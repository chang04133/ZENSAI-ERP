import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();
const s = 'zensai';

function getPartnerFilter(req: Request): string | undefined {
  const role = req.user?.role;
  if (role === 'STORE_MANAGER' || role === 'STORE_STAFF') {
    return req.user?.partnerCode || undefined;
  }
  return (req.query.partner_code as string)?.trim() || undefined;
}

// ── 행거/마네킹 목록 조회 ──
router.get('/fixtures', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const partnerCode = getPartnerFilter(req);
  if (!partnerCode) { res.json({ success: true, data: [] }); return; }

  const { rows } = await pool.query(
    `SELECT * FROM ${s}.store_fixtures WHERE partner_code = $1 ORDER BY fixture_type, sort_order, fixture_id`,
    [partnerCode],
  );
  res.json({ success: true, data: rows });
}));

// ── 행거/마네킹 추가 ──
router.post('/fixtures', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { partner_code, fixture_type, fixture_name } = req.body;
  const userId = req.user?.userId || 'system';
  const role = req.user?.role;
  const pc = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') ? req.user?.partnerCode : partner_code;

  if (!pc || !fixture_type) {
    res.status(400).json({ success: false, error: 'partner_code, fixture_type 필수' }); return;
  }

  // 자동 이름: "행거 N" / "마네킹 N"
  const label = fixture_type === 'MANNEQUIN' ? '마네킹' : '행거';
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM ${s}.store_fixtures WHERE partner_code = $1 AND fixture_type = $2`,
    [pc, fixture_type],
  );
  const name = fixture_name || `${label} ${countRes.rows[0].cnt + 1}`;
  const sortOrder = countRes.rows[0].cnt;

  const { rows } = await pool.query(
    `INSERT INTO ${s}.store_fixtures (partner_code, fixture_type, fixture_name, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [pc, fixture_type, name, sortOrder, userId],
  );
  res.json({ success: true, data: rows[0] });
}));

// ── 행거/마네킹 수정 (상품 등록 포함) ──
router.put('/fixtures/:id', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { id } = req.params;
  const { fixture_name, products } = req.body;

  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];

  if (fixture_name !== undefined) { params.push(fixture_name); sets.push(`fixture_name = $${params.length}`); }
  if (products !== undefined) { params.push(products); sets.push(`products = $${params.length}`); }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE ${s}.store_fixtures SET ${sets.join(', ')} WHERE fixture_id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows.length) { res.status(404).json({ success: false, error: '항목을 찾을 수 없습니다' }); return; }
  res.json({ success: true, data: rows[0] });
}));

// ── 행거/마네킹 삭제 ──
router.delete('/fixtures/:id', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { id } = req.params;
  await pool.query(`DELETE FROM ${s}.store_fixtures WHERE fixture_id = $1`, [id]);
  res.json({ success: true });
}));

// ── 매장 평수 저장 ──
router.put('/store-area', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { partner_code, store_area } = req.body;
  const role = req.user?.role;
  const pc = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') ? req.user?.partnerCode : partner_code;

  if (!pc) { res.status(400).json({ success: false, error: 'partner_code 필수' }); return; }

  await pool.query(
    `UPDATE ${s}.partners SET store_area = $1 WHERE partner_code = $2`,
    [store_area || null, pc],
  );
  res.json({ success: true });
}));

// ── 매장 평수 조회 ──
router.get('/store-area', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const partnerCode = getPartnerFilter(req);
  if (!partnerCode) { res.json({ success: true, data: null }); return; }

  const { rows } = await pool.query(
    `SELECT store_area FROM ${s}.partners WHERE partner_code = $1`, [partnerCode],
  );
  res.json({ success: true, data: rows[0]?.store_area || null });
}));

// ── 행거별 매출 조회 ──
router.get('/fixture-sales', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const partnerCode = getPartnerFilter(req);
  const codes = ((req.query.product_codes as string) || '').split(',').map(c => c.trim()).filter(Boolean);

  if (!partnerCode || !codes.length) {
    res.json({ success: true, data: {} }); return;
  }

  const dateTo = (req.query.date_to as string) || new Date().toISOString().slice(0, 10);
  const dateFrom = (req.query.date_from as string) ||
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const sql = `
    SELECT p.product_code, p.product_name,
           COALESCE(SUM(sl.qty), 0)::int AS qty,
           COALESCE(SUM(sl.total_price), 0)::bigint AS revenue
    FROM ${s}.products p
    LEFT JOIN ${s}.product_variants pv ON pv.product_code = p.product_code
    LEFT JOIN ${s}.sales sl ON sl.variant_id = pv.variant_id
      AND sl.partner_code = $1
      AND sl.sale_date >= $2::date AND sl.sale_date <= $3::date
      AND COALESCE(sl.sale_type, '정상') NOT IN ('반품','수정')
    WHERE p.product_code = ANY($4)
    GROUP BY p.product_code, p.product_name`;

  const { rows } = await pool.query(sql, [partnerCode, dateFrom, dateTo, codes]);
  const map: Record<string, { product_name: string; qty: number; revenue: number }> = {};
  for (const r of rows) {
    map[r.product_code] = { product_name: r.product_name, qty: +r.qty, revenue: +r.revenue };
  }
  res.json({ success: true, data: map });
}));

export default router;
