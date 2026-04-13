import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';

const router = Router();

// POST /api/notifications/stock-request — 재고 요청 알림 + 수평이동 의뢰 생성
router.post('/stock-request', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const userId = req.user!.userId;
  const fromPartner = req.user!.partnerCode;
  if (!fromPartner) {
    res.status(400).json({ success: false, error: '매장 사용자만 재고 요청을 보낼 수 있습니다.' });
    return;
  }

  const { variant_id, from_qty, targets: rawTargets } = req.body;
  // targets: [{ partner_code, qty }]
  if (!variant_id || !rawTargets || !Array.isArray(rawTargets) || rawTargets.length === 0) {
    res.status(400).json({ success: false, error: 'variant_id와 targets는 필수입니다.' });
    return;
  }

  // 본사 거래처 제외
  const hqResult = await pool.query(
    `SELECT partner_code FROM partners WHERE partner_type = '본사'`,
  );
  const hqCodes = new Set(hqResult.rows.map((r: any) => r.partner_code));
  const targets = rawTargets.filter((t: any) => !hqCodes.has(t.partner_code));
  if (targets.length === 0) {
    res.status(400).json({ success: false, error: '수평이동 가능한 매장이 없습니다. (본사/창고 제외)' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted: number[] = [];

    // 1. 각 대상 매장에 알림 생성
    for (const t of targets) {
      const r = await client.query(
        `INSERT INTO stock_notifications (from_partner_code, to_partner_code, variant_id, from_qty, to_qty, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING notification_id`,
        [fromPartner, t.partner_code, variant_id, from_qty || 0, t.qty || 0, userId],
      );
      inserted.push(r.rows[0].notification_id);
    }

    // 2. 하나의 수평이동 의뢰 생성 (target_partners에 모든 대상 매장 저장)
    const targetPartners = targets.map((t: any) => t.partner_code).join(',');
    const noResult = await client.query('SELECT generate_shipment_no() as no');
    const requestNo = noResult.rows[0].no;
    const qty = Number(targets[0]?.qty) || 1;

    const shipment = await client.query(
      `INSERT INTO shipment_requests
       (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by, target_partners)
       VALUES ($1, CURRENT_DATE, NULL, $2, '수평이동', 'PENDING', $3, $4, $5)
       RETURNING request_id`,
      [requestNo, fromPartner,
       `재고부족 수평이동 요청 (알림 #${inserted.join(',')})`, userId, targetPartners],
    );
    const requestId = shipment.rows[0].request_id;

    await client.query(
      `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
       VALUES ($1, $2, $3, 0, 0)`,
      [requestId, variant_id, qty > 0 ? qty : 1],
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { count: inserted.length, ids: inserted, requestNos: [requestNo] } });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// GET /api/notifications — 내게 온 알림 목록
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const { status = 'PENDING', limit = '20' } = req.query;
  const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 100);

  // 어드민/본사: 본사로 온 알림 + 전체 알림 조회 가능
  // 매장: 자기 매장으로 온 알림만
  let filter: string;
  const params: any[] = [status, limitNum];

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
  const notifId = parseInt(req.params.id as string, 10);
  if (isNaN(notifId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }

  // 매장 사용자는 자기 매장 알림만 읽음 처리 가능
  const pc = req.user?.partnerCode;
  if (pc) {
    const check = await pool.query('SELECT to_partner_code FROM stock_notifications WHERE notification_id = $1', [notifId]);
    if (check.rows[0] && check.rows[0].to_partner_code !== pc) {
      res.status(403).json({ success: false, error: '자신의 매장 알림만 처리할 수 있습니다.' });
      return;
    }
  }

  await pool.query(
    `UPDATE stock_notifications SET status = 'READ', read_at = NOW() WHERE notification_id = $1 AND status = 'PENDING'`,
    [notifId],
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

    // 매장 소유권 검증: STORE_MANAGER는 자기 매장 알림만 처리 가능
    const userRole = req.user?.role;
    const userPc = req.user?.partnerCode;
    if ((userRole === 'STORE_MANAGER' || userRole === 'STORE_STAFF') && userPc) {
      if (n.to_partner_code !== userPc && n.from_partner_code !== userPc) {
        await client.query('ROLLBACK');
        res.status(403).json({ success: false, error: '자신의 매장 알림만 처리할 수 있습니다.' });
        return;
      }
    }

    const qtyParsed = parseInt(req.body.qty, 10);
    const qty = isNaN(qtyParsed) || qtyParsed <= 0 ? 1 : qtyParsed;

    // 이미 생성된 수평이동 의뢰가 있는지 확인
    // 1) target_partners 방식 (from_partner IS NULL, target_partners에 대상매장 포함)
    // 2) 레거시 방식 (from_partner = 대상매장)
    const existing = await client.query(
      `SELECT sr.request_id, sr.request_no, sr.from_partner, sr.target_partners FROM shipment_requests sr
       JOIN shipment_request_items sri ON sr.request_id = sri.request_id
       WHERE sr.to_partner = $1 AND sri.variant_id = $2 AND sr.request_type = '수평이동' AND sr.status = 'PENDING'
         AND (
           (sr.from_partner IS NULL AND sr.target_partners IS NOT NULL AND $3 = ANY(string_to_array(sr.target_partners, ',')))
           OR sr.from_partner = $3
         )
       LIMIT 1`,
      [n.from_partner_code, n.variant_id, n.to_partner_code],
    );

    let requestId: number;
    let requestNo: string;

    if (existing.rows.length > 0) {
      // 이미 의뢰가 있으면 수량 업데이트 + from_partner 설정
      requestId = existing.rows[0].request_id;
      requestNo = existing.rows[0].request_no;
      await client.query(
        `UPDATE shipment_request_items SET request_qty = $1 WHERE request_id = $2 AND variant_id = $3`,
        [qty, requestId, n.variant_id],
      );
      // multi-target → 이 매장이 수락: from_partner 설정
      if (!existing.rows[0].from_partner && existing.rows[0].target_partners) {
        await client.query(
          `UPDATE shipment_requests SET from_partner = $1, target_partners = NULL, updated_at = NOW() WHERE request_id = $2`,
          [n.to_partner_code, requestId],
        );
      }
    } else {
      // 의뢰 새로 생성 (알림과 연결된 의뢰가 없는 경우)
      const noResult = await client.query('SELECT generate_shipment_no() as no');
      requestNo = noResult.rows[0].no;
      const shipment = await client.query(
        `INSERT INTO shipment_requests
         (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by)
         VALUES ($1, CURRENT_DATE, $2, $3, '수평이동', 'PENDING', $4, $5)
         RETURNING *`,
        [requestNo, n.to_partner_code, n.from_partner_code,
         `재고부족 요청 처리 (알림 #${n.notification_id})`, req.user!.userId],
      );
      requestId = shipment.rows[0].request_id;
      await client.query(
        `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
         VALUES ($1, $2, $3, 0, 0)`,
        [requestId, n.variant_id, qty],
      );
    }

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

// GET /api/notifications/my-pending-requests — 내가 보낸 활성 요청의 variant_id 목록
router.get('/my-pending-requests', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const pc = req.user?.partnerCode;
  if (!pc) {
    res.json({ success: true, data: [] });
    return;
  }
  const result = await pool.query(
    `SELECT DISTINCT variant_id FROM stock_notifications
     WHERE from_partner_code = $1 AND status IN ('PENDING', 'READ')`,
    [pc],
  );
  res.json({ success: true, data: result.rows.map((r: any) => r.variant_id) });
}));

// GET /api/notifications/general — 일반 알림 목록 (출고/생산 등)
router.get('/general', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const userId = req.user!.userId;
  const pc = req.user?.partnerCode;
  const { limit = '5' } = req.query;
  const lim = Math.min(parseInt(limit as string, 10) || 5, 20);

  // 본인 관련 알림만: 내가 생성했거나, 내 매장 대상이거나
  const conditions: string[] = [];
  const params: any[] = [lim];

  // 내가 만든 알림
  conditions.push(`created_by = $${params.length + 1}`);
  params.push(userId);

  if (pc) {
    // 내 매장 대상 알림
    conditions.push(`target_partner = $${params.length + 1}`);
    params.push(pc);
  }

  const filter = `WHERE (${conditions.join(' OR ')})`;

  const result = await pool.query(
    `SELECT * FROM general_notifications ${filter} ORDER BY created_at DESC LIMIT $1`,
    params,
  );
  res.json({ success: true, data: result.rows });
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
