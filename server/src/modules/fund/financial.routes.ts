import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();
const adminOnly = [authMiddleware, requireRole('ADMIN')];

// ══════════════════════════════════════════
// 1. 손익계산서 (Income Statement / P&L)
// ══════════════════════════════════════════

router.get('/income-statement', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  const pool = getPool();

  // 날짜 필터 (파라미터 바인딩 사용)
  const dateParams: any[] = [year];
  let dateFilter: string;
  if (month) {
    dateFilter = `EXTRACT(YEAR FROM sale_date) = $1 AND EXTRACT(MONTH FROM sale_date) = $2`;
    dateParams.push(month);
  } else {
    dateFilter = `EXTRACT(YEAR FROM sale_date) = $1`;
  }

  // I. 매출액 — sale_type별 breakdown
  const revenueSql = `
    SELECT COALESCE(sale_type, '기타') AS sale_type,
           SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END)::int AS qty,
           SUM(CASE WHEN qty > 0 THEN total_price ELSE 0 END)::bigint AS amount
    FROM sales WHERE ${dateFilter} AND qty > 0
    GROUP BY sale_type ORDER BY amount DESC
  `;
  const revenueRows = (await pool.query(revenueSql, dateParams)).rows;

  // 반품 (qty < 0)
  const returnSql = `
    SELECT COALESCE(SUM(ABS(qty)), 0)::int AS return_qty,
           COALESCE(SUM(ABS(total_price)), 0)::bigint AS return_amount
    FROM sales WHERE ${dateFilter} AND qty < 0
  `;
  const returnData = (await pool.query(returnSql, dateParams)).rows[0];

  // II. 매출원가 (COGS) — sold × cost_price
  const cogsSql = `
    SELECT COALESCE(SUM(s.qty * COALESCE(p.cost_price, 0)), 0)::bigint AS cogs
    FROM sales s
    JOIN product_variants pv ON s.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    WHERE ${dateFilter.replace(/sale_date/g, 's.sale_date')} AND s.qty > 0
  `;
  const cogs = Number((await pool.query(cogsSql, dateParams)).rows[0].cogs);

  // IV. 판관비 (SG&A) — fund_plans actual_amount
  const sgaParams: any[] = [year];
  let sgaMonthFilter = '';
  if (month) {
    sgaMonthFilter = 'AND fp.plan_month = $2';
    sgaParams.push(month);
  }
  const sgaSql = `
    SELECT fc.category_name, COALESCE(SUM(fp.actual_amount), 0)::bigint AS amount
    FROM fund_plans fp
    JOIN fund_categories fc ON fp.category_id = fc.category_id
    WHERE fp.plan_year = $1 ${sgaMonthFilter}
      AND fc.plan_type = 'EXPENSE'
    GROUP BY fc.category_name, fc.sort_order
    ORDER BY fc.sort_order
  `;
  const sgaRows = (await pool.query(sgaSql, sgaParams)).rows;

  // 전년동기 매출
  const prevYearParams: any[] = [year - 1];
  if (month) prevYearParams.push(month);
  const prevRevSql = `
    SELECT COALESCE(SUM(total_price), 0)::bigint AS amount
    FROM sales WHERE ${dateFilter}
  `;
  const prevRevenue = Number((await pool.query(prevRevSql, prevYearParams)).rows[0].amount);

  // 월별 매출 추이 (연간 조회 시)
  let monthlyTrend: any[] = [];
  if (!month) {
    const trendSql = `
      SELECT EXTRACT(MONTH FROM sale_date)::int AS m,
             SUM(CASE WHEN qty > 0 THEN total_price ELSE 0 END)::bigint AS revenue,
             SUM(CASE WHEN qty < 0 THEN ABS(total_price) ELSE 0 END)::bigint AS returns
      FROM sales WHERE EXTRACT(YEAR FROM sale_date) = $1
      GROUP BY m ORDER BY m
    `;
    monthlyTrend = (await pool.query(trendSql, [year])).rows;
  }

  // 계산
  const grossRevenue = revenueRows.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  const netRevenue = grossRevenue - Number(returnData.return_amount);
  const grossProfit = netRevenue - cogs;
  const totalSGA = sgaRows.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  const operatingProfit = grossProfit - totalSGA;
  const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;
  const operatingMargin = netRevenue > 0 ? Math.round((operatingProfit / netRevenue) * 1000) / 10 : 0;

  res.json({
    success: true,
    data: {
      period: month ? `${year}-${String(month).padStart(2, '0')}` : String(year),
      revenue: {
        breakdown: revenueRows,
        gross: grossRevenue,
        returns: Number(returnData.return_amount),
        returnQty: Number(returnData.return_qty),
        net: netRevenue,
      },
      cogs,
      grossProfit,
      grossMargin,
      sga: { breakdown: sgaRows, total: totalSGA },
      operatingProfit,
      operatingMargin,
      prevYearRevenue: prevRevenue,
      yoyGrowth: prevRevenue > 0 ? Math.round(((netRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : null,
      monthlyTrend,
    },
  });
}));

// ══════════════════════════════════════════
// 2. 대차대조표 (Balance Sheet)
// ══════════════════════════════════════════

router.get('/balance-sheet', ...adminOnly, asyncHandler(async (_req: Request, res: Response) => {
  const pool = getPool();

  // 자산 — 재고자산 (원가 기준)
  const invSql = `
    SELECT
      COALESCE(SUM(i.qty * COALESCE(p.cost_price, 0)), 0)::bigint AS cost_value,
      COALESCE(SUM(i.qty * p.base_price), 0)::bigint AS retail_value,
      COALESCE(SUM(i.qty), 0)::int AS total_qty
    FROM inventory i
    JOIN product_variants pv ON i.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    WHERE i.qty > 0
  `;
  const inv = (await pool.query(invSql)).rows[0];

  // 재고 — 위치별
  const invByLocSql = `
    SELECT
      CASE WHEN pt.biz_type IN ('창고','본사') THEN '창고/본사' ELSE '매장' END AS location,
      COALESCE(SUM(i.qty * COALESCE(p.cost_price, 0)), 0)::bigint AS cost_value,
      COALESCE(SUM(i.qty), 0)::int AS qty
    FROM inventory i
    JOIN product_variants pv ON i.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    JOIN partners pt ON i.partner_code = pt.partner_code
    WHERE i.qty > 0
    GROUP BY location ORDER BY location
  `;
  const invByLoc = (await pool.query(invByLocSql)).rows;

  // 자산 — 매출채권
  const arSql = `
    SELECT COALESCE(SUM(amount - paid_amount), 0)::bigint AS balance,
           COUNT(*)::int AS count
    FROM accounts_receivable
    WHERE status IN ('PENDING','PARTIAL','OVERDUE')
  `;
  const ar = (await pool.query(arSql)).rows[0];

  // 부채 — 매입채무
  const apSql = `
    SELECT COALESCE(SUM(amount - paid_amount), 0)::bigint AS balance,
           COUNT(*)::int AS count
    FROM accounts_payable
    WHERE status IN ('PENDING','PARTIAL','OVERDUE')
  `;
  const ap = (await pool.query(apSql)).rows[0];

  const totalAssets = Number(inv.cost_value) + Number(ar.balance);
  const totalLiabilities = Number(ap.balance);
  const equity = totalAssets - totalLiabilities;

  res.json({
    success: true,
    data: {
      assets: {
        inventory: {
          costValue: Number(inv.cost_value),
          retailValue: Number(inv.retail_value),
          totalQty: Number(inv.total_qty),
          byLocation: invByLoc,
        },
        accountsReceivable: { balance: Number(ar.balance), count: Number(ar.count) },
        total: totalAssets,
      },
      liabilities: {
        accountsPayable: { balance: Number(ap.balance), count: Number(ap.count) },
        total: totalLiabilities,
      },
      equity,
    },
  });
}));

// ══════════════════════════════════════════
// 3. 현금흐름표 (Cash Flow Statement)
// ══════════════════════════════════════════

router.get('/cash-flow', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const pool = getPool();

  // 영업활동 — 월별 매출 유입
  const salesSql = `
    SELECT EXTRACT(MONTH FROM sale_date)::int AS m,
           COALESCE(SUM(total_price), 0)::bigint AS amount
    FROM sales WHERE EXTRACT(YEAR FROM sale_date) = $1
    GROUP BY m ORDER BY m
  `;
  const salesMonthly = (await pool.query(salesSql, [year])).rows;

  // 영업활동 — 월별 비용 유출
  const expenseSql = `
    SELECT fp.plan_month AS m,
           COALESCE(SUM(fp.actual_amount), 0)::bigint AS amount
    FROM fund_plans fp
    JOIN fund_categories fc ON fp.category_id = fc.category_id
    WHERE fp.plan_year = $1 AND fc.plan_type = 'EXPENSE'
    GROUP BY fp.plan_month ORDER BY fp.plan_month
  `;
  const expenseMonthly = (await pool.query(expenseSql, [year])).rows;

  // 투자활동 — 월별 생산비
  const prodSql = `
    SELECT EXTRACT(MONTH FROM COALESCE(pp.target_date, pp.created_at::date))::int AS m,
           COALESCE(SUM(pi.plan_qty * COALESCE(pi.unit_cost, 0)), 0)::bigint AS amount
    FROM production_plan_items pi
    JOIN production_plans pp ON pi.plan_id = pp.plan_id
    WHERE EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date)) = $1
      AND pp.status IN ('IN_PRODUCTION','COMPLETED')
    GROUP BY m ORDER BY m
  `;
  const prodMonthly = (await pool.query(prodSql, [year])).rows;

  // 월별 집계
  const salesMap: Record<number, number> = {};
  for (const r of salesMonthly) salesMap[r.m] = Number(r.amount);
  const expenseMap: Record<number, number> = {};
  for (const r of expenseMonthly) expenseMap[r.m] = Number(r.amount);
  const prodMap: Record<number, number> = {};
  for (const r of prodMonthly) prodMap[r.m] = Number(r.amount);

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const inflow = salesMap[m] || 0;
    const opExpense = expenseMap[m] || 0;
    const investing = prodMap[m] || 0;
    return {
      month: m,
      operatingInflow: inflow,
      operatingOutflow: opExpense,
      operatingNet: inflow - opExpense,
      investingOutflow: investing,
      net: inflow - opExpense - investing,
    };
  });

  const totalInflow = monthly.reduce((s, m) => s + m.operatingInflow, 0);
  const totalOpOutflow = monthly.reduce((s, m) => s + m.operatingOutflow, 0);
  const totalInvesting = monthly.reduce((s, m) => s + m.investingOutflow, 0);

  res.json({
    success: true,
    data: {
      year,
      monthly,
      summary: {
        operatingInflow: totalInflow,
        operatingOutflow: totalOpOutflow,
        operatingNet: totalInflow - totalOpOutflow,
        investingOutflow: totalInvesting,
        netCashFlow: totalInflow - totalOpOutflow - totalInvesting,
      },
    },
  });
}));

