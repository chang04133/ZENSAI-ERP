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

  // 매입 비용: 실제 결제된 선지급 + 잔금 (결제일 기준 월별 집계)
  const purchaseResult = await pool.query(
    `SELECT plan_month, SUM(cost)::bigint AS cost FROM (
       SELECT EXTRACT(MONTH FROM advance_date)::int AS plan_month,
              COALESCE(advance_amount, 0) AS cost
       FROM production_plans
       WHERE EXTRACT(YEAR FROM advance_date) = $1
         AND advance_status = 'PAID' AND advance_date IS NOT NULL
       UNION ALL
       SELECT EXTRACT(MONTH FROM balance_date)::int AS plan_month,
              COALESCE(balance_amount, 0) AS cost
       FROM production_plans
       WHERE EXTRACT(YEAR FROM balance_date) = $1
         AND balance_status = 'PAID' AND balance_date IS NOT NULL
     ) sub GROUP BY plan_month`,
    [year],
  );

  // 부자재 비용: 자재 사용량 × 자재 단가
  const materialResult = await pool.query(
    `SELECT EXTRACT(MONTH FROM COALESCE(pp.target_date, pp.created_at::date))::int AS plan_month,
            SUM(pmu.required_qty * COALESCE(m.unit_price, 0))::bigint AS cost
     FROM production_material_usage pmu
     JOIN production_plans pp ON pmu.plan_id = pp.plan_id
     JOIN materials m ON pmu.material_id = m.material_id
     WHERE EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date)) = $1
       AND pp.status IN ('IN_PRODUCTION', 'COMPLETED')
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
  // auto_source가 설정된 카테고리는 이름 변경 불가
  const cat = await pool.query('SELECT auto_source FROM fund_categories WHERE category_id = $1', [req.params.id]);
  if (cat.rows.length > 0 && cat.rows[0].auto_source) {
    res.status(400).json({ success: false, error: '자동 연동 항목은 이름을 변경할 수 없습니다.' }); return;
  }
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

// ══════════════════════════════════════════
// 재무제표 (Financial Statements)
// ══════════════════════════════════════════

// ── 재무제표 자동 데이터 (매출 + 자금계획 연동) ──
router.get('/financial-statements/auto-data', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const period = (req.query.period as string) || 'ANNUAL';
  const pool = getPool();

  // 기간에 따른 날짜/월 범위
  let monthFrom = 1, monthTo = 12;
  let dateFrom = `${year}-01-01`, dateTo = `${year}-12-31`;
  if (period === 'Q1') { monthFrom = 1; monthTo = 3; dateFrom = `${year}-01-01`; dateTo = `${year}-03-31`; }
  else if (period === 'Q2') { monthFrom = 4; monthTo = 6; dateFrom = `${year}-04-01`; dateTo = `${year}-06-30`; }
  else if (period === 'Q3') { monthFrom = 7; monthTo = 9; dateFrom = `${year}-07-01`; dateTo = `${year}-09-30`; }
  else if (period === 'Q4') { monthFrom = 10; monthTo = 12; dateFrom = `${year}-10-01`; dateTo = `${year}-12-31`; }

  // 1) 매출 데이터 (sales 테이블에서)
  const salesResult = await pool.query(
    `SELECT COALESCE(SUM(total_price), 0)::bigint AS total_revenue
     FROM sales
     WHERE sale_date >= $1 AND sale_date <= $2`,
    [dateFrom, dateTo],
  );
  const totalRevenue = Number(salesResult.rows[0]?.total_revenue || 0);

  // 2) 자금계획 실적 (fund_plans EXPENSE 실적)
  const fundResult = await pool.query(
    `SELECT fc.category_name, fc.parent_id, fc.category_id,
            COALESCE(SUM(fp.actual_amount), 0)::bigint AS actual_total
     FROM fund_categories fc
     LEFT JOIN fund_plans fp ON fc.category_id = fp.category_id
       AND fp.plan_year = $1
       AND fp.plan_month >= $2 AND fp.plan_month <= $3
     WHERE fc.plan_type = 'EXPENSE' AND fc.is_active = TRUE
     GROUP BY fc.category_id, fc.category_name, fc.parent_id
     ORDER BY fc.sort_order`,
    [year, monthFrom, monthTo],
  );

  // 자금계획 합계 (리프 항목의 합 = 판관비 총액)
  const sgaTotal = fundResult.rows
    .filter((r: any) => r.parent_id !== null) // 리프만
    .reduce((s: number, r: any) => s + Number(r.actual_total), 0);

  // 자금계획 항목별 내역 (사용자에게 참고 표시용)
  const fundBreakdown = fundResult.rows
    .filter((r: any) => Number(r.actual_total) > 0)
    .map((r: any) => ({ name: r.category_name, amount: Number(r.actual_total), isChild: r.parent_id !== null }));

  res.json({
    success: true,
    data: {
      REVENUE_PRODUCT: totalRevenue,
      SGA_TOTAL: sgaTotal,
      fund_breakdown: fundBreakdown,
    },
  });
}));

// ── 재무제표 조회 ──
router.get('/financial-statements', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const period = (req.query.period as string) || 'ANNUAL';
  const type = (req.query.type as string) || 'IS';
  const pool = getPool();
  const result = await pool.query(
    `SELECT item_code, amount FROM financial_statements
     WHERE fiscal_year = $1 AND period = $2 AND statement_type = $3`,
    [year, period, type],
  );
  const data: Record<string, number> = {};
  for (const row of result.rows) {
    data[row.item_code] = Number(row.amount);
  }
  res.json({ success: true, data });
}));

// ── 재무제표 저장 (일괄 UPSERT) ──
router.post('/financial-statements', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { fiscal_year, period, statement_type, items } = req.body;
  if (!fiscal_year || !period || !statement_type) {
    res.status(400).json({ success: false, error: 'fiscal_year, period, statement_type 필수' }); return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'items 배열 필수' }); return;
  }
  const userId = (req as any).user?.user_id || null;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      if (!item.item_code) continue;
      await client.query(
        `INSERT INTO financial_statements (fiscal_year, period, statement_type, item_code, amount, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (fiscal_year, period, statement_type, item_code)
         DO UPDATE SET amount = $5, updated_at = NOW()`,
        [fiscal_year, period, statement_type, item.item_code, item.amount || 0, userId],
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

export default router;
