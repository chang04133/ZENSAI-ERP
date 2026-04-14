import { getPool } from '../../db/connection';
import type {
  AbcAnalysisResult, MarginAnalysisResult,
  SeasonPerformanceResult, SizeColorTrendsResult,
  MarkdownEffectivenessResult, StoreProductFitResult,
  StyleProductivityResult,
} from '../../../../shared/types/md';
import type { VmdEffectResult } from '../../../../shared/types/vmd';

interface MdSettings {
  abcA: number;   // ABC A등급 임계값 (0~1, 기본 0.7)
  abcB: number;   // ABC B등급 임계값 (0~1, 기본 0.9)
  slowMover: number; // 슬로우무버 회전율 기준 (기본 0.5)
  fastMover: number; // 패스트무버 회전율 기준 (기본 2.0)
  markdownDays: number; // 마크다운 비교 기간 (기본 14일)
  distributionFeePct: number; // 유통 수수료율 % (기본 0)
  managerFeePct: number;      // 매니저 수수료율 % (기본 0)
  costMultiplier: number;      // 원가 배수 (기본 3.5)
}

class MdAnalyticsRepository {
  private pool = getPool();

  /** DB에서 MD 분석 설정값 로드 (없으면 기본값) */
  private async loadMdSettings(): Promise<MdSettings> {
    const res = await this.pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'MD_%'",
    );
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.code_value] = r.code_label;
    return {
      abcA: (parseInt(map.MD_ABC_A_THRESHOLD || '70', 10) || 70) / 100,
      abcB: (parseInt(map.MD_ABC_B_THRESHOLD || '90', 10) || 90) / 100,
      slowMover: (parseInt(map.MD_SLOW_MOVER_THRESHOLD || '50', 10) || 50) / 100,
      fastMover: (parseInt(map.MD_FAST_MOVER_THRESHOLD || '200', 10) || 200) / 100,
      markdownDays: parseInt(map.MD_MARKDOWN_COMPARE_DAYS || '14', 10) || 14,
      distributionFeePct: parseInt(map.MD_DISTRIBUTION_FEE_PCT || '0', 10) || 0,
      managerFeePct: parseInt(map.MD_MANAGER_FEE_PCT || '0', 10) || 0,
      costMultiplier: (parseInt(map.MD_COST_MULTIPLIER || '35', 10) || 35) / 10,
    };
  }

  private get salesCte() {
    return `combined_sales AS (
      SELECT sale_id, sale_date, partner_code, variant_id, qty, unit_price, total_price, COALESCE(sale_type, '정상') AS sale_type FROM ${this.s}.sales
      UNION ALL
      SELECT preorder_id, preorder_date, partner_code, variant_id, qty, unit_price, total_price, '예약판매' FROM ${this.s}.preorders WHERE status = '대기'
    )`;
  }

  private get s() { return 'zensai'; }

    // ─── 1. ABC 분석 (글로벌 누적매출 기반) ───
  async abcAnalysis(dateFrom: string, dateTo: string, partnerCode?: string, category?: string, overrideA?: number, overrideB?: number): Promise<AbcAnalysisResult> {
    const settings = await this.loadMdSettings();
    const abcA = overrideA && overrideA > 0 && overrideA < 100 ? overrideA / 100 : settings.abcA;
    const abcB = overrideB && overrideB > 0 && overrideB < 100 ? overrideB / 100 : settings.abcB;
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcFilter = '';
    let catFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $${idx++}`; }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    const abcAIdx = idx++;
    const abcBIdx = idx++;
    params.push(abcA, abcB);

    // 전체 상품 매출 내림차순 → 누적비중으로 A(70%)/B(90%)/C 분류
    const sql = `
      WITH ${this.salesCte},
      ranked AS (
        SELECT p.product_code AS key, p.product_name AS label,
          COALESCE(p.category, '미분류') AS category,
          SUM(s.total_price)::bigint AS total_price,
          SUM(s.qty)::int AS qty,
          SUM(SUM(s.total_price)) OVER () AS grand_total,
          SUM(SUM(s.total_price)) OVER (ORDER BY SUM(s.total_price) DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
          AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
        GROUP BY p.product_code, p.product_name, p.category
      )
      SELECT key, label, category, total_price, qty,
        ROUND(running_total::numeric / NULLIF(grand_total, 0) * 100, 1)::float AS cumulative_pct,
        CASE
          WHEN (running_total - total_price)::numeric / NULLIF(grand_total, 0) < $${abcAIdx}::numeric THEN 'A'
          WHEN (running_total - total_price)::numeric / NULLIF(grand_total, 0) < $${abcBIdx}::numeric THEN 'B'
          ELSE 'C'
        END AS grade
      FROM ranked
      ORDER BY total_price DESC`;

    const rows = (await this.pool.query(sql, params)).rows.map((r: any) => ({
      ...r, total_price: Number(r.total_price), cumulative_pct: Number(r.cumulative_pct),
    }));

    // 카테고리 내 순위/비중 계산 (클라이언트 호환)
    const catGroups: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!catGroups[r.category]) catGroups[r.category] = [];
      catGroups[r.category].push(r);
    }
    for (const cat of Object.keys(catGroups)) {
      const items = catGroups[cat].sort((a, b) => b.total_price - a.total_price);
      const catTotal = items.reduce((s, r) => s + r.total_price, 0);
      items.forEach((item, i) => {
        item.cat_rank = i + 1;
        item.cat_count = items.length;
        item.revenue_share_pct = catTotal > 0 ? Math.round(item.total_price / catTotal * 1000) / 10 : 0;
      });
    }

    // 카테고리별 요약
    const catMap: Record<string, { revenue: number; a: number; b: number; c: number; total: number }> = {};
    for (const r of rows) {
      if (!catMap[r.category]) catMap[r.category] = { revenue: 0, a: 0, b: 0, c: 0, total: 0 };
      catMap[r.category].revenue += r.total_price;
      catMap[r.category].total++;
      if (r.grade === 'A') catMap[r.category].a++;
      else if (r.grade === 'B') catMap[r.category].b++;
      else catMap[r.category].c++;
    }

    const summary = {
      total_revenue: rows.reduce((s, r) => s + r.total_price, 0),
      a_count: rows.filter(r => r.grade === 'A').length,
      b_count: rows.filter(r => r.grade === 'B').length,
      c_count: rows.filter(r => r.grade === 'C').length,
      a_revenue: rows.filter(r => r.grade === 'A').reduce((s, r) => s + r.total_price, 0),
      b_revenue: rows.filter(r => r.grade === 'B').reduce((s, r) => s + r.total_price, 0),
      c_revenue: rows.filter(r => r.grade === 'C').reduce((s, r) => s + r.total_price, 0),
      by_category: Object.entries(catMap).map(([cat, d]) => ({
        category: cat, total: d.total, a_count: d.a, b_count: d.b, c_count: d.c, revenue: d.revenue,
      })).sort((a, b) => b.revenue - a.revenue),
    };
    return { items: rows, summary };
  }

// ─── 2. 마진 분석 (설정배수 / 실제원가 선택) ───
  async marginAnalysis(dateFrom: string, dateTo: string, partnerCode?: string, category?: string, groupBy = 'product', costMode: 'multiplier' | 'actual' = 'multiplier'): Promise<MarginAnalysisResult> {
    const settings = await this.loadMdSettings();
    const distPct = settings.distributionFeePct;
    const mgrPct = settings.managerFeePct;
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcFilter = '';
    let catFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $${idx++}`; }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    let groupKey: string;
    let groupByCols: string;
    if (groupBy === 'category') {
      groupKey = `COALESCE(p.category, '미분류') AS key, COALESCE(p.category, '미분류') AS label`;
      groupByCols = `COALESCE(p.category, '미분류')`;
    } else if (groupBy === 'season') {
      groupKey = `COALESCE(p.season, '미분류') AS key, COALESCE(p.season, '미분류') AS label`;
      groupByCols = `COALESCE(p.season, '미분류')`;
    } else {
      groupKey = `p.product_code AS key, p.product_name AS label`;
      groupByCols = `p.product_code, p.product_name`;
    }

    const useActual = costMode === 'actual';

    let sql: string;
    if (useActual) {
      // 실제원가 모드: p.cost_price 직접 사용
      sql = `
        WITH ${this.salesCte}
        SELECT ${groupKey},
          ROUND(SUM(s.qty * p.cost_price)::numeric / NULLIF(SUM(s.qty), 0))::int AS cost_price,
          ROUND(SUM(s.qty * p.base_price)::numeric / NULLIF(SUM(s.qty), 0))::int AS base_price,
          ROUND(SUM(s.total_price)::numeric / NULLIF(SUM(s.qty), 0))::int AS avg_selling_price,
          ROUND((1 - SUM(s.qty * p.cost_price)::numeric / NULLIF(SUM(s.qty * p.base_price), 0)) * 100, 1)::float AS base_margin_pct,
          ROUND((1 - SUM(s.qty * p.cost_price)::numeric / NULLIF(SUM(s.total_price), 0)) * 100, 1)::float AS actual_margin_pct,
          SUM(s.total_price)::bigint AS total_revenue,
          SUM(s.qty * p.cost_price)::bigint AS total_cost,
          (SUM(s.total_price) - SUM(s.qty * p.cost_price))::bigint AS total_profit,
          SUM(s.qty)::int AS qty
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
          AND s.sale_type NOT IN ('반품','수정')
          AND p.cost_price > 0 ${pcFilter} ${catFilter}
        GROUP BY ${groupByCols}
        ORDER BY total_profit DESC`;
    } else {
      // 설정배수 모드: 원가 = 정가 / 배수 (기존 로직 그대로)
      const costMulIdx = idx++;
      params.push(settings.costMultiplier);
      sql = `
        WITH ${this.salesCte}
        SELECT ${groupKey},
          ROUND(SUM(s.qty * p.base_price)::numeric / $${costMulIdx} / NULLIF(SUM(s.qty), 0))::int AS cost_price,
          ROUND(SUM(s.qty * p.base_price)::numeric / NULLIF(SUM(s.qty), 0))::int AS base_price,
          ROUND(SUM(s.total_price)::numeric / NULLIF(SUM(s.qty), 0))::int AS avg_selling_price,
          ROUND((1 - 1.0 / $${costMulIdx}) * 100, 1)::float AS base_margin_pct,
          ROUND((1 - SUM(s.qty * p.base_price)::numeric / $${costMulIdx} / NULLIF(SUM(s.total_price), 0)) * 100, 1)::float AS actual_margin_pct,
          SUM(s.total_price)::bigint AS total_revenue,
          ROUND(SUM(s.qty * p.base_price)::numeric / $${costMulIdx})::bigint AS total_cost,
          (SUM(s.total_price) - ROUND(SUM(s.qty * p.base_price)::numeric / $${costMulIdx}))::bigint AS total_profit,
          SUM(s.qty)::int AS qty
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
          AND s.sale_type NOT IN ('반품','수정')
          AND p.base_price > 0 ${pcFilter} ${catFilter}
        GROUP BY ${groupByCols}
        ORDER BY total_profit DESC`;
    }

    const rawItems = (await this.pool.query(sql, params)).rows;

    // 수수료 반영하여 순마진/순이익 계산
    const items = rawItems.map((r: any) => {
      const revenue = Number(r.total_revenue);
      const cost = Number(r.total_cost);
      const profit = Number(r.total_profit);
      const actualMargin = Number(r.actual_margin_pct) || 0;
      const netMarginPct = Math.round((actualMargin - distPct - mgrPct) * 10) / 10;
      const netProfit = Math.round(profit - revenue * distPct / 100 - revenue * mgrPct / 100);
      const distFeeAmt = Math.round(revenue * distPct / 100);
      const mgrFeeAmt = Math.round(revenue * mgrPct / 100);
      return {
        ...r,
        distribution_fee_pct: distPct,
        manager_fee_pct: mgrPct,
        distribution_fee_amount: distFeeAmt,
        manager_fee_amount: mgrFeeAmt,
        net_margin_pct: netMarginPct,
        net_profit: netProfit,
      };
    });

    const totalRevenue = items.reduce((s: number, r: any) => s + Number(r.total_revenue), 0);
    const totalCost = items.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
    const totalProfit = items.reduce((s: number, r: any) => s + Number(r.total_profit), 0);
    const totalNetProfit = items.reduce((s: number, r: any) => s + Number(r.net_profit), 0);
    const totalDistFee = items.reduce((s: number, r: any) => s + Number(r.distribution_fee_amount), 0);
    const totalMgrFee = items.reduce((s: number, r: any) => s + Number(r.manager_fee_amount), 0);

    // 마진 분포
    const ranges = ['0~20%', '20~40%', '40~60%', '60~80%', '80%+'];
    const dist = [0, 0, 0, 0, 0];
    for (const r of items) {
      const m = Number(r.actual_margin_pct) || 0;
      if (m < 20) dist[0]++;
      else if (m < 40) dist[1]++;
      else if (m < 60) dist[2]++;
      else if (m < 80) dist[3]++;
      else dist[4]++;
    }

    return {
      items,
      summary: {
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        total_net_profit: totalNetProfit,
        avg_base_margin: items.length ? Math.round(items.reduce((s: number, r: any) => s + Number(r.base_margin_pct || 0), 0) / items.length * 10) / 10 : 0,
        avg_actual_margin: items.length ? Math.round(items.reduce((s: number, r: any) => s + Number(r.actual_margin_pct || 0), 0) / items.length * 10) / 10 : 0,
        avg_net_margin: items.length ? Math.round(items.reduce((s: number, r: any) => s + Number(r.net_margin_pct || 0), 0) / items.length * 10) / 10 : 0,
        distribution_fee_pct: distPct,
        manager_fee_pct: mgrPct,
        total_distribution_fee: totalDistFee,
        total_manager_fee: totalMgrFee,
        cost_multiplier: settings.costMultiplier,
        margin_distribution: ranges.map((range, i) => ({ range, count: dist[i] })),
      },
    };
  }

  // ─── 3. 완판율 분석 (입고 대비 판매율) ───
  async inventoryTurnover(dateFrom: string, dateTo: string, partnerCode?: string, category?: string, _groupBy = 'product'): Promise<any> {
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcSalesFilter = '';
    let pcInvFilter = '';
    let pcInboundFilter = '';
    let catFilter = '';
    if (partnerCode) {
      params.push(partnerCode);
      pcSalesFilter = `AND s2.partner_code = $${idx}`;
      pcInvFilter = `WHERE i.partner_code = $${idx}`;
      pcInboundFilter = `AND ir.partner_code = $${idx}`;
      idx++;
    }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);

    const sql = `
      WITH ${this.salesCte},
      inbound_supply AS (
        SELECT pv1.product_code,
               SUM(ii.qty)::int AS total_inbound,
               MIN(ir.inbound_date) AS first_inbound_date
        FROM ${this.s}.inbound_items ii
        JOIN ${this.s}.inbound_records ir ON ii.record_id = ir.record_id
        JOIN ${this.s}.product_variants pv1 ON ii.variant_id = pv1.variant_id
        WHERE ir.status = 'COMPLETED' AND ir.inbound_date >= NOW() - INTERVAL '2 years' ${pcInboundFilter}
        GROUP BY pv1.product_code
      ),
      sold AS (
        SELECT pv2.product_code, SUM(s2.qty)::int AS sold_qty
        FROM combined_sales s2
        JOIN ${this.s}.product_variants pv2 ON s2.variant_id = pv2.variant_id
        WHERE COALESCE(s2.sale_type,'정상') NOT IN ('반품','수정') AND s2.sale_date >= NOW() - INTERVAL '2 years' ${pcSalesFilter}
        GROUP BY pv2.product_code
      ),
      current_inv AS (
        SELECT pv3.product_code, SUM(i.qty)::int AS current_stock
        FROM ${this.s}.inventory i
        JOIN ${this.s}.product_variants pv3 ON i.variant_id = pv3.variant_id
        ${pcInvFilter}
        GROUP BY pv3.product_code
      )
      SELECT p.product_code AS key, p.product_name AS label, p.category, p.base_price,
        COALESCE(ib.total_inbound, 0)::int AS total_inbound,
        ib.first_inbound_date,
        COALESCE(sl.sold_qty, 0)::int AS sold_qty,
        COALESCE(ci.current_stock, 0)::int AS current_stock,
        CASE WHEN COALESCE(ib.total_inbound, 0) > 0
          THEN ROUND(COALESCE(sl.sold_qty, 0)::numeric / ib.total_inbound * 100, 1)
          ELSE 0 END::float AS sell_through_rate
      FROM ${this.s}.products p
      LEFT JOIN inbound_supply ib ON p.product_code = ib.product_code
      LEFT JOIN sold sl ON p.product_code = sl.product_code
      LEFT JOIN current_inv ci ON p.product_code = ci.product_code
      WHERE COALESCE(ib.total_inbound, 0) > 0
        ${catFilter}
      ORDER BY sell_through_rate DESC`;

    const now = new Date();
    const rows = (await this.pool.query(sql, params)).rows.map((r: any) => {
      const totalInbound = Number(r.total_inbound) || 0;
      const soldQty = Number(r.sold_qty) || 0;
      const currentStock = Number(r.current_stock) || 0;
      const sellThrough = Number(r.sell_through_rate) || 0;

      // 완판예상일: 현재 일평균판매 기준 잔여재고 소진
      const firstDate = r.first_inbound_date ? new Date(r.first_inbound_date) : null;
      const elapsedDays = firstDate ? Math.max(1, Math.round((now.getTime() - firstDate.getTime()) / 86400000)) : days;
      const dailySales = soldQty > 0 ? soldQty / elapsedDays : 0;
      const daysToSellout = currentStock > 0 && dailySales > 0
        ? Math.round(currentStock / dailySales)
        : currentStock === 0 ? 0 : 9999;

      return {
        ...r,
        total_inbound: totalInbound,
        sold_qty: soldQty,
        current_stock: currentStock,
        sell_through_rate: sellThrough,
        days_to_sellout: daysToSellout,
        // 하위호환
        avg_inventory: totalInbound,
        turnover_rate: sellThrough,
        dio: daysToSellout,
      };
    });

    const settings = await this.loadMdSettings();
    // 완판 기준: slowMover 임계값을 % 기준으로 재해석 (기본 0.5 → 50% 미만)
    const slowThresholdPct = settings.slowMover * 100; // 50
    const fastThresholdPct = settings.fastMover * 100;  // 200 → 실용적으로 80% 이상 사용

    const withData = rows.filter(r => r.total_inbound > 0);
    const avgSellThrough = withData.length
      ? Math.round(withData.reduce((s, r) => s + r.sell_through_rate, 0) / withData.length * 10) / 10
      : 0;
    const soldOutCount = rows.filter(r => r.sell_through_rate >= 95 && r.current_stock <= 0).length;
    const slowMovers = rows.filter(r => r.sell_through_rate < slowThresholdPct && r.current_stock > 0);
    const fastMovers = rows.filter(r => r.sell_through_rate >= 80);

    return {
      items: rows,
      summary: {
        avg_sell_through: avgSellThrough,
        sold_out_count: soldOutCount,
        slow_movers_count: slowMovers.length,
        fast_movers_count: fastMovers.length,
        total_inbound: withData.reduce((s, r) => s + r.total_inbound, 0),
        total_sold: withData.reduce((s, r) => s + r.sold_qty, 0),
        // 하위호환
        avg_turnover: avgSellThrough,
        avg_dio: 0,
      },
      slow_movers: slowMovers.slice(0, 20).map(r => ({
        product_code: r.key, product_name: r.label, category: r.category || '',
        sell_through_rate: r.sell_through_rate, current_stock: r.current_stock,
        stock_value: r.current_stock * (Number(r.base_price) || 0),
        turnover_rate: r.sell_through_rate,
      })),
      thresholds: { slow: settings.slowMover, fast: settings.fastMover },
    };
  }

  // ─── 4. 시즌 성과 ───

  /** 숫자/레거시 시즌코드 → 표준 4시즌 정규화 SQL CASE */
  private get seasonNormCase() {
    return `CASE
      WHEN p.season IN ('SS','1') THEN 'SS'
      WHEN p.season IN ('SM','2') THEN 'SM'
      WHEN p.season IN ('FW','3') THEN 'FW'
      WHEN p.season IN ('WN','4') THEN 'WN'
      ELSE p.season END`;
  }

  /** 숫자 연도 → products.year 문자코드 변환 (master_codes YEAR) */
  private async yearToCode(numericYear: number): Promise<string | null> {
    const res = await this.pool.query(
      `SELECT code_value FROM ${this.s}.master_codes WHERE code_type = 'YEAR' AND code_label = $1 AND is_active = TRUE LIMIT 1`,
      [String(numericYear)],
    );
    return res.rows[0]?.code_value || null;
  }

  async seasonPerformance(year?: number, compareYears?: number[], monthFrom?: number, monthTo?: number): Promise<SeasonPerformanceResult> {
    const currentYear = year || new Date().getFullYear();

    const [yearCode, prevYearCode] = await Promise.all([
      this.yearToCode(currentYear),
      this.yearToCode(currentYear - 1),
    ]);

    // 고정 4시즌 (봄→여름→가을→겨울)
    const SEASONS = [
      { code: 'SS', name: '봄' },
      { code: 'SM', name: '여름' },
      { code: 'FW', name: '가을' },
      { code: 'WN', name: '겨울' },
    ];

    // 월 필터 SQL 조각 (파라미터화)
    const mFrom = monthFrom && monthFrom >= 1 && monthFrom <= 12 ? monthFrom : null;
    const mTo = monthTo && monthTo >= 1 && monthTo <= 12 ? monthTo : null;
    const monthParams: any[] = [];
    let monthFilter = '';
    if (mFrom && mTo) {
      monthFilter = `AND EXTRACT(MONTH FROM s.sale_date) BETWEEN $2 AND $3`;
      monthParams.push(mFrom, mTo);
    } else if (mFrom) {
      monthFilter = `AND EXTRACT(MONTH FROM s.sale_date) >= $2`;
      monthParams.push(mFrom);
    } else if (mTo) {
      monthFilter = `AND EXTRACT(MONTH FROM s.sale_date) <= $2`;
      monthParams.push(mTo);
    }

    const buildSeasonData = async (yCode: string | null, numYear: number): Promise<any[]> => {
      if (!yCode) return [];

      let configs: any[] = [];
      try {
        const configRes = await this.pool.query(
          `SELECT * FROM ${this.s}.season_configs WHERE year = $1 ORDER BY season_code`,
          [numYear],
        );
        configs = configRes.rows;
      } catch { /* season_configs 없으면 무시 */ }

      // 실적 — 시즌코드 정규화(1→SS, 2→SM 등) 후 집계
      const actualSql = `
        WITH ${this.salesCte}
        SELECT ${this.seasonNormCase} AS norm_season,
          COUNT(DISTINCT p.product_code)::int AS actual_styles,
          SUM(s.qty)::int AS actual_qty,
          SUM(s.total_price)::bigint AS actual_revenue
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.year = $1 AND p.season IS NOT NULL AND s.sale_type NOT IN ('반품','수정') ${monthFilter}
        GROUP BY norm_season`;
      const actuals = (await this.pool.query(actualSql, [yCode, ...monthParams])).rows;

      // 잔여재고 — 정규화
      const stockSql = `
        SELECT ${this.seasonNormCase} AS norm_season,
          SUM(i.qty)::int AS remaining_stock,
          SUM(i.qty * p.base_price)::bigint AS remaining_stock_value
        FROM ${this.s}.inventory i
        JOIN ${this.s}.product_variants pv ON i.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.year = $1 AND p.season IS NOT NULL
        GROUP BY norm_season`;
      const stocks = (await this.pool.query(stockSql, [yCode])).rows;

      const actualMap: Record<string, any> = {};
      for (const a of actuals) actualMap[a.norm_season] = a;
      const stockMap: Record<string, any> = {};
      for (const st of stocks) stockMap[st.norm_season] = st;

      // 4시즌 고정 — 데이터 없는 시즌도 표시
      return SEASONS.map(({ code, name }) => {
        const cfg = configs.find((c: any) => c.season_code === code);
        const act = actualMap[code] || {};
        const stk = stockMap[code] || {};
        const targetQty = cfg?.target_qty || 0;
        const targetRevenue = cfg?.target_revenue || 0;
        const actualQty = Number(act.actual_qty || 0);
        const actualRevenue = Number(act.actual_revenue || 0);
        return {
          season_code: code,
          season_name: cfg?.season_name || name,
          status: cfg?.status || 'N/A',
          target_styles: cfg?.target_styles || 0,
          target_qty: targetQty,
          target_revenue: targetRevenue,
          actual_styles: Number(act.actual_styles || 0),
          actual_qty: actualQty,
          actual_revenue: actualRevenue,
          achievement_rate_qty: targetQty > 0 ? Math.round(actualQty / targetQty * 1000) / 10 : 0,
          achievement_rate_revenue: targetRevenue > 0 ? Math.round(actualRevenue / targetRevenue * 1000) / 10 : 0,
          remaining_stock: Number(stk.remaining_stock || 0),
          remaining_stock_value: Number(stk.remaining_stock_value || 0),
        };
      });
    };

    const [seasons, prevSeasons] = await Promise.all([
      buildSeasonData(yearCode, currentYear),
      buildSeasonData(prevYearCode, currentYear - 1),
    ]);

    // 추가 비교 연도
    let compare_seasons: Record<number, any[]> | undefined;
    if (compareYears?.length) {
      compare_seasons = {};
      const uniqueYears = [...new Set(compareYears)].filter(y => y !== currentYear && y !== currentYear - 1);
      const results = await Promise.all(
        uniqueYears.map(async y => ({ y, code: await this.yearToCode(y) })),
      );
      const built = await Promise.all(
        results.map(async ({ y, code }) => ({ y, data: await buildSeasonData(code, y) })),
      );
      for (const { y, data } of built) compare_seasons[y] = data;
      // 전년도도 포함
      if (compareYears.includes(currentYear - 1)) compare_seasons[currentYear - 1] = prevSeasons;
    }

    return { seasons, prev_seasons: prevSeasons, compare_seasons };
  }

  // ─── 5. 사이즈/컬러 트렌드 ───
  async sizeColorTrends(dateFrom: string, dateTo: string, partnerCode?: string, category?: string): Promise<SizeColorTrendsResult> {
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcFilter = '';
    let catFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $${idx++}`; }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    const sizeOrder = `CASE pv.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 WHEN 'FREE' THEN 7 ELSE 8 END`;

    // 사이즈별 판매
    const sizeSalesSql = `
      WITH ${this.salesCte}
      SELECT pv.size, SUM(s.qty)::int AS sold_qty
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
      GROUP BY pv.size
      ORDER BY ${sizeOrder}`;

    // 사이즈별 입고
    const sizeInboundSql = `
      SELECT pv.size, SUM(it.qty_change)::int AS inbound_qty
      FROM ${this.s}.inventory_transactions it
      JOIN ${this.s}.product_variants pv ON it.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE it.tx_type IN ('INBOUND','SHIPMENT') AND it.qty_change > 0
        AND it.created_at >= $1::date AND it.created_at < ($2::date + 1)
        ${pcFilter.replace('s.partner_code', 'it.partner_code')} ${catFilter}
      GROUP BY pv.size
      ORDER BY ${sizeOrder}`;

    // 컬러별 판매 TOP 20
    const colorSalesSql = `
      WITH ${this.salesCte}
      SELECT pv.color, SUM(s.qty)::int AS sold_qty
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
        AND pv.color IS NOT NULL AND pv.color != ''
      GROUP BY pv.color
      ORDER BY sold_qty DESC
      LIMIT 20`;

    // 카테고리×사이즈
    const catSizeSql = `
      WITH ${this.salesCte}
      SELECT p.category, pv.size, SUM(s.qty)::int AS sold_qty
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
      GROUP BY p.category, pv.size
      ORDER BY p.category, ${sizeOrder}`;

    // 카테고리×컬러
    const catColorSql = `
      WITH ${this.salesCte}
      SELECT p.category, pv.color, SUM(s.qty)::int AS sold_qty
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
        AND pv.color IS NOT NULL AND pv.color != ''
      GROUP BY p.category, pv.color
      ORDER BY p.category, sold_qty DESC`;

    // 카테고리별 총 디자인수 대비 판매수량
    const catSummarySql = `
      WITH ${this.salesCte}
      SELECT p.category,
             COUNT(DISTINCT p.product_code)::int AS design_count,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty
      FROM ${this.s}.products p
      LEFT JOIN ${this.s}.product_variants pv ON pv.product_code = p.product_code
      LEFT JOIN combined_sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정') ${pcFilter}
      WHERE p.category IS NOT NULL AND p.category != '' ${catFilter}
      GROUP BY p.category
      ORDER BY sold_qty DESC`;

    // 스타일별 사이즈 분포 (판매 상위 50개)
    const styleSizeSql = `
      WITH ${this.salesCte},
      style_totals AS (
        SELECT p.product_code, p.product_name, p.category, SUM(s.qty)::int AS total_qty
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
          AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
        GROUP BY p.product_code, p.product_name, p.category
        ORDER BY total_qty DESC LIMIT 30
      )
      SELECT st.product_code, st.product_name, st.category, st.total_qty, pv.size, SUM(s.qty)::int AS size_qty
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN style_totals st ON pv.product_code = st.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
      GROUP BY st.product_code, st.product_name, st.category, st.total_qty, pv.size
      ORDER BY st.total_qty DESC, ${sizeOrder}`;

    const [sizeSales, sizeInbound, colorSales, catSize, catColor, catSummary, styleSize] = await Promise.all([
      this.pool.query(sizeSalesSql, params),
      this.pool.query(sizeInboundSql, params),
      this.pool.query(colorSalesSql, params),
      this.pool.query(catSizeSql, params),
      this.pool.query(catColorSql, params),
      this.pool.query(catSummarySql, params),
      this.pool.query(styleSizeSql, params),
    ]);

    const totalSizeSold = sizeSales.rows.reduce((s: number, r: any) => s + Number(r.sold_qty), 0) || 1;
    const totalInbound = sizeInbound.rows.reduce((s: number, r: any) => s + Number(r.inbound_qty), 0) || 1;
    const totalColorSold = colorSales.rows.reduce((s: number, r: any) => s + Number(r.sold_qty), 0) || 1;

    const inboundMap: Record<string, number> = {};
    for (const r of sizeInbound.rows) inboundMap[r.size] = Number(r.inbound_qty);

    const by_size = sizeSales.rows.map((r: any) => {
      const soldPct = Math.round(Number(r.sold_qty) / totalSizeSold * 1000) / 10;
      const iq = inboundMap[r.size] || 0;
      const inboundPct = Math.round(iq / totalInbound * 1000) / 10;
      return { size: r.size, sold_qty: Number(r.sold_qty), sold_pct: soldPct, inbound_qty: iq, inbound_pct: inboundPct, gap: Math.round((soldPct - inboundPct) * 10) / 10 };
    });

    const by_color = colorSales.rows.map((r: any, i: number) => ({
      color: r.color, sold_qty: Number(r.sold_qty), sold_pct: Math.round(Number(r.sold_qty) / totalColorSold * 1000) / 10, rank: i + 1,
    }));

    // 카테고리별 사이즈 비율
    const catSizeGroups: Record<string, number> = {};
    for (const r of catSize.rows) catSizeGroups[r.category] = (catSizeGroups[r.category] || 0) + Number(r.sold_qty);
    const by_category_size = catSize.rows.map((r: any) => ({
      category: r.category, size: r.size, sold_qty: Number(r.sold_qty),
      sold_pct: Math.round(Number(r.sold_qty) / (catSizeGroups[r.category] || 1) * 1000) / 10,
    }));

    const catColorGroups: Record<string, number> = {};
    for (const r of catColor.rows) catColorGroups[r.category] = (catColorGroups[r.category] || 0) + Number(r.sold_qty);
    const by_category_color = catColor.rows.map((r: any) => ({
      category: r.category, color: r.color, sold_qty: Number(r.sold_qty),
      sold_pct: Math.round(Number(r.sold_qty) / (catColorGroups[r.category] || 1) * 1000) / 10,
    }));

    // 스타일별 사이즈 분포 집계
    const styleMap: Record<string, { product_code: string; product_name: string; category: string; total_qty: number; sizes: Record<string, number> }> = {};
    const allSizesSet = new Set<string>();
    for (const r of styleSize.rows) {
      allSizesSet.add(r.size);
      if (!styleMap[r.product_code]) {
        styleMap[r.product_code] = { product_code: r.product_code, product_name: r.product_name, category: r.category, total_qty: Number(r.total_qty), sizes: {} };
      }
      styleMap[r.product_code].sizes[r.size] = Number(r.size_qty);
    }
    const sizeOrderArr = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'];
    const all_sizes = sizeOrderArr.filter(s => allSizesSet.has(s)).concat([...allSizesSet].filter(s => !sizeOrderArr.includes(s)));
    const by_style = Object.values(styleMap);

    const by_category_summary = catSummary.rows.map((r: any) => ({
      category: r.category,
      design_count: Number(r.design_count),
      sold_qty: Number(r.sold_qty),
      avg_qty_per_design: Number(r.design_count) > 0 ? Math.round(Number(r.sold_qty) / Number(r.design_count) * 10) / 10 : 0,
    }));

    return { by_size, by_color, by_category_size, by_category_color, by_category_summary, by_style, all_sizes };
  }

  // ─── 6. 마크다운 효과 분석 (대조군 비교 + 일별 추이 + 가변 기간) ───
  async markdownEffectiveness(seasonCode?: string, scheduleId?: number, overrideDays?: number): Promise<MarkdownEffectivenessResult> {
    const settings = await this.loadMdSettings();
    const compareDays = overrideDays && [7, 14, 21, 28].includes(overrideDays) ? overrideDays : settings.markdownDays;
    const params: any[] = [];
    let idx = 1;
    let filters = '';
    if (seasonCode) { params.push(seasonCode); filters += ` AND ms.season_code = $${idx++}`; }
    if (scheduleId) { params.push(scheduleId); filters += ` AND ms.schedule_id = $${idx++}`; }

    // applied_at이 없으면 start_date 사용 (DRAFT 분석 가능)
    const sql = `
      SELECT ms.schedule_id, ms.schedule_name, ms.season_code, ms.markdown_round,
        ms.discount_rate, ms.applied_at::text, ms.start_date::text, ms.end_date::text,
        COALESCE(ms.applied_at::date, ms.start_date) AS base_date,
        COUNT(DISTINCT mi.product_code)::int AS affected_products
      FROM ${this.s}.markdown_schedules ms
      JOIN ${this.s}.markdown_items mi ON ms.schedule_id = mi.schedule_id
      WHERE 1=1 ${filters}
      GROUP BY ms.schedule_id, ms.schedule_name, ms.season_code, ms.markdown_round,
        ms.discount_rate, ms.applied_at, ms.start_date, ms.end_date
      ORDER BY COALESCE(ms.applied_at, ms.start_date::timestamptz) DESC`;

    const schedules = (await this.pool.query(sql, params)).rows;

    const result: any[] = [];
    for (const sch of schedules) {
      const baseDate = sch.base_date;

      // 마크다운 대상 상품 전/후 판매
      const targetPreSql = `
        SELECT COALESCE(SUM(s.qty), 0)::int AS total_qty, COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.markdown_items mi ON pv.product_code = mi.product_code AND mi.schedule_id = $1
        WHERE s.sale_date >= ($2::date - $3) AND s.sale_date < $2::date
          AND s.sale_type NOT IN ('반품','수정')`;
      const targetPostSql = `
        SELECT COALESCE(SUM(s.qty), 0)::int AS total_qty, COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.markdown_items mi ON pv.product_code = mi.product_code AND mi.schedule_id = $1
        WHERE s.sale_date >= $2::date AND s.sale_date < ($2::date + $3)
          AND s.sale_type NOT IN ('반품','수정')`;

      // 대조군: 같은 카테고리의 마크다운 미적용 상품
      const controlPreSql = `
        SELECT COALESCE(SUM(s.qty), 0)::int AS total_qty, COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.category IN (
          SELECT DISTINCT p2.category FROM ${this.s}.markdown_items mi2
          JOIN ${this.s}.products p2 ON mi2.product_code = p2.product_code
          WHERE mi2.schedule_id = $1
        )
        AND p.product_code NOT IN (SELECT mi3.product_code FROM ${this.s}.markdown_items mi3 WHERE mi3.schedule_id = $1)
        AND s.sale_date >= ($2::date - $3) AND s.sale_date < $2::date
        AND s.sale_type NOT IN ('반품','수정')`;
      const controlPostSql = `
        SELECT COALESCE(SUM(s.qty), 0)::int AS total_qty, COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.category IN (
          SELECT DISTINCT p2.category FROM ${this.s}.markdown_items mi2
          JOIN ${this.s}.products p2 ON mi2.product_code = p2.product_code
          WHERE mi2.schedule_id = $1
        )
        AND p.product_code NOT IN (SELECT mi3.product_code FROM ${this.s}.markdown_items mi3 WHERE mi3.schedule_id = $1)
        AND s.sale_date >= $2::date AND s.sale_date < ($2::date + $3)
        AND s.sale_type NOT IN ('반품','수정')`;

      // 재고 + 가격 정보 (현재 잔여재고 + 정가/원가/할인가 가중평균)
      const stockSql = `
        SELECT COALESCE(SUM(i.qty), 0)::int AS current_stock
        FROM ${this.s}.inventory i
        JOIN ${this.s}.product_variants pv ON i.variant_id = pv.variant_id
        JOIN ${this.s}.markdown_items mi ON pv.product_code = mi.product_code AND mi.schedule_id = $1`;
      const priceSql = `
        SELECT ROUND(AVG(mi.original_price))::int AS avg_original,
               ROUND(AVG(mi.markdown_price))::int AS avg_markdown,
               ROUND(AVG(p.cost_price))::int AS avg_cost
        FROM ${this.s}.markdown_items mi
        JOIN ${this.s}.products p ON mi.product_code = p.product_code
        WHERE mi.schedule_id = $1`;

      // 대조군 잔여 재고 (상대 판매소진율 비교용)
      const controlStockSql = `
        SELECT COALESCE(SUM(i.qty), 0)::int AS current_stock
        FROM ${this.s}.inventory i
        JOIN ${this.s}.product_variants pv ON i.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.category IN (
          SELECT DISTINCT p2.category FROM ${this.s}.markdown_items mi2
          JOIN ${this.s}.products p2 ON mi2.product_code = p2.product_code
          WHERE mi2.schedule_id = $1
        )
        AND p.product_code NOT IN (SELECT mi3.product_code FROM ${this.s}.markdown_items mi3 WHERE mi3.schedule_id = $1)`;

      const [tPre, tPost, cPre, cPost, stockRes, priceRes, ctrlStockRes] = await Promise.all([
        this.pool.query(targetPreSql, [sch.schedule_id, baseDate, compareDays]),
        this.pool.query(targetPostSql, [sch.schedule_id, baseDate, compareDays]),
        this.pool.query(controlPreSql, [sch.schedule_id, baseDate, compareDays]),
        this.pool.query(controlPostSql, [sch.schedule_id, baseDate, compareDays]),
        this.pool.query(stockSql, [sch.schedule_id]),
        this.pool.query(priceSql, [sch.schedule_id]),
        this.pool.query(controlStockSql, [sch.schedule_id]),
      ]);

      const preQty = Number(tPre.rows[0]?.total_qty || 0);
      const postQty = Number(tPost.rows[0]?.total_qty || 0);
      const preRevenue = Number(tPre.rows[0]?.total_revenue || 0);
      const postRevenue = Number(tPost.rows[0]?.total_revenue || 0);
      const preVelocity = Math.round(preQty / compareDays * 100) / 100;
      const postVelocity = Math.round(postQty / compareDays * 100) / 100;
      const velocityChangePct = preVelocity > 0 ? Math.round((postVelocity - preVelocity) / preVelocity * 1000) / 10 : 0;

      const ctrlPreQty = Number(cPre.rows[0]?.total_qty || 0);
      const ctrlPostQty = Number(cPost.rows[0]?.total_qty || 0);
      const ctrlPreVelocity = Math.round(ctrlPreQty / compareDays * 100) / 100;
      const ctrlPostVelocity = Math.round(ctrlPostQty / compareDays * 100) / 100;
      const ctrlChangePct = ctrlPreVelocity > 0 ? Math.round((ctrlPostVelocity - ctrlPreVelocity) / ctrlPreVelocity * 1000) / 10 : 0;

      // 재고 소진 계산: 마크다운 시점 재고 ≈ 현재 재고 + 마크다운 이후 판매수량
      const currentStock = Number(stockRes.rows[0]?.current_stock || 0);
      const stockAtMarkdown = currentStock + postQty;
      const clearanceRate = stockAtMarkdown > 0 ? Math.round(postQty / stockAtMarkdown * 1000) / 10 : 0;

      // 마진 회수 계산
      const avgOriginal = Number(priceRes.rows[0]?.avg_original || 0);
      const avgMarkdown = Number(priceRes.rows[0]?.avg_markdown || 0);
      const avgCost = Number(priceRes.rows[0]?.avg_cost || 0);
      const discountLoss = Math.round((avgOriginal - avgMarkdown) * postQty);         // 정가 대비 깎아준 금액
      const additionalQty = Math.max(postQty - preQty, 0);                            // 할인 덕에 추가로 팔린 수량
      const marginalProfit = Math.round(additionalQty * Math.max(avgMarkdown - avgCost, 0)); // 추가 수량의 마진
      const netMarkdownValue = marginalProfit - discountLoss;

      // 상대 판매율 비교: 할인상품 vs 비할인 상품 소진율 차이
      const controlStock = Number(ctrlStockRes.rows[0]?.current_stock || 0);
      // 상대 판매속도 지수: (할인후/대조후) ÷ (할인전/대조전) - 1 → 시즌 하락 보정된 순수 할인효과
      let relativeVelocityIndex = 0;
      if (preVelocity > 0 && ctrlPreVelocity > 0 && ctrlPostVelocity > 0) {
        relativeVelocityIndex = Math.round(
          ((postVelocity / ctrlPostVelocity) / (preVelocity / ctrlPreVelocity) - 1) * 1000
        ) / 10;
      } else if (postVelocity > 0 && ctrlPostVelocity > 0) {
        // pre 데이터 없으면 post만으로 비교 (비율 자체를 %)
        relativeVelocityIndex = Math.round((postVelocity / ctrlPostVelocity - 1) * 1000) / 10;
      }
      // 대조군 소진율: 같은 기간 비할인 상품의 재고 소진 비율
      const ctrlStockAtStart = controlStock + ctrlPostQty;
      const controlSellThrough = ctrlStockAtStart > 0
        ? Math.round(ctrlPostQty / ctrlStockAtStart * 1000) / 10 : 0;
      // 소진율 격차: 할인상품 소진율 - 비할인상품 소진율 (pp)
      const sellThroughGap = Math.round((clearanceRate - controlSellThrough) * 10) / 10;

      result.push({
        schedule_id: sch.schedule_id,
        schedule_name: sch.schedule_name,
        season_code: sch.season_code,
        markdown_round: sch.markdown_round,
        discount_rate: Number(sch.discount_rate),
        applied_at: sch.applied_at,
        start_date: sch.start_date,
        end_date: sch.end_date,
        pre_velocity: preVelocity,
        post_velocity: postVelocity,
        velocity_change_pct: velocityChangePct,
        pre_revenue: preRevenue,
        post_revenue: postRevenue,
        additional_revenue: postRevenue - preRevenue,
        affected_products: sch.affected_products,
        control_pre_velocity: ctrlPreVelocity,
        control_post_velocity: ctrlPostVelocity,
        control_velocity_change_pct: ctrlChangePct,
        net_effect_pct: Math.round((velocityChangePct - ctrlChangePct) * 10) / 10,
        stock_at_markdown: stockAtMarkdown,
        stock_remaining: currentStock,
        clearance_rate: clearanceRate,
        discount_loss: discountLoss,
        marginal_profit: marginalProfit,
        net_markdown_value: netMarkdownValue,
        relative_velocity_index: relativeVelocityIndex,
        control_sell_through: controlSellThrough,
        sell_through_gap: sellThroughGap,
      });
    }

    // 라운드별 집계
    const roundMap: Record<number, { count: number; velocitySum: number; netSum: number; revenueSum: number }> = {};
    for (const s of result) {
      if (!roundMap[s.markdown_round]) roundMap[s.markdown_round] = { count: 0, velocitySum: 0, netSum: 0, revenueSum: 0 };
      roundMap[s.markdown_round].count++;
      roundMap[s.markdown_round].velocitySum += s.velocity_change_pct;
      roundMap[s.markdown_round].netSum += s.net_effect_pct;
      roundMap[s.markdown_round].revenueSum += s.additional_revenue;
    }
    const by_round = Object.entries(roundMap).map(([round, v]) => ({
      markdown_round: Number(round),
      avg_velocity_change: Math.round(v.velocitySum / v.count * 10) / 10,
      avg_net_effect: Math.round(v.netSum / v.count * 10) / 10,
      total_additional_revenue: v.revenueSum,
      schedule_count: v.count,
    }));

    // 일별 추이 (특정 스케줄 선택 시만)
    let daily_trend: any[] | undefined;
    if (scheduleId && result.length === 1) {
      const baseDate = schedules[0]?.base_date;
      // 마크다운 대상 일별
      const dailyTargetSql = `
        SELECT s.sale_date::text AS date, SUM(s.qty)::int AS qty, SUM(s.total_price)::bigint AS revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.markdown_items mi ON pv.product_code = mi.product_code AND mi.schedule_id = $1
        WHERE s.sale_date >= ($2::date - $3) AND s.sale_date < ($2::date + $3)
          AND s.sale_type NOT IN ('반품','수정')
        GROUP BY s.sale_date ORDER BY s.sale_date`;
      // 대조군 일별
      const dailyControlSql = `
        SELECT s.sale_date::text AS date, SUM(s.qty)::int AS qty, SUM(s.total_price)::bigint AS revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.category IN (
          SELECT DISTINCT p2.category FROM ${this.s}.markdown_items mi2
          JOIN ${this.s}.products p2 ON mi2.product_code = p2.product_code
          WHERE mi2.schedule_id = $1
        )
        AND p.product_code NOT IN (SELECT mi3.product_code FROM ${this.s}.markdown_items mi3 WHERE mi3.schedule_id = $1)
        AND s.sale_date >= ($2::date - $3) AND s.sale_date < ($2::date + $3)
        AND s.sale_type NOT IN ('반품','수정')
        GROUP BY s.sale_date ORDER BY s.sale_date`;

      const [dtRes, dcRes] = await Promise.all([
        this.pool.query(dailyTargetSql, [scheduleId, baseDate, compareDays]),
        this.pool.query(dailyControlSql, [scheduleId, baseDate, compareDays]),
      ]);

      const ctrlMap: Record<string, { qty: number; revenue: number }> = {};
      for (const r of dcRes.rows) ctrlMap[r.date] = { qty: Number(r.qty), revenue: Number(r.revenue) };

      // 모든 날짜를 합쳐서 일별 추이
      const allDates = new Set<string>();
      dtRes.rows.forEach((r: any) => allDates.add(r.date));
      dcRes.rows.forEach((r: any) => allDates.add(r.date));

      const targetMap: Record<string, { qty: number; revenue: number }> = {};
      for (const r of dtRes.rows) targetMap[r.date] = { qty: Number(r.qty), revenue: Number(r.revenue) };

      daily_trend = Array.from(allDates).sort().map(date => ({
        date: date.slice(0, 10),
        qty: targetMap[date]?.qty || 0,
        revenue: targetMap[date]?.revenue || 0,
        control_qty: ctrlMap[date]?.qty || 0,
        control_revenue: ctrlMap[date]?.revenue || 0,
        is_post: date >= baseDate.toISOString().slice(0, 10),
      }));
    }

    return { schedules: result, by_round, compare_days: compareDays, daily_trend };
  }

  // ─── 7. 매장별 상품 적합도 ───
  async storeProductFit(dateFrom: string, dateTo: string, metric = 'revenue', excludePartners: string[] = []): Promise<StoreProductFitResult> {
    const params: any[] = [dateFrom, dateTo];

    // 매장별 카테고리별 판매
    const salesSql = `
      WITH ${this.salesCte}
      SELECT s.partner_code, p.category,
        SUM(s.qty)::int AS sold_qty,
        SUM(s.total_price)::bigint AS revenue
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정')
        AND p.category IS NOT NULL
      GROUP BY s.partner_code, p.category`;

    // 활성 매장
    const partnerSql = `SELECT partner_code, partner_name FROM ${this.s}.partners WHERE is_active = TRUE ORDER BY partner_name`;

    const [salesRes, partnerRes] = await Promise.all([
      this.pool.query(salesSql, params),
      this.pool.query(partnerSql),
    ]);

    // 제외 매장 필터링
    const excludeSet = new Set(excludePartners.map(p => p.toUpperCase()));
    if (excludeSet.size > 0) {
      partnerRes.rows = partnerRes.rows.filter((r: any) => !excludeSet.has(r.partner_code.toUpperCase()));
    }

    // 데이터 맵핑
    const salesMap: Record<string, Record<string, { sold_qty: number; revenue: number }>> = {};
    for (const r of salesRes.rows) {
      if (!salesMap[r.partner_code]) salesMap[r.partner_code] = {};
      salesMap[r.partner_code][r.category] = { sold_qty: Number(r.sold_qty), revenue: Number(r.revenue) };
    }

    // 전체 카테고리
    const categories = [...new Set(salesRes.rows.map((r: any) => r.category))].filter(Boolean).sort();

    // 카테고리별 평균
    const catAvg: Record<string, number[]> = {};
    for (const cat of categories) catAvg[cat] = [];

    // 매트릭스 구성
    const matrix = partnerRes.rows.map((pt: any) => {
      const cats: Record<string, { value: number; vs_avg: number }> = {};
      for (const cat of categories) {
        const sold = salesMap[pt.partner_code]?.[cat]?.sold_qty || 0;
        const revenue = salesMap[pt.partner_code]?.[cat]?.revenue || 0;
        const value = metric === 'revenue' ? revenue : sold;
        cats[cat] = { value, vs_avg: 0 };
        catAvg[cat].push(value);
      }
      return { partner_code: pt.partner_code, partner_name: pt.partner_name, categories: cats };
    });

    // 평균 대비 계산 (0인 매장도 포함하여 전체 평균)
    const avgMap: Record<string, number> = {};
    for (const cat of categories) {
      const vals = catAvg[cat];
      avgMap[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    for (const row of matrix) {
      for (const cat of categories) {
        const avg = avgMap[cat];
        row.categories[cat].vs_avg = avg > 0 ? Math.round((row.categories[cat].value - avg) / avg * 1000) / 10 : 0;
      }
    }

    // TOP 조합
    const combinations: Array<{ partner_name: string; category: string; value: number; rank: number }> = [];
    for (const row of matrix) {
      for (const cat of categories) {
        if (row.categories[cat].value > 0) {
          combinations.push({ partner_name: row.partner_name, category: cat, value: row.categories[cat].value, rank: 0 });
        }
      }
    }
    combinations.sort((a, b) => b.value - a.value);
    combinations.forEach((c, i) => c.rank = i + 1);

    // 매장별 강점/약점
    const store_summary = matrix.map(row => {
      let maxCat = '', maxVal = -Infinity, minCat = '', minVal = Infinity;
      for (const cat of categories) {
        const v = row.categories[cat].vs_avg;
        if (v > maxVal) { maxVal = v; maxCat = cat; }
        if (v < minVal) { minVal = v; minCat = cat; }
      }
      const catValues = categories.map(c => row.categories[c].value);
      const overall = catValues.length ? Math.round(catValues.reduce((a, b) => a + b, 0) / catValues.length * 10) / 10 : 0;
      return { partner_code: row.partner_code, partner_name: row.partner_name, strength: maxCat, weakness: minCat, overall };
    });

    return { matrix, categories, top_combinations: combinations.slice(0, 20), store_summary };
  }

  // ─── 7-1. 매장별 상품 판매 순위 ───
  async storeProductRanking(dateFrom: string, dateTo: string, partnerCode: string, metric = 'revenue'): Promise<any[]> {
    const sql = `
      WITH ${this.salesCte}
      SELECT p.product_code, p.product_name, p.category,
        SUM(s.qty)::int AS sold_qty,
        SUM(s.total_price)::bigint AS revenue,
        ROUND(SUM(s.total_price)::numeric / NULLIF(SUM(s.qty), 0))::int AS avg_price
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.partner_code = $3
        AND s.sale_type NOT IN ('반품','수정')
      GROUP BY p.product_code, p.product_name, p.category
      ORDER BY ${metric === 'qty' ? 'sold_qty' : 'revenue'} DESC
      LIMIT 50`;
    const rows = (await this.pool.query(sql, [dateFrom, dateTo, partnerCode])).rows;
    return rows.map((r: any, i: number) => ({
      rank: i + 1,
      product_code: r.product_code,
      product_name: r.product_name,
      category: r.category || '미분류',
      sold_qty: Number(r.sold_qty),
      revenue: Number(r.revenue),
      avg_price: Number(r.avg_price),
    }));
  }

  // ─── 8. 시즌 목표 설정 (CRUD) ───
  async upsertSeasonConfigs(year: number, items: Array<{
    season_code: string; season_name?: string; status?: string;
    target_styles?: number; target_qty?: number; target_revenue?: number;
  }>, createdBy?: string): Promise<any[]> {
    const results: any[] = [];
    for (const item of items) {
      const sql = `
        INSERT INTO ${this.s}.season_configs (season_code, year, season_name, status, target_styles, target_qty, target_revenue, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (season_code, year) DO UPDATE SET
          season_name = EXCLUDED.season_name,
          status = EXCLUDED.status,
          target_styles = EXCLUDED.target_styles,
          target_qty = EXCLUDED.target_qty,
          target_revenue = EXCLUDED.target_revenue,
          updated_at = NOW()
        RETURNING *`;
      const res = await this.pool.query(sql, [
        item.season_code, year, item.season_name || null,
        item.status || 'ACTIVE', item.target_styles || 0,
        item.target_qty || 0, item.target_revenue || 0, createdBy || null,
      ]);
      results.push(res.rows[0]);
    }
    return results;
  }

  // ═══════════════════════════════════════════
  // 8. 스타일 생산성 분석
  // ═══════════════════════════════════════════
  async styleProductivity(
    dateFrom: string, dateTo: string, partnerCode?: string, category?: string,
  ): Promise<StyleProductivityResult> {
    const s = this.s;
    const conds = ['cs.sale_date BETWEEN $1 AND $2', "COALESCE(cs.sale_type, '정상') NOT IN ('반품','수정')"];
    const vals: any[] = [dateFrom, dateTo];
    let idx = 3;
    if (partnerCode) { conds.push(`cs.partner_code = $${idx++}`); vals.push(partnerCode); }
    if (category) { conds.push(`p.category = $${idx++}`); vals.push(category); }
    const where = conds.join(' AND ');

    // 카테고리별 스타일 생산성
    const catSql = `
      WITH ${this.salesCte}
      SELECT p.category,
             COUNT(DISTINCT p.product_code)::int AS style_count,
             SUM(cs.qty)::int AS total_qty,
             SUM(cs.total_price)::bigint AS total_revenue,
             ROUND(SUM(cs.qty)::numeric / NULLIF(COUNT(DISTINCT p.product_code), 0), 1) AS qty_per_style,
             ROUND(SUM(cs.total_price)::numeric / NULLIF(COUNT(DISTINCT p.product_code), 0)) AS revenue_per_style
        FROM combined_sales cs
        JOIN ${s}.product_variants pv ON pv.variant_id = cs.variant_id
        JOIN ${s}.products p ON p.product_code = pv.product_code
       WHERE ${where}
       GROUP BY p.category
       ORDER BY total_revenue DESC`;
    const catRes = await this.pool.query(catSql, vals);

    // 월별 추이 (전체)
    const monthlySql = `
      WITH ${this.salesCte}
      SELECT TO_CHAR(cs.sale_date, 'YYYY-MM') AS month,
             COUNT(DISTINCT p.product_code)::int AS style_count,
             SUM(cs.qty)::int AS total_qty,
             SUM(cs.total_price)::bigint AS total_revenue,
             ROUND(SUM(cs.qty)::numeric / NULLIF(COUNT(DISTINCT p.product_code), 0), 1) AS qty_per_style,
             ROUND(SUM(cs.total_price)::numeric / NULLIF(COUNT(DISTINCT p.product_code), 0)) AS revenue_per_style
        FROM combined_sales cs
        JOIN ${s}.product_variants pv ON pv.variant_id = cs.variant_id
        JOIN ${s}.products p ON p.product_code = pv.product_code
       WHERE ${where}
       GROUP BY TO_CHAR(cs.sale_date, 'YYYY-MM')
       ORDER BY month`;
    const monthlyRes = await this.pool.query(monthlySql, vals);

    // 카테고리 × 월별 (드릴다운용)
    const catMonthlySql = `
      WITH ${this.salesCte}
      SELECT p.category,
             TO_CHAR(cs.sale_date, 'YYYY-MM') AS month,
             COUNT(DISTINCT p.product_code)::int AS style_count,
             SUM(cs.qty)::int AS total_qty,
             SUM(cs.total_price)::bigint AS total_revenue,
             ROUND(SUM(cs.qty)::numeric / NULLIF(COUNT(DISTINCT p.product_code), 0), 1) AS qty_per_style,
             ROUND(SUM(cs.total_price)::numeric / NULLIF(COUNT(DISTINCT p.product_code), 0)) AS revenue_per_style
        FROM combined_sales cs
        JOIN ${s}.product_variants pv ON pv.variant_id = cs.variant_id
        JOIN ${s}.products p ON p.product_code = pv.product_code
       WHERE ${where}
       GROUP BY p.category, TO_CHAR(cs.sale_date, 'YYYY-MM')
       ORDER BY p.category, month`;
    const catMonthlyRes = await this.pool.query(catMonthlySql, vals);

    return {
      by_category: catRes.rows,
      monthly: monthlyRes.rows,
      by_category_monthly: catMonthlyRes.rows,
    };
  }

  // ═══════════════════════════════════════════
  // 9. VMD 진열 효과 분석
  // ═══════════════════════════════════════════
  async vmdEffectAnalysis(dateFrom: string, dateTo: string, partnerCode?: string): Promise<VmdEffectResult> {
    const s = this.s;
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND da.partner_code = $${idx++}`; }

    // 존별 판매 집계: display_assignments 기간 내 해당 상품의 판매 JOIN
    const sql = `
      WITH ${this.salesCte},
      display_sales AS (
        SELECT da.assignment_id, da.zone_code, da.partner_code, da.product_code,
               da.assigned_date, COALESCE(da.removed_date, CURRENT_DATE) AS end_date,
               GREATEST((COALESCE(da.removed_date, CURRENT_DATE) - da.assigned_date), 1) AS days_displayed,
               p.product_name, p.category,
               pt.partner_name,
               mc.code_label AS zone_label,
               COALESCE(SUM(cs.qty), 0)::int AS qty,
               COALESCE(SUM(cs.total_price), 0)::bigint AS revenue
        FROM ${s}.display_assignments da
        JOIN ${s}.products p ON da.product_code = p.product_code
        JOIN ${s}.partners pt ON da.partner_code = pt.partner_code
        LEFT JOIN ${s}.master_codes mc ON mc.code_type = 'DISPLAY_ZONE' AND mc.code_value = da.zone_code
        LEFT JOIN ${s}.product_variants pv ON da.product_code = pv.product_code
        LEFT JOIN combined_sales cs ON pv.variant_id = cs.variant_id
          AND cs.partner_code = da.partner_code
          AND cs.sale_date >= da.assigned_date
          AND cs.sale_date <= COALESCE(da.removed_date, CURRENT_DATE)
          AND COALESCE(cs.sale_type, '정상') NOT IN ('반품','수정')
        WHERE da.assigned_date >= $1::date AND da.assigned_date <= $2::date ${pcFilter}
        GROUP BY da.assignment_id, da.zone_code, da.partner_code, da.product_code,
                 da.assigned_date, da.removed_date, p.product_name, p.category,
                 pt.partner_name, mc.code_label
      )
      SELECT * FROM display_sales ORDER BY zone_code, revenue DESC`;

    const rows = (await this.pool.query(sql, params)).rows;

    // 존별 요약
    const zoneMap: Record<string, { zone_code: string; zone_label: string; products: Set<string>; totalQty: number; totalRevenue: number; totalDays: number; count: number }> = {};
    for (const r of rows) {
      if (!zoneMap[r.zone_code]) {
        zoneMap[r.zone_code] = { zone_code: r.zone_code, zone_label: r.zone_label || r.zone_code, products: new Set(), totalQty: 0, totalRevenue: 0, totalDays: 0, count: 0 };
      }
      const z = zoneMap[r.zone_code];
      z.products.add(r.product_code);
      z.totalQty += Number(r.qty);
      z.totalRevenue += Number(r.revenue);
      z.totalDays += Number(r.days_displayed);
      z.count++;
    }

    const by_zone = Object.values(zoneMap).map(z => ({
      zone_code: z.zone_code,
      zone_label: z.zone_label,
      product_count: z.products.size,
      total_qty: z.totalQty,
      total_revenue: z.totalRevenue,
      avg_daily_qty: z.totalDays > 0 ? Math.round(z.totalQty / z.totalDays * 100) / 100 : 0,
      avg_daily_revenue: z.totalDays > 0 ? Math.round(z.totalRevenue / z.totalDays) : 0,
    }));

    // NORMAL 존의 평균 일일 판매속도 (비교 기준)
    const normalZone = zoneMap['NORMAL'];
    const normalVelocity = normalZone && normalZone.totalDays > 0
      ? normalZone.totalQty / normalZone.totalDays
      : 0;

    // 상품별 효과
    const products = rows.map((r: any) => {
      const daysDisplayed = Number(r.days_displayed);
      const qty = Number(r.qty);
      const revenue = Number(r.revenue);
      const dailyVelocity = daysDisplayed > 0 ? Math.round(qty / daysDisplayed * 100) / 100 : 0;
      const liftPct = normalVelocity > 0 ? Math.round((dailyVelocity - normalVelocity) / normalVelocity * 1000) / 10 : 0;

      return {
        product_code: r.product_code,
        product_name: r.product_name,
        category: r.category || '',
        zone_code: r.zone_code,
        zone_label: r.zone_label || r.zone_code,
        partner_code: r.partner_code,
        partner_name: r.partner_name,
        days_displayed: daysDisplayed,
        qty,
        revenue,
        daily_velocity: dailyVelocity,
        normal_velocity: Math.round(normalVelocity * 100) / 100,
        velocity_lift_pct: r.zone_code === 'NORMAL' ? 0 : liftPct,
      };
    });

    const nonNormalProducts = products.filter(p => p.zone_code !== 'NORMAL' && p.velocity_lift_pct !== 0);
    const avgLift = nonNormalProducts.length
      ? Math.round(nonNormalProducts.reduce((s, p) => s + p.velocity_lift_pct, 0) / nonNormalProducts.length * 10) / 10
      : 0;

    return {
      by_zone,
      products,
      total_products: new Set(rows.map((r: any) => r.product_code)).size,
      avg_lift_pct: avgLift,
    };
  }
}

export const mdAnalyticsRepository = new MdAnalyticsRepository();
