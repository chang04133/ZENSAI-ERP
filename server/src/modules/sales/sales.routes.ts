import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { salesRepository } from './sales.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();
const writeRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF')];
const managerRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

// 인메모리 중복 등록 방지 (동일 사용자+거래처+날짜 기준 5초)
const recentBatchMap = new Map<string, number>();

/** sale_number 생성: INSERT → sale_id로 번호 부여 후 UPDATE */
async function assignSaleNumber(client: any, saleId: number, saleDate: string): Promise<string> {
  const dateStr = saleDate.replace(/-/g, '').slice(0, 8);
  const saleNumber = `S${dateStr}-${String(saleId).padStart(4, '0')}`;
  await client.query('UPDATE sales SET sale_number = $1 WHERE sale_id = $2', [saleNumber, saleId]);
  return saleNumber;
}

// 바코드/SKU 스캔 조회
router.get('/scan', authMiddleware, asyncHandler(async (req, res) => {
  const code = (req.query.code as string || '').trim();
  if (!code) {
    res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  // 매장 역할이면 자기 매장 코드, 본사 역할이면 query param의 partner_code 사용
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc
    ? pc
    : (req.query.partner_code as string || '').trim() || undefined;

  const pool = getPool();
  const result = await pool.query(
    `SELECT pv.variant_id, pv.sku, pv.color, pv.size, pv.barcode,
            p.product_code, p.product_name, p.category,
            p.base_price, p.discount_price,
            CASE WHEN p.event_price IS NOT NULL
                  AND (p.event_start_date IS NULL OR p.event_start_date <= CURRENT_DATE)
                  AND (p.event_end_date IS NULL OR p.event_end_date >= CURRENT_DATE)
                 THEN p.event_price ELSE NULL END AS event_price,
            p.event_store_codes
       ${partnerCode ? `, COALESCE(i.qty, 0)::int AS current_stock` : ''}
     FROM product_variants pv
     JOIN products p ON pv.product_code = p.product_code
     ${partnerCode ? `LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code = $2` : ''}
     WHERE pv.is_active = TRUE AND p.is_active = TRUE
       AND (pv.sku = $1 OR pv.barcode = $1)
     LIMIT 1`,
    partnerCode ? [code, partnerCode] : [code],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    return;
  }
  const row = result.rows[0];
  // 거래처별 행사가 우선 조회
  if (partnerCode) {
    const pepResult = await pool.query(
      `SELECT event_price FROM product_event_prices
       WHERE product_code = $1 AND partner_code = $2
         AND (event_start_date IS NULL OR event_start_date <= CURRENT_DATE)
         AND (event_end_date IS NULL OR event_end_date >= CURRENT_DATE)`,
      [row.product_code, partnerCode],
    );
    if (pepResult.rows.length > 0) {
      row.event_price = Number(pepResult.rows[0].event_price);
      delete row.event_store_codes;
      res.json({ success: true, data: row });
      return;
    }
  }
  // 거래처별 행사가 없으면 기존 로직: event_store_codes 기반 필터링
  if (row.event_price && row.event_store_codes && row.event_store_codes.length > 0 && partnerCode) {
    if (!row.event_store_codes.includes(partnerCode)) {
      row.event_price = null;
    }
  }
  delete row.event_store_codes;
  res.json({ success: true, data: row });
}));

// ═══ 예약판매 (/:id 라우트 앞에 배치) ═══

// GET /api/sales/preorders — 미처리 예약판매 목록 (preorders 테이블)
router.get('/preorders', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const isStore = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc;

  const params: any[] = [];
  let idx = 1;
  let partnerFilter = '';
  if (isStore) {
    partnerFilter = ` AND po.partner_code = $${idx}`;
    params.push(pc);
    idx++;
  }

  const result = await pool.query(`
    SELECT po.preorder_id, po.preorder_date, po.partner_code, po.variant_id, po.qty, po.unit_price, po.total_price,
           po.status, po.memo, po.created_at,
           pv.sku, pv.color, pv.size, p.product_name, p.product_code,
           pt.partner_name,
           COALESCE(inv.qty, 0)::int AS current_stock
    FROM preorders po
    JOIN product_variants pv ON po.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    JOIN partners pt ON po.partner_code = pt.partner_code
    LEFT JOIN inventory inv ON po.partner_code = inv.partner_code AND po.variant_id = inv.variant_id
    WHERE po.status = '대기' ${partnerFilter}
    ORDER BY po.created_at DESC
  `, params);

  res.json({ success: true, data: result.rows });
}));

