import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();
const adminOnly = [authMiddleware, requireRole('ADMIN')];

// ── 카테고리 목록 (EXPENSE만, parent_id + auto_source 포함) ──
router.get('/categories', ...adminOnly, asyncHandler(async (_req: Request, res: Response) => {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM fund_categories
     WHERE is_active = TRUE AND plan_type = 'EXPENSE'
     ORDER BY sort_order, category_id`,
  );
  res.json({ success: true, data: result.rows });
}));

// ── 생산계획 기반 비용 자동계산 (월별) ──
router.get('/production-costs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const pool = getPool();

  // 매입 비용: 생산계획 품목 × 단가
  const purchaseResult = await pool.query(
    `SELECT EXTRACT(MONTH FROM pp.target_date)::int AS plan_month,
            SUM(pi.plan_qty * COALESCE(pi.unit_cost, 0))::bigint AS cost
     FROM production_plan_items pi
     JOIN production_plans pp ON pi.plan_id = pp.plan_id
     WHERE EXTRACT(YEAR FROM pp.target_date) = $1
       AND pp.status NOT IN ('CANCELLED')
       AND pp.target_date IS NOT NULL
     GROUP BY plan_month`,
    [year],
  );

  // 부자재 비용: 자재 사용량 × 자재 단가
  const materialResult = await pool.query(
    `SELECT EXTRACT(MONTH FROM pp.target_date)::int AS plan_month,
            SUM(pmu.required_qty * COALESCE(m.unit_price, 0))::bigint AS cost
     FROM production_material_usage pmu
     JOIN production_plans pp ON pmu.plan_id = pp.plan_id
     JOIN materials m ON pmu.material_id = m.material_id
     WHERE EXTRACT(YEAR FROM pp.target_date) = $1
       AND pp.status NOT IN ('CANCELLED')
       AND pp.target_date IS NOT NULL
     GROUP BY plan_month`,
    [year],
  );

  const purchase: Record<number, number> = {};
  for (const r of purchaseResult.rows) purchase[r.plan_month] = Number(r.cost);

  const material: Record<number, number> = {};
  for (const r of materialResult.rows) material[r.plan_month] = Number(r.cost);

  res.json({ success: true, data: { purchase, material } });
}));

// ── 카테고리 추가 ──
router.post('/categories', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { category_name, parent_id } = req.body;
  if (!category_name) {
    res.status(400).json({ success: false, error: '항목 이름을 입력해주세요.' }); return;
  }
  const pool = getPool();
  // sort_order: 같은 parent 내 마지막 + 1
  const maxSort = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 as next
     FROM fund_categories WHERE plan_type = 'EXPENSE' AND parent_id IS NOT DISTINCT FROM $1`,
    [parent_id || null],
  );
  const result = await pool.query(
    `INSERT INTO fund_categories (category_name, plan_type, sort_order, parent_id)
     VALUES ($1, 'EXPENSE', $2, $3) RETURNING *`,
    [category_name, maxSort.rows[0].next, parent_id || null],
  );
  res.json({ success: true, data: result.rows[0] });
}));

// ── 카테고리 수정 ──
router.put('/categories/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { category_name } = req.body;
  if (!category_name) {
    res.status(400).json({ success: false, error: '항목 이름을 입력해주세요.' }); return;
  }
  const pool = getPool();
  const result = await pool.query(
    'UPDATE fund_categories SET category_name = $1 WHERE category_id = $2 RETURNING *',
    [category_name, req.params.id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '카테고리를 찾을 수 없습니다.' }); return;
  }
  res.json({ success: true, data: result.rows[0] });
}));

