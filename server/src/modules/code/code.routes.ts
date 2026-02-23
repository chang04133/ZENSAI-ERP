import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';

const router = Router();
const VALID_TYPES = ['CATEGORY', 'BRAND', 'YEAR', 'SEASON', 'ITEM', 'COLOR', 'SIZE', 'SHIPMENT_TYPE', 'FIT', 'LENGTH', 'SETTING'];

router.get('/', authMiddleware, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM master_codes ORDER BY code_type, sort_order, code_value');
  const grouped: Record<string, any[]> = {};
  for (const row of result.rows) {
    if (!grouped[row.code_type]) grouped[row.code_type] = [];
    grouped[row.code_type].push(row);
  }
  res.json({ success: true, data: grouped });
}));

router.get('/:type', authMiddleware, asyncHandler(async (req, res) => {
  const type = (req.params.type as string).toUpperCase();
  if (!VALID_TYPES.includes(type)) { res.status(400).json({ success: false, error: '유효하지 않은 코드 타입입니다.' }); return; }
  const pool = getPool();
  const result = await pool.query('SELECT * FROM master_codes WHERE code_type = $1 ORDER BY sort_order, code_value', [type]);
  res.json({ success: true, data: result.rows });
}));

router.post('/', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN'), asyncHandler(async (req, res) => {
  const { code_type, code_value, code_label, sort_order, parent_code } = req.body;
  if (!code_type || !code_value || !code_label) { res.status(400).json({ success: false, error: '코드타입, 코드값, 코드명은 필수입니다.' }); return; }
  if (!VALID_TYPES.includes(code_type.toUpperCase())) { res.status(400).json({ success: false, error: '유효하지 않은 코드 타입입니다.' }); return; }
  try {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO master_codes (code_type, code_value, code_label, sort_order, parent_code) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code_type.toUpperCase(), code_value.trim(), code_label.trim(), sort_order || 0, parent_code || null],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') { res.status(409).json({ success: false, error: '이미 존재하는 코드입니다.' }); return; }
    throw error;
  }
}));

router.put('/:id', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const { code_value, code_label, sort_order, is_active, parent_code } = req.body;
  const pool = getPool();
  const result = await pool.query(
    `UPDATE master_codes SET code_value=$1, code_label=$2, sort_order=$3, is_active=$4, parent_code=$5 WHERE code_id=$6 RETURNING *`,
    [code_value, code_label, sort_order ?? 0, is_active ?? true, parent_code ?? null, id],
  );
  if (result.rows.length === 0) { res.status(404).json({ success: false, error: '코드를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data: result.rows[0] });
}));

router.delete('/:id', authMiddleware, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const pool = getPool();
  await pool.query('DELETE FROM master_codes WHERE code_id = $1', [parseInt(req.params.id as string, 10)]);
  res.json({ success: true });
}));

export default router;