// ══════════════════════════════════════════
// 4. 재고자산 평가 (Inventory Valuation)
// ══════════════════════════════════════════

router.get('/inventory-valuation', ...adminOnly, asyncHandler(async (_req: Request, res: Response) => {
  const pool = getPool();
  const sql = `
    SELECT
      pt.partner_name,
      COALESCE(p.category, '미분류') AS category,
      COUNT(DISTINCT p.product_code)::int AS product_count,
      COUNT(DISTINCT pv.variant_id)::int AS variant_count,
      COALESCE(SUM(i.qty), 0)::int AS total_qty,
      COALESCE(SUM(i.qty * p.base_price), 0)::bigint AS retail_value,
      COALESCE(SUM(i.qty * COALESCE(p.cost_price, 0)), 0)::bigint AS cost_value
    FROM inventory i
    JOIN product_variants pv ON i.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    JOIN partners pt ON i.partner_code = pt.partner_code
    WHERE i.qty > 0
    GROUP BY pt.partner_name, p.category
    ORDER BY cost_value DESC
  `;
  const data = (await pool.query(sql)).rows;
  res.json({ success: true, data });
}));

// ══════════════════════════════════════════
// 5. 매출원가 상세 (COGS Detail)
// ══════════════════════════════════════════

router.get('/cogs-detail', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  const pool = getPool();

  const params: any[] = [year];
  let monthFilter = '';
  if (month) {
    monthFilter = 'AND EXTRACT(MONTH FROM s.sale_date) = $2';
    params.push(month);
  }

  const sql = `
    SELECT
      COALESCE(p.category, '미분류') AS category,
      SUM(s.qty)::int AS sold_qty,
      SUM(s.total_price)::bigint AS revenue,
      SUM(s.qty * COALESCE(p.cost_price, 0))::bigint AS cogs,
      (SUM(s.total_price) - SUM(s.qty * COALESCE(p.cost_price, 0)))::bigint AS gross_profit,
      CASE WHEN SUM(s.total_price) > 0
        THEN ROUND((SUM(s.total_price) - SUM(s.qty * COALESCE(p.cost_price, 0)))::numeric
          / SUM(s.total_price)::numeric * 100, 1)
        ELSE 0 END AS margin_pct
    FROM sales s
    JOIN product_variants pv ON s.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    WHERE EXTRACT(YEAR FROM s.sale_date) = $1 ${monthFilter}
      AND s.qty > 0
    GROUP BY p.category
    ORDER BY revenue DESC
  `;
  const data = (await pool.query(sql, params)).rows;
  res.json({ success: true, data });
}));

