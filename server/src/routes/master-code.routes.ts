import { Router } from 'express';
import { authMiddleware } from '../auth/middleware';
import { requireRole } from '../middleware/role-guard';
import { getPool } from '../db/connection';

const router = Router();

const VALID_TYPES = ['BRAND', 'YEAR', 'SEASON', 'ITEM', 'COLOR', 'SIZE'];

// GET /api/codes - 전체 코드 조회 (타입별 그룹)
router.get('/', authMiddleware, async (_req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM master_codes ORDER BY code_type, sort_order, code_value'
    );

    // Group by code_type
    const grouped: Record<string, any[]> = {};
    for (const row of result.rows) {
      if (!grouped[row.code_type]) grouped[row.code_type] = [];
      grouped[row.code_type].push(row);
    }

    res.json({ success: true, data: grouped });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/codes/:type - 특정 타입 코드 조회
router.get('/:type', authMiddleware, async (req, res) => {
  try {
    const type = (req.params.type as string).toUpperCase();
    if (!VALID_TYPES.includes(type)) {
      res.status(400).json({ success: false, error: '유효하지 않은 코드 타입입니다.' });
      return;
    }
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM master_codes WHERE code_type = $1 ORDER BY sort_order, code_value',
      [type]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/codes - 코드 추가
router.post('/',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const { code_type, code_value, code_label, sort_order } = req.body;
      if (!code_type || !code_value || !code_label) {
        res.status(400).json({ success: false, error: '코드타입, 코드값, 코드명은 필수입니다.' });
        return;
      }
      if (!VALID_TYPES.includes(code_type.toUpperCase())) {
        res.status(400).json({ success: false, error: '유효하지 않은 코드 타입입니다.' });
        return;
      }

      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [code_type.toUpperCase(), code_value.trim(), code_label.trim(), sort_order || 0]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 코드입니다.' });
        return;
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// PUT /api/codes/:id - 코드 수정
router.put('/:id',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { code_value, code_label, sort_order, is_active } = req.body;
      const pool = getPool();
      const result = await pool.query(
        `UPDATE master_codes SET code_value=$1, code_label=$2, sort_order=$3, is_active=$4
         WHERE code_id=$5 RETURNING *`,
        [code_value, code_label, sort_order ?? 0, is_active ?? true, id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: '코드를 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/codes/:id - 코드 삭제
router.delete('/:id',
  authMiddleware,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const pool = getPool();
      await pool.query('DELETE FROM master_codes WHERE code_id = $1', [id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