// POST /api/sales/preorders/:id/fulfill — 예약판매 해소 (실매출 생성, 재고는 생성 시 이미 차감됨)
router.post('/preorders/:id/fulfill',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const preorderId = Number(req.params.id);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orig = await client.query('SELECT * FROM preorders WHERE preorder_id = $1 FOR UPDATE', [preorderId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '예약판매를 찾을 수 없습니다.' });
        return;
      }
      const po = orig.rows[0];
      if (po.status !== '대기') {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: '대기 상태가 아닙니다.' });
        return;
      }

      // 재고 확인: 예약판매 생성 시 이미 차감됐으므로 현재 재고 >= 0이면 물건 도착 의미
      const invCheck = await client.query(
        'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [po.partner_code, po.variant_id],
      );
      if ((invCheck.rows[0]?.qty ?? 0) < 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: '재고가 아직 입고되지 않아 해소할 수 없습니다.' });
        return;
      }

      // 판매유형 결정 (행사/할인/정상)
      const priceRow = await client.query(
        `SELECT p.discount_price,
                CASE WHEN p.event_price IS NOT NULL
                      AND (p.event_start_date IS NULL OR p.event_start_date <= CURRENT_DATE)
                      AND (p.event_end_date IS NULL OR p.event_end_date >= CURRENT_DATE)
                     THEN p.event_price ELSE NULL END AS event_price,
                p.event_store_codes, p.product_code
         FROM product_variants pv JOIN products p ON pv.product_code = p.product_code
         WHERE pv.variant_id = $1`, [po.variant_id],
      );
      let saleType = '정상';
      if (priceRow.rows[0]) {
        const pi = priceRow.rows[0];
        const pepResult = await client.query(
          `SELECT event_price FROM product_event_prices
           WHERE product_code = $1 AND partner_code = $2
             AND (event_start_date IS NULL OR event_start_date <= CURRENT_DATE)
             AND (event_end_date IS NULL OR event_end_date >= CURRENT_DATE)`,
          [pi.product_code, po.partner_code],
        );
        if (pepResult.rows.length > 0) {
          saleType = '행사';
        } else if (pi.event_price) {
          const stores: string[] = pi.event_store_codes || [];
          if (stores.length === 0 || stores.includes(po.partner_code)) saleType = '행사';
        }
        if (saleType === '정상' && pi.discount_price && Number(pi.discount_price) > 0) {
          saleType = '할인';
        }
      }

      // 매출 레코드 처리: 이미 sales에 있으면 UPDATE, 없으면 INSERT
      let saleId: number;
      if (po.fulfilled_sale_id) {
        // 이미 sales 테이블에 '예약판매'로 등록됨 → sale_type 업데이트
        await client.query(
          `UPDATE sales SET sale_type = $1, memo = COALESCE(memo, '') || ' [예약판매 해소]', updated_at = NOW()
           WHERE sale_id = $2`,
          [saleType, po.fulfilled_sale_id],
        );
        saleId = Number(po.fulfilled_sale_id);
      } else {
        // 마이그레이션 데이터 등 (sales에 레코드 없음) → INSERT
        const sale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo, customer_id)
           VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [po.partner_code, po.variant_id, po.qty, po.unit_price, po.total_price, saleType,
           (po.memo ? po.memo + ' ' : '') + '[예약판매 해소]', po.customer_id],
        );
        saleId = sale.rows[0].sale_id;
        await assignSaleNumber(client, saleId, new Date().toISOString().slice(0, 10));
      }

      // 재고는 예약판매 생성 시 이미 차감됨 → 추가 차감 불필요

      // preorder 상태 업데이트
      await client.query(
        `UPDATE preorders SET status = '해소', fulfilled_at = NOW(), fulfilled_sale_id = $1, updated_at = NOW()
         WHERE preorder_id = $2`,
        [saleId, preorderId],
      );

      await client.query('COMMIT');
      const saleResult = await pool.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      res.json({ success: true, data: saleResult.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// DELETE /api/sales/preorders/:id — 예약판매 삭제 (대기 상태만) + 재고 복원
router.delete('/preorders/:id',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const preorderId = Number(req.params.id);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `DELETE FROM preorders WHERE preorder_id = $1 AND status = '대기' RETURNING *`,
        [preorderId],
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '삭제할 예약판매를 찾을 수 없습니다.' });
        return;
      }
      const po = result.rows[0];
      // 예약판매 생성 시 차감된 재고 복원
      await inventoryRepository.applyChange(
        po.partner_code, po.variant_id, po.qty, 'PREORDER', preorderId, req.user!.userId, client,
        { memo: '예약판매 삭제 → 재고 복원' },
      );
      await client.query('COMMIT');
      res.json({ success: true, data: { preorder_id: preorderId } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 종합 매출조회
router.get('/comprehensive', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 필수' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.comprehensiveSales(date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

// 종합 매출조회 → 거래처별 판매 상세
router.get('/comprehensive/detail', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, partner_code, sale_type } = req.query as Record<string, string>;
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 필수' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  // 매장 역할: 자기 매장만 조회
  const effectivePartnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : (partner_code || undefined);
  const params: any[] = [date_from, date_to];
  let pcFilter = '';
  if (effectivePartnerCode) {
    params.push(effectivePartnerCode);
    pcFilter = `AND s.partner_code = $${params.length}`;
  }
  const pool = getPool();

  // 예약판매: preorders 테이블 조회
  if (sale_type === '예약판매') {
    const pParams: any[] = [date_from, date_to];
    let pPcFilter = '';
    if (effectivePartnerCode) { pParams.push(effectivePartnerCode); pPcFilter = `AND po.partner_code = $${pParams.length}`; }
    const pSql = `
      SELECT po.preorder_id AS sale_id, po.preorder_date AS sale_date, po.partner_code, pt.partner_name,
             pv.sku, p.product_code, p.product_name, pv.color, pv.size,
             p.category, p.sub_category,
             po.qty, po.unit_price, po.total_price,
             '예약판매' AS sale_type, po.status, po.memo
      FROM preorders po
      JOIN product_variants pv ON po.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON po.partner_code = pt.partner_code
      WHERE po.preorder_date BETWEEN $1 AND $2 AND po.status = '대기'
        ${pPcFilter}
      ORDER BY po.preorder_date DESC, po.preorder_id DESC
      LIMIT 10000`;
    const rows = (await pool.query(pSql, pParams)).rows;
    res.json({ success: true, data: rows });
    return;
  }

  let typeFilter = '';
  if (sale_type && sale_type !== 'all') {
    if (sale_type === '정상') {
      typeFilter = `AND COALESCE(s.sale_type, '정상') = '정상'`;
    } else if (sale_type === '할인그룹') {
      typeFilter = `AND s.sale_type IN ('기획', '균일', '할인')`;
    } else {
      params.push(sale_type);
      typeFilter = `AND s.sale_type = $${params.length}`;
    }
  }

  // all: sales + preorders 통합 조회
  const includePreorders = !sale_type || sale_type === 'all';
  const sql = includePreorders
    ? `WITH combined AS (
        SELECT sale_id, sale_date, partner_code, variant_id, qty, unit_price, total_price, COALESCE(sale_type, '정상') AS sale_type
        FROM sales
        UNION ALL
        SELECT preorder_id, preorder_date, partner_code, variant_id, qty, unit_price, total_price, '예약판매'
        FROM preorders WHERE status = '대기'
      )
      SELECT s.sale_id, s.sale_date, s.partner_code, pt.partner_name,
             pv.sku, p.product_code, p.product_name, pv.color, pv.size,
             p.category, p.sub_category,
             s.qty, s.unit_price, s.total_price, s.sale_type
      FROM combined s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      WHERE s.sale_date BETWEEN $1 AND $2
        ${pcFilter}
      ORDER BY s.sale_date DESC, s.sale_id DESC
      LIMIT 10000`
    : `SELECT s.sale_id, s.sale_date, s.partner_code, pt.partner_name,
             pv.sku, p.product_code, p.product_name, pv.color, pv.size,
             p.category, p.sub_category,
             s.qty, s.unit_price, s.total_price,
             COALESCE(s.sale_type, '정상') AS sale_type
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      WHERE s.sale_date BETWEEN $1 AND $2
        ${pcFilter}
        ${typeFilter}
      ORDER BY s.sale_date DESC, s.sale_id DESC
      LIMIT 10000`;
  const rows = (await pool.query(sql, params)).rows;
  res.json({ success: true, data: rows });
}));

