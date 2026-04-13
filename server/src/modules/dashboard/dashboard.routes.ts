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
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' AND sale_type NOT IN ('반품', '수정') THEN total_price END), 0) as month_gross,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' AND sale_type != '수정' THEN total_price END), 0) as month_revenue,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN
        CASE WHEN sale_type = '반품' THEN -qty WHEN sale_type = '수정' THEN 0 ELSE qty END
      END), 0) as month_qty,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' AND sale_type NOT IN ('반품', '수정') THEN total_price END), 0) as week_gross,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' AND sale_type != '수정' THEN total_price END), 0) as week_revenue,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN
        CASE WHEN sale_type = '반품' THEN -qty WHEN sale_type = '수정' THEN 0 ELSE qty END
      END), 0) as week_qty,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' AND sale_type = '반품' THEN ABS(total_price) END), 0) as month_return,
      COALESCE(SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days' AND sale_type = '반품' THEN ABS(total_price) END), 0) as week_return
    FROM (
      SELECT s.sale_date, s.total_price, s.qty, s.sale_type FROM sales s WHERE 1=1 ${salesFilter}
      UNION ALL
      SELECT po.preorder_date, po.total_price, po.qty, '예약판매' as sale_type FROM preorders po WHERE po.status = '대기' AND po.fulfilled_sale_id IS NULL ${isStore ? `AND po.partner_code = $1` : ''}
    ) combined`, params),
    pool.query(`SELECT
      COALESCE(SUM(CASE WHEN sale_type != '수정' THEN total_price ELSE 0 END), 0) as today_revenue,
      COALESCE(SUM(CASE WHEN sale_type = '반품' THEN -qty WHEN sale_type = '수정' THEN 0 ELSE qty END), 0) as today_qty,
      COALESCE(SUM(CASE WHEN sale_type = '반품' THEN ABS(total_price) END), 0) as today_return,
      COALESCE(SUM(CASE WHEN sale_type NOT IN ('반품', '수정') THEN total_price END), 0) as today_gross,
      COALESCE(SUM(CASE WHEN sale_type = '정상' THEN total_price END), 0) as today_normal,
      COALESCE(SUM(CASE WHEN sale_type IN ('할인', '기획', '균일') THEN total_price END), 0) as today_discount,
      COALESCE(SUM(CASE WHEN sale_type = '행사' THEN total_price END), 0) as today_event,
      COALESCE(SUM(CASE WHEN sale_type = '예약판매' THEN total_price END), 0) as today_preorder,
      COUNT(CASE WHEN sale_type NOT IN ('반품', '수정') THEN 1 END)::int as today_sale_count,
      COUNT(CASE WHEN sale_type = '반품' THEN 1 END)::int as today_return_count
    FROM (
      SELECT s.total_price, s.qty, s.sale_type FROM sales s WHERE s.sale_date = CURRENT_DATE ${salesFilter ? salesFilter : ''}
      UNION ALL
      SELECT po.total_price, po.qty, '예약판매' as sale_type FROM preorders po WHERE po.preorder_date = CURRENT_DATE AND po.status = '대기' AND po.fulfilled_sale_id IS NULL ${isStore ? `AND po.partner_code = $${pIdx - 1}` : ''}
    ) combined`, params),
  ]);

  const [recentShipments, topProducts, lowStock, monthlySalesTrend, pendingApprovals] = await Promise.all([
    pool.query(`
      SELECT sr.request_no, sr.request_type, sr.status, sr.request_date,
             fp.partner_name as from_partner_name, tp.partner_name as to_partner_name
      FROM shipment_requests sr
      LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
      LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
      WHERE sr.request_type != '수평이동' ${shipFilter}
      ORDER BY sr.created_at DESC LIMIT 5
    `, params),
    pool.query(`
      SELECT p.product_name, p.product_code,
             SUM(CASE WHEN s.sale_type = '반품' THEN -s.qty WHEN s.sale_type = '수정' THEN 0 ELSE s.qty END) as total_qty,
             SUM(CASE WHEN s.sale_type != '수정' THEN s.total_price ELSE 0 END) as total_amount
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
      ORDER BY i.qty ASC LIMIT 7
    `, lowStockParams),
    pool.query(`
      SELECT TO_CHAR(sale_date, 'MM/DD') as label,
             SUM(CASE WHEN sale_type != '수정' THEN total_price ELSE 0 END) as revenue,
             SUM(CASE WHEN sale_type = '반품' THEN -qty WHEN sale_type = '수정' THEN 0 ELSE qty END) as qty,
             SUM(CASE WHEN sale_type = '반품' THEN ABS(total_price) ELSE 0 END) as return_amount
      FROM (
        SELECT s.sale_date, s.total_price, s.qty, s.sale_type FROM sales s WHERE s.sale_date >= CURRENT_DATE - INTERVAL '14 days' ${salesFilter}
        UNION ALL
        SELECT po.preorder_date, po.total_price, po.qty, '예약판매' as sale_type FROM preorders po WHERE po.preorder_date >= CURRENT_DATE - INTERVAL '14 days' AND po.status = '대기' AND po.fulfilled_sale_id IS NULL ${isStore ? `AND po.partner_code = $1` : ''}
      ) combined
      GROUP BY sale_date ORDER BY sale_date
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
      WHERE sr.status = 'PENDING' AND sr.request_type NOT IN ('수평이동', '반품')
      GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               sr.from_partner, sr.to_partner, sr.memo, sr.requested_by,
               fp.partner_name, tp.partner_name, u.user_name
      ORDER BY sr.created_at DESC
      LIMIT 20
    `),
  ]);

  // ── 할일/대기 항목 (역할별) ──
  const pendingActions: any = {};

  // ── 수량불일치(DISCREPANCY) 건수 조회 (역할 공통) ──
  const discrepancyResult = isStore
    ? await pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               fp.partner_name as from_partner_name, tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.shipped_qty), 0)::int as total_shipped_qty,
               COALESCE(SUM(ri.received_qty), 0)::int as total_received_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'DISCREPANCY' AND (sr.from_partner = $1 OR sr.to_partner = $1)
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
                 fp.partner_name, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc])
    : await pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               fp.partner_name as from_partner_name, tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.shipped_qty), 0)::int as total_shipped_qty,
               COALESCE(SUM(ri.received_qty), 0)::int as total_received_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'DISCREPANCY'
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
                 fp.partner_name, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `);
  pendingActions.discrepancies = discrepancyResult.rows;

  if (isStore) {
    const [shipmentsToReceive, shipmentsToShip] = await Promise.all([
      // 출고완료된 의뢰 (내 매장으로 수령확인 대기)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               fp.partner_name as from_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'SHIPPED' AND sr.to_partner = $1 AND sr.request_type != '수평이동'
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date, fp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc]),
      // 출고 처리 대기 (승인된 의뢰 중 내 매장에서 출고해야 하는 건)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'APPROVED' AND sr.from_partner = $1
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc]),
    ]);
    pendingActions.shipmentsToReceive = shipmentsToReceive.rows;
    pendingActions.shipmentsToShip = shipmentsToShip.rows;

    // 수평이동 대기 (매장 매니저용)
    const [transferToShip, transferToReceive] = await Promise.all([
      // 내가 보내야 할 수평이동 (PENDING, from_partner = 내 매장)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_date,
               tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'PENDING' AND sr.request_type = '수평이동' AND sr.from_partner = $1
        GROUP BY sr.request_id, sr.request_no, sr.request_date, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc]),
      // 내가 수령해야 할 수평이동 (SHIPPED, to_partner = 내 매장)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_date,
               fp.partner_name as from_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'SHIPPED' AND sr.request_type = '수평이동' AND sr.to_partner = $1
        GROUP BY sr.request_id, sr.request_no, sr.request_date, fp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `, [pc]),
    ]);
    pendingActions.transferToShip = transferToShip.rows;
    pendingActions.transferToReceive = transferToReceive.rows;
  } else {
    const [pendingRestocks, shippedAwaitingReceipt, pendingReturns] = await Promise.all([
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
      // 출고완료 → 수령확인 대기 (수평이동 제외 — 매장 간 처리)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_type, sr.request_date,
               fp.partner_name as from_partner_name, tp.partner_name as to_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'SHIPPED' AND sr.request_type != '수평이동'
        GROUP BY sr.request_id, sr.request_no, sr.request_type, sr.request_date,
                 fp.partner_name, tp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `),
      // 반품 승인 대기 (매장→본사, PENDING 상태)
      pool.query(`
        SELECT sr.request_id, sr.request_no, sr.request_date,
               fp.partner_name as from_partner_name,
               COALESCE(SUM(ri.request_qty), 0)::int as total_qty,
               COUNT(ri.item_id)::int as item_count
        FROM shipment_requests sr
        LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
        LEFT JOIN shipment_request_items ri ON sr.request_id = ri.request_id
        WHERE sr.status = 'PENDING' AND sr.request_type = '반품'
        GROUP BY sr.request_id, sr.request_no, sr.request_date, fp.partner_name
        ORDER BY sr.created_at DESC LIMIT 20
      `),
    ]);
    pendingActions.pendingRestocks = pendingRestocks.rows;
    pendingActions.shippedAwaitingReceipt = shippedAwaitingReceipt.rows;
    pendingActions.pendingReturns = pendingReturns.rows;
  }

  // 예약판매 미처리 건수 (preorders 테이블)
  const preorderResult = isStore
    ? await pool.query(`SELECT COUNT(*)::int AS cnt FROM preorders WHERE status = '대기' AND partner_code = $1`, [pc])
    : await pool.query(`SELECT COUNT(*)::int AS cnt FROM preorders WHERE status = '대기'`);
  const preorderCount = preorderResult.rows[0]?.cnt || 0;

  // 본사용: 매장별 예약판매 건수
  let preordersByPartner: any[] = [];
  if (!isStore) {
    const pbpResult = await pool.query(`
      SELECT po.partner_code, p.partner_name, COUNT(*)::int AS cnt
      FROM preorders po
      JOIN partners p ON po.partner_code = p.partner_code
      WHERE po.status = '대기'
      GROUP BY po.partner_code, p.partner_name
      ORDER BY cnt DESC
    `);
    preordersByPartner = pbpResult.rows;
  }

  // 오늘 판매 내역 상세 — 예약판매(orphaned preorders) 포함
  let todaySalesDetail: any[] = [];
  if (isStore && pc) {
    const detailRes = await pool.query(`
      SELECT * FROM (
        SELECT s.sale_id, s.qty, s.unit_price, s.total_price,
               COALESCE(s.sale_type, '정상') as sale_type,
               pv.sku, pv.color, pv.size, p.product_name,
               TO_CHAR(s.created_at, 'HH24:MI') as sale_time,
               s.created_at, pt.partner_name
        FROM sales s
        LEFT JOIN product_variants pv ON s.variant_id = pv.variant_id
        LEFT JOIN products p ON pv.product_code = p.product_code
        LEFT JOIN partners pt ON s.partner_code = pt.partner_code
        WHERE s.sale_date = CURRENT_DATE AND s.partner_code = $1
        UNION ALL
        SELECT po.preorder_id as sale_id, po.qty, po.unit_price, po.total_price,
               '예약판매' as sale_type,
               pv.sku, pv.color, pv.size, p.product_name,
               TO_CHAR(po.created_at, 'HH24:MI') as sale_time,
               po.created_at, pt.partner_name
        FROM preorders po
        LEFT JOIN product_variants pv ON po.variant_id = pv.variant_id
        LEFT JOIN products p ON pv.product_code = p.product_code
        LEFT JOIN partners pt ON po.partner_code = pt.partner_code
        WHERE po.preorder_date = CURRENT_DATE AND po.partner_code = $1
          AND po.status = '대기' AND po.fulfilled_sale_id IS NULL
      ) combined
      ORDER BY created_at DESC LIMIT 20
    `, [pc]);
    todaySalesDetail = detailRes.rows;
  } else if (!isStore) {
    // 본사/관리자: 전 매장 오늘 판매 내역 (최근 30건)
    const detailRes = await pool.query(`
      SELECT * FROM (
        SELECT s.sale_id, s.qty, s.unit_price, s.total_price,
               COALESCE(s.sale_type, '정상') as sale_type,
               pv.sku, pv.color, pv.size, p.product_name,
               TO_CHAR(s.created_at, 'HH24:MI') as sale_time,
               s.created_at, pt.partner_name
        FROM sales s
        LEFT JOIN product_variants pv ON s.variant_id = pv.variant_id
        LEFT JOIN products p ON pv.product_code = p.product_code
        LEFT JOIN partners pt ON s.partner_code = pt.partner_code
        WHERE s.sale_date = CURRENT_DATE AND s.sale_type != '수정'
        UNION ALL
        SELECT po.preorder_id as sale_id, po.qty, po.unit_price, po.total_price,
               '예약판매' as sale_type,
               pv.sku, pv.color, pv.size, p.product_name,
               TO_CHAR(po.created_at, 'HH24:MI') as sale_time,
               po.created_at, pt.partner_name
        FROM preorders po
        LEFT JOIN product_variants pv ON po.variant_id = pv.variant_id
        LEFT JOIN products p ON pv.product_code = p.product_code
        LEFT JOIN partners pt ON po.partner_code = pt.partner_code
        WHERE po.preorder_date = CURRENT_DATE
          AND po.status = '대기' AND po.fulfilled_sale_id IS NULL
      ) combined
      ORDER BY created_at DESC LIMIT 30
    `);
    todaySalesDetail = detailRes.rows;
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
      todaySalesDetail,
      recentShipments: recentShipments.rows,
      topProducts: topProducts.rows,
      lowStock: lowStock.rows,
      monthlySalesTrend: monthlySalesTrend.rows,
      pendingApprovals: pendingApprovals.rows,
      pendingActions,
      preorderCount,
      preordersByPartner,
      isStore: !!isStore,
      partnerCode: pc || null,
    },
  });
}));

export default router;
