import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { salesRepository } from './sales.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();

// 매출현황 대시보드
router.get('/dashboard-stats', authMiddleware, asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.dashboardStats(year, partnerCode);
  res.json({ success: true, data });
}));

// 분석 라우트 (CRUD보다 먼저 등록 - 경로 충돌 방지)
router.get('/monthly-sales', authMiddleware, asyncHandler(async (req, res) => {
  const query: any = { ...req.query };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc) query.partner_code = pc;
  const data = await salesRepository.monthlySales(query);
  res.json({ success: true, data });
}));

// 스타일 판매 분석 (전년대비 종합)
router.get('/style-analytics', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.styleAnalytics(year, partnerCode);
  res.json({ success: true, data });
}));

// 연도별 매출현황 (최근 6년)
router.get('/yearly-overview', authMiddleware, asyncHandler(async (req, res) => {
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.yearlyOverview(partnerCode);
  res.json({ success: true, data });
}));

// 연단위 비교
router.get('/year-comparison', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.yearComparison(year, partnerCode);
  res.json({ success: true, data });
}));

// 스타일별 판매현황 (기간별)
router.get('/style-by-range', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category } = req.query as { date_from?: string; date_to?: string; category?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.styleSalesByRange(date_from, date_to, partnerCode, category || undefined);
  res.json({ success: true, data });
}));

