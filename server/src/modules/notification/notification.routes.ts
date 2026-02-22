import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';

const router = Router();

// POST /api/notifications/stock-request — 재고 요청 알림 보내기
router.post('/stock-request', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const userId = req.user!.userId;
  const fromPartner = req.user!.partnerCode;
  if (!fromPartner) {
    res.status(400).json({ success: false, error: '매장 사용자만 재고 요청을 보낼 수 있습니다.' });
    return;
  }

  const { variant_id, from_qty, targets } = req.body;
  // targets: [{ partner_code, qty }]
  if (!variant_id || !targets || !Array.isArray(targets) || targets.length === 0) {
    res.status(400).json({ success: false, error: 'variant_id와 targets는 필수입니다.' });
    return;
  }

  const inserted: number[] = [];
  for (const t of targets) {
    const r = await pool.query(
      `INSERT INTO stock_notifications (from_partner_code, to_partner_code, variant_id, from_qty, to_qty, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING notification_id`,
      [fromPartner, t.partner_code, variant_id, from_qty || 0, t.qty || 0, userId],
    );
    inserted.push(r.rows[0].notification_id);
  }

  res.json({ success: true, data: { count: inserted.length, ids: inserted } });
}));

// GET /api/notifications — 내게 온 알림 목록
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const { status = 'PENDING', limit = '20' } = req.query;

  // 어드민/본사: 본사로 온 알림 + 전체 알림 조회 가능
  // 매장: 자기 매장으로 온 알림만
  let filter: string;
  const params: any[] = [status, parseInt(limit as string, 10)];

  if (pc) {
    filter = 'sn.to_partner_code = $3';
    params.push(pc);
  } else {
    // 어드민은 모든 알림 조회
    filter = '1=1';
  }

  const sql = `
    SELECT sn.notification_id, sn.from_partner_code, sn.to_partner_code,
           sn.variant_id, sn.from_qty, sn.to_qty, sn.status, sn.created_at, sn.read_at,
           fp.partner_name AS from_partner_name,
           tp.partner_name AS to_partner_name,
           pv.sku, pv.color, pv.size,
           p.product_code, p.product_name,
           u.user_name AS created_by_name
    FROM stock_notifications sn
    JOIN partners fp ON sn.from_partner_code = fp.partner_code
    JOIN partners tp ON sn.to_partner_code = tp.partner_code
    JOIN product_variants pv ON sn.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    LEFT JOIN users u ON sn.created_by = u.user_id
    WHERE sn.status = $1 AND ${filter}
    ORDER BY sn.created_at DESC
    LIMIT $2`;

  const result = await pool.query(sql, params);
  res.json({ success: true, data: result.rows });
}));

// PUT /api/notifications/:id/read — 읽음 처리
router.put('/:id/read', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  await pool.query(
    `UPDATE stock_notifications SET status = 'READ', read_at = NOW() WHERE notification_id = $1 AND status = 'PENDING'`,
    [req.params.id],
  );
  res.json({ success: true });
}));

// PUT /api/notifications/:id/resolve — 처리 완료 (같은 요청의 다른 알림 자동 취소)
router.put('/:id/resolve', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 수락할 알림 정보 조회
    const notif = await client.query(
      'SELECT from_partner_code, variant_id FROM stock_notifications WHERE notification_id = $1',
      [req.params.id],
    );
    if (notif.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: '알림을 찾을 수 없습니다.' });
      return;
    }

    const { from_partner_code, variant_id } = notif.rows[0];

    // 이 알림을 RESOLVED 처리
    await client.query(
      `UPDATE stock_notifications SET status = 'RESOLVED', read_at = COALESCE(read_at, NOW()) WHERE notification_id = $1`,
      [req.params.id],
    );

    // 같은 요청(같은 요청자 + 같은 상품)의 다른 PENDING 알림은 자동 취소
    const cancelled = await client.query(
      `UPDATE stock_notifications SET status = 'CANCELLED', read_at = NOW()
       WHERE from_partner_code = $1 AND variant_id = $2 AND notification_id != $3
         AND status IN ('PENDING', 'READ')
       RETURNING notification_id`,
      [from_partner_code, variant_id, req.params.id],
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { cancelledCount: cancelled.rowCount } });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// PUT /api/notifications/:id/process — 재고 요청 처리: 수평이동 생성 + 알림 RESOLVED
router.put('/:id/process', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 알림 조회
    const notif = await client.query(
      `SELECT * FROM stock_notifications WHERE notification_id = $1 AND status IN ('PENDING', 'READ')`,
      [req.params.id],
    );
    if (notif.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: '처리 가능한 알림을 찾을 수 없습니다.' });
      return;
    }

    const n = notif.rows[0];
    const qty = parseInt(req.body.qty, 10) || 1;

    // 의뢰번호 생성
    const noResult = await client.query('SELECT generate_shipment_no() as no');
    const requestNo = noResult.rows[0].no;

    // 수평이동 의뢰 생성 (from: 알림 받은 매장(to_partner), to: 요청한 매장(from_partner))
    const shipment = await client.query(
      `INSERT INTO shipment_requests
       (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by)
       VALUES ($1, CURRENT_DATE, $2, $3, '수평이동', 'PENDING', $4, $5)
       RETURNING *`,
      [requestNo, n.to_partner_code, n.from_partner_code,
       `재고부족 요청 처리 (알림 #${n.notification_id})`, req.user!.userId],
    );
    const requestId = shipment.rows[0].request_id;

    // 의뢰 품목 추가
    await client.query(
      `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
       VALUES ($1, $2, $3, 0, 0)`,
      [requestId, n.variant_id, qty],
    );

    // 알림 RESOLVED 처리
    await client.query(
      `UPDATE stock_notifications SET status = 'RESOLVED', read_at = COALESCE(read_at, NOW()) WHERE notification_id = $1`,
      [req.params.id],
    );

    // 같은 요청의 다른 PENDING 알림 자동 취소
    await client.query(
      `UPDATE stock_notifications SET status = 'CANCELLED', read_at = NOW()
       WHERE from_partner_code = $1 AND variant_id = $2 AND notification_id != $3
         AND status IN ('PENDING', 'READ')`,
      [n.from_partner_code, n.variant_id, req.params.id],
    );

    await client.query('COMMIT');

    // 생성된 의뢰 상세 반환
    const detail = await pool.query(
      `SELECT sr.*, fp.partner_name as from_partner_name, tp.partner_name as to_partner_name
       FROM shipment_requests sr
       LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
       LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
       WHERE sr.request_id = $1`, [requestId]);

    res.json({ success: true, data: { shipment: detail.rows[0], requestNo } });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// GET /api/notifications/count — 미읽음 알림 수
router.get('/count', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const pc = req.user?.partnerCode;
  let filter: string;
  const params: any[] = [];
  if (pc) {
    filter = 'to_partner_code = $1';
    params.push(pc);
  } else {
    filter = '1=1';
  }
  const r = await pool.query(`SELECT COUNT(*) FROM stock_notifications WHERE status = 'PENDING' AND ${filter}`, params);
  res.json({ success: true, data: { count: parseInt(r.rows[0].count, 10) } });
}));

export default router;