// ══════════════════════════════════════════
// 6. 매출 자동 연동 데이터 (Sales Revenue for Fund)
// ══════════════════════════════════════════

router.get('/sales-revenue', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const pool = getPool();
  const sql = `
    SELECT EXTRACT(MONTH FROM sale_date)::int AS plan_month,
           COALESCE(SUM(total_price), 0)::bigint AS amount
    FROM sales WHERE EXTRACT(YEAR FROM sale_date) = $1
    GROUP BY plan_month ORDER BY plan_month
  `;
  const rows = (await pool.query(sql, [year])).rows;
  const monthly: Record<number, number> = {};
  for (const r of rows) monthly[r.plan_month] = Number(r.amount);
  res.json({ success: true, data: monthly });
}));

// ══════════════════════════════════════════
// 7. 미수금 CRUD (Accounts Receivable)
// ══════════════════════════════════════════

router.get('/ar', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { status, partner_code } = req.query;
  const pool = getPool();
  const params: any[] = [];
  const filters: string[] = [];
  let idx = 1;

  if (status) { filters.push(`ar.status = $${idx++}`); params.push(status); }
  if (partner_code) { filters.push(`ar.partner_code = $${idx++}`); params.push(partner_code); }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `
    SELECT ar.*, pt.partner_name
    FROM accounts_receivable ar
    JOIN partners pt ON ar.partner_code = pt.partner_code
    ${where}
    ORDER BY ar.ar_date DESC, ar.created_at DESC
  `;
  const data = (await pool.query(sql, params)).rows;
  res.json({ success: true, data });
}));