// ── 카테고리 삭제 (하위 + fund_plans도 삭제) ──
router.delete('/categories/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = parseInt(req.params.id as string, 10);
    // auto_source가 설정된 카테고리는 삭제 불가
    const cat = await client.query('SELECT auto_source FROM fund_categories WHERE category_id = $1', [id]);
    if (cat.rows.length > 0 && cat.rows[0].auto_source) {
      res.status(400).json({ success: false, error: '자동 연동 항목은 삭제할 수 없습니다.' }); return;
    }
    // 하위 카테고리 ID 조회
    const children = await client.query('SELECT category_id FROM fund_categories WHERE parent_id = $1', [id]);
    const childIds = children.rows.map((r: any) => r.category_id);
    const allIds = [id, ...childIds];
    // fund_plans 삭제
    await client.query(`DELETE FROM fund_plans WHERE category_id = ANY($1)`, [allIds]);
    // 하위 카테고리 삭제
    if (childIds.length > 0) {
      await client.query(`DELETE FROM fund_categories WHERE category_id = ANY($1)`, [childIds]);
    }
    // 본 카테고리 삭제
    await client.query('DELETE FROM fund_categories WHERE category_id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ── 연간 자금계획 조회 (EXPENSE만) ──
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const pool = getPool();
  const result = await pool.query(
    `SELECT fp.*, fc.category_name, fc.plan_type, fc.sort_order, fc.parent_id
     FROM fund_plans fp
     JOIN fund_categories fc ON fp.category_id = fc.category_id
     WHERE fp.plan_year = $1 AND fc.plan_type = 'EXPENSE'
     ORDER BY fc.sort_order, fp.plan_month`,
    [year],
  );
  res.json({ success: true, data: result.rows });
}));

// ── 연간 요약 ──
router.get('/summary', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const pool = getPool();
  const result = await pool.query(
    `SELECT fp.plan_month,
            SUM(fp.plan_amount) as total_plan,
            SUM(fp.actual_amount) as total_actual
     FROM fund_plans fp
     JOIN fund_categories fc ON fp.category_id = fc.category_id
     WHERE fp.plan_year = $1 AND fc.plan_type = 'EXPENSE'
     GROUP BY fp.plan_month ORDER BY fp.plan_month`,
    [year],
  );
  res.json({ success: true, data: result.rows });
}));

// auto_source 카테고리 ID 집합 조회 헬퍼
async function getAutoSourceIds(): Promise<Set<number>> {
  const pool = getPool();
  const result = await pool.query("SELECT category_id FROM fund_categories WHERE auto_source IS NOT NULL");
  return new Set(result.rows.map((r: any) => r.category_id));
}

// ── 단건 UPSERT ──
router.post('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { plan_year, plan_month, category_id, plan_amount, actual_amount, memo } = req.body;
  if (!plan_year || !plan_month || !category_id) {
    res.status(400).json({ success: false, error: 'plan_year, plan_month, category_id 필수' }); return;
  }
  // auto_source 카테고리 차단
  const autoIds = await getAutoSourceIds();
  if (autoIds.has(category_id)) {
    res.status(400).json({ success: false, error: '자동 연동 항목은 수동 입력할 수 없습니다.' }); return;
  }
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO fund_plans (plan_year, plan_month, category_id, plan_amount, actual_amount, memo)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (plan_year, plan_month, category_id)
     DO UPDATE SET plan_amount = $4, actual_amount = $5, memo = $6, updated_at = NOW()
     RETURNING *`,
    [plan_year, plan_month, category_id, plan_amount || 0, actual_amount || 0, memo || null],
  );
  res.json({ success: true, data: result.rows[0] });
}));

// ── 일괄 저장 ──
router.post('/batch', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'items 필수' }); return;
  }
  // auto_source 카테고리 필터링 (자동 항목은 저장에서 제외)
  const autoIds = await getAutoSourceIds();
  const filteredItems = items.filter((i: any) => !autoIds.has(i.category_id));

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const item of filteredItems) {
      const { plan_year, plan_month, category_id, plan_amount, actual_amount, memo } = item;
      if (!plan_year || !plan_month || !category_id) continue;
      const r = await client.query(
        `INSERT INTO fund_plans (plan_year, plan_month, category_id, plan_amount, actual_amount, memo)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (plan_year, plan_month, category_id)
         DO UPDATE SET plan_amount = $4, actual_amount = $5, memo = $6, updated_at = NOW()
         RETURNING *`,
        [plan_year, plan_month, category_id, plan_amount || 0, actual_amount || 0, memo || null],
      );
      results.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ success: true, data: results });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ── 삭제 ──
router.delete('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const pool = getPool();
  await pool.query('DELETE FROM fund_plans WHERE fund_plan_id = $1', [req.params.id]);
  res.json({ success: true });
}));

export default router;
