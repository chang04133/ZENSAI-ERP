import { getPool } from '../../db/connection';

const STATUS_ORDER = ['PLANNING', 'CONFIRMED', 'IN_SEASON', 'MARKDOWN', 'CLOSED'];

/** season_code(예: "26SA")에서 season_type + year 추출하는 헬퍼 */
function parseSeasonCode(code: string) {
  // season_configs에 season_type/year가 있으면 그걸 사용하고,
  // 없으면 code에서 파싱 (예: "26SA" → type="SA", year="2026")
  if (code.length >= 4) {
    return { seasonType: code.slice(2), year: '20' + code.slice(0, 2) };
  }
  return { seasonType: code, year: '' };
}

export const seasonService = {
  /** 시즌 목록 (집계 통계 포함) */
  async list() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT sc.*,
        COALESCE(ps.total_styles, 0)  AS total_styles,
        COALESCE(ps.total_qty, 0)     AS total_qty,
        COALESCE(ss.sold_qty, 0)      AS sold_qty,
        COALESCE(ss.revenue, 0)       AS revenue,
        CASE WHEN COALESCE(ps.total_qty, 0) > 0
          THEN ROUND(COALESCE(ss.sold_qty, 0)::numeric / ps.total_qty * 100, 1)
          ELSE 0 END                   AS sell_through,
        COALESCE(md.markdown_rate, 0)  AS markdown_rate
      FROM season_configs sc
      LEFT JOIN (
        SELECT season, year,
          COUNT(DISTINCT product_code) AS total_styles,
          0 AS total_qty
        FROM products WHERE is_active = true
        GROUP BY season, year
      ) ps ON ps.season = sc.season_type AND ps.year = sc.year
      LEFT JOIN (
        SELECT p.season, p.year,
          SUM(ABS(s.qty)) AS sold_qty,
          SUM(ABS(s.qty) * s.unit_price) AS revenue
        FROM sales s
        JOIN product_variants pv ON pv.variant_id = s.variant_id
        JOIN products p ON p.product_code = pv.product_code
        WHERE s.sale_type IN ('retail','online','wholesale')
        GROUP BY p.season, p.year
      ) ss ON ss.season = sc.season_type AND ss.year = sc.year
      LEFT JOIN (
        SELECT ms.season_code,
          MAX(ms.discount_rate) AS markdown_rate
        FROM markdown_schedules ms
        WHERE ms.status IN ('ACTIVE','COMPLETED')
        GROUP BY ms.season_code
      ) md ON md.season_code = sc.season_code
      ORDER BY sc.created_at DESC
    `);
    return rows;
  },

  /** 시즌 상세 */
  async getByCode(code: string) {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT * FROM season_configs WHERE season_code = $1`, [code]);
    return rows[0] || null;
  },

  /** 시즌별 상품 목록 */
  async getProducts(code: string) {
    const pool = getPool();
    // season_configs에서 season_type, year 조회
    const { rows: [sc] } = await pool.query(
      `SELECT season_type, year FROM season_configs WHERE season_code = $1`, [code],
    );
    const seasonType = sc?.season_type || parseSeasonCode(code).seasonType;
    const year = sc?.year || parseSeasonCode(code).year;

    const params: any[] = [seasonType];
    let yearFilter = '';
    if (year) {
      yearFilter = ' AND p.year = $2';
      params.push(year);
    }

    const { rows } = await pool.query(`
      SELECT p.product_code, p.product_name, p.category, p.sub_category,
        p.base_price, p.event_price, p.season, p.year,
        COALESCE(inv.total_stock, 0) AS current_stock,
        COALESCE(sl.sold_qty, 0) AS sold_qty,
        COALESCE(sl.revenue, 0) AS revenue,
        CASE WHEN (COALESCE(inv.total_stock,0) + COALESCE(sl.sold_qty,0)) > 0
          THEN ROUND(COALESCE(sl.sold_qty,0)::numeric / (COALESCE(inv.total_stock,0) + COALESCE(sl.sold_qty,0)) * 100, 1)
          ELSE 0 END AS sell_through_rate
      FROM products p
      LEFT JOIN (
        SELECT pv.product_code, SUM(i.qty) AS total_stock
        FROM inventory i
        JOIN product_variants pv ON pv.variant_id = i.variant_id
        GROUP BY pv.product_code
      ) inv ON inv.product_code = p.product_code
      LEFT JOIN (
        SELECT pv.product_code,
          SUM(ABS(s.qty)) AS sold_qty,
          SUM(ABS(s.qty) * s.unit_price) AS revenue
        FROM sales s
        JOIN product_variants pv ON pv.variant_id = s.variant_id
        WHERE s.sale_type IN ('retail','online','wholesale')
        GROUP BY pv.product_code
      ) sl ON sl.product_code = p.product_code
      WHERE p.season = $1${yearFilter} AND p.is_active = true
      ORDER BY sl.sold_qty DESC NULLS LAST
    `, params);
    return rows;
  },

  /** 시즌 분석 (카테고리별 판매율) */
  async getAnalytics(code: string) {
    const pool = getPool();
    const { rows: [sc] } = await pool.query(
      `SELECT season_type, year FROM season_configs WHERE season_code = $1`, [code],
    );
    const seasonType = sc?.season_type || parseSeasonCode(code).seasonType;
    const year = sc?.year || parseSeasonCode(code).year;

    const params: any[] = [seasonType];
    let yearFilter = '';
    if (year) {
      yearFilter = ' AND p.year = $2';
      params.push(year);
    }

    // 카테고리별 집계
    const { rows: byCategory } = await pool.query(`
      SELECT p.category,
        COUNT(DISTINCT p.product_code) AS styles,
        COALESCE(SUM(inv.total_stock), 0) AS stock,
        COALESCE(SUM(sl.sold_qty), 0) AS sold_qty,
        COALESCE(SUM(sl.revenue), 0) AS revenue,
        CASE WHEN (COALESCE(SUM(inv.total_stock),0) + COALESCE(SUM(sl.sold_qty),0)) > 0
          THEN ROUND(COALESCE(SUM(sl.sold_qty),0)::numeric / (COALESCE(SUM(inv.total_stock),0) + COALESCE(SUM(sl.sold_qty),0)) * 100, 1)
          ELSE 0 END AS sell_through_rate
      FROM products p
      LEFT JOIN (
        SELECT pv.product_code, SUM(i.qty) AS total_stock
        FROM inventory i
        JOIN product_variants pv ON pv.variant_id = i.variant_id
        GROUP BY pv.product_code
      ) inv ON inv.product_code = p.product_code
      LEFT JOIN (
        SELECT pv.product_code,
          SUM(ABS(s.qty)) AS sold_qty,
          SUM(ABS(s.qty) * s.unit_price) AS revenue
        FROM sales s
        JOIN product_variants pv ON pv.variant_id = s.variant_id
        WHERE s.sale_type IN ('retail','online','wholesale')
        GROUP BY pv.product_code
      ) sl ON sl.product_code = p.product_code
      WHERE p.season = $1${yearFilter} AND p.is_active = true
      GROUP BY p.category
      ORDER BY sold_qty DESC
    `, params);

    // 월별 매출 추이
    const { rows: monthlyTrend } = await pool.query(`
      SELECT TO_CHAR(s.sale_date, 'YYYY-MM') AS month,
        SUM(ABS(s.qty)) AS sold_qty,
        SUM(ABS(s.qty) * s.unit_price) AS revenue
      FROM sales s
      JOIN product_variants pv ON pv.variant_id = s.variant_id
      JOIN products p ON p.product_code = pv.product_code
      WHERE p.season = $1${yearFilter} AND s.sale_type IN ('retail','online','wholesale')
      GROUP BY TO_CHAR(s.sale_date, 'YYYY-MM')
      ORDER BY month
    `, params);

    return { byCategory, monthlyTrend };
  },

  /** 시즌 생성 */
  async create(data: any) {
    const pool = getPool();
    const { rows } = await pool.query(`
      INSERT INTO season_configs (season_code, season_name, status, plan_start_date, plan_end_date, target_styles, target_qty, target_revenue, memo, created_by, season_type, year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [data.season_code, data.season_name, data.status || 'PLANNING', data.plan_start_date, data.plan_end_date,
        data.target_styles || 0, data.target_qty || 0, data.target_revenue || 0, data.memo, data.created_by,
        data.season_type, data.year]);
    return rows[0];
  },

  /** 시즌 수정 (상태 전이 포함) */
  async update(code: string, data: any) {
    const pool = getPool();
    // 상태 전이 검증
    if (data.status) {
      const { rows } = await pool.query(`SELECT status FROM season_configs WHERE season_code = $1`, [code]);
      if (!rows[0]) throw new Error('시즌을 찾을 수 없습니다.');
      const curIdx = STATUS_ORDER.indexOf(rows[0].status);
      const newIdx = STATUS_ORDER.indexOf(data.status);
      if (newIdx < 0) throw new Error('유효하지 않은 상태입니다.');
      if (newIdx < curIdx) throw new Error(`${rows[0].status}에서 ${data.status}로 되돌릴 수 없습니다.`);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of ['season_name', 'status', 'plan_start_date', 'plan_end_date', 'actual_start_date', 'actual_end_date', 'target_styles', 'target_qty', 'target_revenue', 'memo']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) throw new Error('수정할 항목이 없습니다.');
    fields.push(`updated_at = NOW()`);
    values.push(code);

    const { rows } = await pool.query(
      `UPDATE season_configs SET ${fields.join(', ')} WHERE season_code = $${idx} RETURNING *`,
      values,
    );
    return rows[0];
  },
};
