import { getPool } from '../../db/connection';
import type {
  AbcAnalysisResult, MarginAnalysisResult, InventoryTurnoverResult,
  SeasonPerformanceResult, SizeColorTrendsResult,
  MarkdownEffectivenessResult, StoreProductFitResult,
} from '../../../../shared/types/md';

interface MdSettings {
  abcA: number;   // ABC A등급 임계값 (0~1, 기본 0.7)
  abcB: number;   // ABC B등급 임계값 (0~1, 기본 0.9)
  slowMover: number; // 슬로우무버 회전율 기준 (기본 0.5)
  fastMover: number; // 패스트무버 회전율 기준 (기본 2.0)
  markdownDays: number; // 마크다운 비교 기간 (기본 14일)
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

  // ─── 1. ABC 분석 ───
  async abcAnalysis(dateFrom: string, dateTo: string, partnerCode?: string, category?: string, dimension = 'product'): Promise<AbcAnalysisResult> {
    const settings = await this.loadMdSettings();
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcFilter = '';
    let catFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $${idx++}`; }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    // ABC 임계값을 SQL 파라미터로 전달
    const abcAIdx = idx++;
    const abcBIdx = idx++;
    params.push(settings.abcA, settings.abcB);

    let groupSelect: string;
    let groupBy: string;
    if (dimension === 'category') {
      groupSelect = `COALESCE(p.category, '미분류') AS key, COALESCE(p.category, '미분류') AS label`;
      groupBy = `COALESCE(p.category, '미분류')`;
    } else if (dimension === 'season') {
      groupSelect = `COALESCE(p.season, '미분류') AS key, COALESCE(p.season, '미분류') AS label`;
      groupBy = `COALESCE(p.season, '미분류')`;
    } else {
      groupSelect = `p.product_code AS key, p.product_name AS label`;
      groupBy = `p.product_code, p.product_name`;
    }

    const sql = `
      WITH ${this.salesCte},
      ranked AS (
        SELECT ${groupSelect},
          SUM(s.total_price)::bigint AS total_price,
          SUM(s.qty)::int AS qty,
          SUM(SUM(s.total_price)) OVER () AS grand_total,
          SUM(SUM(s.total_price)) OVER (ORDER BY SUM(s.total_price) DESC) AS running_total
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
          AND s.sale_type NOT IN ('반품','수정') ${pcFilter} ${catFilter}
        GROUP BY ${groupBy}
      )
      SELECT key, label, total_price, qty,
        ROUND(running_total::numeric / NULLIF(grand_total, 0) * 100, 1)::float AS cumulative_pct,
        CASE
          WHEN running_total::numeric / NULLIF(grand_total, 0) <= $${abcAIdx}::numeric THEN 'A'
          WHEN running_total::numeric / NULLIF(grand_total, 0) <= $${abcBIdx}::numeric THEN 'B'
          ELSE 'C'
        END AS grade
      FROM ranked
      ORDER BY total_price DESC`;

    const rows = (await this.pool.query(sql, params)).rows;
    const summary = {
      total_revenue: rows.reduce((s, r) => s + Number(r.total_price), 0),
      a_count: rows.filter(r => r.grade === 'A').length,
      b_count: rows.filter(r => r.grade === 'B').length,
      c_count: rows.filter(r => r.grade === 'C').length,
      a_revenue: rows.filter(r => r.grade === 'A').reduce((s, r) => s + Number(r.total_price), 0),
      b_revenue: rows.filter(r => r.grade === 'B').reduce((s, r) => s + Number(r.total_price), 0),
      c_revenue: rows.filter(r => r.grade === 'C').reduce((s, r) => s + Number(r.total_price), 0),
    };
    return { items: rows, summary };
  }

  // ─── 2. 마진 분석 ───
  async marginAnalysis(dateFrom: string, dateTo: string, partnerCode?: string, category?: string, groupBy = 'product'): Promise<MarginAnalysisResult> {
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcFilter = '';
    let catFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $${idx++}`; }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    let groupSelect: string;
    let groupByCols: string;
    if (groupBy === 'category') {
      groupSelect = `COALESCE(p.category, '미분류') AS key, COALESCE(p.category, '미분류') AS label, AVG(p.cost_price)::int AS cost_price, AVG(p.base_price)::int AS base_price`;
      groupByCols = `COALESCE(p.category, '미분류')`;
    } else if (groupBy === 'season') {
      groupSelect = `COALESCE(p.season, '미분류') AS key, COALESCE(p.season, '미분류') AS label, AVG(p.cost_price)::int AS cost_price, AVG(p.base_price)::int AS base_price`;
      groupByCols = `COALESCE(p.season, '미분류')`;
    } else {
      groupSelect = `p.product_code AS key, p.product_name AS label, p.cost_price, p.base_price`;
      groupByCols = `p.product_code, p.product_name, p.cost_price, p.base_price`;
    }