router.post('/ar', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { partner_code, ar_date, amount, due_date, memo } = req.body;
  if (!partner_code || !ar_date || !amount) {
    res.status(400).json({ success: false, error: 'partner_code, ar_date, amount 필수' }); return;
  }
  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ success: false, error: '금액은 0보다 큰 숫자여야 합니다.' }); return;
  }
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO accounts_receivable (partner_code, ar_date, amount, due_date, memo, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [partner_code, ar_date, amount, due_date || null, memo || null, (req as any).user?.user_id || null],
  );
  res.json({ success: true, data: result.rows[0] });
}));

router.put('/ar/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { status, paid_amount, memo } = req.body;
  const pool = getPool();

  // paid_amount 검증: 원금 초과 방지
  if (paid_amount !== undefined) {
    const orig = await pool.query('SELECT amount FROM accounts_receivable WHERE ar_id = $1', [req.params.id]);
    if (orig.rows.length === 0) {
      res.status(404).json({ success: false, error: '미수금을 찾을 수 없습니다.' }); return;
    }
    if (Number(paid_amount) < 0) {
      res.status(400).json({ success: false, error: '지급액은 0 이상이어야 합니다.' }); return;
    }
    if (Number(paid_amount) > Number(orig.rows[0].amount)) {
      res.status(400).json({ success: false, error: '지급액이 원금을 초과할 수 없습니다.' }); return;
    }
  }

  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let idx = 1;
  if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
  if (paid_amount !== undefined) { sets.push(`paid_amount = $${idx++}`); params.push(paid_amount); }
  if (memo !== undefined) { sets.push(`memo = $${idx++}`); params.push(memo); }
  params.push(req.params.id);
  const result = await pool.query(
    `UPDATE accounts_receivable SET ${sets.join(', ')} WHERE ar_id = $${idx} RETURNING *`,
    params,
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '미수금을 찾을 수 없습니다.' }); return;
  }
  res.json({ success: true, data: result.rows[0] });
}));

