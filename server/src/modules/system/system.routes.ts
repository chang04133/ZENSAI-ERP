import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';
import { inventoryRepository } from '../inventory/inventory.repository';
import fs from 'fs';
import path from 'path';

const router = Router();
const admin = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN')];
const adminHqStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

// docs 폴더 경로 해석
function resolveDocsDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '../docs'),
    path.resolve(process.cwd(), 'docs'),
    path.resolve(__dirname, '../../../../docs'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

// GET /api/system/docs - 문서 목록 조회
router.get('/docs', ...admin, asyncHandler(async (_req, res) => {
  const docsDir = resolveDocsDir();
  if (!docsDir) { res.status(404).json({ success: false, error: 'docs 폴더를 찾을 수 없습니다.' }); return; }
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
  const docs = files.map(f => {
    const stat = fs.statSync(path.join(docsDir, f));
    return { filename: f, updatedAt: stat.mtime.toISOString() };
  });
  res.json({ success: true, data: docs });
}));

// GET /api/system/docs/:filename - 개별 문서 조회
router.get('/docs/:filename', ...admin, asyncHandler(async (req, res) => {
  const filename = req.params.filename as string;
  if (!/^[\w\-]+\.md$/.test(filename)) {
    res.status(400).json({ success: false, error: '유효하지 않은 파일명입니다.' });
    return;
  }
  const docsDir = resolveDocsDir();
  if (!docsDir) { res.status(404).json({ success: false, error: 'docs 폴더를 찾을 수 없습니다.' }); return; }
  const filePath = path.join(docsDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '문서 파일을 찾을 수 없습니다.' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  res.json({ success: true, data: { content, updatedAt: stat.mtime.toISOString() } });
}));

// GET /api/system/test-results - 테스트 결과 JSON 조회
router.get('/test-results', ...admin, asyncHandler(async (_req, res) => {
  const docsDir = resolveDocsDir();
  if (!docsDir) { res.status(404).json({ success: false, error: 'docs 폴더를 찾을 수 없습니다.' }); return; }
  const filePath = path.join(docsDir, 'test-results.json');
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '테스트 결과 파일이 없습니다. 서버에서 npm run test:report를 실행하세요.' });
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const results = JSON.parse(raw);
  res.json({ success: true, data: { results, updatedAt: stat.mtime.toISOString() } });
}));

// GET /api/system/e2e-results - E2E 테스트 결과 JSON 조회
router.get('/e2e-results', asyncHandler(async (_req, res) => {
  const docsDir = resolveDocsDir();
  if (!docsDir) { res.status(404).json({ success: false, error: 'docs 폴더를 찾을 수 없습니다.' }); return; }
  const filePath = path.join(docsDir, 'e2e-results.json');
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: 'E2E 테스트 결과 파일이 없습니다. npx playwright test를 실행하세요.' });
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const results = JSON.parse(raw);
  res.json({ success: true, data: { results, updatedAt: stat.mtime.toISOString() } });
}));

// GET /api/system/e2e-screenshots — E2E 스크린샷 이미지 서빙 (?path=relative/path.png)
router.get('/e2e-screenshots', asyncHandler(async (req, res) => {
  const relPath = req.query.path as string;
  if (!relPath || !relPath.endsWith('.png') || relPath.includes('..')) {
    res.status(400).json({ success: false, error: '유효하지 않은 경로입니다.' });
    return;
  }
  const testResultsDir = path.resolve(process.cwd(), '../test-results');
  const filePath = path.resolve(testResultsDir, relPath);
  // 보안: test-results 디렉토리 내부인지 확인
  if (!filePath.startsWith(testResultsDir)) {
    res.status(403).json({ success: false, error: '접근이 거부되었습니다.' });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '스크린샷을 찾을 수 없습니다.' });
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
}));

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

// GET /api/system/store-activity-logs - 매장 활동 로그 조회 (매장매니저 이상)
router.get('/store-activity-logs', ...adminHqStore, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { page = '1', limit = '50', method, summary, start_date, end_date } = req.query;
  const p = parseInt(page as string, 10);
  const l = Math.min(parseInt(limit as string, 10) || 50, 200);
  const offset = (p - 1) * l;

  let where = '';
  const params: any[] = [];
  let idx = 1;

  // STORE_MANAGER는 자기 매장만 조회 가능
  const role = req.user?.role;
  if (role === 'STORE_MANAGER') {
    const partnerCode = req.user?.partnerCode;
    if (partnerCode) {
      where += ` AND partner_code = $${idx}`;
      params.push(partnerCode);
      idx++;
    }
  }

  if (method) { where += ` AND method = $${idx}`; params.push(method); idx++; }
  if (summary) { where += ` AND summary ILIKE $${idx}`; params.push(`%${summary}%`); idx++; }
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
  // 임계값 캐시 즉시 무효화
  inventoryRepository.invalidateThresholdCache();
  res.json({ success: true });
}));

// ═══ 권한 관리 ═══

// GET /api/system/permissions — ADMIN: 전체 역할별 권한 조회
router.get('/permissions', ...admin, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query(
    `SELECT group_id, group_name, description, permissions FROM role_groups ORDER BY group_id`,
  );
  res.json({ success: true, data: result.rows });
}));

// PUT /api/system/permissions — ADMIN: 역할별 권한 일괄 업데이트
router.put('/permissions', ...admin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const permissions = req.body.permissions as Record<string, Record<string, boolean>>;
  if (!permissions || typeof permissions !== 'object') {
    res.status(400).json({ success: false, error: '유효하지 않은 권한 데이터입니다.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [groupName, perms] of Object.entries(permissions)) {
      await client.query(
        `UPDATE role_groups SET permissions = $1::jsonb WHERE group_name = $2`,
        [JSON.stringify(perms), groupName],
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

// GET /api/system/my-permissions — 인증 사용자: 자기 역할의 권한 조회
router.get('/my-permissions', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  if (!role) { res.status(401).json({ success: false, error: '인증 정보가 없습니다.' }); return; }

  const result = await pool.query(
    `SELECT permissions FROM role_groups WHERE group_name = $1`, [role],
  );
  const perms = result.rows[0]?.permissions || {};
  res.json({ success: true, data: perms });
}));

export default router;
