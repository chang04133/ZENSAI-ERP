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

  async monthlyRevenue(options: { year?: string; partner_code?: string } = {}) {
    const qb = new QueryBuilder();
    if (options.partner_code) qb.eq('s.partner_code', options.partner_code);
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
  async comprehensiveSales(dateFrom: string, dateTo: string, partnerCode?: string) {
    const params: any[] = [dateFrom, dateTo];
    let pcFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $3`; }
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
      WHERE s.sale_date BETWEEN LEAST((p.df - INTERVAL '1 year')::date, (p.df - INTERVAL '1 month')::date) AND p.dt ${pcFilter}
      GROUP BY s.partner_code, pt.partner_name
      ORDER BY cur_amount DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 연단위 월별 비교 (선택연도 vs 전년) */
  async yearComparison(year: number, partnerCode?: string) {
    const prevYear = year - 1;
    const params: any[] = [year, prevYear];
    let pcFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND partner_code = $3`; }
    const sql = `
      SELECT TO_CHAR(sale_date, 'MM') AS m,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $1 THEN total_price END), 0)::bigint AS cur_amount,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $1 THEN qty END), 0)::int AS cur_qty,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $2 THEN total_price END), 0)::bigint AS prev_amount,
             COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM sale_date) = $2 THEN qty END), 0)::int AS prev_qty
      FROM sales
      WHERE EXTRACT(YEAR FROM sale_date) IN ($1, $2) ${pcFilter}
      GROUP BY m ORDER BY m`;
    const rows = (await this.pool.query(sql, params)).rows;

    const totalSql = `
      SELECT EXTRACT(YEAR FROM sale_date)::int AS y,
             SUM(total_price)::bigint AS total_amount,
             SUM(qty)::int AS total_qty,
             COUNT(*)::int AS sale_count
      FROM sales
      WHERE EXTRACT(YEAR FROM sale_date) IN ($1, $2) ${pcFilter}
      GROUP BY y ORDER BY y`;
    const totals = (await this.pool.query(totalSql, params)).rows;

    return { monthly: rows, totals };
  }

  /** 스타일 판매 분석 (전년대비 종합) — 동일기간 비교 */
  async styleAnalytics(year: number, partnerCode?: string) {
    const prevYear = year - 1;
    const now = new Date();
    const currentYear = now.getFullYear();

    // 동일기간 비교: 올해면 오늘까지, 과거면 전체연도
    let curStart: string, curEnd: string, prevStart: string, prevEnd: string;
    if (year === currentYear) {
      curStart = `${year}-01-01`;
      curEnd = now.toISOString().slice(0, 10);
      prevStart = `${prevYear}-01-01`;
      prevEnd = `${prevYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    } else {
      curStart = `${year}-01-01`;
      curEnd = `${year}-12-31`;
      prevStart = `${prevYear}-01-01`;
      prevEnd = `${prevYear}-12-31`;
    }

    // params: $1=curStart, $2=curEnd, $3=prevStart, $4=prevEnd [, $5=partnerCode]
    const dateParams: any[] = [curStart, curEnd, prevStart, prevEnd];
    const curOnlyParams: any[] = [curStart, curEnd];
    let pcFilter = '';
    let pcFilterNoAlias = '';
    if (partnerCode) {
      dateParams.push(partnerCode);
      pcFilter = `AND s.partner_code = $5`;
      curOnlyParams.push(partnerCode);
      pcFilterNoAlias = `AND partner_code = $3`;
    }

    // 1. 카테고리별 전년대비
    const byCategorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $3::date AND s.sale_date <= $2::date ${pcFilter}
      GROUP BY COALESCE(p.category, '미분류')
      ORDER BY cur_amount DESC`;
    const byCategory = (await this.pool.query(byCategorySql, dateParams)).rows;

    // 2. 핏별 전년대비
    const byFitSql = `
      SELECT COALESCE(p.fit, '미지정') AS fit,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $3::date AND s.sale_date <= $2::date ${pcFilter}
      GROUP BY COALESCE(p.fit, '미지정')
      ORDER BY cur_amount DESC`;
    const byFit = (await this.pool.query(byFitSql, dateParams)).rows;

    // 3. 기장별 전년대비
    const byLengthSql = `
      SELECT COALESCE(p.length, '미지정') AS length,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $3::date AND s.sale_date <= $2::date ${pcFilter}
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY cur_amount DESC`;
    const byLength = (await this.pool.query(byLengthSql, dateParams)).rows;

    // 4. 제품별 증감률
    const productGrowthSql = `
      WITH product_yoy AS (
        SELECT p.product_code, p.product_name, p.category, p.fit, p.length,
          COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.qty END), 0)::int AS cur_qty,
          COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.total_price END), 0)::bigint AS cur_amount,
          COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.qty END), 0)::int AS prev_qty,
          COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.total_price END), 0)::bigint AS prev_amount
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $3::date AND s.sale_date <= $2::date ${pcFilter}
        GROUP BY p.product_code, p.product_name, p.category, p.fit, p.length
      )
      SELECT *,
        CASE WHEN prev_qty > 0 THEN ROUND((cur_qty - prev_qty)::numeric / prev_qty * 100, 1) ELSE NULL END AS qty_growth,
        CASE WHEN prev_amount > 0 THEN ROUND((cur_amount - prev_amount)::numeric / prev_amount * 100, 1) ELSE NULL END AS amount_growth
      FROM product_yoy
      WHERE (cur_qty > 0 OR prev_qty > 0)
      ORDER BY cur_amount DESC`;
    const productGrowth = (await this.pool.query(productGrowthSql, dateParams)).rows;

    // 5. 사이즈별 판매비중 (선택기간)
    const bySizeSql = `
      SELECT pv.size,
        SUM(s.qty)::int AS total_qty,
        SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${partnerCode ? 'AND s.partner_code = $3' : ''}
      GROUP BY pv.size
      ORDER BY total_qty DESC`;
    const bySize = (await this.pool.query(bySizeSql, curOnlyParams)).rows;

    // 6. 컬러별 판매 TOP 15 (선택기간)
    const byColorSql = `
      SELECT pv.color,
        SUM(s.qty)::int AS total_qty,
        SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${partnerCode ? 'AND s.partner_code = $3' : ''}
      GROUP BY pv.color
      ORDER BY total_qty DESC LIMIT 15`;
    const byColor = (await this.pool.query(byColorSql, curOnlyParams)).rows;

    // 7. 월별 YoY 추이
    const monthlyYoYSql = `
      SELECT TO_CHAR(sale_date, 'MM') AS month,
        COALESCE(SUM(CASE WHEN sale_date >= $1::date AND sale_date <= $2::date THEN total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN sale_date >= $1::date AND sale_date <= $2::date THEN qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN sale_date >= $3::date AND sale_date <= $4::date THEN total_price END), 0)::bigint AS prev_amount,
        COALESCE(SUM(CASE WHEN sale_date >= $3::date AND sale_date <= $4::date THEN qty END), 0)::int AS prev_qty
      FROM sales
      WHERE sale_date >= $3::date AND sale_date <= $2::date ${partnerCode ? 'AND partner_code = $5' : ''}
      GROUP BY TO_CHAR(sale_date, 'MM')
      ORDER BY month`;
    const monthlyYoY = (await this.pool.query(monthlyYoYSql, dateParams)).rows;

    // 8. 시즌별 전년대비
    const bySeasonSql = `
      SELECT
        CASE
          WHEN p.season LIKE '%SA' THEN '봄/가을'
          WHEN p.season LIKE '%SM' THEN '여름'
          WHEN p.season LIKE '%WN' THEN '겨울'
          ELSE '기타'
        END AS season_type,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $3::date AND s.sale_date <= $2::date ${pcFilter}
      GROUP BY season_type
      ORDER BY cur_amount DESC`;
    const bySeason = (await this.pool.query(bySeasonSql, dateParams)).rows;

    // 9. 세부카테고리별 전년대비
    const bySubCategorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
        COALESCE(p.sub_category, '미분류') AS sub_category,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.qty END), 0)::int AS cur_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $1::date AND s.sale_date <= $2::date THEN s.total_price END), 0)::bigint AS cur_amount,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.qty END), 0)::int AS prev_qty,
        COALESCE(SUM(CASE WHEN s.sale_date >= $3::date AND s.sale_date <= $4::date THEN s.total_price END), 0)::bigint AS prev_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $3::date AND s.sale_date <= $2::date ${pcFilter}
      GROUP BY COALESCE(p.category, '미분류'), COALESCE(p.sub_category, '미분류')
      ORDER BY cur_amount DESC`;
    const bySubCategory = (await this.pool.query(bySubCategorySql, dateParams)).rows;

    const period = { curStart, curEnd, prevStart, prevEnd };
    return { period, byCategory, byFit, byLength, productGrowth, bySize, byColor, monthlyYoY, bySeason, bySubCategory };
  }

  /** 기간별 판매 상품 리스트 (일별/주별/월별) */
  async salesProductsByRange(dateFrom: string, dateTo: string, partnerCode?: string) {
    const params: any[] = [dateFrom, dateTo];
    let pcFilter = '';
    if (partnerCode) {
      params.push(partnerCode);
      pcFilter = `AND s.partner_code = $3`;
    }
    const pcFilterSimple = partnerCode ? `AND partner_code = $3` : '';

    // 상품별 집계
    const summarySql = `
      SELECT p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(*)::int AS sale_count,
             COUNT(DISTINCT s.partner_code)::int AS partner_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter}
      GROUP BY p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length
      ORDER BY total_amount DESC`;
    const summary = (await this.pool.query(summarySql, params)).rows;

    // 개별 판매 내역
    const detailSql = `
      SELECT s.sale_id, s.sale_date::text, s.partner_code, pt.partner_name,
             s.variant_id, pv.sku, pv.color, pv.size,
             p.product_code, p.product_name, p.category,
             s.qty, s.unit_price, s.total_price,
             COALESCE(s.sale_type, '정상') AS sale_type,
             s.created_at
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter}
      ORDER BY s.sale_date DESC, s.created_at DESC`;
    const details = (await this.pool.query(detailSql, params)).rows;

    // 총합
    const totalSql = `
      SELECT COUNT(*)::int AS sale_count,
             COALESCE(SUM(qty), 0)::int AS total_qty,
             COALESCE(SUM(total_price), 0)::bigint AS total_amount,
             COUNT(DISTINCT partner_code)::int AS partner_count,
             COUNT(DISTINCT variant_id)::int AS variant_count
      FROM sales
      WHERE sale_date >= $1::date AND sale_date <= $2::date ${pcFilterSimple}`;
    const totals = (await this.pool.query(totalSql, params)).rows[0];

    // 일별 추이 (기간내)
    const dailySql = `
      SELECT sale_date::text AS date,
             SUM(total_price)::bigint AS revenue,
             SUM(qty)::int AS qty,
             COUNT(*)::int AS cnt
      FROM sales
      WHERE sale_date >= $1::date AND sale_date <= $2::date ${pcFilterSimple}
      GROUP BY sale_date
      ORDER BY sale_date`;
    const dailyTrend = (await this.pool.query(dailySql, params)).rows;

    return { dateFrom, dateTo, summary, details, totals, dailyTrend };
  }

  /** 스타일별 판매현황 (기간별) */
  async styleSalesByRange(dateFrom: string, dateTo: string, partnerCode?: string, category?: string) {
    const params: any[] = [dateFrom, dateTo];
    let pcFilter = '';
    let pcFilterSimple = '';
    let catFilter = '';
    let catFilterSimple = '';
    let nextIdx = 3;
    if (partnerCode) {
      params.push(partnerCode);
      pcFilter = `AND s.partner_code = $${nextIdx}`;
      pcFilterSimple = `AND partner_code = $${nextIdx}`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      catFilter = `AND p.category = $${nextIdx}`;
      catFilterSimple = `AND variant_id IN (SELECT pv2.variant_id FROM product_variants pv2 JOIN products p2 ON pv2.product_code = p2.product_code WHERE p2.category = $${nextIdx})`;
      nextIdx++;
    }

    // 총합
    const totalSql = `
      SELECT COUNT(*)::int AS sale_count,
             COALESCE(SUM(qty), 0)::int AS total_qty,
             COALESCE(SUM(total_price), 0)::bigint AS total_amount,
             COUNT(DISTINCT variant_id)::int AS variant_count
      FROM sales
      WHERE sale_date >= $1::date AND sale_date <= $2::date ${pcFilterSimple} ${catFilterSimple}`;
    const totals = (await this.pool.query(totalSql, params)).rows[0];

    // 카테고리별
    const catSql = `
      SELECT COALESCE(p.category, '미분류') AS category,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY COALESCE(p.category, '미분류')
      ORDER BY total_amount DESC`;
    const byCategory = (await this.pool.query(catSql, params)).rows;

    // 세부카테고리별
    const subCatSql = `
      SELECT COALESCE(p.category, '미분류') AS category,
             COALESCE(p.sub_category, '미분류') AS sub_category,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY COALESCE(p.category, '미분류'), COALESCE(p.sub_category, '미분류')
      ORDER BY total_amount DESC`;
    const bySubCategory = (await this.pool.query(subCatSql, params)).rows;

    // 핏별
    const fitSql = `
      SELECT COALESCE(p.fit, '미지정') AS fit,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY COALESCE(p.fit, '미지정')
      ORDER BY total_amount DESC`;
    const byFit = (await this.pool.query(fitSql, params)).rows;

    // 기장별
    const lenSql = `
      SELECT COALESCE(p.length, '미지정') AS length,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY total_amount DESC`;
    const byLength = (await this.pool.query(lenSql, params)).rows;

    // 사이즈별
    const sizeSql = `
      SELECT pv.size,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY pv.size
      ORDER BY total_qty DESC`;
    const bySize = (await this.pool.query(sizeSql, params)).rows;

    // 컬러별
    const colorSql = `
      SELECT pv.color,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY pv.color
      ORDER BY total_qty DESC LIMIT 20`;
    const byColor = (await this.pool.query(colorSql, params)).rows;

    // 인기상품 TOP 15
    const topSql = `
      SELECT p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(*)::int AS sale_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length
      ORDER BY total_amount DESC LIMIT 15`;
    const topProducts = (await this.pool.query(topSql, params)).rows;

    // 시즌별
    const seasonSql = `
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
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter}
      GROUP BY season_type
      ORDER BY total_amount DESC`;
    const bySeason = (await this.pool.query(seasonSql, params)).rows;

    return { dateFrom, dateTo, totals, byCategory, bySubCategory, byFit, byLength, bySize, byColor, topProducts, bySeason };
  }

  /** 상품별 컬러/사이즈 판매 상세 */
  async productVariantSales(productCode: string, dateFrom: string, dateTo: string, partnerCode?: string) {
    const params: any[] = [productCode, dateFrom, dateTo];
    let pcFilter = '';
    if (partnerCode) {
      params.push(partnerCode);
      pcFilter = `AND s.partner_code = $4`;
    }

    const sql = `
      SELECT pv.color, pv.size, pv.sku,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      WHERE pv.product_code = $1
        AND s.sale_date >= $2::date AND s.sale_date <= $3::date ${pcFilter}
      GROUP BY pv.color, pv.size, pv.sku
      ORDER BY pv.color, CASE pv.size
        WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
        WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
        WHEN 'FREE' THEN 7 ELSE 8 END`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 판매율 분석 (품번별/사이즈별/카테고리별/일자별) */
  async sellThroughAnalysis(dateFrom: string, dateTo: string, partnerCode?: string, category?: string) {
    const params: any[] = [dateFrom, dateTo];
    let pcFilterSales = '';
    let pcFilterInv = '';
    let catFilter = '';
    let catFilterInv = '';
    let nextIdx = 3;
    if (partnerCode) {
      params.push(partnerCode);
      pcFilterSales = `AND s.partner_code = $${nextIdx}`;
      pcFilterInv = `WHERE i.partner_code = $${nextIdx}`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      catFilter = `AND p.category = $${nextIdx}`;
      catFilterInv = partnerCode
        ? `AND p2.category = $${nextIdx}`
        : `WHERE p2.category = $${nextIdx}`;
      nextIdx++;
    }

    // 품번별 판매율
    const byProductSql = `
      SELECT p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length, p.season,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty,
             COALESCE(inv.current_stock, 0)::int AS current_stock,
             CASE WHEN (COALESCE(SUM(s.qty), 0) + COALESCE(inv.current_stock, 0)) > 0
               THEN ROUND(COALESCE(SUM(s.qty), 0)::numeric / (COALESCE(SUM(s.qty), 0) + COALESCE(inv.current_stock, 0)) * 100, 1)
               ELSE 0 END AS sell_through_rate
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
      LEFT JOIN sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales}
      LEFT JOIN (
        SELECT pv2.product_code, SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${pcFilterInv} ${catFilterInv}
        GROUP BY pv2.product_code
      ) inv ON inv.product_code = p.product_code
      WHERE p.is_active = TRUE ${catFilter}
      GROUP BY p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length, p.season, inv.current_stock
      HAVING (COALESCE(SUM(s.qty), 0) + COALESCE(inv.current_stock, 0)) > 0
      ORDER BY sell_through_rate DESC`;
    const byProduct = (await this.pool.query(byProductSql, params)).rows;

    // 변형별 판매율 (품번+컬러+사이즈, 0개 포함)
    const byVariantSql = `
      SELECT p.product_code, p.product_name, p.category, pv.color, pv.size, pv.sku,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty,
             COALESCE(inv_v.current_stock, 0)::int AS current_stock,
             CASE WHEN (COALESCE(SUM(s.qty), 0) + COALESCE(inv_v.current_stock, 0)) > 0
               THEN ROUND(COALESCE(SUM(s.qty), 0)::numeric / (COALESCE(SUM(s.qty), 0) + COALESCE(inv_v.current_stock, 0)) * 100, 1)
               ELSE 0 END AS sell_through_rate
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
      LEFT JOIN sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales}
      LEFT JOIN (
        SELECT i.variant_id, COALESCE(i.qty, 0)::int AS current_stock
        FROM inventory i
        ${pcFilterInv}
      ) inv_v ON inv_v.variant_id = pv.variant_id
      WHERE p.is_active = TRUE ${catFilter}
      GROUP BY p.product_code, p.product_name, p.category, pv.color, pv.size, pv.sku, inv_v.current_stock
      ORDER BY p.product_code, pv.color, CASE pv.size
        WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
        WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
        WHEN 'FREE' THEN 7 ELSE 8 END`;
    const byVariant = (await this.pool.query(byVariantSql, params)).rows;

    // 카테고리별 판매율
    const byCategorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty,
             COALESCE(inv_c.current_stock, 0)::int AS current_stock,
             COUNT(DISTINCT p.product_code)::int AS product_count,
             CASE WHEN (COALESCE(SUM(s.qty), 0) + COALESCE(inv_c.current_stock, 0)) > 0
               THEN ROUND(COALESCE(SUM(s.qty), 0)::numeric / (COALESCE(SUM(s.qty), 0) + COALESCE(inv_c.current_stock, 0)) * 100, 1)
               ELSE 0 END AS sell_through_rate
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
      LEFT JOIN sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales}
      LEFT JOIN (
        SELECT COALESCE(p2.category, '미분류') AS category, SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${pcFilterInv}
        GROUP BY COALESCE(p2.category, '미분류')
      ) inv_c ON inv_c.category = COALESCE(p.category, '미분류')
      WHERE p.is_active = TRUE ${catFilter}
      GROUP BY COALESCE(p.category, '미분류'), inv_c.current_stock
      HAVING (COALESCE(SUM(s.qty), 0) + COALESCE(inv_c.current_stock, 0)) > 0
      ORDER BY sell_through_rate DESC`;
    const byCategory = (await this.pool.query(byCategorySql, params)).rows;

    // 일자별 판매 수량 + 판매율
    const dailySql = `
      SELECT s.sale_date::text AS date,
             SUM(s.qty)::int AS daily_sold_qty,
             COUNT(DISTINCT pv.product_code)::int AS product_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales} ${catFilter}
      GROUP BY s.sale_date
      ORDER BY s.sale_date`;
    const daily = (await this.pool.query(dailySql, params)).rows;

    // 일자별 카테고리별
    const dailyCategorySql = `
      SELECT s.sale_date::text AS date,
             COALESCE(p.category, '미분류') AS category,
             SUM(s.qty)::int AS daily_sold_qty
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales} ${catFilter}
      GROUP BY s.sale_date, COALESCE(p.category, '미분류')
      ORDER BY s.sale_date, category`;
    const dailyByCategory = (await this.pool.query(dailyCategorySql, params)).rows;

    // 일자별 아이템별
    const dailyProductSql = `
      SELECT s.sale_date::text AS date,
             p.product_code, p.product_name, p.category,
             SUM(s.qty)::int AS daily_sold_qty
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales} ${catFilter}
      GROUP BY s.sale_date, p.product_code, p.product_name, p.category
      ORDER BY s.sale_date DESC, daily_sold_qty DESC`;
    const dailyByProduct = (await this.pool.query(dailyProductSql, params)).rows;

    // 시즌별 집계
    const seasonMap: Record<string, { season: string; sold_qty: number; current_stock: number; product_count: number }> = {};
    for (const p of byProduct) {
      const season = p.season || '미지정';
      if (!seasonMap[season]) seasonMap[season] = { season, sold_qty: 0, current_stock: 0, product_count: 0 };
      seasonMap[season].sold_qty += Number(p.sold_qty);
      seasonMap[season].current_stock += Number(p.current_stock);
      seasonMap[season].product_count += 1;
    }
    const bySeason = Object.values(seasonMap).map(s => ({
      ...s,
      sell_through_rate: (s.sold_qty + s.current_stock) > 0
        ? Math.round(s.sold_qty / (s.sold_qty + s.current_stock) * 1000) / 10 : 0,
    })).sort((a, b) => b.season.localeCompare(a.season));

    // 연차별 집계
    const currentYear = new Date().getFullYear();
    const getAgeGroup = (season: string | null): string => {
      if (!season || season.length < 4) return '미지정';
      const year = parseInt(season.substring(0, 4));
      if (isNaN(year)) return '미지정';
      const diff = currentYear - year;
      if (diff <= 0) return '신상';
      if (diff === 1) return '1년차';
      if (diff === 2) return '2년차';
      if (diff === 3) return '3년차';
      return '3년이상';
    };
    const ageOrder: Record<string, number> = { '신상': 0, '1년차': 1, '2년차': 2, '3년차': 3, '3년이상': 4, '미지정': 5 };
    const ageMap: Record<string, { age_group: string; sold_qty: number; current_stock: number; product_count: number; order: number }> = {};
    for (const p of byProduct) {
      const ag = getAgeGroup(p.season);
      if (!ageMap[ag]) ageMap[ag] = { age_group: ag, sold_qty: 0, current_stock: 0, product_count: 0, order: ageOrder[ag] ?? 6 };
      ageMap[ag].sold_qty += Number(p.sold_qty);
      ageMap[ag].current_stock += Number(p.current_stock);
      ageMap[ag].product_count += 1;
    }
    const byAge = Object.values(ageMap).map(a => ({
      ...a,
      sell_through_rate: (a.sold_qty + a.current_stock) > 0
        ? Math.round(a.sold_qty / (a.sold_qty + a.current_stock) * 1000) / 10 : 0,
    })).sort((a, b) => a.order - b.order);

    // 전체 요약
    const totalSold = byProduct.reduce((s: number, r: any) => s + Number(r.sold_qty), 0);
    const totalStock = byProduct.reduce((s: number, r: any) => s + Number(r.current_stock), 0);
    const overallRate = (totalSold + totalStock) > 0
      ? Math.round(totalSold / (totalSold + totalStock) * 1000) / 10 : 0;

    return {
      dateFrom, dateTo,
      totals: { total_sold: totalSold, total_stock: totalStock, overall_rate: overallRate, product_count: byProduct.length },
      byProduct, byVariant, byCategory, bySeason, byAge, daily, dailyByCategory, dailyByProduct,
    };
  }

  async dropAnalysis(partnerCode?: string, category?: string) {
    const params: any[] = [];
    let pcFilterSales = '';
    let pcFilterInv = '';
    let catFilter = '';
    let nextIdx = 1;
    if (partnerCode) {
      params.push(partnerCode);
      pcFilterSales = `AND s.partner_code = $${nextIdx}`;
      pcFilterInv = `WHERE i.partner_code = $${nextIdx}`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      catFilter = `AND p.category = $${nextIdx}`;
      nextIdx++;
    }
    const invWhere = pcFilterInv || '';
    const catFilterInv = category
      ? (pcFilterInv ? `AND p2.category = $${nextIdx - 1}` : `WHERE p2.category = $${nextIdx - 1}`)
      : '';

    // A. 드랍별 소화율 (상품별 마일스톤 판매율)
    const milestonesSql = `
      WITH product_launch AS (
        SELECT p.product_code, p.product_name, p.category, p.season,
               p.created_at::date AS launch_date,
               (CURRENT_DATE - p.created_at::date) AS days_since_launch
        FROM products p
        WHERE p.is_active = TRUE ${catFilter}
      ),
      milestone_sales AS (
        SELECT pl.product_code,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 7 THEN s.qty END), 0)::int AS sold_7d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 14 THEN s.qty END), 0)::int AS sold_14d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 30 THEN s.qty END), 0)::int AS sold_30d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 60 THEN s.qty END), 0)::int AS sold_60d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 90 THEN s.qty END), 0)::int AS sold_90d,
          COALESCE(SUM(s.qty), 0)::int AS sold_total
        FROM product_launch pl
        JOIN product_variants pv ON pl.product_code = pv.product_code AND pv.is_active = TRUE
        LEFT JOIN sales s ON s.variant_id = pv.variant_id AND s.sale_date >= pl.launch_date ${pcFilterSales}
        GROUP BY pl.product_code
      ),
      product_stock AS (
        SELECT pv2.product_code, SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${invWhere} ${catFilterInv}
        GROUP BY pv2.product_code
      )
      SELECT pl.product_code, pl.product_name, pl.category, pl.season,
             pl.launch_date::text, pl.days_since_launch::int,
             ms.sold_7d, ms.sold_14d, ms.sold_30d, ms.sold_60d, ms.sold_90d, ms.sold_total,
             COALESCE(ps.current_stock, 0)::int AS current_stock,
             CASE WHEN pl.days_since_launch >= 7 AND (ms.sold_7d + COALESCE(ps.current_stock, 0)) > 0
               THEN ROUND(ms.sold_7d::numeric / (ms.sold_7d + COALESCE(ps.current_stock, 0)) * 100, 1) ELSE NULL END AS rate_7d,
             CASE WHEN pl.days_since_launch >= 14 AND (ms.sold_14d + COALESCE(ps.current_stock, 0)) > 0
               THEN ROUND(ms.sold_14d::numeric / (ms.sold_14d + COALESCE(ps.current_stock, 0)) * 100, 1) ELSE NULL END AS rate_14d,
             CASE WHEN pl.days_since_launch >= 30 AND (ms.sold_30d + COALESCE(ps.current_stock, 0)) > 0
               THEN ROUND(ms.sold_30d::numeric / (ms.sold_30d + COALESCE(ps.current_stock, 0)) * 100, 1) ELSE NULL END AS rate_30d,
             CASE WHEN pl.days_since_launch >= 60 AND (ms.sold_60d + COALESCE(ps.current_stock, 0)) > 0
               THEN ROUND(ms.sold_60d::numeric / (ms.sold_60d + COALESCE(ps.current_stock, 0)) * 100, 1) ELSE NULL END AS rate_60d,
             CASE WHEN pl.days_since_launch >= 90 AND (ms.sold_90d + COALESCE(ps.current_stock, 0)) > 0
               THEN ROUND(ms.sold_90d::numeric / (ms.sold_90d + COALESCE(ps.current_stock, 0)) * 100, 1) ELSE NULL END AS rate_90d,
             CASE WHEN (ms.sold_total + COALESCE(ps.current_stock, 0)) > 0
               THEN ROUND(ms.sold_total::numeric / (ms.sold_total + COALESCE(ps.current_stock, 0)) * 100, 1) ELSE 0 END AS sell_through_rate
      FROM product_launch pl
      JOIN milestone_sales ms ON pl.product_code = ms.product_code
      LEFT JOIN product_stock ps ON pl.product_code = ps.product_code
      WHERE (ms.sold_total + COALESCE(ps.current_stock, 0)) > 0
      ORDER BY pl.launch_date DESC, sell_through_rate DESC`;
    const milestones = (await this.pool.query(milestonesSql, params)).rows;

    // B. 드랍회차 비교 (월별 코호트)
    const cohortsSql = `
      WITH cohort_products AS (
        SELECT p.product_code,
               TO_CHAR(p.created_at, 'YYYY-MM') AS cohort_month,
               p.created_at::date AS launch_date
        FROM products p
        WHERE p.is_active = TRUE ${catFilter}
      ),
      cohort_sales AS (
        SELECT cp.cohort_month,
          COUNT(DISTINCT cp.product_code)::int AS product_count,
          MIN(cp.launch_date)::text AS first_launch,
          MAX(cp.launch_date)::text AS last_launch,
          COALESCE(SUM(s.qty), 0)::int AS total_sold,
          COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue,
          COALESCE(SUM(CASE WHEN s.sale_date <= cp.launch_date + 7 THEN s.qty END), 0)::int AS sold_7d,
          COALESCE(SUM(CASE WHEN s.sale_date <= cp.launch_date + 14 THEN s.qty END), 0)::int AS sold_14d,
          COALESCE(SUM(CASE WHEN s.sale_date <= cp.launch_date + 30 THEN s.qty END), 0)::int AS sold_30d
        FROM cohort_products cp
        JOIN product_variants pv ON cp.product_code = pv.product_code AND pv.is_active = TRUE
        LEFT JOIN sales s ON s.variant_id = pv.variant_id AND s.sale_date >= cp.launch_date ${pcFilterSales}
        GROUP BY cp.cohort_month
      ),
      cohort_stock AS (
        SELECT TO_CHAR(p2.created_at, 'YYYY-MM') AS cohort_month,
               SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${invWhere} ${catFilterInv}
        GROUP BY TO_CHAR(p2.created_at, 'YYYY-MM')
      )
      SELECT cs.*,
             COALESCE(cst.current_stock, 0)::int AS current_stock,
             CASE WHEN (cs.total_sold + COALESCE(cst.current_stock, 0)) > 0
               THEN ROUND(cs.total_sold::numeric / (cs.total_sold + COALESCE(cst.current_stock, 0)) * 100, 1) ELSE 0 END AS sell_through_rate,
             CASE WHEN cs.product_count > 0
               THEN ROUND(cs.total_sold::numeric / cs.product_count, 1) ELSE 0 END AS avg_sold_per_product
      FROM cohort_sales cs
      LEFT JOIN cohort_stock cst ON cs.cohort_month = cst.cohort_month
      ORDER BY cs.cohort_month DESC`;
    const cohorts = (await this.pool.query(cohortsSql, params)).rows;

    // C. 판매속도 순위
    const velocitySql = `
      WITH product_velocity AS (
        SELECT p.product_code, p.product_name, p.category, p.season,
               p.created_at::date AS launch_date,
               (CURRENT_DATE - p.created_at::date) AS days_since_launch,
               COALESCE(SUM(s.qty), 0)::int AS total_sold,
               COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM products p
        JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
        LEFT JOIN sales s ON s.variant_id = pv.variant_id AND s.sale_date >= p.created_at::date ${pcFilterSales}
        WHERE p.is_active = TRUE ${catFilter}
        GROUP BY p.product_code, p.product_name, p.category, p.season, p.created_at
      ),
      with_stock AS (
        SELECT pv2.product_code, SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${invWhere} ${catFilterInv}
        GROUP BY pv2.product_code
      )
      SELECT pv.product_code, pv.product_name, pv.category, pv.season,
             pv.launch_date::text, pv.days_since_launch::int,
             pv.total_sold, pv.total_revenue,
             COALESCE(ws.current_stock, 0)::int AS current_stock,
             CASE WHEN pv.days_since_launch > 0
               THEN ROUND(pv.total_sold::numeric / pv.days_since_launch, 2) ELSE 0 END AS daily_velocity,
             CASE WHEN pv.days_since_launch > 0
               THEN ROUND(pv.total_revenue::numeric / pv.days_since_launch)::bigint ELSE 0 END AS daily_revenue,
             CASE WHEN (pv.total_sold + COALESCE(ws.current_stock, 0)) > 0
               THEN ROUND(pv.total_sold::numeric / (pv.total_sold + COALESCE(ws.current_stock, 0)) * 100, 1) ELSE 0 END AS sell_through_rate,
             CASE WHEN pv.days_since_launch > 0 AND pv.total_sold > 0
               THEN ROUND(COALESCE(ws.current_stock, 0)::numeric / (pv.total_sold::numeric / pv.days_since_launch))::int
               ELSE NULL END AS est_days_to_sellout
      FROM product_velocity pv
      LEFT JOIN with_stock ws ON pv.product_code = ws.product_code
      WHERE pv.days_since_launch > 0 AND (pv.total_sold + COALESCE(ws.current_stock, 0)) > 0
      ORDER BY daily_velocity DESC`;
    const velocity = (await this.pool.query(velocitySql, params)).rows;

    return { milestones, cohorts, velocity };
  }

  async weeklyStyleSales(options: { weeks?: number; category?: string; partner_code?: string } = {}) {
    const weeks = options.weeks || 4;
    const qb = new QueryBuilder();
    qb.raw(`s.sale_date >= CURRENT_DATE - (? || ' weeks')::interval`, weeks);
    if (options.category) qb.eq('p.category', options.category);
    if (options.partner_code) qb.eq('s.partner_code', options.partner_code);
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
