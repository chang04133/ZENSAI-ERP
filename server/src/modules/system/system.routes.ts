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

  // M-5: 화이트리스트에서 검증된 키를 사용하여 SQL 구성
  const validatedTable = Object.keys(tablePkMap).find(k => k === table_name);
  if (!validatedTable) { res.status(400).json({ success: false, error: '유효하지 않은 테이블입니다.' }); return; }

  // M-15: 복원 + 감사로그를 트랜잭션으로 묶음
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE ${validatedTable} SET is_active = TRUE, updated_at = NOW() WHERE ${pkColumn} = $1`, [id]);
    const userId = req.user?.userId || 'unknown';
    await client.query(
      `INSERT INTO audit_logs (table_name, record_id, action, changed_by, old_data, new_data)
       VALUES ($1, $2, 'RESTORE', $3, '{"is_active": false}'::jsonb, '{"is_active": true}'::jsonb)`,
      [validatedTable, String(id), userId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ success: true });
}));

// GET /api/system/activity-logs - 활동 로그 조회
router.get('/activity-logs', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { page = '1', limit = '50', user_id, method, path: pathFilter, start_date, end_date } = req.query;
  const p = parseInt(page as string, 10);
  const l = Math.min(parseInt(limit as string, 10) || 50, 200);
  const offset = (p - 1) * l;

  let where = '';
  const params: any[] = [];
  let idx = 1;
  if (user_id) { where += ` AND user_id = $${idx}`; params.push(user_id); idx++; }
  if (method) { where += ` AND method = $${idx}`; params.push(method); idx++; }
  if (pathFilter) { where += ` AND path ILIKE $${idx}`; params.push(`%${pathFilter}%`); idx++; }
  if (start_date) { where += ` AND created_at >= $${idx}`; params.push(start_date); idx++; }
  if (end_date) { where += ` AND created_at < ($${idx}::date + 1)`; params.push(end_date); idx++; }

  const total = parseInt(
    (await pool.query(`SELECT COUNT(*) FROM activity_logs WHERE 1=1 ${where}`, params)).rows[0].count, 10,
  );
  const data = await pool.query(
    `SELECT * FROM activity_logs WHERE 1=1 ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, l, offset],
  );
  res.json({ success: true, data: { data: data.rows, total, page: p, limit: l, totalPages: Math.ceil(total / l) } });
}));

// GET /api/system/activity-logs/users - 활동 로그 사용자 목록 (전체 사용자)
router.get('/activity-logs/users', ...admin, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query(
    `SELECT user_id, user_name FROM users WHERE is_active = TRUE ORDER BY user_id`,
  );
  res.json({ success: true, data: result.rows });
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

// PUT /api/system/settings - 시스템 설정 변경 (M-16: 트랜잭션)
router.put('/settings', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const updates = req.body as Record<string, string>;
  const allowed = [
    'LOW_STOCK_THRESHOLD', 'MEDIUM_STOCK_THRESHOLD',
    'SEASON_WEIGHT_SA_SA', 'SEASON_WEIGHT_SA_SM', 'SEASON_WEIGHT_SA_WN',
    'SEASON_WEIGHT_SM_SA', 'SEASON_WEIGHT_SM_SM', 'SEASON_WEIGHT_SM_WN',
    'SEASON_WEIGHT_WN_SA', 'SEASON_WEIGHT_WN_SM', 'SEASON_WEIGHT_WN_WN',
    'PRODUCTION_SALES_PERIOD_DAYS', 'PRODUCTION_SELL_THROUGH_THRESHOLD',
    'AUTO_PROD_SALES_PERIOD_DAYS',
    'BROKEN_SIZE_MIN_SIZES', 'BROKEN_SIZE_QTY_THRESHOLD',
    'DEAD_STOCK_DEFAULT_MIN_AGE_YEARS',
    'RESTOCK_EXCLUDE_AGE_DAYS',
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;

      let saveVal: string;
      if (key.startsWith('SEASON_WEIGHT_')) {
        const fv = parseFloat(value);
        if (isNaN(fv) || fv < 0 || fv > 1) continue;
        saveVal = fv.toFixed(2);
      } else {
        const numVal = parseInt(value, 10);
        if (isNaN(numVal) || numVal < 0) continue;
        saveVal = String(numVal);
      }

      await client.query(
        `INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
         VALUES ('SETTING', $1, $2, 0)
         ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = $2`,
        [key, saveVal],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ success: true });
}));

export default router;
