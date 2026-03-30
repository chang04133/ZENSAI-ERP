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

  // ── 1) 단순 집계를 하나의 SQL로 합침 (1 라운드트립) ──
  const aggregateSql = `SELECT
    (SELECT COUNT(*) FROM partners WHERE is_active = TRUE) as partner_count,
    (SELECT COUNT(*) FROM products WHERE is_active = TRUE) as product_count,
    (SELECT COALESCE(SUM(qty), 0) FROM inventory i WHERE 1=1 ${invFilter}) as total_inv_qty,
    (SELECT COUNT(*) FROM inventory i WHERE 1=1 ${invFilter}) as total_inv_items,
    (SELECT COALESCE(SUM(total_price), 0) FROM sales s WHERE sale_date = CURRENT_DATE ${salesFilter}) as today_revenue,
    (SELECT COALESCE(SUM(qty), 0) FROM sales s WHERE sale_date = CURRENT_DATE ${salesFilter}) as today_qty,
    (SELECT COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN total_price END), 0) FROM sales s WHERE 1=1 ${salesFilter}) as month_revenue,
    (SELECT COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN qty END), 0) FROM sales s WHERE 1=1 ${salesFilter}) as month_qty,
    (SELECT COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN total_price END), 0) FROM sales s WHERE 1=1 ${salesFilter}) as week_revenue,
    (SELECT COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN qty END), 0) FROM sales s WHERE 1=1 ${salesFilter}) as week_qty,
    (SELECT COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type = '출고') FROM shipment_requests sr WHERE 1=1 ${shipFilter}) as ship_pending,
    (SELECT COUNT(*) FILTER (WHERE status = 'SHIPPED' AND request_type = '출고') FROM shipment_requests sr WHERE 1=1 ${shipFilter}) as ship_shipped,
    (SELECT COUNT(*) FILTER (WHERE status = 'RECEIVED' AND request_type = '출고') FROM shipment_requests sr WHERE 1=1 ${shipFilter}) as ship_received,
    (SELECT COALESCE((SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'LOW_STOCK_THRESHOLD'), '5')) as low_threshold
  `;

  // ── 2) 복잡 쿼리 (JOIN/GROUP/ORDER) — 최대 7~8개, pool max=10 이내 ──
  const queries: Array<Promise<any>> = [
    /* 0 aggregate */ pool.query(aggregateSql, params),
    /* 1 recentShipments */ pool.query(`
      SELECT sr.request_no, sr.request_type, sr.status, sr.request_date,
             fp.partner_name as from_partner_name, tp.partner_name as to_partner_name
      FROM shipment_requests sr
      LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
      LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
      WHERE 1=1 ${shipFilter}
      ORDER BY sr.created_at DESC LIMIT 5
    `, params),
    /* 2 topProducts */ pool.query(`
      SELECT p.product_name, p.product_code, SUM(s.qty) as total_qty, SUM(s.total_price) as total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days' ${salesFilter}
      GROUP BY p.product_code, p.product_name
      ORDER BY total_qty DESC LIMIT 5
    `, params),
    /* 3 monthlySalesTrend */ pool.query(`
      SELECT TO_CHAR(s.sale_date, 'MM/DD') as label,
             SUM(s.total_price) as revenue, SUM(s.qty) as qty
      FROM sales s
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '14 days' ${salesFilter}
      GROUP BY s.sale_date ORDER BY s.sale_date
    `, params),
    /* 4 pendingApprovals */ isStore ? Promise.resolve({ rows: [] }) : pool.query(`
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
  ];

  // 역할별 할일 쿼리
  if (isStore) {
    queries.push(
      /* 5 */ pool.query(`
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
      /* 6 */ pool.query(`
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
      /* 7 */ pool.query(`
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
    );
  } else {
    queries.push(
      /* 5 */ pool.query(`
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
      /* 6 */ pool.query(`
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
    );
  }

  const results = await Promise.all(queries);

  // ── 결과 추출 ──
  const agg = results[0].rows[0];
  const lowThreshold = parseInt(agg.low_threshold, 10) || 5;

  // lowStock — threshold에 의존하므로 후속 실행
  const lowStockParams = isStore ? [pc, lowThreshold] : [lowThreshold];
  const lowStockPcFilter = isStore ? `AND i.partner_code = $1` : '';
  const lowStockThresholdIdx = isStore ? 2 : 1;
  const lowStock = await pool.query(`
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
  `, lowStockParams);

  // 할일/대기 항목
  const pendingActions: any = {};
  if (isStore) {
    pendingActions.shipmentsToProcess = results[5].rows;
    pendingActions.shipmentsToReceive = results[6].rows;
    pendingActions.restockPending = results[7].rows;
  } else {
    pendingActions.pendingRestocks = results[5].rows;
    pendingActions.shippedAwaitingReceipt = results[6].rows;
  }

  res.json({
    success: true,
    data: {
      partners: parseInt(agg.partner_count, 10),
      products: parseInt(agg.product_count, 10),
      shipments: {
        pending: agg.ship_pending,
        shipped: agg.ship_shipped,
        received: agg.ship_received,
      },
      inventory: {
        totalQty: parseInt(agg.total_inv_qty, 10),
        totalItems: parseInt(agg.total_inv_items, 10),
      },
      sales: {
        month_revenue: agg.month_revenue,
        month_qty: agg.month_qty,
        week_revenue: agg.week_revenue,
        week_qty: agg.week_qty,
      },
      todaySales: {
        today_revenue: agg.today_revenue,
        today_qty: agg.today_qty,
      },
      recentShipments: results[1].rows,
      topProducts: results[2].rows,
      lowStock: lowStock.rows,
      monthlySalesTrend: results[3].rows,
      pendingApprovals: results[4].rows,
      pendingActions,
      isStore: !!isStore,
      partnerCode: pc || null,
    },
  });
}));

export default router;