// 매장별 성과 비교
router.get('/store-comparison', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };
  const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = date_to || new Date().toISOString().slice(0, 10);

  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  // 매장 사용자는 자기 매장 데이터만 조회 가능
  const partnerFilter = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc
    ? 'AND s.partner_code = $3' : '';
  const params: any[] = [from, to];
  if (partnerFilter) params.push(pc);

  const pool = getPool();
  const result = await pool.query(
    `SELECT s.partner_code, pa.partner_name,
            COUNT(DISTINCT s.sale_id)::int AS sale_count,
            SUM(CASE WHEN COALESCE(s.sale_type,'정상') != '반품' THEN s.qty ELSE 0 END)::int AS total_qty,
            SUM(CASE WHEN COALESCE(s.sale_type,'정상') != '반품' THEN s.total_price ELSE 0 END)::numeric AS gross_revenue,
            SUM(CASE WHEN COALESCE(s.sale_type,'정상') = '반품' THEN ABS(s.total_price) ELSE 0 END)::numeric AS return_revenue,
            SUM(s.total_price)::numeric AS total_revenue,
            COUNT(DISTINCT s.sale_date)::int AS active_days
     FROM sales s
     JOIN partners pa ON s.partner_code = pa.partner_code
     WHERE s.sale_date BETWEEN $1 AND $2 AND COALESCE(s.sale_type, '정상') != '수정' ${partnerFilter}
     GROUP BY s.partner_code, pa.partner_name
     ORDER BY gross_revenue DESC`,
    params,
  );
  res.json({ success: true, data: result.rows });
}));

// 상품별 판매이력
router.get('/by-product/:code', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const productCode = req.params.code;
  const { limit = '20' } = req.query;
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;

  const pool = getPool();
  const params: any[] = [productCode, parseInt(limit as string, 10)];
  let partnerFilter = '';
  if (partnerCode) {
    partnerFilter = 'AND s.partner_code = $3';
    params.push(partnerCode);
  }

  const result = await pool.query(
    `SELECT s.sale_id, s.sale_date, s.qty, s.unit_price, s.total_price, s.sale_type,
            s.partner_code, pa.partner_name,
            pv.sku, pv.color, pv.size
     FROM sales s
     JOIN product_variants pv ON s.variant_id = pv.variant_id
     JOIN partners pa ON s.partner_code = pa.partner_code
     WHERE pv.product_code = $1 ${partnerFilter}
     ORDER BY s.sale_date DESC, s.sale_id DESC
     LIMIT $2`,
    params,
  );
  res.json({ success: true, data: result.rows });
}));

// 매출 목록 (JOIN 포함)
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role;
  const query: any = { ...req.query };
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && req.user?.partnerCode) {
    query.partner_code = req.user.partnerCode;
  }
  const data = await salesRepository.listWithDetails(query);
  res.json({ success: true, data });
}));