    const sql = `
      WITH ${this.salesCte}
      SELECT ${groupSelect},
        ROUND(AVG(s.unit_price))::int AS avg_selling_price,
        ROUND((AVG(p.base_price) - AVG(p.cost_price))::numeric / NULLIF(AVG(p.base_price), 0) * 100, 1)::float AS base_margin_pct,
        ROUND((AVG(s.unit_price) - AVG(p.cost_price))::numeric / NULLIF(AVG(s.unit_price), 0) * 100, 1)::float AS actual_margin_pct,
        SUM(s.total_price)::bigint AS total_revenue,
        (SUM(s.qty) * AVG(p.cost_price))::bigint AS total_cost,
        (SUM(s.total_price) - SUM(s.qty) * AVG(p.cost_price))::bigint AS total_profit,
        SUM(s.qty)::int AS qty
      FROM combined_sales s
      JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date
        AND s.sale_type NOT IN ('반품','수정')
        AND p.cost_price > 0 ${pcFilter} ${catFilter}
      GROUP BY ${groupByCols}
      ORDER BY total_profit DESC`;

    const items = (await this.pool.query(sql, params)).rows;

    const totalRevenue = items.reduce((s, r) => s + Number(r.total_revenue), 0);
    const totalCost = items.reduce((s, r) => s + Number(r.total_cost), 0);
    const totalProfit = items.reduce((s, r) => s + Number(r.total_profit), 0);

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
        avg_base_margin: items.length ? Math.round(items.reduce((s, r) => s + Number(r.base_margin_pct || 0), 0) / items.length * 10) / 10 : 0,
        avg_actual_margin: items.length ? Math.round(items.reduce((s, r) => s + Number(r.actual_margin_pct || 0), 0) / items.length * 10) / 10 : 0,
        margin_distribution: ranges.map((range, i) => ({ range, count: dist[i] })),
      },
    };
  }

  // ─── 3. 재고 회전율 ───
  async inventoryTurnover(dateFrom: string, dateTo: string, partnerCode?: string, category?: string, groupBy = 'product'): Promise<InventoryTurnoverResult & { thresholds?: { slow: number; fast: number } }> {
    const params: any[] = [dateFrom, dateTo];
    let idx = 3;
    let pcSalesFilter = '';
    let pcInvFilter = '';
    let catFilter = '';
    if (partnerCode) { params.push(partnerCode); pcSalesFilter = `AND s.partner_code = $${idx}`; pcInvFilter = `WHERE i.partner_code = $${idx}`; idx++; }
    if (category) { params.push(category); catFilter = `AND p.category = $${idx++}`; }

    const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);

    let groupSelect: string;
    let groupByCols: string;
    let soldGroupBy: string;
    let invGroupBy: string;
    if (groupBy === 'category') {
      groupSelect = `COALESCE(p.category, '미분류') AS key, COALESCE(p.category, '미분류') AS label, NULL::text AS category`;
      groupByCols = `COALESCE(p.category, '미분류')`;
      soldGroupBy = `p2.category`;
      invGroupBy = `p3.category`;
    } else if (groupBy === 'store') {
      groupSelect = `pt.partner_code AS key, pt.partner_name AS label, NULL::text AS category`;
      groupByCols = `pt.partner_code, pt.partner_name`;
      soldGroupBy = `s2.partner_code`;
      invGroupBy = `i2.partner_code`;
    } else {
      groupSelect = `p.product_code AS key, p.product_name AS label, p.category`;
      groupByCols = `p.product_code, p.product_name, p.category`;
      soldGroupBy = `pv2.product_code`;
      invGroupBy = `pv3.product_code`;
    }

    // 단순화: product 기준으로 통합 쿼리
    const sql = `
      WITH ${this.salesCte},
      sold AS (
        SELECT pv2.product_code, SUM(s2.qty)::int AS sold_qty
        FROM combined_sales s2
        JOIN ${this.s}.product_variants pv2 ON s2.variant_id = pv2.variant_id
        WHERE s2.sale_date >= $1::date AND s2.sale_date <= $2::date
          AND s2.sale_type NOT IN ('반품','수정') ${pcSalesFilter}
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
        COALESCE(sl.sold_qty, 0)::int AS sold_qty,
        COALESCE(ci.current_stock, 0)::int AS current_stock,
        ROUND((COALESCE(ci.current_stock, 0) + COALESCE(sl.sold_qty, 0))::numeric / 2, 0)::int AS avg_inventory,
        CASE WHEN (COALESCE(ci.current_stock, 0) + COALESCE(sl.sold_qty, 0)) > 0
          THEN ROUND(COALESCE(sl.sold_qty, 0)::numeric / ((COALESCE(ci.current_stock, 0) + COALESCE(sl.sold_qty, 0))::numeric / 2) , 2)
          ELSE 0 END::float AS turnover_rate
      FROM ${this.s}.products p
      LEFT JOIN sold sl ON p.product_code = sl.product_code
      LEFT JOIN current_inv ci ON p.product_code = ci.product_code
      WHERE (COALESCE(sl.sold_qty, 0) > 0 OR COALESCE(ci.current_stock, 0) > 0)
        ${catFilter}
      ORDER BY turnover_rate ASC`;

    const rows = (await this.pool.query(sql, params)).rows.map((r: any) => ({
      ...r,
      sold_qty: Number(r.sold_qty),
      current_stock: Number(r.current_stock),
      avg_inventory: Number(r.avg_inventory),
      turnover_rate: Number(r.turnover_rate),
      dio: Number(r.turnover_rate) > 0 ? Math.round(days / Number(r.turnover_rate)) : 9999,
    }));

    const settings = await this.loadMdSettings();
    const withTurnover = rows.filter(r => r.avg_inventory > 0);
    const avgTurnover = withTurnover.length ? Math.round(withTurnover.reduce((s, r) => s + r.turnover_rate, 0) / withTurnover.length * 100) / 100 : 0;
    const avgDio = avgTurnover > 0 ? Math.round(days / avgTurnover) : 9999;
    const slowMovers = rows.filter(r => r.turnover_rate < settings.slowMover && r.current_stock > 0);
    const fastMovers = rows.filter(r => r.turnover_rate >= settings.fastMover);

    return {
      items: rows,
      summary: {
        avg_turnover: avgTurnover,
        avg_dio: avgDio,
        slow_movers_count: slowMovers.length,
        fast_movers_count: fastMovers.length,
      },
      slow_movers: slowMovers.slice(0, 20).map(r => ({
        product_code: r.key, product_name: r.label, category: r.category || '',
        turnover_rate: r.turnover_rate, current_stock: r.current_stock,
        stock_value: r.current_stock * (Number(r.base_price) || 0),
      })),
      thresholds: { slow: settings.slowMover, fast: settings.fastMover },
    };
  }

  // ─── 4. 시즌 성과 ───
  async seasonPerformance(year?: number): Promise<SeasonPerformanceResult> {
    const currentYear = year || new Date().getFullYear();
    const yearStr = String(currentYear);
    const prevYearStr = String(currentYear - 1);

    const buildSeasonData = async (yr: string): Promise<any[]> => {
      // 시즌 설정
      const configSql = `SELECT * FROM ${this.s}.season_configs WHERE year = $1 ORDER BY season_code`;
      const configs = (await this.pool.query(configSql, [yr])).rows;

      // 실적
      const actualSql = `
        WITH ${this.salesCte}
        SELECT p.season,
          COUNT(DISTINCT p.product_code)::int AS actual_styles,
          SUM(s.qty)::int AS actual_qty,
          SUM(s.total_price)::bigint AS actual_revenue
        FROM combined_sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.year = $1 AND s.sale_type NOT IN ('반품','수정')
        GROUP BY p.season`;
      const actuals = (await this.pool.query(actualSql, [yr])).rows;

      // 잔여재고
      const stockSql = `
        SELECT p.season, SUM(i.qty)::int AS remaining_stock,
          SUM(i.qty * p.base_price)::bigint AS remaining_stock_value
        FROM ${this.s}.inventory i
        JOIN ${this.s}.product_variants pv ON i.variant_id = pv.variant_id
        JOIN ${this.s}.products p ON pv.product_code = p.product_code
        WHERE p.year = $1
        GROUP BY p.season`;
      const stocks = (await this.pool.query(stockSql, [yr])).rows;

      // 매핑
      const actualMap: Record<string, any> = {};
      for (const a of actuals) actualMap[a.season] = a;
      const stockMap: Record<string, any> = {};
      for (const s of stocks) stockMap[s.season] = s;

      // config가 없어도 실적 기준으로 시즌 생성
      const seasonCodes = [...new Set([...configs.map((c: any) => c.season_code), ...actuals.map((a: any) => a.season)])];

      return seasonCodes.map(code => {
        const cfg = configs.find((c: any) => c.season_code === code);
        const act = actualMap[code] || {};
        const stk = stockMap[code] || {};
        const targetQty = cfg?.target_qty || 0;
        const targetRevenue = cfg?.target_revenue || 0;
        const actualQty = Number(act.actual_qty || 0);
        const actualRevenue = Number(act.actual_revenue || 0);
        return {
          season_code: code,
          season_name: cfg?.season_name || code,
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
      buildSeasonData(yearStr),
      buildSeasonData(prevYearStr),
    ]);

    return { seasons, prev_seasons: prevSeasons };
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

    const [sizeSales, sizeInbound, colorSales, catSize, catColor] = await Promise.all([
      this.pool.query(sizeSalesSql, params),
      this.pool.query(sizeInboundSql, params),
      this.pool.query(colorSalesSql, params),
      this.pool.query(catSizeSql, params),
      this.pool.query(catColorSql, params),
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

    return { by_size, by_color, by_category_size, by_category_color };
  }

  // ─── 6. 마크다운 효과 분석 ───
  async markdownEffectiveness(seasonCode?: string, scheduleId?: number): Promise<MarkdownEffectivenessResult> {
    const settings = await this.loadMdSettings();
    const compareDays = settings.markdownDays;
    const params: any[] = [];
    let idx = 1;
    let filters = '';
    if (seasonCode) { params.push(seasonCode); filters += ` AND ms.season_code = $${idx++}`; }
    if (scheduleId) { params.push(scheduleId); filters += ` AND ms.schedule_id = $${idx++}`; }

    const sql = `
      SELECT ms.schedule_id, ms.schedule_name, ms.season_code, ms.markdown_round,
        ms.discount_rate, ms.applied_at::text, ms.start_date::text, ms.end_date::text,
        ms.applied_at::date AS apply_date,
        COUNT(DISTINCT mi.product_code)::int AS affected_products
      FROM ${this.s}.markdown_schedules ms
      JOIN ${this.s}.markdown_items mi ON ms.schedule_id = mi.schedule_id
      WHERE ms.applied_at IS NOT NULL ${filters}
      GROUP BY ms.schedule_id, ms.schedule_name, ms.season_code, ms.markdown_round,
        ms.discount_rate, ms.applied_at, ms.start_date, ms.end_date
      ORDER BY ms.applied_at DESC`;

    const schedules = (await this.pool.query(sql, params)).rows;

    // 각 스케줄별 전/후 판매 비교
    const result: any[] = [];
    for (const sch of schedules) {
      const applyDate = sch.apply_date;
      const preSql = `
        SELECT COALESCE(SUM(s.qty), 0)::int AS total_qty, COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.markdown_items mi ON pv.product_code = mi.product_code AND mi.schedule_id = $1
        WHERE s.sale_date >= ($2::date - ${compareDays}) AND s.sale_date < $2::date
          AND s.sale_type NOT IN ('반품','수정')`;
      const postSql = `
        SELECT COALESCE(SUM(s.qty), 0)::int AS total_qty, COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM ${this.s}.sales s
        JOIN ${this.s}.product_variants pv ON s.variant_id = pv.variant_id
        JOIN ${this.s}.markdown_items mi ON pv.product_code = mi.product_code AND mi.schedule_id = $1
        WHERE s.sale_date >= $2::date AND s.sale_date < ($2::date + ${compareDays})
          AND s.sale_type NOT IN ('반품','수정')`;

      const [pre, post] = await Promise.all([
        this.pool.query(preSql, [sch.schedule_id, applyDate]),
        this.pool.query(postSql, [sch.schedule_id, applyDate]),
      ]);

      const preQty = Number(pre.rows[0]?.total_qty || 0);
      const postQty = Number(post.rows[0]?.total_qty || 0);
      const preRevenue = Number(pre.rows[0]?.total_revenue || 0);
      const postRevenue = Number(post.rows[0]?.total_revenue || 0);
      const preVelocity = Math.round(preQty / compareDays * 100) / 100;
      const postVelocity = Math.round(postQty / compareDays * 100) / 100;

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
        velocity_change_pct: preVelocity > 0 ? Math.round((postVelocity - preVelocity) / preVelocity * 1000) / 10 : 0,
        pre_revenue: preRevenue,
        post_revenue: postRevenue,
        additional_revenue: postRevenue - preRevenue,
        affected_products: sch.affected_products,
      });
    }

    // 라운드별 집계
    const roundMap: Record<number, { count: number; velocitySum: number; revenueSum: number }> = {};
    for (const s of result) {
      if (!roundMap[s.markdown_round]) roundMap[s.markdown_round] = { count: 0, velocitySum: 0, revenueSum: 0 };
      roundMap[s.markdown_round].count++;
      roundMap[s.markdown_round].velocitySum += s.velocity_change_pct;
      roundMap[s.markdown_round].revenueSum += s.additional_revenue;
    }
    const by_round = Object.entries(roundMap).map(([round, v]) => ({
      markdown_round: Number(round),
      avg_velocity_change: Math.round(v.velocitySum / v.count * 10) / 10,
      total_additional_revenue: v.revenueSum,
      schedule_count: v.count,
    }));

    return { schedules: result, by_round };
  }

  // ─── 7. 매장별 상품 적합도 ───
  async storeProductFit(dateFrom: string, dateTo: string, metric = 'sell_through'): Promise<StoreProductFitResult> {
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

    // 매장별 카테고리별 재고
    const invSql = `
      SELECT i.partner_code, p.category,
        SUM(i.qty)::int AS stock_qty
      FROM ${this.s}.inventory i
      JOIN ${this.s}.product_variants pv ON i.variant_id = pv.variant_id
      JOIN ${this.s}.products p ON pv.product_code = p.product_code
      WHERE p.category IS NOT NULL
      GROUP BY i.partner_code, p.category`;

    // 활성 매장
    const partnerSql = `SELECT partner_code, partner_name FROM ${this.s}.partners WHERE is_active = TRUE ORDER BY partner_name`;

    const [salesRes, invRes, partnerRes] = await Promise.all([
      this.pool.query(salesSql, params),
      this.pool.query(invSql),
      this.pool.query(partnerSql),
    ]);

    // 데이터 맵핑
    const salesMap: Record<string, Record<string, { sold_qty: number; revenue: number }>> = {};
    for (const r of salesRes.rows) {
      if (!salesMap[r.partner_code]) salesMap[r.partner_code] = {};
      salesMap[r.partner_code][r.category] = { sold_qty: Number(r.sold_qty), revenue: Number(r.revenue) };
    }

    const invMap: Record<string, Record<string, number>> = {};
    for (const r of invRes.rows) {
      if (!invMap[r.partner_code]) invMap[r.partner_code] = {};
      invMap[r.partner_code][r.category] = Number(r.stock_qty);
    }

    // 전체 카테고리
    const categories = [...new Set([...salesRes.rows.map((r: any) => r.category), ...invRes.rows.map((r: any) => r.category)])].filter(Boolean).sort();

    // 카테고리별 평균
    const catAvg: Record<string, number[]> = {};
    for (const cat of categories) catAvg[cat] = [];

    // 매트릭스 구성
    const matrix = partnerRes.rows.map((pt: any) => {
      const cats: Record<string, { value: number; vs_avg: number }> = {};
      for (const cat of categories) {
        const sold = salesMap[pt.partner_code]?.[cat]?.sold_qty || 0;
        const stock = invMap[pt.partner_code]?.[cat] || 0;
        const revenue = salesMap[pt.partner_code]?.[cat]?.revenue || 0;
        let value = 0;
        if (metric === 'sell_through') value = (sold + stock) > 0 ? Math.round(sold / (sold + stock) * 1000) / 10 : 0;
        else if (metric === 'revenue') value = revenue;
        else value = sold;
        cats[cat] = { value, vs_avg: 0 };
        catAvg[cat].push(value);
      }
      return { partner_code: pt.partner_code, partner_name: pt.partner_name, categories: cats };
    });

    // 평균 대비 계산
    const avgMap: Record<string, number> = {};
    for (const cat of categories) {
      const vals = catAvg[cat].filter(v => v > 0);
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
}

export const mdAnalyticsRepository = new MdAnalyticsRepository();