router.delete('/ar/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const pool = getPool();
  await pool.query('DELETE FROM accounts_receivable WHERE ar_id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ══════════════════════════════════════════
// 8. 미지급금 CRUD (Accounts Payable)
// ══════════════════════════════════════════

router.get('/ap', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { status, partner_code, category } = req.query;
  const pool = getPool();
  const params: any[] = [];
  const filters: string[] = [];
  let idx = 1;

  if (status) { filters.push(`ap.status = $${idx++}`); params.push(status); }
  if (partner_code) { filters.push(`ap.partner_code = $${idx++}`); params.push(partner_code); }
  if (category) { filters.push(`ap.category = $${idx++}`); params.push(category); }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `
    SELECT ap.*, pt.partner_name
    FROM accounts_payable ap
    LEFT JOIN partners pt ON ap.partner_code = pt.partner_code
    ${where}
    ORDER BY ap.ap_date DESC, ap.created_at DESC
  `;
  const data = (await pool.query(sql, params)).rows;
  res.json({ success: true, data });
}));

router.post('/ap', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { partner_code, ap_date, amount, due_date, category, memo } = req.body;
  if (!ap_date || !amount) {
    res.status(400).json({ success: false, error: 'ap_date, amount 필수' }); return;
  }
  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ success: false, error: '금액은 0보다 큰 숫자여야 합니다.' }); return;
  }
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO accounts_payable (partner_code, ap_date, amount, due_date, category, memo, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [partner_code || null, ap_date, amount, due_date || null, category || null, memo || null, (req as any).user?.user_id || null],
  );
  res.json({ success: true, data: result.rows[0] });
}));

router.put('/ap/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { status, paid_amount, memo } = req.body;
  const pool = getPool();

  // paid_amount 검증: 원금 초과 방지
  if (paid_amount !== undefined) {
    const orig = await pool.query('SELECT amount FROM accounts_payable WHERE ap_id = $1', [req.params.id]);
    if (orig.rows.length === 0) {
      res.status(404).json({ success: false, error: '미지급금을 찾을 수 없습니다.' }); return;
    }
    if (Number(paid_amount) < 0) {
      res.status(400).json({ success: false, error: '지급액은 0 이상이어야 합니다.' }); return;
    }
    if (Number(paid_amount) > Number(orig.rows[0].amount)) {
      res.status(400).json({ success: false, error: '지급액이 원금을 초과할 수 없습니다.' }); return;
    }
  }

  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let idx = 1;
  if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
  if (paid_amount !== undefined) { sets.push(`paid_amount = $${idx++}`); params.push(paid_amount); }
  if (memo !== undefined) { sets.push(`memo = $${idx++}`); params.push(memo); }
  params.push(req.params.id);
  const result = await pool.query(
    `UPDATE accounts_payable SET ${sets.join(', ')} WHERE ap_id = $${idx} RETURNING *`,
    params,
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '미지급금을 찾을 수 없습니다.' }); return;
  }
  res.json({ success: true, data: result.rows[0] });
}));

router.delete('/ap/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const pool = getPool();
  await pool.query('DELETE FROM accounts_payable WHERE ap_id = $1', [req.params.id]);
  res.json({ success: true });
}));

export default router;
