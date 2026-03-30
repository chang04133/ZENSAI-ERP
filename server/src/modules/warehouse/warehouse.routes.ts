import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';
import { audit } from '../../core/audit';

const router = Router();
const admin = [authMiddleware, requireRole('ADMIN')];

// GET /api/warehouses — 전체 창고 목록
router.get('/', authMiddleware, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query(`
    SELECT w.*, pt.partner_name, pt.partner_type
    FROM warehouses w
    LEFT JOIN partners pt ON w.partner_code = pt.partner_code
    ORDER BY w.is_default DESC, w.warehouse_name
  `);
  res.json({ success: true, data: result.rows });
}));

// GET /api/warehouses/default — 기본 창고 조회
router.get('/default', authMiddleware, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query(
    `SELECT w.*, pt.partner_name FROM warehouses w
     LEFT JOIN partners pt ON w.partner_code = pt.partner_code
     WHERE w.is_default = TRUE AND w.is_active = TRUE LIMIT 1`,
  );
  res.json({ success: true, data: result.rows[0] || null });
}));

// POST /api/warehouses — 창고 생성 (ADMIN)
router.post('/', ...admin, asyncHandler(async (req, res) => {
  const { warehouse_code, warehouse_name, address, is_default } = req.body;
  if (!warehouse_code || !warehouse_name) {
    res.status(400).json({ success: false, error: '창고코드와 창고명은 필수입니다.' });
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 거래처에 없으면 자동 생성
    const existing = await client.query('SELECT partner_code FROM partners WHERE partner_code = $1', [warehouse_code]);
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO partners (partner_code, partner_name, partner_type, address, is_active)
         VALUES ($1, $2, '본사', $3, TRUE)`,
        [warehouse_code, warehouse_name, address || null],
      );
    }

    // 기본 창고 설정 시 기존 기본 해제
    if (is_default) {
      await client.query('UPDATE warehouses SET is_default = FALSE WHERE is_default = TRUE');
    }

    const result = await client.query(
      `INSERT INTO warehouses (warehouse_code, warehouse_name, partner_code, address, is_default)
       VALUES ($1, $2, $1, $3, $4) RETURNING *`,
      [warehouse_code, warehouse_name, address || null, is_default || false],
    );

    await client.query('COMMIT');
    await audit('warehouses', warehouse_code, 'INSERT', req.user!.userId, null, result.rows[0]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      res.status(409).json({ success: false, error: '이미 존재하는 창고코드입니다.' });
      return;
    }
    throw error;
  } finally {
    client.release();
  }
}));

// PUT /api/warehouses/:code — 창고 수정 (ADMIN)
router.put('/:code', ...admin, asyncHandler(async (req, res) => {
  const code = req.params.code as string;
  const { warehouse_name, address, is_default, is_active } = req.body;
  if (!warehouse_name) {
    res.status(400).json({ success: false, error: '창고명은 필수입니다.' });
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const old = await client.query('SELECT * FROM warehouses WHERE warehouse_code = $1', [code]);
    if (old.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: '창고를 찾을 수 없습니다.' });
      return;
    }

    // 기본 창고 설정 시 기존 기본 해제
    if (is_default) {
      await client.query('UPDATE warehouses SET is_default = FALSE WHERE is_default = TRUE AND warehouse_code != $1', [code]);
    }

    const result = await client.query(
      `UPDATE warehouses SET warehouse_name = $1, address = $2, is_default = $3, is_active = $4, updated_at = NOW()
       WHERE warehouse_code = $5 RETURNING *`,
      [warehouse_name, address || null, is_default ?? old.rows[0].is_default, is_active ?? true, code],
    );

    await client.query('COMMIT');
    await audit('warehouses', code, 'UPDATE', req.user!.userId, old.rows[0], result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch {
    await client.query('ROLLBACK');
    throw new Error('창고 수정 중 오류가 발생했습니다.');
  } finally {
    client.release();
  }
}));

// DELETE /api/warehouses/:code — 창고 비활성화 (ADMIN)
router.delete('/:code', ...admin, asyncHandler(async (req, res) => {
  const code = req.params.code as string;
  const pool = getPool();
  const old = await pool.query('SELECT * FROM warehouses WHERE warehouse_code = $1', [code]);
  if (old.rows.length === 0) {
    res.status(404).json({ success: false, error: '창고를 찾을 수 없습니다.' });
    return;
  }
  if (old.rows[0].is_default) {
    res.status(400).json({ success: false, error: '기본 창고는 비활성화할 수 없습니다. 다른 창고를 기본으로 설정한 후 비활성화하세요.' });
    return;
  }
  await pool.query('DELETE FROM warehouses WHERE warehouse_code = $1', [code]);
  await audit('warehouses', code, 'DELETE', req.user!.userId, old.rows[0], null);
  res.json({ success: true });
}));

// PUT /api/warehouses/:code/set-default — 기본 창고 변경 (ADMIN)
router.put('/:code/set-default', ...admin, asyncHandler(async (req, res) => {
  const code = req.params.code as string;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query('SELECT * FROM warehouses WHERE warehouse_code = $1 AND is_active = TRUE', [code]);
    if (target.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: '활성 창고를 찾을 수 없습니다.' });
      return;
    }
    await client.query('UPDATE warehouses SET is_default = FALSE WHERE is_default = TRUE');
    await client.query('UPDATE warehouses SET is_default = TRUE, updated_at = NOW() WHERE warehouse_code = $1', [code]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    throw new Error('기본 창고 변경 중 오류가 발생했습니다.');
  } finally {
    client.release();
  }
}));

export default router;
