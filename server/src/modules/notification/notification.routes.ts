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

// PUT /api/notifications/:id/resolve — 처리 완료
router.put('/:id/resolve', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  await pool.query(
    `UPDATE stock_notifications SET status = 'RESOLVED', read_at = COALESCE(read_at, NOW()) WHERE notification_id = $1`,
    [req.params.id],
  );
  res.json({ success: true });
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