// 상품별 컬러/사이즈 판매 상세
router.get('/product-variant-sales', authMiddleware, asyncHandler(async (req, res) => {
  const { product_code, date_from, date_to } = req.query as { product_code?: string; date_from?: string; date_to?: string };
  if (!product_code || !date_from || !date_to) {
    res.status(400).json({ success: false, error: 'product_code, date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.productVariantSales(product_code, date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

// 판매 리스트 (기간별: 일별/주별/월별)
router.get('/products-by-range', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, sub_category, season, fit, length, color, size, search, partner_code } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  // 매장 역할: 자기 매장만, 본사: partner_code 파라미터 or 전체
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : (partner_code || undefined);
  const filters = { category, sub_category, season, fit, length, color, size, search };
  // 빈 문자열 제거
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as any;
  const data = await salesRepository.salesProductsByRange(date_from, date_to, partnerCode, Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined);
  res.json({ success: true, data });
}));

// 바코드/SKU 스캔 조회
router.get('/scan', authMiddleware, asyncHandler(async (req, res) => {
  const code = (req.query.code as string || '').trim();
  if (!code) {
    res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;

  const pool = getPool();
  const result = await pool.query(
    `SELECT pv.variant_id, pv.sku, pv.color, pv.size, pv.barcode,
            p.product_code, p.product_name, p.category,
            p.base_price, p.discount_price, p.event_price, p.event_store_codes
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
  // 행사 매장 제한: event_store_codes가 설정되어 있고 현재 매장이 포함되지 않으면 event_price 제거
  if (row.event_price && row.event_store_codes && row.event_store_codes.length > 0 && partnerCode) {
    if (!row.event_store_codes.includes(partnerCode)) {
      row.event_price = null;
    }
  }
  delete row.event_store_codes;
  res.json({ success: true, data: row });
}));

// 판매율 분석 (품번별/사이즈별/카테고리별/일자별)
router.get('/sell-through', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category } = req.query as { date_from?: string; date_to?: string; category?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.sellThroughAnalysis(date_from, date_to, partnerCode, category || undefined);
  res.json({ success: true, data });
}));

// 드랍 분석 (출시일 기준 판매율/코호트/판매속도)
router.get('/drop-analysis', authMiddleware, asyncHandler(async (req, res) => {
  const { category } = req.query as { category?: string };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.dropAnalysis(partnerCode, category || undefined);
  res.json({ success: true, data });
}));

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
            SUM(CASE WHEN s.sale_type != '반품' THEN s.qty ELSE 0 END)::int AS total_qty,
            SUM(s.total_price)::numeric AS total_revenue,
            COUNT(DISTINCT s.sale_date)::int AS active_days
     FROM sales s
     JOIN partners pa ON s.partner_code = pa.partner_code
     WHERE s.sale_date BETWEEN $1 AND $2 ${partnerFilter}
     GROUP BY s.partner_code, pa.partner_name
     ORDER BY total_revenue DESC`,
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

// 매출 등록 권한
const writeRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF')];
const managerRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

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

    // 재고 부족 경고 수집
    const warnings: string[] = [];
    for (const item of items) {
      if (!item.variant_id || !item.qty) continue;
      const stockResult = await pool.query(
        'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [pc, item.variant_id],
      );
      const currentStock = stockResult.rows[0]?.qty || 0;
      if (currentStock < item.qty) {
        warnings.push(`variant_id=${item.variant_id}: 재고 ${currentStock}개, 판매요청 ${item.qty}개 (부족 ${item.qty - currentStock}개)`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      const skipped: string[] = [];
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
        if (Number(unit_price) < 0) {
          skipped.push(`항목 ${i + 1}: 단가는 0 이상이어야 합니다 (unit_price=${unit_price})`);
          continue;
        }
        const total_price = Math.round(qty * unit_price);
        const itemTaxFree = items[i].tax_free !== undefined ? !!items[i].tax_free : globalTaxFree;
        const sale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, tax_free, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [sale_date, pc, variant_id, qty, unit_price, total_price, sale_type || '정상', itemTaxFree, memo || null],
        );
        await inventoryRepository.applyChange(
          pc, variant_id, -qty, 'SALE', sale.rows[0].sale_id, req.user!.userId, client,
        );
        results.push(sale.rows[0]);
      }
      if (results.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: '등록 가능한 유효한 항목이 없습니다.', skipped });
        return;
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: results, ...(warnings.length > 0 && { warnings }), ...(skipped.length > 0 && { skipped }) });
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
    const { sale_date, partner_code, variant_id, qty, unit_price, sale_type, tax_free, memo } = req.body;
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    const total_price = Math.round(qty * unit_price);
    const pool = getPool();

    // 재고 부족 경고
    const warnings: string[] = [];
    const stockResult = await pool.query(
      'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
      [pc, variant_id],
    );
    const currentStock = stockResult.rows[0]?.qty || 0;
    if (currentStock < qty) {
      warnings.push(`재고 ${currentStock}개, 판매요청 ${qty}개 (부족 ${qty - currentStock}개)`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, tax_free, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [sale_date, pc, variant_id, qty, unit_price, total_price, sale_type || '정상', !!tax_free, memo || null],
      );
      await inventoryRepository.applyChange(
        pc, variant_id, -qty, 'SALE', sale.rows[0].sale_id, req.user!.userId, client,
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: sale.rows[0], ...(warnings.length > 0 && { warnings }) });
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
    const { qty, unit_price, sale_type, memo } = req.body;
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

      // 매장 매니저: 당일 매출만 수정 가능
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
      const qtyDiff = old.qty - qty; // 양수면 줄어듬→재고 복원, 음수면 늘어남→재고 차감
      const total_price = Math.round(qty * unit_price);

      // 매출 업데이트
      const updated = await client.query(
        `UPDATE sales SET qty = $1, unit_price = $2, total_price = $3, sale_type = $4, memo = $5, updated_at = NOW()
         WHERE sale_id = $6 RETURNING *`,
        [qty, unit_price, total_price, sale_type || old.sale_type, memo !== undefined ? (memo || null) : old.memo, saleId],
      );

      // 수량 차이만큼 재고 조정
      if (qtyDiff !== 0) {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, qtyDiff, 'SALE_EDIT', saleId, req.user!.userId, client,
        );
      }
      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
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
          res.status(403).json({ success: false, error: '당일 매출만 삭제할 수 있습니다.' });
          return;
        }
      }

      // 연결된 반품이 있는지 확인 (memo에 '원본#' 패턴으로 연결)
      if (old.sale_type !== '반품') {
        const linkedReturns = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM sales WHERE sale_type = '반품' AND memo LIKE $1`,
          [`%원본#${saleId}%`],
        );
        if (linkedReturns.rows[0].cnt > 0) {
          await client.query('ROLLBACK');
          res.status(400).json({ success: false, error: `이 매출에 연결된 반품 ${linkedReturns.rows[0].cnt}건이 있어 삭제할 수 없습니다. 반품을 먼저 삭제해주세요.` });
          return;
        }
      }

      // 반품 건이 아닌 경우에만 재고 복원
      if (old.sale_type !== '반품') {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, old.qty, 'SALE_DELETE', saleId, req.user!.userId, client,
        );
      } else {
        // 반품 건 삭제 시 재고 다시 차감
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, -old.qty, 'SALE_DELETE', saleId, req.user!.userId, client,
        );
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

// 직접 반품 등록 (원본 매출 없이 - 매장 고객 반품용)
router.post('/direct-return',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const { variant_id, qty, unit_price, reason, return_reason } = req.body;
    if (!variant_id || !qty || !unit_price) {
      res.status(400).json({ success: false, error: 'variant_id, qty, unit_price 필수' });
      return;
    }
    if (!return_reason) {
      res.status(400).json({ success: false, error: '반품 사유를 선택해주세요.' });
      return;
    }
    if (Number(qty) <= 0) {
      res.status(400).json({ success: false, error: '반품 수량은 양수여야 합니다.' });
      return;
    }
    if (Number(unit_price) <= 0) {
      res.status(400).json({ success: false, error: '단가는 양수여야 합니다.' });
      return;
    }

    const role = req.user?.role;
    const pc = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') ? req.user!.partnerCode : req.body.partner_code;
    if (!pc) {
      res.status(400).json({ success: false, error: 'partner_code 필수' });
      return;
    }

    const total_price = Math.round(qty * unit_price);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, return_reason, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6, $7) RETURNING *`,
        [pc, variant_id, qty, unit_price, -total_price, return_reason, reason || '매장 고객 반품'],
      );

      // 재고 복원 (+qty)
      await inventoryRepository.applyChange(
        pc, variant_id, qty, 'RETURN', returnSale.rows[0].sale_id, req.user!.userId, client,
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: returnSale.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 반품 등록 (원본 매출 기반)
router.post('/:id/return',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const { qty, reason, return_reason } = req.body;
    if (!return_reason) {
      res.status(400).json({ success: false, error: '반품 사유를 선택해주세요.' });
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '원본 매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 매장 매니저: 당일 매출만 반품 가능
      if (req.user?.role === 'STORE_MANAGER') {
        const dayCheck = await client.query(
          `SELECT sale_date::date = CURRENT_DATE AS is_today FROM sales WHERE sale_id = $1`, [saleId],
        );
        if (!dayCheck.rows[0]?.is_today) {
          await client.query('ROLLBACK');
          res.status(403).json({ success: false, error: '당일 매출만 반품 처리할 수 있습니다.' });
          return;
        }
      }

      const returnQty = qty || old.qty;

      // 이전 반품 누적 수량 조회 (원본#saleId 패턴으로 연결된 반품 건)
      const prevReturns = await client.query(
        `SELECT COALESCE(SUM(qty), 0)::int AS total_returned
         FROM sales WHERE sale_type = '반품' AND memo LIKE $1`,
        [`반품(원본#${saleId})`],
      );
      const alreadyReturned = prevReturns.rows[0]?.total_returned || 0;
      const remainingQty = old.qty - alreadyReturned;

      if (returnQty > remainingQty) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          error: remainingQty <= 0
            ? `이미 전량 반품 처리되었습니다. (원본 ${old.qty}개, 반품완료 ${alreadyReturned}개)`
            : `반품 가능 수량을 초과합니다. (원본 ${old.qty}개, 반품완료 ${alreadyReturned}개, 남은 ${remainingQty}개)`,
        });
        return;
      }
      const total_price = Math.round(returnQty * old.unit_price);

      // 반품 매출 레코드 생성
      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, return_reason, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6, $7) RETURNING *`,
        [old.partner_code, old.variant_id, returnQty, old.unit_price, -total_price, return_reason, reason ? `반품(원본#${saleId}) ${reason}` : `반품(원본#${saleId})`],
      );

      // 재고 복원 (+qty)
      await inventoryRepository.applyChange(
        old.partner_code, old.variant_id, returnQty, 'RETURN', returnSale.rows[0].sale_id, req.user!.userId, client,
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: returnSale.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 교환 처리 (반품 + 새 판매를 단일 트랜잭션으로)
router.post('/:id/exchange',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const originalSaleId = Number(req.params.id);
    const { new_variant_id, new_qty, new_unit_price, return_reason, memo } = req.body;
    if (!new_variant_id || !new_qty || new_unit_price === undefined || new_unit_price === null) {
      res.status(400).json({ success: false, error: 'new_variant_id, new_qty, new_unit_price 필수' });
      return;
    }
    if (!return_reason) {
      res.status(400).json({ success: false, error: '교환 사유를 선택해주세요.' });
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 원본 매출 조회
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [originalSaleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '원본 매출을 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 반품 처리 (원본 상품)
      const returnTotal = Math.round(old.qty * old.unit_price);
      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, return_reason, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6, $7) RETURNING *`,
        [old.partner_code, old.variant_id, old.qty, old.unit_price, -returnTotal, return_reason, `교환반품(원본#${originalSaleId})`],
      );
      await inventoryRepository.applyChange(
        old.partner_code, old.variant_id, old.qty, 'RETURN', returnSale.rows[0].sale_id, req.user!.userId, client,
      );

      // 새 판매 처리 (교환 상품)
      const newTotal = Math.round(new_qty * new_unit_price);
      const newSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '정상', $6) RETURNING *`,
        [old.partner_code, new_variant_id, new_qty, new_unit_price, newTotal, `교환판매(원본#${originalSaleId})`],
      );
      await inventoryRepository.applyChange(
        old.partner_code, new_variant_id, -new_qty, 'SALE', newSale.rows[0].sale_id, req.user!.userId, client,
      );

      // 교환 레코드 생성
      await client.query(
        `INSERT INTO sales_exchanges (original_sale_id, return_sale_id, new_sale_id, exchange_date, memo, created_by)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)`,
        [originalSaleId, returnSale.rows[0].sale_id, newSale.rows[0].sale_id, memo || null, req.user!.userId],
      );

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: {
          return_sale: returnSale.rows[0],
          new_sale: newSale.rows[0],
        },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 교환 이력 조회
router.get('/exchanges/list', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '50' } = req.query;
  const p = parseInt(page as string, 10);
  const l = Math.min(parseInt(limit as string, 10), 100);
  const offset = (p - 1) * l;
  const pool = getPool();

  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerFilter = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc
    ? 'AND os.partner_code = $3' : '';
  const params: any[] = [l, offset];
  if (partnerFilter) params.push(pc);

  const countSql = `SELECT COUNT(*) FROM sales_exchanges se
    JOIN sales os ON se.original_sale_id = os.sale_id
    WHERE 1=1 ${partnerFilter ? 'AND os.partner_code = $1' : ''}`;
  const countParams = partnerFilter ? [pc] : [];
  const total = parseInt((await pool.query(countSql, countParams)).rows[0].count, 10);

  const dataSql = `
    SELECT se.*,
      os.variant_id AS orig_variant_id, os.qty AS orig_qty, os.unit_price AS orig_unit_price,
      opv.sku AS orig_sku, op.product_name AS orig_product_name, opv.color AS orig_color, opv.size AS orig_size,
      ns.variant_id AS new_variant_id, ns.qty AS new_qty, ns.unit_price AS new_unit_price,
      npv.sku AS new_sku, np.product_name AS new_product_name, npv.color AS new_color, npv.size AS new_size,
      pa.partner_name
    FROM sales_exchanges se
    JOIN sales os ON se.original_sale_id = os.sale_id
    JOIN sales ns ON se.new_sale_id = ns.sale_id
    JOIN product_variants opv ON os.variant_id = opv.variant_id
    JOIN products op ON opv.product_code = op.product_code
    JOIN product_variants npv ON ns.variant_id = npv.variant_id
    JOIN products np ON npv.product_code = np.product_code
    JOIN partners pa ON os.partner_code = pa.partner_code
    WHERE 1=1 ${partnerFilter}
    ORDER BY se.created_at DESC
    LIMIT $1 OFFSET $2`;
  const data = await pool.query(dataSql, params);
  res.json({ success: true, data: { data: data.rows, total, page: p, limit: l, totalPages: Math.ceil(total / l) } });
}));

export default router;
