import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';

const router = Router();

router.get('/stats', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const isStore = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc;

  // 재고 부족 임계값 (기본 5)
  const lowThresholdR = await pool.query(
    "SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'LOW_STOCK_THRESHOLD'",
  );
  const lowThreshold = lowThresholdR.rows.length > 0 ? parseInt(lowThresholdR.rows[0].code_label, 10) || 5 : 5;

  // 파라미터화된 필터 구성
  const params: any[] = [];
  let pIdx = 1;

  let salesFilter = '';
  let invFilter = '';
  let shipFilter = '';

  if (isStore) {
    params.push(pc);
    salesFilter = `AND s.partner_code = $${pIdx}`;
    invFilter = `AND i.partner_code = $${pIdx}`;
    shipFilter = `AND (sr.from_partner = $${pIdx} OR sr.to_partner = $${pIdx})`;
    pIdx++;
  }

  // lowStock용 파라미터
  const lowStockParams = isStore ? [pc, lowThreshold] : [lowThreshold];
  const lowStockPcFilter = isStore ? `AND i.partner_code = $1` : '';
  const lowStockThresholdIdx = isStore ? 2 : 1;

  const [partners, products, shipments, inventory, sales, todaySales] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM partners WHERE is_active = TRUE'),
    pool.query('SELECT COUNT(*) FROM products WHERE is_active = TRUE'),
    pool.query(`SELECT
      COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type = '출고') as pending,
      COUNT(*) FILTER (WHERE status = 'SHIPPED' AND request_type = '출고') as shipped,
      COUNT(*) FILTER (WHERE status = 'RECEIVED' AND request_type = '출고') as received,
      COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type = '반품') as return_pending,
      COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type = '수평이동') as transfer_pending
    FROM shipment_requests sr WHERE 1=1 ${shipFilter}`, params),
    pool.query(`SELECT COALESCE(SUM(qty), 0) as total_qty, COUNT(*) as total_items FROM inventory i WHERE 1=1 ${invFilter}`, params),
    pool.query(`SELECT
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN total_price END), 0) as month_revenue,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN qty END), 0) as month_qty,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN total_price END), 0) as week_revenue,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN qty END), 0) as week_qty
    FROM sales s WHERE 1=1 ${salesFilter}`, params),
    pool.query(`SELECT
      COALESCE(SUM(total_price), 0) as today_revenue,
      COALESCE(SUM(qty), 0) as today_qty
    FROM sales s WHERE sale_date = CURRENT_DATE ${salesFilter}`, params),
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
    `, params),
    pool.query(`
      SELECT p.product_name, p.product_code, SUM(s.qty) as total_qty, SUM(s.total_price) as total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days' ${salesFilter}
      GROUP BY p.product_code, p.product_name
      ORDER BY total_qty DESC LIMIT 5
    `, params),
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
        AND COALESCE(pv.low_stock_alert, TRUE) = TRUE
        AND i.qty <= $${lowStockThresholdIdx} AND i.qty >= 0 ${lowStockPcFilter}
      ORDER BY i.qty ASC LIMIT 10
    `, lowStockParams),
    pool.query(`
      SELECT TO_CHAR(s.sale_date, 'MM/DD') as label,
             SUM(s.total_price) as revenue, SUM(s.qty) as qty
      FROM sales s
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '14 days' ${salesFilter}
      GROUP BY s.sale_date ORDER BY s.sale_date
    `, params),
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
      WHERE sr.status = 'PENDING'
      GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               sr.from_partner, sr.to_partner, sr.memo, sr.requested_by,
               fp.partner_name, tp.partner_name, u.user_name
      ORDER BY sr.created_at DESC
      LIMIT 20
    `),
  ]);

  // ── 할일/대기 항목 (역할별) ──
  const pendingActions: any = {};

  if (isStore) {
    const [shipmentsToProcess, shipmentsToReceive, restockPending] = await Promise.all([
      // 대기중 출고의뢰 (내 매장에서 출고해야 할 것)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'PENDING' AND sr.from_partner = $1
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc]),
      // 출고완료된 의뢰 (내 매장으로 수령확인 대기)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               fp.partner_name as from_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'SHIPPED' AND sr.to_partner = $1
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date, fp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc]),
      // 재입고 진행중 (내 매장 재입고 요청 중 미완료)
      pool.query(`
        SELECT rr.request_id, rr.request_no, rr.status, rr.request_date, rr.expected_date,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM restock_requests rr
        LEFT JOIN restock_request_items ri ON rr.request_id = ri.request_id
        WHERE rr.status IN ('DRAFT', 'APPROVED', 'ORDERED') AND rr.partner_code = $1
        GROUP BY rr.request_id, rr.request_no, rr.status, rr.request_date, rr.expected_date
        ORDER BY CASE rr.status WHEN 'ORDERED' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END, rr.created_at DESC
        LIMIT 20
      `, [pc]),
    ]);
    pendingActions.shipmentsToProcess = shipmentsToProcess.rows;
    pendingActions.shipmentsToReceive = shipmentsToReceive.rows;
    pendingActions.restockPending = restockPending.rows;
  } else {
    const [pendingRestocks, shippedAwaitingReceipt] = await Promise.all([
      // 재입고 승인 대기 (DRAFT 상태)
      pool.query(`
        SELECT rr.request_id, rr.request_no, rr.request_date, rr.expected_date,
               p.partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM restock_requests rr
        JOIN partners p ON rr.partner_code = p.partner_code
        LEFT JOIN restock_request_items ri ON rr.request_id = ri.request_id
        WHERE rr.status = 'DRAFT'
        GROUP BY rr.request_id, rr.request_no, rr.request_date, rr.expected_date, p.partner_name
        ORDER BY rr.created_at DESC LIMIT 20
      `),
      // 출고완료 → 수령확인 대기
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               fp.partner_name as from_partner_name, tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'SHIPPED'
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
                 fp.partner_name, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `),
    ]);
    pendingActions.pendingRestocks = pendingRestocks.rows;
    pendingActions.shippedAwaitingReceipt = shippedAwaitingReceipt.rows;
  }

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
      pendingActions,
      isStore: !!isStore,
      partnerCode: pc || null,
    },
  });
}));

export default router;
