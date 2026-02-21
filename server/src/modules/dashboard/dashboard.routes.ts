import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';
import { inventoryRepository } from '../inventory/inventory.repository';

const router = Router();

router.get('/stats', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  const pc = req.user?.partnerCode; // 매장 사용자면 partner_code 있음
  const isStore = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc;

  // 매장별 임계값 조회
  let lowThreshold: number;
  if (isStore) {
    const t = await inventoryRepository.getPartnerThresholds(pc!);
    lowThreshold = t.low;
  } else {
    lowThreshold = await inventoryRepository.getLowStockThreshold();
  }

  // 매장 사용자: 자기 매장만 필터
  const salesFilter = isStore ? `AND s.partner_code = '${pc}'` : '';
  const salesFilterSimple = isStore ? `AND partner_code = '${pc}'` : '';
  const invFilter = isStore ? `AND i.partner_code = '${pc}'` : '';
  const shipFilter = isStore ? `AND (sr.from_partner = '${pc}' OR sr.to_partner = '${pc}')` : '';

  const [partners, products, shipments, inventory, sales, todaySales] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM partners WHERE is_active = TRUE'),
    pool.query('SELECT COUNT(*) FROM products WHERE is_active = TRUE'),
    pool.query(`SELECT
      COUNT(*) FILTER (WHERE status = 'DRAFT') as draft,
      COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
      COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
      COUNT(*) FILTER (WHERE status = 'SHIPPED') as shipped,
      COUNT(*) FILTER (WHERE status = 'RECEIVED') as received
    FROM shipment_requests sr WHERE 1=1 ${shipFilter}`),
    pool.query(`SELECT COALESCE(SUM(qty), 0) as total_qty, COUNT(*) as total_items FROM inventory i WHERE 1=1 ${invFilter}`),
    pool.query(`SELECT
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN total_price END), 0) as month_revenue,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN qty END), 0) as month_qty,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN total_price END), 0) as week_revenue,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN qty END), 0) as week_qty
    FROM sales s WHERE 1=1 ${salesFilter}`),
    pool.query(`SELECT
      COALESCE(SUM(total_price), 0) as today_revenue,
      COALESCE(SUM(qty), 0) as today_qty
    FROM sales s WHERE sale_date = CURRENT_DATE ${salesFilter}`),
  ]);

  const [recentShipments, topProducts, lowStock, monthlySalesTrend, pendingApprovals] = await Promise.all([
    pool.query(`
      SELECT sr.request_no, sr.request_type, sr.status, sr.request_date,
             fp.partner_name as from_partner_name, tp.partner_name as to_partner_name
      FROM shipment_requests sr
      LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
      LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
      WHERE 1=1 ${shipFilter}
      ORDER BY sr.created_at DESC LIMIT 5
    `),
    pool.query(`
      SELECT p.product_name, p.product_code, SUM(s.qty) as total_qty, SUM(s.total_price) as total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days' ${salesFilter}
      GROUP BY p.product_code, p.product_name
      ORDER BY total_qty DESC LIMIT 5
    `),
    pool.query(`
      SELECT i.qty, i.variant_id, i.partner_code, pv.sku, pv.color, pv.size,
             p.product_name, p.product_code, pt.partner_name,
             (SELECT COALESCE(json_agg(json_build_object(
                'partner_code', o.partner_code,
                'partner_name', op.partner_name,
                'partner_type', op.partner_type,
                'qty', o.qty
              ) ORDER BY o.qty DESC), '[]'::json)
              FROM inventory o
              JOIN partners op ON o.partner_code = op.partner_code
              WHERE o.variant_id = i.variant_id AND o.partner_code != i.partner_code AND o.qty > 0
             ) AS other_locations
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND i.qty <= $1 AND i.qty >= 0 ${invFilter}
      ORDER BY i.qty ASC LIMIT 10
    `, [lowThreshold]),
    pool.query(`
      SELECT TO_CHAR(s.sale_date, 'MM/DD') as label,
             SUM(s.total_price) as revenue, SUM(s.qty) as qty
      FROM sales s
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '14 days' ${salesFilter}
      GROUP BY s.sale_date ORDER BY s.sale_date
    `),
    // 승인 대기 의뢰 (ADMIN/HQ만 의미있지만, 쿼리 자체는 항상 실행)
    isStore ? Promise.resolve({ rows: [] }) : pool.query(`
      SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
             sr.from_partner, sr.to_partner, sr.memo, sr.requested_by,
             fp.partner_name as from_partner_name, tp.partner_name as to_partner_name,
             u.user_name as requested_by_name,
             COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
             COUNT(ri.item_id)::int as item_count
      FROM shipment_requests sr
      LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
      LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
      LEFT JOIN users u ON sr.requested_by = u.user_id
      LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
      WHERE sr.status = 'DRAFT'
      GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               sr.from_partner, sr.to_partner, sr.memo, sr.requested_by,
               fp.partner_name, tp.partner_name, u.user_name
      ORDER BY sr.created_at DESC
      LIMIT 20
    `),
  ]);

  res.json({
    success: true,
    data: {
      partners: parseInt(partners.rows[0].count, 10),
      products: parseInt(products.rows[0].count, 10),
      shipments: shipments.rows[0],
      inventory: {
        totalQty: parseInt(inventory.rows[0].total_qty, 10),
        totalItems: parseInt(inventory.rows[0].total_items, 10),
      },
      sales: sales.rows[0],
      todaySales: todaySales.rows[0],
      recentShipments: recentShipments.rows,
      topProducts: topProducts.rows,
      lowStock: lowStock.rows,
      monthlySalesTrend: monthlySalesTrend.rows,
      pendingApprovals: pendingApprovals.rows,
      isStore: !!isStore,
      partnerCode: pc || null,
    },
  });
}));

export default router;