// 매출 다건 등록 (배치) — POST /batch를 먼저 등록
router.post('/batch',
  ...writeRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const { sale_date, partner_code, items, tax_free, memo } = req.body;
    if (!sale_date || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'sale_date, items 필수' });
      return;
    }
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    if (!pc) {
      res.status(400).json({ success: false, error: 'partner_code 필수' });
      return;
    }
    const globalTaxFree = !!tax_free;
    const pool = getPool();

    // 중복 등록 방지: 동일 사용자+거래처+날짜 기준 5초 이내 재등록 차단 (인메모리)
    const dupKey = `${req.user!.userId}:${pc}:${sale_date}`;
    const now = Date.now();
    const lastBatch = recentBatchMap.get(dupKey);
    if (lastBatch && now - lastBatch < 5000) {
      res.status(409).json({ success: false, error: '중복 등록 감지: 잠시 후 다시 시도해주세요.' });
      return;
    }
    recentBatchMap.set(dupKey, now);
    // 오래된 항목 정리 (10초 초과)
    for (const [k, t] of recentBatchMap) {
      if (now - t > 10000) recentBatchMap.delete(k);
    }

    // 거래처 활성 상태 검증
    const partnerCheck = await pool.query('SELECT is_active, partner_name FROM partners WHERE partner_code = $1', [pc]);
    if (partnerCheck.rows[0] && !partnerCheck.rows[0].is_active) {
      res.status(400).json({ success: false, error: `비활성 거래처(${partnerCheck.rows[0].partner_name})에 매출을 등록할 수 없습니다.` });
      return;
    }

    // 재고 부족 경고 수집
    const warnings: string[] = [];
    for (const item of items) {
      if (!item.variant_id || !item.qty) continue;
      const stockResult = await pool.query(
        'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [pc, item.variant_id],
      );
      const currentStock = stockResult.rows[0]?.qty ?? 0;
      if (currentStock < item.qty) {
        warnings.push(`variant_id=${item.variant_id}: 재고 ${currentStock}개, 판매요청 ${item.qty}개 (재고 부족)`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      const preorderResults: any[] = [];
      const skipped: string[] = [];
      const batchCustomerId = req.body.customer_id || null;
      for (let i = 0; i < items.length; i++) {
        const { variant_id, qty, unit_price, sale_type } = items[i];
        if (!variant_id || qty === undefined || qty === null || unit_price === undefined || unit_price === null) {
          skipped.push(`항목 ${i + 1}: 필수값 누락 (variant_id, qty, unit_price)`);
          continue;
        }
        if (Number(qty) <= 0) {
          skipped.push(`항목 ${i + 1}: 수량은 양수여야 합니다 (qty=${qty})`);
          continue;
        }
        // 가격 결정: 행사가 > 할인가/정상가 (시스템 설정 기반)
        const priceRow = await client.query(
          `SELECT pv.price AS variant_price, p.base_price, p.discount_price,
                  CASE WHEN p.event_price IS NOT NULL
                        AND (p.event_start_date IS NULL OR p.event_start_date <= CURRENT_DATE)
                        AND (p.event_end_date IS NULL OR p.event_end_date >= CURRENT_DATE)
                       THEN p.event_price ELSE NULL END AS event_price,
                  p.event_store_codes, p.product_code
           FROM product_variants pv JOIN products p ON pv.product_code = p.product_code
           WHERE pv.variant_id = $1`, [variant_id],
        );
        const pInfo = priceRow.rows[0];
        let effectivePrice = Number(unit_price);
        let effectiveSaleType = sale_type || '정상';
        if (pInfo) {
          const baseP = Number(pInfo.variant_price || pInfo.base_price || 0);
          const discountP = pInfo.discount_price ? Number(pInfo.discount_price) : null;
          // 1. 행사가 확인: product_event_prices 테이블 (거래처별)
          let eventP: number | null = null;
          const pepResult = await client.query(
            `SELECT event_price FROM product_event_prices
             WHERE product_code = $1 AND partner_code = $2
               AND (event_start_date IS NULL OR event_start_date <= CURRENT_DATE)
               AND (event_end_date IS NULL OR event_end_date >= CURRENT_DATE)`,
            [pInfo.product_code, pc],
          );
          if (pepResult.rows.length > 0) {
            eventP = Number(pepResult.rows[0].event_price);
          } else if (pInfo.event_price) {
            // products 테이블의 event_price + event_store_codes 확인
            const stores: string[] = pInfo.event_store_codes || [];
            if (stores.length === 0 || stores.includes(pc)) {
              eventP = Number(pInfo.event_price);
            }
          }
          if (eventP && eventP > 0) {
            effectivePrice = eventP;
            effectiveSaleType = '행사';
          } else if (discountP && discountP > 0) {
            effectivePrice = discountP;
            effectiveSaleType = sale_type || '할인';
          } else {
            effectivePrice = baseP;
            effectiveSaleType = sale_type || '정상';
          }
        }
        const total_price = Math.round(qty * effectivePrice);

        // 재고 확인 → 부족하면 예약판매로 전환
        const stockCheck = await client.query(
          'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
          [pc, variant_id],
        );
        const currentStock = stockCheck.rows[0]?.qty ?? 0;

        const afterStock = currentStock - qty;

        if (afterStock < -2) {
          // ── 판매 후 재고 -3 이하 → 판매/예약 모두 차단 ──
          skipped.push(`항목 ${i + 1}: 재고 부족 (현재 ${currentStock}개, 요청 ${qty}개). 예약판매는 재고 부족 시 최대 2개까지만 가능합니다.`);
          continue;
        } else if (currentStock < qty) {
          // ── 재고 부족하지만 -2까지는 허용 → 예약판매(preorder) 생성 + 재고 차감 ──
          const po = await client.query(
            `INSERT INTO preorders (preorder_date, partner_code, variant_id, qty, unit_price, total_price, status, memo, customer_id)
             VALUES ($1, $2, $3, $4, $5, $6, '대기', $7, $8) RETURNING *`,
            [sale_date, pc, variant_id, qty, effectivePrice, total_price, memo || null, batchCustomerId],
          );
          await inventoryRepository.applyChange(
            pc, variant_id, -qty, 'PREORDER', po.rows[0].preorder_id, req.user!.userId, client,
            { allowNegative: true, memo: '예약판매 등록' },
          );
          preorderResults.push(po.rows[0]);
        } else {
          // ── 재고 충분 → 정상 판매 + 재고 차감 ──
          // 텍스프리: 금액 직접 입력, 최대 총액의 10%
          let itemTaxFreeAmount = Number(items[i].tax_free_amount) || 0;
          const maxTaxFree = Math.round(total_price * 0.1);
          if (itemTaxFreeAmount < 0) itemTaxFreeAmount = 0;
          if (itemTaxFreeAmount > maxTaxFree) itemTaxFreeAmount = maxTaxFree;
          const itemTaxFree = itemTaxFreeAmount > 0;

          const sale = await client.query(
            `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, tax_free, tax_free_amount, memo, customer_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [sale_date, pc, variant_id, qty, effectivePrice, total_price, effectiveSaleType, itemTaxFree, itemTaxFreeAmount, memo || null, batchCustomerId],
          );
          const batchSaleNum = await assignSaleNumber(client, sale.rows[0].sale_id, sale_date);
          sale.rows[0].sale_number = batchSaleNum;
          await inventoryRepository.applyChange(
            pc, variant_id, -qty, 'SALE', sale.rows[0].sale_id, req.user!.userId, client,
            { memo: `매출 등록 (${effectiveSaleType})` },
          );
          results.push(sale.rows[0]);
        }
      }
      if (results.length === 0 && preorderResults.length === 0) {
        await client.query('ROLLBACK');
        const errMsg = skipped.length > 0
          ? skipped.join(' / ')
          : '등록 가능한 유효한 항목이 없습니다.';
        res.status(400).json({ success: false, error: errMsg, skipped });
        return;
      }
      await client.query('COMMIT');

      // 고객 연동 (벌크)
      const batchCid = req.body.customer_id;
      if (batchCid && results.length > 0) {
        try {
          for (const s of results) {
            const vInfo = await pool.query(
              `SELECT pv.color, pv.size, p.product_name FROM product_variants pv JOIN products p ON pv.product_code = p.product_code WHERE pv.variant_id = $1`,
              [s.variant_id],
            );
            const v = vInfo.rows[0];
            if (v) {
              await pool.query(
                `INSERT INTO customer_purchases (customer_id, partner_code, purchase_date, product_name, variant_info, qty, unit_price, total_price, sale_id, auto_created, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
                [batchCid, pc, sale_date, v.product_name, `${v.color || ''}/${v.size || ''}`, s.qty, s.unit_price, s.total_price, s.sale_id, req.user!.userId],
              );
            }
          }
          const { crmService } = await import('../crm/crm.service');
          await crmService.recalculateTier(batchCid).catch(() => {});
        } catch { /* CRM 연동 실패해도 매출은 유지 */ }
      }

      // 응답: 예약판매 전환 건 포함
      const responseData: any = { success: true, data: results };
      if (preorderResults.length > 0) {
        responseData.preorders = preorderResults;
        responseData.message = `${results.length}건 매출 등록, ${preorderResults.length}건 예약판매 전환 (재고 부족)`;
      }
      if (warnings.length > 0) responseData.warnings = warnings;
      if (skipped.length > 0) responseData.skipped = skipped;
      res.status(201).json(responseData);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 매출 단건 등록 + 재고 차감
router.post('/',
  ...writeRoles,
  validateRequired(['sale_date', 'partner_code', 'variant_id', 'qty', 'unit_price']),
  asyncHandler(async (req: Request, res: Response) => {
    const { sale_date, partner_code, variant_id, qty, unit_price, sale_type, tax_free, tax_free_amount, memo } = req.body;
    if (!Number.isFinite(Number(qty)) || Number(qty) <= 0) {
      res.status(400).json({ success: false, error: '수량은 양수여야 합니다.' });
      return;
    }
    if (!Number.isFinite(Number(unit_price)) || Number(unit_price) < 0) {
      res.status(400).json({ success: false, error: '단가는 0 이상이어야 합니다.' });
      return;
    }
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    const pool = getPool();

    // 가격 결정: 행사가 > 할인가/정상가 (시스템 설정 기반)
    const priceRow = await pool.query(
      `SELECT pv.price AS variant_price, p.base_price, p.discount_price,
              CASE WHEN p.event_price IS NOT NULL
                    AND (p.event_start_date IS NULL OR p.event_start_date <= CURRENT_DATE)
                    AND (p.event_end_date IS NULL OR p.event_end_date >= CURRENT_DATE)
                   THEN p.event_price ELSE NULL END AS event_price,
              p.event_store_codes, p.product_code
       FROM product_variants pv JOIN products p ON pv.product_code = p.product_code
       WHERE pv.variant_id = $1`, [variant_id],
    );
    const pInfo = priceRow.rows[0];
    let effectivePrice = Number(unit_price);
    let effectiveSaleType = sale_type || '정상';
    if (pInfo) {
      const baseP = Number(pInfo.variant_price || pInfo.base_price || 0);
      const discountP = pInfo.discount_price ? Number(pInfo.discount_price) : null;
      // 1. 행사가 확인
      let eventP: number | null = null;
      const pepResult = await pool.query(
        `SELECT event_price FROM product_event_prices
         WHERE product_code = $1 AND partner_code = $2
           AND (event_start_date IS NULL OR event_start_date <= CURRENT_DATE)
           AND (event_end_date IS NULL OR event_end_date >= CURRENT_DATE)`,
        [pInfo.product_code, pc],
      );
      if (pepResult.rows.length > 0) {
        eventP = Number(pepResult.rows[0].event_price);
      } else if (pInfo.event_price) {
        const stores: string[] = pInfo.event_store_codes || [];
        if (stores.length === 0 || stores.includes(pc)) {
          eventP = Number(pInfo.event_price);
        }
      }
      if (eventP && eventP > 0) {
        effectivePrice = eventP;
        effectiveSaleType = '행사';
      } else if (discountP && discountP > 0) {
        effectivePrice = discountP;
        effectiveSaleType = sale_type || '할인';
      } else {
        effectivePrice = baseP;
        effectiveSaleType = sale_type || '정상';
      }
    }
    const total_price = Math.round(qty * effectivePrice);
    // 텍스프리: 금액 직접 입력, 최대 총액의 10%
    let singleTaxFreeAmount = Number(tax_free_amount) || 0;
    const singleMaxTaxFree = Math.round(total_price * 0.1);
    if (singleTaxFreeAmount < 0) singleTaxFreeAmount = 0;
    if (singleTaxFreeAmount > singleMaxTaxFree) singleTaxFreeAmount = singleMaxTaxFree;
    const singleTaxFree = singleTaxFreeAmount > 0;

    // 거래처 활성 상태 검증
    const partnerCheck = await pool.query('SELECT is_active, partner_name FROM partners WHERE partner_code = $1', [pc]);
    if (partnerCheck.rows[0] && !partnerCheck.rows[0].is_active) {
      res.status(400).json({ success: false, error: `비활성 거래처(${partnerCheck.rows[0].partner_name})에 매출을 등록할 수 없습니다.` });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const customerId = req.body.customer_id || null;

      // 재고 확인 → 부족하면 예약판매로 전환
      const stockCheck = await client.query(
        'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [pc, variant_id],
      );
      const currentStock = stockCheck.rows[0]?.qty ?? 0;

      const afterStock = currentStock - qty;

      if (afterStock < -2) {
        // ── 판매 후 재고 -3 이하 → 판매/예약 모두 차단 ──
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: `재고 부족: 현재 ${currentStock}개, 요청 ${qty}개. 예약판매는 재고 부족 시 최대 2개까지만 가능합니다.` });
        return;
      } else if (currentStock < qty) {
        // ── 재고 부족하지만 -2까지는 허용 → 예약판매(preorder) 생성 + 재고 차감 ──
        const po = await client.query(
          `INSERT INTO preorders (preorder_date, partner_code, variant_id, qty, unit_price, total_price, status, memo, customer_id)
           VALUES ($1, $2, $3, $4, $5, $6, '대기', $7, $8) RETURNING *`,
          [sale_date, pc, variant_id, qty, effectivePrice, total_price, memo || null, customerId],
        );
        await inventoryRepository.applyChange(
          pc, variant_id, -qty, 'PREORDER', po.rows[0].preorder_id, req.user!.userId, client,
          { allowNegative: true, memo: '예약판매 등록' },
        );
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: po.rows[0], preorder: true, message: '재고 부족으로 예약판매로 전환되었습니다.' });
      } else {
        // ── 재고 충분 → 정상 판매 + 재고 차감 ──
        const sale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, tax_free, tax_free_amount, memo, customer_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [sale_date, pc, variant_id, qty, effectivePrice, total_price, effectiveSaleType, singleTaxFree, singleTaxFreeAmount, memo || null, customerId],
        );
        await assignSaleNumber(client, sale.rows[0].sale_id, sale_date);
        await inventoryRepository.applyChange(
          pc, variant_id, -qty, 'SALE', sale.rows[0].sale_id, req.user!.userId, client,
          { memo: `매출 등록 (${effectiveSaleType})` },
        );
        await client.query('COMMIT');

        // 고객 연동: 구매이력 자동 생성 + 등급 재계산
        if (customerId) {
          try {
            const vInfo = await pool.query(
              `SELECT pv.color, pv.size, p.product_name FROM product_variants pv JOIN products p ON pv.product_code = p.product_code WHERE pv.variant_id = $1`,
              [variant_id],
            );
            const v = vInfo.rows[0];
            if (v) {
              await pool.query(
                `INSERT INTO customer_purchases (customer_id, partner_code, purchase_date, product_name, variant_info, qty, unit_price, total_price, sale_id, auto_created, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
                [customerId, pc, sale_date, v.product_name, `${v.color || ''}/${v.size || ''}`, qty, effectivePrice, total_price, sale.rows[0].sale_id, req.user!.userId],
              );
            }
            const { crmService } = await import('../crm/crm.service');
            await crmService.recalculateTier(customerId).catch(() => {});
          } catch { /* CRM 연동 실패해도 매출은 유지 */ }
        }

        res.status(201).json({ success: true, data: sale.rows[0] });
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 매출 수정 (수량/단가/유형)
router.put('/:id',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const { qty, unit_price, sale_type, memo, tax_free, tax_free_amount, customer_id } = req.body;
    if (qty === undefined || qty === null || unit_price === undefined || unit_price === null) {
      res.status(400).json({ success: false, error: 'qty, unit_price 필수' });
      return;
    }
    if (!Number.isFinite(Number(qty)) || Number(qty) <= 0) {
      res.status(400).json({ success: false, error: '수량은 양수여야 합니다.' });
      return;
    }
    if (!Number.isFinite(Number(unit_price)) || Number(unit_price) < 0) {
      res.status(400).json({ success: false, error: '단가는 0 이상이어야 합니다.' });
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 기존 매출 조회
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 매장 매니저: 당일 매출만 수정 가능 + 금액(단가) 변경 불가
      if (req.user?.role === 'STORE_MANAGER') {
        const dayCheck = await client.query(
          `SELECT sale_date::date = CURRENT_DATE AS is_today FROM sales WHERE sale_id = $1`, [saleId],
        );
        if (!dayCheck.rows[0]?.is_today) {
          await client.query('ROLLBACK');
          res.status(403).json({ success: false, error: '당일 매출만 수정할 수 있습니다.' });
          return;
        }
      }
      // 단가 변경 불가 — 원래 값 강제 유지 (가격은 상품관리에서만 변경)
      const effectiveUnitPrice = Number(old.unit_price);
      const isStoreRole = req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF';
      // 텍스프리 금액 처리
      let effectiveTaxFreeAmount = isStoreRole
        ? (old.tax_free_amount || 0)
        : (tax_free_amount !== undefined ? Number(tax_free_amount) || 0 : (old.tax_free_amount || 0));
      const updatedTotalPrice = Math.round(qty * effectiveUnitPrice);
      const updateMaxTaxFree = Math.round(updatedTotalPrice * 0.1);
      if (effectiveTaxFreeAmount < 0) effectiveTaxFreeAmount = 0;
      if (effectiveTaxFreeAmount > updateMaxTaxFree) effectiveTaxFreeAmount = updateMaxTaxFree;
      const effectiveTaxFree = effectiveTaxFreeAmount > 0;
      const qtyDiff = old.qty - qty; // 양수면 줄어듬→재고 복원, 음수면 늘어남→재고 차감

      // 수량 증가 시 재고 부족 체크
      if (qtyDiff < 0) {
        const stockCheck = await client.query(
          'SELECT COALESCE(qty, 0)::int AS stock FROM inventory WHERE partner_code = $1 AND variant_id = $2',
          [old.partner_code, old.variant_id],
        );
        const currentStock = stockCheck.rows[0]?.stock ?? 0;
        if (currentStock + qtyDiff < 0) {
          await client.query('ROLLBACK');
          res.status(400).json({ success: false, error: `재고 부족: 현재 재고 ${currentStock}개, 추가 필요 ${-qtyDiff}개` });
          return;
        }
      }

      // 매장 매니저: 판매유형 변경 불가
      const effectiveSaleType = isStoreRole ? old.sale_type : (sale_type || old.sale_type);

      // customer_id 업데이트
      const effectiveCustomerId = customer_id !== undefined ? (customer_id || null) : old.customer_id;

      // 매출 업데이트
      const updated = await client.query(
        `UPDATE sales SET qty = $1, unit_price = $2, total_price = $3, sale_type = $4, memo = $5, tax_free = $6, tax_free_amount = $7, customer_id = $8, updated_at = NOW()
         WHERE sale_id = $9 RETURNING *`,
        [qty, effectiveUnitPrice, updatedTotalPrice, effectiveSaleType, memo !== undefined ? (memo || null) : old.memo, effectiveTaxFree, effectiveTaxFreeAmount, effectiveCustomerId, saleId],
      );

      // 수량 차이만큼 재고 조정 (예약판매는 재고 연동 없음)
      if (qtyDiff !== 0) {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, qtyDiff, 'SALE_EDIT', saleId, req.user!.userId, client,
          { memo: `매출 수정 (${old.qty}→${qty}개)` },
        );
      }

      // 매출 수정 이력 기록 (차액 추적)
      const oldTotal = Number(old.qty) * Number(old.unit_price);
      const priceDiff = updatedTotalPrice - oldTotal;
      if (priceDiff !== 0 || qtyDiff !== 0) {
        await client.query(
          `INSERT INTO audit_logs (table_name, record_id, action, changed_by, old_data, new_data)
           VALUES ('sales', $1, 'UPDATE', $2, $3::jsonb, $4::jsonb)`,
          [
            String(saleId),
            req.user!.userId,
            JSON.stringify({ qty: Number(old.qty), total_price: oldTotal, sale_type: old.sale_type }),
            JSON.stringify({ qty: Number(qty), total_price: updatedTotalPrice, sale_type: effectiveSaleType, diff: priceDiff }),
          ],
        );

        // 수정 차액 레코드 생성 (판매내역에 별도 행으로 표시)
        const adjQty = Number(qty) - Number(old.qty);
        const origSaleNumber = old.sale_number || `S-${saleId}`;
        const adjSale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo, customer_id)
           VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '수정', $6, $7) RETURNING sale_id`,
          [old.partner_code, old.variant_id, adjQty, effectiveUnitPrice, priceDiff,
           `수량수정 ${old.qty}→${qty} (원본 ${origSaleNumber})`, old.customer_id],
        );
        await assignSaleNumber(client, adjSale.rows[0].sale_id, new Date().toISOString().slice(0, 10));
      }

      await client.query('COMMIT');
      res.json({ success: true, data: { ...updated.rows[0], price_diff: priceDiff } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 매출 삭제 (재고 복원)
router.delete('/:id',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 매장 매니저: 당일 매출만 삭제 가능
      if (req.user?.role === 'STORE_MANAGER') {
        const dayCheck = await client.query(
          `SELECT sale_date::date = CURRENT_DATE AS is_today FROM sales WHERE sale_id = $1`, [saleId],
        );
        if (!dayCheck.rows[0]?.is_today) {
          await client.query('ROLLBACK');
          res.status(403).json({ success: false, error: '당일 매출만 삭제할 수 있습니다. 본사에 문의해주세요.' });
          return;
        }
      }

      // 연결된 반품이 있는지 확인 (memo에 '원본#' 패턴으로 연결)
      if (old.sale_type !== '반품') {
        const linkedReturns = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM sales WHERE sale_type = '반품' AND memo LIKE $1`,
          [`%(원본#${saleId})%`],
        );
        if (linkedReturns.rows[0].cnt > 0) {
          await client.query('ROLLBACK');
          res.status(400).json({ success: false, error: `이 매출에 연결된 반품 ${linkedReturns.rows[0].cnt}건이 있어 삭제할 수 없습니다. 반품을 먼저 삭제해주세요.` });
          return;
        }
      }

      // 반품이 아닌 정상/할인/행사 매출 삭제 시 재고 복원
      if (old.sale_type !== '반품') {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, old.qty, 'SALE_DELETE', saleId, req.user!.userId, client,
          { memo: `매출 삭제 → 재고 복원 (${old.sale_type})` },
        );
      } else if (old.sale_type === '반품') {
        // 반품 건 삭제 시 재고 다시 차감
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, -old.qty, 'SALE_DELETE', saleId, req.user!.userId, client,
          { memo: '반품 삭제 → 재고 재차감' },
        );

        // 연결된 물류반품 자동 취소 (재고 복구)
        if (old.shipment_request_id) {
          const linkedShip = await client.query(
            'SELECT * FROM shipment_requests WHERE request_id = $1 FOR UPDATE',
            [old.shipment_request_id],
          );
          const ship = linkedShip.rows[0];
          if (ship && ship.status !== 'CANCELLED') {
            if (ship.status === 'RECEIVED') {
              await client.query('ROLLBACK');
              res.status(400).json({ success: false, error: '본사에서 수령완료된 물류반품이 연결되어 있어 삭제할 수 없습니다.' });
              return;
            }
            const shipItems = await client.query(
              'SELECT variant_id, shipped_qty, received_qty FROM shipment_request_items WHERE request_id = $1',
              [ship.request_id],
            );
            // SHIPPED/DISCREPANCY: from_partner 재고 복구
            if (ship.from_partner && (ship.status === 'SHIPPED' || ship.status === 'DISCREPANCY')) {
              for (const si of shipItems.rows) {
                if (Number(si.shipped_qty) > 0) {
                  await inventoryRepository.applyChange(
                    ship.from_partner, si.variant_id, Number(si.shipped_qty),
                    'RETURN', ship.request_id, req.user!.userId, client,
                    { memo: '반품 삭제 → 물류반품 취소 (출고 복원)' },
                  );
                }
              }
            }
            // DISCREPANCY: to_partner received_qty 차감
            if (ship.status === 'DISCREPANCY' && ship.to_partner) {
              for (const si of shipItems.rows) {
                if (Number(si.received_qty) > 0) {
                  await inventoryRepository.applyChange(
                    ship.to_partner, si.variant_id, -Number(si.received_qty),
                    'RETURN', ship.request_id, req.user!.userId, client,
                    { memo: '반품 삭제 → 물류반품 취소 (수령 원복)' },
                  );
                }
              }
            }
            await client.query(
              `UPDATE shipment_requests SET status = 'CANCELLED', memo = COALESCE(memo, '') || ' [반품삭제 자동취소]', updated_at = NOW() WHERE request_id = $1`,
              [ship.request_id],
            );
          }
        }
      }

      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
      await client.query('COMMIT');
      res.json({ success: true, data: { sale_id: saleId } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

export default router;
