import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

export class SalesRepository {
  private pool = getPool();

  async listWithDetails(options: any = {}) {
    const { page = 1, limit = 20, partner_code, search } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('s');
    if (partner_code) qb.eq('partner_code', partner_code);
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ?)', `%${search}%`, `%${search}%`);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `
      SELECT COUNT(*) FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT s.*, pt.partner_name, pv.sku, pv.color, pv.size, p.product_name
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      ${whereClause} ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async monthlySales(options: { year?: string; partner_code?: string } = {}) {
    const qb = new QueryBuilder();
    if (options.partner_code) qb.eq('s.partner_code', options.partner_code);
    if (options.year) qb.raw("TO_CHAR(s.sale_date, 'YYYY') = ?", options.year);
    const { whereClause, params } = qb.build();

    const sql = `
      SELECT TO_CHAR(s.sale_date, 'YYYY-MM') as month,
             s.partner_code, p.partner_name,
             SUM(s.qty) as total_qty, SUM(s.total_price) as total_amount
      FROM sales s JOIN partners p ON s.partner_code = p.partner_code
      ${whereClause}
      GROUP BY month, s.partner_code, p.partner_name
      ORDER BY month DESC, total_amount DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  async monthlyRevenue(options: { year?: string } = {}) {
    const qb = new QueryBuilder();
    if (options.year) qb.raw("TO_CHAR(s.sale_date, 'YYYY') = ?", options.year);
    const { whereClause, params } = qb.build();

    const sql = `
      SELECT TO_CHAR(s.sale_date, 'YYYY-MM') as month,
             SUM(s.qty) as total_qty, SUM(s.total_price) as total_amount
      FROM sales s ${whereClause}
      GROUP BY month ORDER BY month DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 매출현황 대시보드 통계 */
  async dashboardStats(year?: number, partnerCode?: string) {
    // 파라미터 배열 구성
    const baseParams: any[] = [];
    let pIdx = 1;

    let dateFilter: string;
    let dateFilterSimple: string;
    if (year) {
      baseParams.push(Number(year));
      dateFilter = `EXTRACT(YEAR FROM s.sale_date) = $${pIdx}`;
      dateFilterSimple = `EXTRACT(YEAR FROM sale_date) = $${pIdx}`;
      pIdx++;
    } else {
      dateFilter = `s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)`;
      dateFilterSimple = `sale_date >= DATE_TRUNC('month', CURRENT_DATE)`;
    }

    let pcFilter = '';
    let pcFilterSimple = '';
    if (partnerCode) {
      baseParams.push(partnerCode);
      pcFilter = `AND s.partner_code = $${pIdx}`;
      pcFilterSimple = `AND partner_code = $${pIdx}`;
      pIdx++;
    }
    // pcOnly: 파트너코드만 있는 파라미터 배열 (period 쿼리용)
    const pcOnlyParams = partnerCode ? [partnerCode] : [];
    const pcOnlyFilter = partnerCode ? `AND partner_code = $1` : '';
    const pcOnlyFilterS = partnerCode ? `AND s.partner_code = $1` : '';

    // 오늘/이번주/이번달/지난달 매출 (항상 고정)
    const periodSql = `
      SELECT
        COALESCE(SUM(CASE WHEN sale_date = CURRENT_DATE THEN total_price END), 0)::bigint AS today_revenue,
        COALESCE(SUM(CASE WHEN sale_date = CURRENT_DATE THEN qty END), 0)::int AS today_qty,
        COALESCE(SUM(CASE WHEN sale_date = CURRENT_DATE - INTERVAL '1 day' THEN total_price END), 0)::bigint AS yesterday_revenue,
        COALESCE(SUM(CASE WHEN sale_date = CURRENT_DATE - INTERVAL '1 day' THEN qty END), 0)::int AS yesterday_qty,
        COALESCE(SUM(CASE WHEN sale_date = CURRENT_DATE - INTERVAL '2 days' THEN total_price END), 0)::bigint AS two_days_ago_revenue,
        COALESCE(SUM(CASE WHEN sale_date = CURRENT_DATE - INTERVAL '2 days' THEN qty END), 0)::int AS two_days_ago_qty,
        COALESCE(SUM(CASE WHEN sale_date >= DATE_TRUNC('week', CURRENT_DATE) THEN total_price END), 0)::bigint AS week_revenue,
        COALESCE(SUM(CASE WHEN sale_date >= DATE_TRUNC('week', CURRENT_DATE) THEN qty END), 0)::int AS week_qty,
        COALESCE(SUM(CASE WHEN sale_date >= DATE_TRUNC('month', CURRENT_DATE) THEN total_price END), 0)::bigint AS month_revenue,
        COALESCE(SUM(CASE WHEN sale_date >= DATE_TRUNC('month', CURRENT_DATE) THEN qty END), 0)::int AS month_qty,
        COALESCE(SUM(CASE WHEN sale_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                           AND sale_date < DATE_TRUNC('month', CURRENT_DATE) THEN total_price END), 0)::bigint AS prev_month_revenue,
        COALESCE(SUM(CASE WHEN sale_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                           AND sale_date < DATE_TRUNC('month', CURRENT_DATE) THEN qty END), 0)::int AS prev_month_qty,
        COUNT(DISTINCT partner_code)::int AS total_partners,
        COUNT(*)::int AS total_sales
      FROM sales WHERE 1=1 ${pcOnlyFilter}`;
    const periods = (await this.pool.query(periodSql, pcOnlyParams)).rows[0];

    // 카테고리별 매출
    const categorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE ${dateFilter} ${pcFilter}
      GROUP BY COALESCE(p.category, '미분류')
      ORDER BY total_amount DESC`;
    const byCategory = (await this.pool.query(categorySql, baseParams)).rows;

    // 거래처별 매출 TOP 10
    const partnerSql = `
      SELECT s.partner_code, pt.partner_name,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN partners pt ON s.partner_code = pt.partner_code
      WHERE ${dateFilter} ${pcFilter}
      GROUP BY s.partner_code, pt.partner_name
      ORDER BY total_amount DESC LIMIT 10`;
    const byPartner = (await this.pool.query(partnerSql, baseParams)).rows;

    // 인기상품 TOP 10
    const topProductsSql = `
      SELECT p.product_code, p.product_name, p.category,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE ${dateFilter} ${pcFilter}
      GROUP BY p.product_code, p.product_name, p.category
      ORDER BY total_amount DESC LIMIT 10`;
    const topProducts = (await this.pool.query(topProductsSql, baseParams)).rows;

    // 일별 매출 추이 (최근 30일 - 항상 고정)
    const dailyTrendSql = `
      SELECT sale_date::text AS date,
             SUM(total_price)::bigint AS revenue,
             SUM(qty)::int AS qty
      FROM sales
      WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days' ${pcOnlyFilter}
      GROUP BY sale_date
      ORDER BY sale_date`;
    const dailyTrend = (await this.pool.query(dailyTrendSql, pcOnlyParams)).rows;

    // 월별 매출 추이 (최근 6개월 - 항상 고정)
    const monthlyTrendSql = `
      SELECT TO_CHAR(sale_date, 'YYYY-MM') AS month,
             SUM(total_price)::bigint AS revenue,
             SUM(qty)::int AS qty
      FROM sales
      WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months' ${pcOnlyFilter}
      GROUP BY TO_CHAR(sale_date, 'YYYY-MM')
      ORDER BY month`;
    const monthlyTrend = (await this.pool.query(monthlyTrendSql, pcOnlyParams)).rows;

    // 핏별 매출 — 아이템수 대비 평균
    const byFitSql = `
      SELECT COALESCE(p.fit, '미지정') AS fit,
             COUNT(DISTINCT p.product_code)::int AS product_count,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             CASE WHEN COUNT(DISTINCT p.product_code) > 0
               THEN (SUM(s.total_price) / COUNT(DISTINCT p.product_code))::bigint ELSE 0 END AS avg_per_item
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE ${dateFilter} ${pcFilter}
      GROUP BY COALESCE(p.fit, '미지정')
      ORDER BY avg_per_item DESC`;
    const byFit = (await this.pool.query(byFitSql, baseParams)).rows;

    // 기장별 매출 — 아이템수 대비 평균
    const byLengthSql = `
      SELECT COALESCE(p.length, '미지정') AS length,
             COUNT(DISTINCT p.product_code)::int AS product_count,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             CASE WHEN COUNT(DISTINCT p.product_code) > 0
               THEN (SUM(s.total_price) / COUNT(DISTINCT p.product_code))::bigint ELSE 0 END AS avg_per_item
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE ${dateFilter} ${pcFilter}
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY avg_per_item DESC`;
    const byLength = (await this.pool.query(byLengthSql, baseParams)).rows;

    // 시즌별 매출 빈도 (SA=봄/가을, SM=여름, WN=겨울)
    const bySeasonSql = `
      SELECT
        CASE
          WHEN p.season LIKE '%SA' THEN '봄/가을'
          WHEN p.season LIKE '%SM' THEN '여름'
          WHEN p.season LIKE '%WN' THEN '겨울'
          ELSE '기타'
        END AS season_type,
        SUM(s.qty)::int AS total_qty,
        SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE ${dateFilter} ${pcFilter}
      GROUP BY season_type
      ORDER BY total_amount DESC`;
    const bySeason = (await this.pool.query(bySeasonSql, baseParams)).rows;

    // 같은달 연도별 비교 (이번달 모드일 때만)
    let sameMonthHistory = null;
    if (!year) {
      // 같은 월(현재월) 기준으로 올해 + 최근 3년 비교
      const sameMonthSql = `
        SELECT EXTRACT(YEAR FROM sale_date)::int AS year,
               SUM(total_price)::bigint AS total_amount,
               SUM(qty)::int AS total_qty,
               COUNT(*)::int AS sale_count,
               COUNT(DISTINCT partner_code)::int AS partner_count
        FROM sales
        WHERE EXTRACT(MONTH FROM sale_date) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM sale_date) BETWEEN EXTRACT(YEAR FROM CURRENT_DATE) - 3 AND EXTRACT(YEAR FROM CURRENT_DATE)
          ${pcOnlyFilter}
        GROUP BY EXTRACT(YEAR FROM sale_date)
        ORDER BY year`;
      const sameMonthRows = (await this.pool.query(sameMonthSql, pcOnlyParams)).rows;

      // 같은 월 카테고리별 연도비교
      const sameMonthCatSql = `
        SELECT EXTRACT(YEAR FROM s.sale_date)::int AS year,
               COALESCE(p.category, '미분류') AS category,
               SUM(s.total_price)::bigint AS total_amount,
               SUM(s.qty)::int AS total_qty
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE EXTRACT(MONTH FROM s.sale_date) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM s.sale_date) BETWEEN EXTRACT(YEAR FROM CURRENT_DATE) - 3 AND EXTRACT(YEAR FROM CURRENT_DATE)
          ${pcOnlyFilterS}
        GROUP BY EXTRACT(YEAR FROM s.sale_date), COALESCE(p.category, '미분류')
        ORDER BY year, total_amount DESC`;
      const sameMonthCat = (await this.pool.query(sameMonthCatSql, pcOnlyParams)).rows;

      // 같은 월 핏별 연도비교
      const sameMonthFitSql = `
        SELECT EXTRACT(YEAR FROM s.sale_date)::int AS year,
               COALESCE(p.fit, '미지정') AS fit,
               SUM(s.total_price)::bigint AS total_amount,
               SUM(s.qty)::int AS total_qty
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE EXTRACT(MONTH FROM s.sale_date) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM s.sale_date) BETWEEN EXTRACT(YEAR FROM CURRENT_DATE) - 2 AND EXTRACT(YEAR FROM CURRENT_DATE)
          ${pcOnlyFilterS}
        GROUP BY EXTRACT(YEAR FROM s.sale_date), COALESCE(p.fit, '미지정')
        ORDER BY year, total_amount DESC`;
      const sameMonthFit = (await this.pool.query(sameMonthFitSql, pcOnlyParams)).rows;

      // 같은 월 기장별 연도비교
      const sameMonthLenSql = `
        SELECT EXTRACT(YEAR FROM s.sale_date)::int AS year,
               COALESCE(p.length, '미지정') AS length,
               SUM(s.total_price)::bigint AS total_amount,
               SUM(s.qty)::int AS total_qty
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE EXTRACT(MONTH FROM s.sale_date) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM s.sale_date) BETWEEN EXTRACT(YEAR FROM CURRENT_DATE) - 2 AND EXTRACT(YEAR FROM CURRENT_DATE)
          ${pcOnlyFilterS}
        GROUP BY EXTRACT(YEAR FROM s.sale_date), COALESCE(p.length, '미지정')
        ORDER BY year, total_amount DESC`;
      const sameMonthLen = (await this.pool.query(sameMonthLenSql, pcOnlyParams)).rows;

      sameMonthHistory = { yearly: sameMonthRows, byCategory: sameMonthCat, byFit: sameMonthFit, byLength: sameMonthLen };
    }

    return { periods, byCategory, byPartner, topProducts, dailyTrend, monthlyTrend, byFit, byLength, bySeason, sameMonthHistory };
  }

  /** 종합 매출조회 (스크린샷 스타일) */
  async comprehensiveSales(dateFrom: string, dateTo: string) {
    const sql = `
      WITH params AS (
        SELECT $1::date AS df, $2::date AS dt
      )
      SELECT
        s.partner_code,
        pt.partner_name,
        -- 전년 동기
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN (p.df - INTERVAL '1 year')::date AND (p.dt - INTERVAL '1 year')::date
          THEN s.total_price END), 0)::bigint AS prev_year_amount,
        -- 전월 동기
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN (p.df - INTERVAL '1 month')::date AND (p.dt - INTERVAL '1 month')::date
          THEN s.total_price END), 0)::bigint AS prev_month_amount,
        -- 조회기간 매출유형별
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN p.df AND p.dt AND COALESCE(s.sale_type, '정상') = '정상'
          THEN s.total_price END), 0)::bigint AS normal_amount,
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN p.df AND p.dt AND s.sale_type = '할인'
          THEN s.total_price END), 0)::bigint AS discount_amount,
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN p.df AND p.dt AND s.sale_type = '행사'
          THEN s.total_price END), 0)::bigint AS event_amount,
        -- 조회기간 합계
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN p.df AND p.dt
          THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN p.df AND p.dt
          THEN s.qty END), 0)::int AS cur_qty,
        -- 당월 누계
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN DATE_TRUNC('month', p.dt)::date AND p.dt
          THEN s.total_price END), 0)::bigint AS mtd_amount,
        COALESCE(SUM(CASE WHEN s.sale_date BETWEEN DATE_TRUNC('month', p.dt)::date AND p.dt
          THEN s.qty END), 0)::int AS mtd_qty
      FROM sales s
      JOIN partners pt ON s.partner_code = pt.partner_code
      CROSS JOIN params p
      WHERE s.sale_date BETWEEN LEAST((p.df - INTERVAL '1 year')::date, (p.df - INTERVAL '1 month')::date) AND p.dt
      GROUP BY s.partner_code, pt.partner_name
      ORDER BY cur_amount DESC`;
    return (await this.pool.query(sql, [dateFrom, dateTo])).rows;
  }

  /** 연단위 월별 비교 (선택연도 vs 전년) */
  async yearComparison(year: number) {
    const prevYear = year - 1;
    const sql = `
      SELECT TO_CHAR(sale_date, 'MM') AS m,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $1 THEN total_price END), 0)::bigint AS cur_amount,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $1 THEN qty END), 0)::int AS cur_qty,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $2 THEN total_price END), 0)::bigint AS prev_amount,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $2 THEN qty END), 0)::int AS prev_qty
      FROM sales
      WHERE EXTRACT(YEAR FROM sale_date) IN ($1, $2)
      GROUP BY m ORDER BY m`;
    const rows = (await this.pool.query(sql, [year, prevYear])).rows;

    const totalSql = `
      SELECT EXTRACT(YEAR FROM sale_date)::int AS y,
             SUM(total_price)::bigint AS total_amount,
             SUM(qty)::int AS total_qty,
             COUNT(*)::int AS sale_count
      FROM sales
      WHERE EXTRACT(YEAR FROM sale_date) IN ($1, $2)
      GROUP BY y ORDER BY y`;
    const totals = (await this.pool.query(totalSql, [year, prevYear])).rows;

    return { monthly: rows, totals };
  }

  /** 스타일 판매 분석 (전년대비 종합) */
  async styleAnalytics(year: number) {
    const prevYear = year - 1;

    // 1. 카테고리별 전년대비
    const byCategorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE EXTRACT(YEAR FROM s.sale_date) IN ($1, $2)
      GROUP BY COALESCE(p.category, '미분류')
      ORDER BY cur_amount DESC`;
    const byCategory = (await this.pool.query(byCategorySql, [year, prevYear])).rows;

    // 2. 핏별 전년대비
    const byFitSql = `
      SELECT COALESCE(p.fit, '미지정') AS fit,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE EXTRACT(YEAR FROM s.sale_date) IN ($1, $2)
      GROUP BY COALESCE(p.fit, '미지정')
      ORDER BY cur_amount DESC`;
    const byFit = (await this.pool.query(byFitSql, [year, prevYear])).rows;

    // 3. 기장별 전년대비
    const byLengthSql = `
      SELECT COALESCE(p.length, '미지정') AS length,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE EXTRACT(YEAR FROM s.sale_date) IN ($1, $2)
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY cur_amount DESC`;
    const byLength = (await this.pool.query(byLengthSql, [year, prevYear])).rows;

    // 4. 제품별 증감률 (전년 판매 있는 제품만, 증가순 + 감소순 각 15개)
    const productGrowthSql = `
      WITH product_yoy AS (
        SELECT p.product_code, p.product_name, p.category, p.fit, p.length,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.qty END), 0)::int AS cur_qty,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.total_price END), 0)::bigint AS cur_amount,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.qty END), 0)::int AS prev_qty,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.total_price END), 0)::bigint AS prev_amount
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE EXTRACT(YEAR FROM s.sale_date) IN ($1, $2)
        GROUP BY p.product_code, p.product_name, p.category, p.fit, p.length
      )
      SELECT *,
        CASE WHEN prev_qty > 0 THEN ROUND((cur_qty - prev_qty)::numeric / prev_qty * 100, 1) ELSE NULL END AS qty_growth,
        CASE WHEN prev_amount > 0 THEN ROUND((cur_amount - prev_amount)::numeric / prev_amount * 100, 1) ELSE NULL END AS amount_growth
      FROM product_yoy
      WHERE (cur_qty > 0 OR prev_qty > 0)
      ORDER BY cur_amount DESC`;
    const productGrowth = (await this.pool.query(productGrowthSql, [year, prevYear])).rows;

    // 5. 사이즈별 판매비중 (올해)
    const bySizeSql = `
      SELECT pv.size,
        SUM(s.qty)::int AS total_qty,
        SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      WHERE EXTRACT(YEAR FROM s.sale_date) = $1
      GROUP BY pv.size
      ORDER BY total_qty DESC`;
    const bySize = (await this.pool.query(bySizeSql, [year])).rows;

    // 6. 컬러별 판매 TOP 15 (올해)
    const byColorSql = `
      SELECT pv.color,
        SUM(s.qty)::int AS total_qty,
        SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      WHERE EXTRACT(YEAR FROM s.sale_date) = $1
      GROUP BY pv.color
      ORDER BY total_qty DESC LIMIT 15`;
    const byColor = (await this.pool.query(byColorSql, [year])).rows;

    // 7. 월별 YoY 추이
    const monthlyYoYSql = `
      SELECT TO_CHAR(sale_date, 'MM') AS month,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $1 THEN total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $1 THEN qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $2 THEN total_price END), 0)::bigint AS prev_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $2 THEN qty END), 0)::int AS prev_qty
      FROM sales
      WHERE EXTRACT(YEAR FROM sale_date) IN ($1, $2)
      GROUP BY TO_CHAR(sale_date, 'MM')
      ORDER BY month`;
    const monthlyYoY = (await this.pool.query(monthlyYoYSql, [year, prevYear])).rows;

    // 8. 시즌별 전년대비
    const bySeasonSql = `
      SELECT
        CASE
          WHEN p.season LIKE '%SA' THEN '봄/가을'
          WHEN p.season LIKE '%SM' THEN '여름'
          WHEN p.season LIKE '%WN' THEN '겨울'
          ELSE '기타'
        END AS season_type,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE EXTRACT(YEAR FROM s.sale_date) IN ($1, $2)
      GROUP BY season_type
      ORDER BY cur_amount DESC`;
    const bySeason = (await this.pool.query(bySeasonSql, [year, prevYear])).rows;

    // 9. 세부카테고리별 전년대비
    const bySubCategorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
        COALESCE(p.sub_category, '미분류') AS sub_category,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $1 THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM s.sale_date) = $2 THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE EXTRACT(YEAR FROM s.sale_date) IN ($1, $2)
      GROUP BY COALESCE(p.category, '미분류'), COALESCE(p.sub_category, '미분류')
      ORDER BY cur_amount DESC`;
    const bySubCategory = (await this.pool.query(bySubCategorySql, [year, prevYear])).rows;

    return { byCategory, byFit, byLength, productGrowth, bySize, byColor, monthlyYoY, bySeason, bySubCategory };
  }

  async weeklyStyleSales(options: { weeks?: number; category?: string } = {}) {
    const weeks = options.weeks || 4;
    const qb = new QueryBuilder();
    qb.raw(`s.sale_date >= CURRENT_DATE - (? || ' weeks')::interval`, weeks);
    if (options.category) qb.eq('p.category', options.category);
    const { whereClause, params } = qb.build();

    const sql = `
      SELECT DATE_TRUNC('week', s.sale_date)::DATE as week_start,
             p.product_code, p.product_name, p.category,
             SUM(s.qty) as total_qty, SUM(s.total_price) as total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      ${whereClause}
      GROUP BY week_start, p.product_code, p.product_name, p.category
      ORDER BY week_start DESC, total_qty DESC`;
    return (await this.pool.query(sql, params)).rows;
  }
}

export const salesRepository = new SalesRepository();
