import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Inventory } from '../../../../shared/types/inventory';
import { inventoryService } from './inventory.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

class InventoryController extends BaseController<Inventory> {
  constructor() {
    super(inventoryService);
  }

  /** 재고 조회용 매장 필터 — STORE_MANAGER는 타매장 재고도 조회 가능 */
  private getInventoryPartnerCode(req: Request): string | undefined {
    const role = req.user?.role;
    // STORE_STAFF만 자기 매장으로 강제, STORE_MANAGER는 전체 조회 가능
    if (role === 'STORE_STAFF' && req.user?.partnerCode) return req.user.partnerCode;
    return undefined;
  }

  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    // STORE_STAFF는 자기 매장만, STORE_MANAGER 이상은 전체 조회 가능
    const pc = this.getInventoryPartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inventoryService.listWithDetails(query);
    res.json({ success: true, data: result });
  });

  /** 매장별 재고 요약: 거래처별 총 수량/SKU수/상품수 — STORE_MANAGER도 조회 가능 */
  byPartner = asyncHandler(async (req: Request, res: Response) => {
    const pool = getPool();
    const role = req.user?.role;
    const canView = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'].includes(role || '');
    if (!canView) {
      res.status(403).json({ success: false, error: '접근 권한이 없습니다.' });
      return;
    }

    const { category, season, year } = req.query;
    const params: any[] = [];
    let idx = 1;
    const joinConds: string[] = [];

    const addMulti = (col: string, val: string | undefined) => {
      if (!val) return;
      const str = String(val);
      if (str.includes(',')) {
        const arr = str.split(',').map(s => s.trim()).filter(Boolean);
        joinConds.push(`${col} IN (${arr.map(() => `$${idx++}`).join(', ')})`);
        params.push(...arr);
      } else {
        joinConds.push(`${col} = $${idx}`); params.push(str); idx++;
      }
    };
    addMulti('p.category', category as string | undefined);
    addMulti('p.season', season as string | undefined);
    addMulti('p.year', year as string | undefined);

    const extraJoin = joinConds.length > 0 ? ' AND ' + joinConds.join(' AND ') : '';

    const sql = `
      SELECT
        pt.partner_code,
        pt.partner_name,
        pt.partner_type,
        COALESCE(SUM(i.qty), 0)::int AS total_qty,
        COUNT(DISTINCT pv.variant_id)::int AS sku_count,
        COUNT(DISTINCT p.product_code)::int AS product_count,
        COALESCE(SUM(CASE WHEN i.qty = 0 THEN 1 ELSE 0 END), 0)::int AS zero_stock_count
      FROM partners pt
      LEFT JOIN inventory i ON pt.partner_code = i.partner_code
      LEFT JOIN product_variants pv ON i.variant_id = pv.variant_id AND pv.is_active = TRUE
      LEFT JOIN products p ON pv.product_code = p.product_code AND p.is_active = TRUE${extraJoin}
      WHERE pt.is_active = TRUE
      GROUP BY pt.partner_code, pt.partner_name, pt.partner_type
      ORDER BY COALESCE(SUM(i.qty), 0) DESC
    `;

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  });

  /** 창고(본사) 재고 조회 — 매장매니저도 읽기 가능 */
  warehouseList = asyncHandler(async (req: Request, res: Response) => {
    const pool = getPool();
    // 기본 창고 파트너코드 조회
    const hqResult = await pool.query(
      "SELECT partner_code FROM warehouses WHERE is_default = TRUE AND is_active = TRUE LIMIT 1",
    );
    if (hqResult.rows.length === 0) {
      res.json({ success: true, data: { data: [], total: 0, sumQty: 0, page: 1, limit: 50, totalPages: 0 } });
      return;
    }
    const hqCode = hqResult.rows[0].partner_code;
    const query: any = { ...req.query, partner_code: hqCode };
    const result = await inventoryService.listWithDetails(query);
    res.json({ success: true, data: result });
  });

  /** 상품코드 기준 매장별 재고 조회 — STORE_MANAGER도 전체 매장 조회 가능 */
  byProduct = asyncHandler(async (req: Request, res: Response) => {
    const productCode = req.params.code;
    const pc = this.getInventoryPartnerCode(req);
    const pool = getPool();
    const params: any[] = [productCode];
    let pcFilter = '';
    if (pc) {
      params.push(pc);
      pcFilter = `AND i.partner_code = $2`;
    }
    const result = await pool.query(
      `SELECT i.inventory_id, i.partner_code, i.variant_id, i.qty,
              pt.partner_name, pv.sku, pv.color, pv.size
       FROM inventory i
       JOIN product_variants pv ON i.variant_id = pv.variant_id
       JOIN partners pt ON i.partner_code = pt.partner_code
       WHERE pv.product_code = $1 ${pcFilter}
       ORDER BY pt.partner_name, pv.color, pv.size`,
      params,
    );
    res.json({ success: true, data: result.rows });
  });

  /** 전체 통계 + 카테고리 + 시즌 + 핏 + 기장 요약 한번에 */
  dashboardStats = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const role = req.user?.role;
    const pc = req.user?.partnerCode;
    const scope = req.query.scope as string;
    // STORE_MANAGER 이상은 전체 통계 조회 가능
    const canSeeAll = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'].includes(role || '');
    // partner_code 쿼리 파라미터로 특정 매장 조회 가능
    const explicitPartner = req.query.partner_code as string | undefined;
    const partnerCode = (canSeeAll && explicitPartner) ? explicitPartner
      : canSeeAll ? undefined
      : role === 'STORE_STAFF' && pc ? pc : undefined;
    const [overall, byCategory, bySeason, byFit, byLength, byYear] = await Promise.all([
      inventoryRepository.overallStats(partnerCode),
      inventoryRepository.summaryByCategory(partnerCode),
      inventoryRepository.summaryBySeason(partnerCode),
      inventoryRepository.summaryByFit(partnerCode),
      inventoryRepository.summaryByLength(partnerCode),
      inventoryRepository.summaryByYear(partnerCode),
    ]);
    res.json({ success: true, data: { overall, byCategory, bySeason, byFit, byLength, byYear, isStore: !!partnerCode } });
  });

  /** 리오더 알림: 수량 임계값 기반 — 매장/본사 모두 지원 */
  reorderAlerts = asyncHandler(async (req: Request, res: Response) => {
    const pool = getPool();
    const role = req.user?.role;
    const pc = req.user?.partnerCode;
    const scope = req.query.scope as string;
    // STORE_MANAGER 이상은 전체 조회 가능
    const canSeeAll = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'].includes(role || '');
    const partnerCode = canSeeAll ? undefined
      : role === 'STORE_STAFF' && pc ? pc : undefined;

    const defaultUrgent = partnerCode ? 1 : 5;
    const defaultRecommend = partnerCode ? 3 : 10;
    // S-18: NaN-safe parseInt (0은 유효한 값이므로 || 대신 명시적 NaN 체크)
    const parsedUrgent = parseInt(req.query.urgent as string);
    const urgentThreshold = Number.isNaN(parsedUrgent) ? defaultUrgent : parsedUrgent;
    const parsedRecommend = parseInt(req.query.recommend as string);
    const recommendThreshold = Number.isNaN(parsedRecommend) ? defaultRecommend : parsedRecommend;
    const alertLimit = Math.min(parseInt(req.query.limit as string) || 500, 1000);

    const params: any[] = [];
    let paramIdx = 1;
    let pcSalesFilter = '';
    let pcInvFilter = '';
    if (partnerCode) {
      params.push(partnerCode);
      pcSalesFilter = `AND partner_code = $${paramIdx}`;
      pcInvFilter = `WHERE partner_code = $${paramIdx}`;
      paramIdx++;
    }
    const recIdx = paramIdx;
    params.push(recommendThreshold);
    paramIdx++;

    const sql = `
      WITH sales_7d AS (
        SELECT variant_id, COALESCE(SUM(-qty_change), 0)::int AS sold
        FROM inventory_transactions
        WHERE tx_type = 'SALE' AND created_at >= NOW() - INTERVAL '7 days'
          ${pcSalesFilter}
        GROUP BY variant_id
      ),
      sales_30d AS (
        SELECT variant_id, COALESCE(SUM(-qty_change), 0)::int AS sold
        FROM inventory_transactions
        WHERE tx_type = 'SALE' AND created_at >= NOW() - INTERVAL '30 days'
          ${pcSalesFilter}
        GROUP BY variant_id
      ),
      inv AS (
        SELECT variant_id, SUM(qty)::int AS total_qty
        FROM inventory
        ${pcInvFilter}
        GROUP BY variant_id
      )
      SELECT
        pv.variant_id, pv.sku, pv.color, pv.size,
        p.product_code, p.product_name, p.category,
        COALESCE(iv.total_qty, 0)::int AS current_qty,
        COALESCE(s7.sold, 0)::int AS sold_7d,
        COALESCE(s30.sold, 0)::int AS sold_30d,
        ROUND(COALESCE(s7.sold, 0) / 7.0, 2)::float AS daily_7d,
        ROUND(COALESCE(s30.sold, 0) / 30.0, 2)::float AS daily_30d,
        CASE WHEN COALESCE(s7.sold, 0) > 0
          THEN FLOOR(COALESCE(iv.total_qty, 0) / (s7.sold / 7.0))::int
          ELSE NULL END AS days_left_7d,
        CASE WHEN COALESCE(s30.sold, 0) > 0
          THEN FLOOR(COALESCE(iv.total_qty, 0) / (s30.sold / 30.0))::int
          ELSE NULL END AS days_left_30d
        ${partnerCode ? `,
        (SELECT COALESCE(json_agg(json_build_object(
          'partner_code', o.partner_code,
          'partner_name', op.partner_name,
          'partner_type', op.partner_type,
          'qty', o.qty
        ) ORDER BY o.qty DESC), '[]'::json)
        FROM inventory o
        JOIN partners op ON o.partner_code = op.partner_code
        WHERE o.variant_id = pv.variant_id AND o.partner_code != $1 AND o.qty > 0
        ) AS other_locations` : ''}
      FROM product_variants pv
      JOIN products p ON pv.product_code = p.product_code
      JOIN inv iv ON pv.variant_id = iv.variant_id
      LEFT JOIN sales_7d s7 ON pv.variant_id = s7.variant_id
      LEFT JOIN sales_30d s30 ON pv.variant_id = s30.variant_id
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND iv.total_qty <= $${recIdx}
      ORDER BY iv.total_qty ASC, p.product_name
      LIMIT $${paramIdx}
    `;
    params.push(alertLimit);

    const result = await pool.query(sql, params);
    const rows = result.rows;

    // 긴급: qty <= urgentThreshold
    const urgent = rows.filter((r: any) => r.current_qty <= urgentThreshold);
    // 추천: urgentThreshold < qty <= recommendThreshold
    const recommend = rows.filter((r: any) => r.current_qty > urgentThreshold);

    res.json({ success: true, data: { urgent, recommend, isStore: !!partnerCode } });
  });

  /** 재고찾기: 상품명/SKU/품번 검색 → 해당 variant의 매장별 재고 */
  searchItem = asyncHandler(async (req: Request, res: Response) => {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 1) {
      res.json({ success: true, data: { product: null, variants: [] } });
      return;
    }
    const pool = getPool();
    const pc = this.getInventoryPartnerCode(req);

    // 1) 상품 1건 찾기 (product_code 정확/부분 매치 or product_name/SKU ILIKE)
    const productSql = `
      SELECT p.product_code, p.product_name, p.category, p.fit, p.length, p.season
      FROM products p
      WHERE p.is_active = TRUE AND (
        p.product_code = $1
        OR p.product_code ILIKE $2
        OR p.product_name ILIKE $2
        OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_code = p.product_code AND pv.is_active = TRUE AND (pv.sku ILIKE $2 OR pv.barcode = $1 OR pv.custom_barcode = $1))
      )
      ORDER BY CASE WHEN p.product_code = $1 THEN 0 WHEN p.product_code ILIKE $2 THEN 1 ELSE 2 END, p.product_name
      LIMIT 1`;
    const productResult = await pool.query(productSql, [q, `%${q}%`]);
    if (productResult.rows.length === 0) {
      res.json({ success: true, data: { product: null, variants: [] } });
      return;
    }
    const product = productResult.rows[0];

    // 2) 해당 상품의 모든 variant + 매장별 재고 (매장유저: 내 매장 우선 표시)
    const variantParams: any[] = [product.product_code];
    const variantsSql = `
      SELECT pv.variant_id, pv.sku, pv.color, pv.size,
             COALESCE(json_agg(
               json_build_object(
                 'partner_code', i.partner_code,
                 'partner_name', pt.partner_name,
                 'partner_type', pt.partner_type,
                 'qty', i.qty
               ) ORDER BY pt.partner_type DESC, i.qty DESC
             ) FILTER (WHERE i.partner_code IS NOT NULL), '[]'::json) AS locations,
             COALESCE(SUM(i.qty), 0)::int AS total_qty
             ${pc ? `, COALESCE((SELECT qty FROM inventory WHERE variant_id = pv.variant_id AND partner_code = $2), 0)::int AS my_store_qty` : ''}
      FROM product_variants pv
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.qty > 0
      LEFT JOIN partners pt ON i.partner_code = pt.partner_code
      WHERE pv.product_code = $1 AND pv.is_active = TRUE
      GROUP BY pv.variant_id, pv.sku, pv.color, pv.size
      ORDER BY pv.color, pv.size`;
    if (pc) variantParams.push(pc);
    const variants = await pool.query(variantsSql, variantParams);
    res.json({ success: true, data: { product, variants: variants.rows, partnerCode: pc || null } });
  });

  /** 재고찾기 자동완성: 상품명/SKU/품번 후보 목록 */
  searchSuggest = asyncHandler(async (req: Request, res: Response) => {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 1) {
      res.json({ success: true, data: [] });
      return;
    }
    const pool = getPool();
    const sql = `
      SELECT p.product_code, p.product_name, p.category
      FROM products p
      WHERE p.is_active = TRUE AND (
        p.product_code ILIKE $1
        OR p.product_name ILIKE $1
        OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_code = p.product_code AND pv.sku ILIKE $1)
      )
      ORDER BY p.product_name
      LIMIT 10`;
    const result = await pool.query(sql, [`%${q}%`]);
    res.json({ success: true, data: result.rows });
  });

  /** 시즌별 요약 */
  summaryBySeason = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const pc = this.getInventoryPartnerCode(req);
    const data = await inventoryRepository.summaryBySeason(pc);
    res.json({ success: true, data });
  });

  /** 시즌별 아이템 목록 */
  listBySeason = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const pc = this.getInventoryPartnerCode(req);
    const query: any = { ...req.query };
    if (pc) query.partner_code = pc;
    const data = await inventoryRepository.listBySeason(req.params.season as string, query);
    res.json({ success: true, data });
  });

  adjust = asyncHandler(async (req: Request, res: Response) => {
    const { partner_code, variant_id, qty_change, memo } = req.body;
    if (!partner_code || typeof partner_code !== 'string') {
      res.status(400).json({ success: false, error: '거래처코드는 필수입니다.' });
      return;
    }
    // S-2: 매장매니저는 자기 매장만 조정 가능
    const role = req.user?.role;
    if (role === 'STORE_MANAGER' && req.user?.partnerCode && partner_code !== req.user.partnerCode) {
      res.status(403).json({ success: false, error: '자신의 매장 재고만 조정할 수 있습니다.' });
      return;
    }
    if (!variant_id || !Number.isInteger(Number(variant_id)) || Number(variant_id) <= 0) {
      res.status(400).json({ success: false, error: '변형ID는 양의 정수여야 합니다.' });
      return;
    }
    if (qty_change === undefined || qty_change === null || !Number.isInteger(Number(qty_change))) {
      res.status(400).json({ success: false, error: '수량변동은 정수여야 합니다.' });
      return;
    }
    if (Number(qty_change) === 0) {
      res.status(400).json({ success: false, error: '조정 수량은 0이 아니어야 합니다.' });
      return;
    }
    // 거래처 / 변형 존재 여부 확인
    const pool = getPool();
    const [partnerCheck, variantCheck] = await Promise.all([
      pool.query('SELECT is_active, partner_name FROM partners WHERE partner_code = $1', [partner_code]),
      pool.query('SELECT 1 FROM product_variants WHERE variant_id = $1 AND is_active = TRUE', [Number(variant_id)]),
    ]);
    if (partnerCheck.rows.length === 0) {
      res.status(400).json({ success: false, error: '존재하지 않는 거래처 코드입니다.' });
      return;
    }
    if (!partnerCheck.rows[0].is_active) {
      res.status(400).json({ success: false, error: `비활성 거래처(${partnerCheck.rows[0].partner_name})의 재고를 조정할 수 없습니다.` });
      return;
    }
    if (variantCheck.rows.length === 0) {
      res.status(400).json({ success: false, error: '존재하지 않거나 비활성인 상품 변형입니다.' });
      return;
    }
    const result = await inventoryService.adjust(partner_code, variant_id, qty_change, req.user!.userId, memo);
    res.json({ success: true, data: result });
  });

  /** 재고처리 조회 (LOSS 트랜잭션 - 유실/폐기/증정/직원할인) */
  lossHistory = asyncHandler(async (req: Request, res: Response) => {
    const pool = getPool();
    const pc = this.getInventoryPartnerCode(req);
    const { date_from, date_to, search, loss_type } = req.query;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = ["it.tx_type = 'LOSS'"];
    const params: any[] = [];
    let idx = 1;

    if (pc) { conditions.push(`it.partner_code = $${idx}`); params.push(pc); idx++; }
    if (loss_type) { conditions.push(`it.loss_type = $${idx}`); params.push(loss_type); idx++; }
    if (date_from) { conditions.push(`it.created_at >= $${idx}::date`); params.push(date_from); idx++; }
    if (date_to) { conditions.push(`it.created_at < ($${idx}::date + 1)`); params.push(date_to); idx++; }
    if (search) {
      conditions.push(`(p.product_name ILIKE $${idx} OR pv.sku ILIKE $${idx} OR p.product_code ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const joinClause = `
      JOIN product_variants pv ON it.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code`;

    const countSql = `SELECT COUNT(*) FROM inventory_transactions it ${joinClause} ${whereClause}`;
    const total = parseInt((await pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT it.tx_id, it.ref_id, it.partner_code, it.variant_id, it.loss_type,
             ABS(it.qty_change)::int as loss_qty, it.created_at, it.created_by, it.memo,
             pv.sku, pv.color, pv.size, p.product_name, p.product_code, p.category,
             pt.partner_name,
             sr.request_no
      FROM inventory_transactions it
      ${joinClause}
      JOIN partners pt ON it.partner_code = pt.partner_code
      LEFT JOIN shipment_requests sr ON it.ref_id = sr.request_id
      ${whereClause}
      ORDER BY it.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
    const data = await pool.query(dataSql, [...params, limit, offset]);

    // 요약 통계 (JOIN 포함)
    const summarySql = `
      SELECT COUNT(*)::int as total_count,
             COALESCE(SUM(ABS(it.qty_change)), 0)::int as total_loss_qty,
             COUNT(DISTINCT it.variant_id)::int as variant_count
      FROM inventory_transactions it ${joinClause} ${whereClause}`;
    const summary = (await pool.query(summarySql, params)).rows[0];

    // 카테고리별 집계 (전체 기간, 필터 무관)
    const catConditions: string[] = ["it.tx_type = 'LOSS'"];
    const catParams: any[] = [];
    if (pc) { catConditions.push(`it.partner_code = $1`); catParams.push(pc); }
    const catWhere = catConditions.length > 0 ? 'WHERE ' + catConditions.join(' AND ') : '';
    const byCategorySql = `
      SELECT COALESCE(it.loss_type, 'LOST') as loss_type,
             COUNT(*)::int as count,
             COALESCE(SUM(ABS(it.qty_change)), 0)::int as qty
      FROM inventory_transactions it ${catWhere}
      GROUP BY COALESCE(it.loss_type, 'LOST')`;
    const byCategory = (await pool.query(byCategorySql, catParams)).rows;

    res.json({
      success: true,
      data: { data: data.rows, total, page, limit, totalPages: Math.ceil(total / limit), summary, byCategory },
    });
  });

  /** 재고처리 등록 (유실/폐기/증정/직원할인) */
  registerLoss = asyncHandler(async (req: Request, res: Response) => {
    const { partner_code, variant_id, qty, loss_type, memo } = req.body;
    const VALID_LOSS_TYPES = ['LOST', 'DISPOSE', 'GIFT', 'EMP_DISCOUNT'];
    if (!partner_code) { res.status(400).json({ success: false, error: '거래처코드는 필수입니다.' }); return; }
    if (!variant_id || Number(variant_id) <= 0) { res.status(400).json({ success: false, error: '상품을 선택해주세요.' }); return; }
    if (!qty || Number(qty) <= 0) { res.status(400).json({ success: false, error: '수량은 1 이상이어야 합니다.' }); return; }
    if (!loss_type || !VALID_LOSS_TYPES.includes(loss_type)) {
      res.status(400).json({ success: false, error: '유효한 처리유형을 선택해주세요.' }); return;
    }
    // 매장매니저: 자기 매장만
    const role = req.user?.role;
    if (role === 'STORE_MANAGER' && req.user?.partnerCode && partner_code !== req.user.partnerCode) {
      res.status(403).json({ success: false, error: '자신의 매장만 처리할 수 있습니다.' }); return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const qtyChange = -Math.abs(Number(qty));

      // 현재 재고 확인
      const cur = await client.query(
        'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2 FOR UPDATE',
        [partner_code, Number(variant_id)],
      );
      const currentQty = cur.rows[0] ? Number(cur.rows[0].qty) : 0;
      if (currentQty + qtyChange < 0) {
        throw new Error(`재고 부족: 현재 ${currentQty}개, 요청 ${Math.abs(qtyChange)}개`);
      }

      // 재고 차감
      await client.query(
        `INSERT INTO inventory (partner_code, variant_id, qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = inventory.qty + $3, updated_at = NOW()`,
        [partner_code, Number(variant_id), qtyChange],
      );
      const inv = await client.query(
        'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [partner_code, Number(variant_id)],
      );
      const qtyAfter = inv.rows[0]?.qty || 0;

      // 트랜잭션 기록
      await client.query(
        `INSERT INTO inventory_transactions (tx_type, partner_code, variant_id, qty_change, qty_after, created_by, memo, loss_type)
         VALUES ('LOSS', $1, $2, $3, $4, $5, $6, $7)`,
        [partner_code, Number(variant_id), qtyChange, qtyAfter, req.user!.userId, memo || null, loss_type],
      );

      await client.query('COMMIT');
      res.json({ success: true, data: { qty_after: qtyAfter } });
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  /** 재고 거래이력 조회 */
  transactions = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const query: any = { ...req.query };
    const pc = this.getInventoryPartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inventoryRepository.listTransactions(query);
    res.json({ success: true, data: result });
  });
  /** 악성재고 분석 */
  deadStock = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const { min_age_years, category } = req.query;
    const partnerCode = this.getInventoryPartnerCode(req) || undefined;
    // S-5: isNaN 체크
    const parsedAge = min_age_years ? parseInt(min_age_years as string, 10) : undefined;
    const data = await inventoryRepository.deadStockAnalysis({
      minAgeYears: parsedAge !== undefined && !Number.isNaN(parsedAge) ? parsedAge : undefined,
      category: category as string | undefined,
      partnerCode,
    });
    res.json({ success: true, data });
  });

}

export const inventoryController = new InventoryController();
