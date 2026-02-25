import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Inventory } from '../../../../shared/types/inventory';
import { inventoryService } from './inventory.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { getStorePartnerCode } from '../../core/store-filter';

class InventoryController extends BaseController<Inventory> {
  constructor() {
    super(inventoryService);
  }

  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inventoryService.listWithDetails(query);
    res.json({ success: true, data: result });
  });

  /** 창고(본사) 재고 조회 — 매장매니저도 읽기 가능 */
  warehouseList = asyncHandler(async (req: Request, res: Response) => {
    const pool = getPool();
    // 본사 파트너코드 조회
    const hqResult = await pool.query(
      "SELECT partner_code FROM partners WHERE partner_type = '본사' AND is_active = TRUE LIMIT 1",
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

  /** 상품코드 기준 매장별 재고 조회 */
  byProduct = asyncHandler(async (req: Request, res: Response) => {
    const productCode = req.params.code;
    const pc = getStorePartnerCode(req);
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
    // scope=all이면 매장유저도 전체 데이터 조회 가능
    const partnerCode = scope === 'all' ? undefined
      : (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
    const [overall, byCategory, bySeason, byFit, byLength] = await Promise.all([
      inventoryRepository.overallStats(partnerCode),
      inventoryRepository.summaryByCategory(partnerCode),
      inventoryRepository.summaryBySeason(partnerCode),
      inventoryRepository.summaryByFit(partnerCode),
      inventoryRepository.summaryByLength(partnerCode),
    ]);
    res.json({ success: true, data: { overall, byCategory, bySeason, byFit, byLength, isStore: !!partnerCode } });
  });

  /** 리오더 알림: 수량 임계값 기반 — 매장/본사 모두 지원 */
  reorderAlerts = asyncHandler(async (req: Request, res: Response) => {
    const pool = getPool();
    const role = req.user?.role;
    const pc = req.user?.partnerCode;
    const scope = req.query.scope as string;
    const partnerCode = scope === 'all' ? undefined
      : (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;

    const defaultUrgent = partnerCode ? 1 : 5;
    const defaultRecommend = partnerCode ? 3 : 10;
    const urgentThreshold = parseInt(req.query.urgent as string) || defaultUrgent;
    const recommendThreshold = parseInt(req.query.recommend as string) || defaultRecommend;
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
      LIMIT ${alertLimit}
    `;

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
    const pc = getStorePartnerCode(req);

    // 1) 상품 1건 찾기 (product_code 정확/부분 매치 or product_name/SKU ILIKE)
    const productSql = `
      SELECT p.product_code, p.product_name, p.category, p.fit, p.length, p.season
      FROM products p
      WHERE p.is_active = TRUE AND (
        p.product_code = $1
        OR p.product_code ILIKE $2
        OR p.product_name ILIKE $2
        OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_code = p.product_code AND pv.is_active = TRUE AND (pv.sku ILIKE $2 OR pv.barcode = $1))
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
    const pc = getStorePartnerCode(req);
    const data = await inventoryRepository.summaryBySeason(pc);
    res.json({ success: true, data });
  });

  /** 시즌별 아이템 목록 */
  listBySeason = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const pc = getStorePartnerCode(req);
    const query: any = { ...req.query };
    if (pc) query.partner_code = pc;
    const data = await inventoryRepository.listBySeason(req.params.season as string, query);
    res.json({ success: true, data });
  });

  adjust = asyncHandler(async (req: Request, res: Response) => {
    const { partner_code, variant_id, qty_change, memo } = req.body;
    if (!partner_code || !variant_id || qty_change === undefined) {
      res.status(400).json({ success: false, error: '거래처코드, 변형ID, 수량변동은 필수입니다.' });
      return;
    }
    if (qty_change === 0) {
      res.status(400).json({ success: false, error: '조정 수량은 0이 아니어야 합니다.' });
      return;
    }
    const result = await inventoryService.adjust(partner_code, variant_id, qty_change, req.user!.userId, memo);
    res.json({ success: true, data: result });
  });

  /** 재고 거래이력 조회 */
  transactions = asyncHandler(async (req: Request, res: Response) => {
    const { inventoryRepository } = await import('./inventory.repository');
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inventoryRepository.listTransactions(query);
    res.json({ success: true, data: result });
  });
}

export const inventoryController = new InventoryController();
