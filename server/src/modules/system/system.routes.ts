import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';

const router = Router();
const admin = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN')];

// GET /api/system/audit-logs - 변경이력 조회
router.get('/audit-logs', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { page = '1', limit = '20', table_name, record_id } = req.query;
  const p = parseInt(page as string, 10);
  const l = parseInt(limit as string, 10);
  const offset = (p - 1) * l;

  let where = '';
  const params: any[] = [];
  let idx = 1;
  if (table_name) { where += ` AND table_name = $${idx}`; params.push(table_name); idx++; }
  if (record_id) { where += ` AND record_id = $${idx}`; params.push(record_id); idx++; }

  const countSql = `SELECT COUNT(*) FROM audit_logs WHERE 1=1 ${where}`;
  const total = parseInt((await pool.query(countSql, params)).rows[0].count, 10);

  const dataSql = `SELECT * FROM audit_logs WHERE 1=1 ${where} ORDER BY changed_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  const data = await pool.query(dataSql, [...params, l, offset]);
  res.json({ success: true, data: { data: data.rows, total, page: p, limit: l, totalPages: Math.ceil(total / l) } });
}));

// GET /api/system/deleted-data - 소프트 삭제된 데이터 조회
router.get('/deleted-data', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { table_name = 'partners' } = req.query;

  const allowedTables: Record<string, string> = {
    partners: 'SELECT * FROM partners WHERE is_active = FALSE ORDER BY updated_at DESC',
    products: 'SELECT * FROM products WHERE is_active = FALSE ORDER BY updated_at DESC',
    users: `SELECT u.user_id, u.user_name, u.partner_code, u.is_active, u.updated_at, rg.group_name as role_name
            FROM users u JOIN role_groups rg ON u.role_group = rg.group_id WHERE u.is_active = FALSE ORDER BY u.updated_at DESC`,
  };

  const sql = allowedTables[table_name as string];
  if (!sql) { res.status(400).json({ success: false, error: '유효하지 않은 테이블입니다.' }); return; }

  const result = await pool.query(sql);
  res.json({ success: true, data: result.rows });
}));

// POST /api/system/restore - 소프트 삭제 복원
const tablePkMap: Record<string, string> = {
  partners: 'partner_code',
  products: 'product_code',
  users: 'user_id',
};

router.post('/restore', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { table_name, id } = req.body;
  const pkColumn = tablePkMap[table_name];
  if (!pkColumn) { res.status(400).json({ success: false, error: '유효하지 않은 테이블입니다.' }); return; }

  await pool.query(`UPDATE ${table_name} SET is_active = TRUE, updated_at = NOW() WHERE ${pkColumn} = $1`, [id]);
  res.json({ success: true });
}));

// GET /api/system/settings - 시스템 설정 조회
router.get('/settings', ...admin, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query(
    "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' ORDER BY sort_order, code_value",
  );
  const settings: Record<string, string> = {};
  for (const r of result.rows) settings[r.code_value] = r.code_label;
  res.json({ success: true, data: settings });
}));

// PUT /api/system/settings - 시스템 설정 변경
router.put('/settings', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const updates = req.body as Record<string, string>;
  const allowed = [
    'LOW_STOCK_THRESHOLD', 'MEDIUM_STOCK_THRESHOLD',
    'SEASON_WEIGHT_SA_SA', 'SEASON_WEIGHT_SA_SM', 'SEASON_WEIGHT_SA_WN',
    'SEASON_WEIGHT_SM_SA', 'SEASON_WEIGHT_SM_SM', 'SEASON_WEIGHT_SM_WN',
    'SEASON_WEIGHT_WN_SA', 'SEASON_WEIGHT_WN_SM', 'SEASON_WEIGHT_WN_WN',
    'PRODUCTION_SALES_PERIOD_DAYS', 'PRODUCTION_SELL_THROUGH_THRESHOLD',
    'AUTO_PROD_GRADE_S_MIN', 'AUTO_PROD_GRADE_S_MULT',
    'AUTO_PROD_GRADE_A_MIN', 'AUTO_PROD_GRADE_A_MULT',
    'AUTO_PROD_GRADE_B_MIN', 'AUTO_PROD_GRADE_B_MULT',
    'AUTO_PROD_SAFETY_BUFFER',
    'EVENT_REC_BROKEN_SIZE_WEIGHT', 'EVENT_REC_LOW_SALES_WEIGHT',
    'EVENT_REC_SALES_PERIOD_DAYS', 'EVENT_REC_MIN_SALES_THRESHOLD',
    'EVENT_REC_MAX_RESULTS',
  ];
  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.includes(key)) continue;

    let saveVal: string;
    if (key.startsWith('SEASON_WEIGHT_')) {
      const fv = parseFloat(value);
      if (isNaN(fv) || fv < 0 || fv > 1) continue;
      saveVal = fv.toFixed(2);
    } else if (key.endsWith('_MULT') || key === 'AUTO_PROD_SAFETY_BUFFER') {
      const fv = parseFloat(value);
      if (isNaN(fv) || fv < 0) continue;
      saveVal = String(fv);
    } else {
      const numVal = parseInt(value, 10);
      if (isNaN(numVal) || numVal < 0) continue;
      saveVal = String(numVal);
    }

    await pool.query(
      `INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
       VALUES ('SETTING', $1, $2, 0)
       ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = $2`,
      [key, saveVal],
    );
  }
  res.json({ success: true });
}));

export default router;
