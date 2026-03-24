import { BaseRepository } from '../../core/base.repository';
import { ProductionPlan } from '../../../../shared/types/production';
import { getPool } from '../../db/connection';

class ProductionRepository extends BaseRepository<ProductionPlan> {
  constructor() {
    super({
      tableName: 'production_plans',
      primaryKey: 'plan_id',
      searchFields: ['plan_no', 'plan_name'],
      filterFields: ['status', 'season', 'partner_code'],
      defaultOrder: 'created_at DESC',
      tableAlias: 'pp',
    });
  }

  async list(options: any = {}) {
    const pool = getPool();
    const { status, season, partner_code, search, year, season_type, payment_step } = options;
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`pp.status = $${idx++}`); params.push(status); }
    if (season) { conditions.push(`pp.season = $${idx++}`); params.push(season); }
    if (year) { conditions.push(`LEFT(pp.season, 4) = $${idx++}`); params.push(year); }
    if (season_type) { conditions.push(`RIGHT(pp.season, 2) = $${idx++}`); params.push(season_type); }
    if (partner_code) { conditions.push(`pp.partner_code = $${idx++}`); params.push(partner_code); }
    if (search) {
      conditions.push(`(pp.plan_no ILIKE $${idx} OR pp.plan_name ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    // 대금 단계 필터
    if (payment_step === 'advance_pending') {
      conditions.push(`pp.advance_status = 'PENDING'`);
      conditions.push(`pp.status NOT IN ('DRAFT', 'CANCELLED')`);
    } else if (payment_step === 'advance_paid') {
      conditions.push(`pp.advance_status = 'PAID'`);
      conditions.push(`pp.inspect_status != 'PENDING'`);
    } else if (payment_step === 'inspect_pending') {
      conditions.push(`pp.advance_status = 'PAID'`);
      conditions.push(`pp.inspect_status = 'PENDING'`);
    } else if (payment_step === 'balance_pending') {
      conditions.push(`pp.inspect_status = 'PASS'`);
      conditions.push(`pp.balance_status = 'PENDING'`);
    } else if (payment_step === 'settled') {
      conditions.push(`pp.settle_status = 'SETTLED'`);
    } else if (payment_step === 'all_payment') {
      // 대금관리 대상: 초안/취소 제외
      conditions.push(`pp.status NOT IN ('DRAFT', 'CANCELLED')`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countSql = `SELECT COUNT(*) FROM production_plans pp ${where}`;
    const total = parseInt((await pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT pp.*, pt.partner_name, u.user_name as created_by_name,
             COALESCE(SUM(pi.plan_qty), 0)::int as total_plan_qty,
             COALESCE(SUM(pi.produced_qty), 0)::int as total_produced_qty,
             COUNT(pi.item_id)::int as item_count,
             COALESCE(SUM(pi.plan_qty * COALESCE(pi.unit_cost, 0)), 0)::bigint as total_cost
      FROM production_plans pp
      LEFT JOIN partners pt ON pp.partner_code = pt.partner_code
      LEFT JOIN users u ON pp.created_by = u.user_id
      LEFT JOIN production_plan_items pi ON pp.plan_id = pi.plan_id
      ${where}
      GROUP BY pp.plan_id, pt.partner_name, u.user_name
      ORDER BY pp.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
    const data = await pool.query(dataSql, [...params, limit, offset]);

    return { data: data.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async generateNo(client?: any): Promise<string> {
    const conn = client || getPool();
    const result = await conn.query('SELECT generate_plan_no() as no');
    return result.rows[0].no;
  }

  async createWithItems(header: Record<string, any>, items: any[]): Promise<ProductionPlan> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const planNo = await this.generateNo(client);
      const insertSql = `
        INSERT INTO production_plans (plan_no, plan_name, season, target_date, start_date, end_date, partner_code, memo, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;
      const planResult = await client.query(insertSql, [
        planNo, header.plan_name, header.season, header.target_date,
        header.start_date, header.end_date, header.partner_code,
        header.memo, header.created_by,
      ]);
      const plan = planResult.rows[0];

      for (const item of items) {
        await client.query(
          `INSERT INTO production_plan_items (plan_id, category, sub_category, fit, length, plan_qty, unit_cost, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [plan.plan_id, item.category, item.sub_category || null, item.fit || null, item.length || null,
           item.plan_qty, item.unit_cost || null, item.memo || null],
        );

        // 매칭 상품 is_reorder = TRUE 자동 업데이트
        const matchConds: string[] = ['p.category = $1'];
        const matchParams: any[] = [item.category];
        let mi = 2;
        if (item.fit) { matchConds.push(`p.fit = $${mi}`); matchParams.push(item.fit); mi++; }
        if (item.length) { matchConds.push(`p.length = $${mi}`); matchParams.push(item.length); mi++; }
        await client.query(
          `UPDATE products p SET is_reorder = TRUE WHERE is_active = TRUE AND is_reorder = FALSE AND ${matchConds.join(' AND ')}`,
          matchParams,
        );
      }

      await client.query('COMMIT');
      return this.getWithItems(plan.plan_id) as Promise<ProductionPlan>;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getWithItems(id: number): Promise<ProductionPlan | null> {
    const pool = getPool();
    const headerSql = `
      SELECT pp.*, pt.partner_name, u.user_name as created_by_name
      FROM production_plans pp
      LEFT JOIN partners pt ON pp.partner_code = pt.partner_code
      LEFT JOIN users u ON pp.created_by = u.user_id
      WHERE pp.plan_id = $1`;
    const header = await pool.query(headerSql, [id]);
    if (header.rows.length === 0) return null;

    const itemsSql = `
      SELECT pi.*
      FROM production_plan_items pi
      WHERE pi.plan_id = $1
      ORDER BY pi.item_id`;
    const items = await pool.query(itemsSql, [id]);

    const materialsSql = `
      SELECT pmu.*, m.material_name, m.material_type, m.unit, m.stock_qty
      FROM production_material_usage pmu
      JOIN materials m ON pmu.material_id = m.material_id
      WHERE pmu.plan_id = $1
      ORDER BY pmu.usage_id`;
    const materials = await pool.query(materialsSql, [id]);

    return { ...header.rows[0], items: items.rows, materials: materials.rows };
  }

  async dashboardStats(): Promise<any> {
    const pool = getPool();
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    const twoYearsAgo = thisYear - 2;

    const [statusCounts, progressItems, purchaseCosts, materialCosts, paymentStats, yearlyPlanSummary, categoryProduction] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*)::int as count,
               COALESCE(SUM(sub.total_qty), 0)::int as total_qty
        FROM production_plans pp
        LEFT JOIN LATERAL (
          SELECT SUM(plan_qty) as total_qty FROM production_plan_items WHERE plan_id = pp.plan_id
        ) sub ON TRUE
        GROUP BY status ORDER BY
          CASE status WHEN 'DRAFT' THEN 1
          WHEN 'IN_PRODUCTION' THEN 2 WHEN 'COMPLETED' THEN 3 ELSE 4 END
      `),
      pool.query(`
        SELECT pi.item_id, pi.plan_id, pi.category, pi.sub_category, pi.fit, pi.length,
               pi.plan_qty, pi.produced_qty, pi.unit_cost,
               pp.plan_no, pp.plan_name, pp.status as plan_status
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status = 'IN_PRODUCTION' AND pi.produced_qty < pi.plan_qty
        ORDER BY (pi.produced_qty::float / NULLIF(pi.plan_qty, 0)) ASC
        LIMIT 30
      `),
      // 연도별 매입비용 (3개년)
      pool.query(`
        SELECT EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date))::int AS yr,
               COALESCE(SUM(pi.plan_qty * COALESCE(pi.unit_cost, 0)), 0)::bigint AS purchase_cost
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status IN ('IN_PRODUCTION','COMPLETED')
          AND EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date)) IN ($1, $2, $3)
        GROUP BY yr
      `, [thisYear, lastYear, twoYearsAgo]),
      // 연도별 부자재비용 (3개년)
      pool.query(`
        SELECT EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date))::int AS yr,
               COALESCE(SUM(pmu.required_qty * COALESCE(m.unit_price, 0)), 0)::bigint AS material_cost
        FROM production_material_usage pmu
        JOIN production_plans pp ON pmu.plan_id = pp.plan_id
        JOIN materials m ON pmu.material_id = m.material_id
        WHERE pp.status IN ('IN_PRODUCTION','COMPLETED')
          AND EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date)) IN ($1, $2, $3)
        GROUP BY yr
      `, [thisYear, lastYear, twoYearsAgo]),
      // 대금 현황
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE pp.advance_status = 'PENDING' AND pp.status NOT IN ('DRAFT','CANCELLED'))::int as advance_pending_count,
          COALESCE(SUM(pp.total_amount) FILTER (WHERE pp.advance_status = 'PENDING' AND pp.status NOT IN ('DRAFT','CANCELLED')), 0)::bigint as advance_pending_amount,
          COUNT(*) FILTER (WHERE pp.advance_status = 'PAID')::int as advance_paid_count,
          COALESCE(SUM(pp.advance_amount) FILTER (WHERE pp.advance_status = 'PAID'), 0)::bigint as advance_paid_amount,
          COUNT(*) FILTER (WHERE pp.advance_status = 'PAID' AND pp.balance_status = 'PENDING')::int as balance_pending_count,
          COALESCE(SUM(pp.balance_amount) FILTER (WHERE pp.advance_status = 'PAID' AND pp.balance_status = 'PENDING'), 0)::bigint as balance_pending_amount,
          COUNT(*) FILTER (WHERE pp.settle_status = 'SETTLED')::int as settled_count,
          COALESCE(SUM(pp.total_amount) FILTER (WHERE pp.settle_status = 'SETTLED'), 0)::bigint as settled_amount
        FROM production_plans pp
        WHERE pp.status NOT IN ('DRAFT', 'CANCELLED')
      `),
      // 연도별 생산 건수/수량 (3개년)
      pool.query(`
        SELECT EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date))::int AS yr,
               COUNT(DISTINCT pp.plan_id)::int AS plan_count,
               COALESCE(SUM(pi.plan_qty), 0)::int AS plan_qty,
               COALESCE(SUM(pi.produced_qty), 0)::int AS produced_qty
        FROM production_plans pp
        LEFT JOIN production_plan_items pi ON pi.plan_id = pp.plan_id
        WHERE pp.status NOT IN ('CANCELLED')
          AND EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date)) IN ($1, $2, $3)
        GROUP BY yr ORDER BY yr DESC
      `, [thisYear, lastYear, twoYearsAgo]),
      // 카테고리별 생산 실적 (3개년)
      pool.query(`
        SELECT EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date))::int AS yr,
               pi.category,
               COUNT(DISTINCT pp.plan_id)::int AS plan_count,
               COALESCE(SUM(pi.plan_qty), 0)::int AS plan_qty,
               COALESCE(SUM(pi.produced_qty), 0)::int AS produced_qty,
               COALESCE(SUM(pi.plan_qty * COALESCE(pi.unit_cost, 0)), 0)::bigint AS total_cost
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status NOT IN ('CANCELLED')
          AND EXTRACT(YEAR FROM COALESCE(pp.target_date, pp.created_at::date)) IN ($1, $2, $3)
        GROUP BY yr, pi.category
        ORDER BY yr DESC, total_cost DESC
      `, [thisYear, lastYear, twoYearsAgo]),
    ]);

    // 연도별 비용 조합
    const purchaseMap: Record<number, number> = {};
    for (const r of purchaseCosts.rows) purchaseMap[r.yr] = Number(r.purchase_cost);
    const materialMap: Record<number, number> = {};
    for (const r of materialCosts.rows) materialMap[r.yr] = Number(r.material_cost);

    return {
      statusCounts: statusCounts.rows,
      progressItems: progressItems.rows,
      financialSummary: {
        thisYear: { year: thisYear, purchase_cost: purchaseMap[thisYear] || 0, material_cost: materialMap[thisYear] || 0 },
        lastYear: { year: lastYear, purchase_cost: purchaseMap[lastYear] || 0, material_cost: materialMap[lastYear] || 0 },
        twoYearsAgo: { year: twoYearsAgo, purchase_cost: purchaseMap[twoYearsAgo] || 0, material_cost: materialMap[twoYearsAgo] || 0 },
      },
      yearlyPlanSummary: yearlyPlanSummary.rows,
      categoryProduction: categoryProduction.rows,
      paymentSummary: paymentStats.rows[0],
    };
  }

  async recommendations(options: { limit?: number; category?: string } = {}): Promise<any[]> {
    const pool = getPool();
    const limit = options.limit || 30;

    // 설정값 조회: 판매기간(일), 판매율 임계값(%)
    // 자동생산등급용 별도 기간 (AUTO_PROD_SALES_PERIOD_DAYS, 기본 14일)
    const settingsResult = await pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value IN ('AUTO_PROD_SALES_PERIOD_DAYS', 'PRODUCTION_SALES_PERIOD_DAYS', 'PRODUCTION_SELL_THROUGH_THRESHOLD')",
    );
    const settingsMap: Record<string, string> = {};
    for (const r of settingsResult.rows) settingsMap[r.code_value] = r.code_label;
    const salesPeriodDays = parseInt(settingsMap.AUTO_PROD_SALES_PERIOD_DAYS || '14', 10);
    const sellThroughThreshold = parseFloat(settingsMap.PRODUCTION_SELL_THROUGH_THRESHOLD || '40');

    const conditions: string[] = [];
    const params: any[] = [salesPeriodDays];
    let idx = 2;

    if (options.category) {
      conditions.push(`p.category = $${idx++}`);
      params.push(options.category);
    }
    const extraWhere = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    const sql = `
      WITH current_season AS (
        SELECT CASE
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (3,4,5,9,10,11) THEN 'SA'
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (6,7,8) THEN 'SM'
          ELSE 'WN'
        END AS season_code
      ),
      season_weights AS (
        SELECT code_value, COALESCE(code_label, '1.0')::numeric AS weight
        FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'SEASON_WEIGHT_%'
      ),
      sales_velocity AS (
        SELECT
          p.product_code, p.product_name, p.category, p.season,
          CASE
            WHEN p.season LIKE '%SS' THEN 'SA'
            WHEN p.season LIKE '%FW' THEN 'WN'
            WHEN p.season LIKE '%SA' THEN 'SA'
            WHEN p.season LIKE '%SM' THEN 'SM'
            WHEN p.season LIKE '%WN' THEN 'WN'
            ELSE 'SA'
          END AS product_season,
          COALESCE(SUM(s.qty), 0)::int AS total_sold,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / $1::numeric, 2) AS avg_daily_sales,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / $1::numeric * 30)::int AS predicted_30d
        FROM products p
        JOIN product_variants pv ON p.product_code = pv.product_code
        JOIN sales s ON pv.variant_id = s.variant_id
          AND s.sale_date >= CURRENT_DATE - ($1 || ' days')::interval
        WHERE p.is_active = TRUE AND p.sale_status = '판매중' ${extraWhere}
        GROUP BY p.product_code, p.product_name, p.category, p.season
      ),
      current_stock AS (
        SELECT pv.product_code, COALESCE(SUM(i.qty), 0)::int AS total_stock
        FROM product_variants pv
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        GROUP BY pv.product_code
      ),
      in_production AS (
        SELECT p.product_code,
               COALESCE(SUM(GREATEST(0, pi.plan_qty - pi.produced_qty)), 0)::int
                 / GREATEST(1, COUNT(DISTINCT p.product_code))::int AS pending_qty
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        JOIN products p ON p.category = pi.category
          AND (pi.fit IS NULL OR p.fit = pi.fit)
          AND (pi.length IS NULL OR p.length = pi.length)
        WHERE pp.status IN ('IN_PRODUCTION')
        GROUP BY p.product_code
      )
      SELECT
        sv.product_code, sv.product_name, sv.category, sv.season,
        sv.product_season,
        sv.total_sold,
        sv.avg_daily_sales,
        sv.predicted_30d AS raw_predicted_30d,
        COALESCE(sw.weight, 1.0) AS season_weight,
        CASE
          WHEN (sv.avg_daily_sales * COALESCE(sw.weight, 1.0)) > 0
            THEN (CURRENT_DATE + (COALESCE(cs.total_stock, 0)::numeric / (sv.avg_daily_sales * COALESCE(sw.weight, 1.0)))::int)::text
          ELSE NULL
        END AS sellout_date,
        COALESCE(cs.total_stock, 0) AS current_stock,
        COALESCE(ip.pending_qty, 0) AS in_production_qty,
        (COALESCE(cs.total_stock, 0) + COALESCE(ip.pending_qty, 0)) AS total_available,
        GREATEST(0, ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int - COALESCE(cs.total_stock, 0) - COALESCE(ip.pending_qty, 0)) AS shortage_qty,
        CEIL(GREATEST(0, ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int - COALESCE(cs.total_stock, 0) - COALESCE(ip.pending_qty, 0)) * 1.2)::int AS recommended_qty,
        CASE
          WHEN (sv.avg_daily_sales * COALESCE(sw.weight, 1.0)) > 0
            THEN ROUND((COALESCE(cs.total_stock, 0) + COALESCE(ip.pending_qty, 0))::numeric / (sv.avg_daily_sales * COALESCE(sw.weight, 1.0)))::int
          ELSE 9999
        END AS days_of_stock,
        CASE
          WHEN (sv.total_sold + COALESCE(cs.total_stock, 0)) > 0
            THEN ROUND(sv.total_sold::numeric / (sv.total_sold + COALESCE(cs.total_stock, 0)) * 100, 1)
          ELSE 0
        END AS sell_through_rate,
        cs2.season_code AS current_season_code
      FROM sales_velocity sv
      CROSS JOIN current_season cs2
      LEFT JOIN season_weights sw ON sw.code_value = 'SEASON_WEIGHT_' || sv.product_season || '_' || cs2.season_code
      LEFT JOIN current_stock cs ON sv.product_code = cs.product_code
      LEFT JOIN in_production ip ON sv.product_code = ip.product_code
      WHERE sv.avg_daily_sales > 0
        AND (COALESCE(cs.total_stock, 0) + COALESCE(ip.pending_qty, 0)) < ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int
        AND CASE
          WHEN (sv.total_sold + COALESCE(cs.total_stock, 0)) > 0
            THEN sv.total_sold::numeric / (sv.total_sold + COALESCE(cs.total_stock, 0)) * 100
          ELSE 0
        END >= $${idx}
      ORDER BY days_of_stock ASC, shortage_qty DESC
      LIMIT $${idx + 1}`;
    params.push(sellThroughThreshold);

    const result = await pool.query(sql, [...params, limit]);

    // 등급 분류 추가
    const gradeSettings = await this.autoGenerateSettings();
    return result.rows.map((r: any) => {
      const rate = Number(r.sell_through_rate);
      let grade: string;
      if (rate >= gradeSettings.gradeS.min) grade = 'S';
      else if (rate >= gradeSettings.gradeA.min) grade = 'A';
      else if (rate >= gradeSettings.gradeB.min) grade = 'B';
      else grade = 'C';
      return { ...r, grade };
    });
  }

  async categorySummary(): Promise<any[]> {
    const pool = getPool();
    const sql = `
      WITH all_categories AS (
        SELECT code_value AS category
        FROM master_codes
        WHERE code_type = 'CATEGORY' AND parent_code IS NULL AND is_active = TRUE
      ),
      current_season AS (
        SELECT CASE
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (3,4,5,9,10,11) THEN 'SA'
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (6,7,8) THEN 'SM'
          ELSE 'WN'
        END AS season_code
      ),
      season_weights AS (
        SELECT code_value, COALESCE(code_label, '1.0')::numeric AS weight
        FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'SEASON_WEIGHT_%'
      ),
      product_weight AS (
        SELECT p.product_code, p.category,
          COALESCE(sw.weight, 1.0) AS weight
        FROM products p
        CROSS JOIN current_season cs2
        LEFT JOIN season_weights sw ON sw.code_value = 'SEASON_WEIGHT_' ||
          CASE
            WHEN p.season LIKE '%SS' THEN 'SA'
            WHEN p.season LIKE '%FW' THEN 'WN'
            WHEN p.season LIKE '%SA' THEN 'SA'
            WHEN p.season LIKE '%SM' THEN 'SM'
            WHEN p.season LIKE '%WN' THEN 'WN'
            ELSE 'SA'
          END || '_' || cs2.season_code
        WHERE p.is_active = TRUE
      ),
      category_sales AS (
        SELECT
          COALESCE(p.category, '미분류') AS category,
          COALESCE(SUM(s.qty), 0)::int AS total_sold_90d,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / 90, 2) AS avg_daily_sales,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / 90 * 30)::int AS raw_predicted_30d
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '90 days' AND p.is_active = TRUE
        GROUP BY COALESCE(p.category, '미분류')
      ),
      category_avg_weight AS (
        SELECT COALESCE(pw2.category, '미분류') AS category,
               ROUND(AVG(pw2.weight), 2) AS avg_weight
        FROM product_weight pw2
        GROUP BY COALESCE(pw2.category, '미분류')
      ),
      category_stock AS (
        SELECT
          COALESCE(p.category, '미분류') AS category,
          COALESCE(SUM(i.qty), 0)::int AS total_stock,
          COUNT(DISTINCT p.product_code)::int AS product_count
        FROM products p
        LEFT JOIN product_variants pv ON p.product_code = pv.product_code
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        WHERE p.is_active = TRUE
        GROUP BY COALESCE(p.category, '미분류')
      ),
      category_production AS (
        SELECT
          pi.category AS category,
          COALESCE(SUM(GREATEST(0, pi.plan_qty - pi.produced_qty)), 0)::int AS pending_qty
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status IN ('IN_PRODUCTION') AND pi.category IS NOT NULL
        GROUP BY pi.category
      )
      SELECT
        ac.category,
        COALESCE(cst.product_count, 0) AS product_count,
        COALESCE(cs.total_sold_90d, 0) AS total_sold_90d,
        COALESCE(cs.avg_daily_sales, 0) AS avg_daily_sales,
        CASE
          WHEN (COALESCE(cs.avg_daily_sales, 0) * COALESCE(caw.avg_weight, 1.0)) > 0
            THEN (CURRENT_DATE + (COALESCE(cst.total_stock, 0)::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)))::int)::text
          ELSE NULL
        END AS sellout_date,
        COALESCE(cst.total_stock, 0) AS current_stock,
        COALESCE(cp.pending_qty, 0) AS in_production_qty,
        (COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0)) AS total_available,
        CASE
          WHEN (COALESCE(cs.avg_daily_sales, 0) * COALESCE(caw.avg_weight, 1.0)) > 0
            THEN ROUND((COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0))::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)))::int
          ELSE 9999
        END AS stock_coverage_days,
        CASE
          WHEN COALESCE(cs.avg_daily_sales, 0) = 0 THEN 'HEALTHY'
          WHEN (COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0))::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)) >= 30 THEN 'HEALTHY'
          WHEN (COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0))::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)) >= 15 THEN 'WARNING'
          ELSE 'CRITICAL'
        END AS stock_status
      FROM all_categories ac
      LEFT JOIN category_sales cs ON ac.category = cs.category
      LEFT JOIN category_avg_weight caw ON ac.category = caw.category
      LEFT JOIN category_stock cst ON ac.category = cst.category
      LEFT JOIN category_production cp ON ac.category = cp.category
      ORDER BY stock_coverage_days ASC, ac.category`;

    const result = await pool.query(sql);
    return result.rows;
  }

  async categorySubStats(category: string): Promise<any[]> {
    const pool = getPool();
    const sql = `
      WITH sub_codes AS (
        SELECT mc.code_value, mc.code_label
        FROM master_codes mc
        JOIN master_codes parent ON mc.parent_code = parent.code_id
        WHERE parent.code_type = 'CATEGORY' AND parent.code_value = $1 AND mc.is_active = TRUE
      ),
      sub_sales AS (
        SELECT
          COALESCE(p.sub_category, '미분류') AS sub_category,
          COALESCE(SUM(s.qty), 0)::int AS total_sold_90d,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / 90, 2) AS avg_daily_sales,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / 90 * 30)::int AS predicted_30d_demand
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
          AND p.is_active = TRUE AND p.category = $1
        GROUP BY COALESCE(p.sub_category, '미분류')
      ),
      sub_stock AS (
        SELECT
          COALESCE(p.sub_category, '미분류') AS sub_category,
          COALESCE(SUM(i.qty), 0)::int AS total_stock,
          COUNT(DISTINCT p.product_code)::int AS product_count
        FROM products p
        LEFT JOIN product_variants pv ON p.product_code = pv.product_code
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        WHERE p.is_active = TRUE AND p.category = $1
        GROUP BY COALESCE(p.sub_category, '미분류')
      ),
      sub_production AS (
        SELECT
          COALESCE(pi.sub_category, '미분류') AS sub_category,
          COALESCE(SUM(GREATEST(0, pi.plan_qty - pi.produced_qty)), 0)::int AS pending_qty
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status IN ('IN_PRODUCTION') AND pi.category = $1
        GROUP BY COALESCE(pi.sub_category, '미분류')
      ),
      all_subs AS (
        SELECT code_value AS sub_category, code_label FROM sub_codes
        UNION
        SELECT sub_category, NULL FROM sub_sales WHERE sub_category NOT IN (SELECT code_value FROM sub_codes)
        UNION
        SELECT sub_category, NULL FROM sub_stock WHERE sub_category NOT IN (SELECT code_value FROM sub_codes)
      )
      SELECT
        a.sub_category,
        COALESCE(a.code_label, a.sub_category) AS sub_category_label,
        COALESCE(ss.product_count, 0) AS product_count,
        COALESCE(sl.total_sold_90d, 0) AS total_sold_90d,
        COALESCE(sl.avg_daily_sales, 0) AS avg_daily_sales,
        CASE
          WHEN COALESCE(sl.avg_daily_sales, 0) > 0
            THEN (CURRENT_DATE + (COALESCE(ss.total_stock, 0)::numeric / sl.avg_daily_sales)::int)::text
          ELSE NULL
        END AS sellout_date,
        COALESCE(ss.total_stock, 0) AS current_stock,
        COALESCE(sp.pending_qty, 0) AS in_production_qty,
        (COALESCE(ss.total_stock, 0) + COALESCE(sp.pending_qty, 0)) AS total_available,
        CASE
          WHEN COALESCE(sl.avg_daily_sales, 0) > 0
            THEN ROUND((COALESCE(ss.total_stock, 0) + COALESCE(sp.pending_qty, 0))::numeric / sl.avg_daily_sales)::int
          ELSE 9999
        END AS stock_coverage_days,
        CASE
          WHEN COALESCE(sl.avg_daily_sales, 0) = 0 THEN 'HEALTHY'
          WHEN (COALESCE(ss.total_stock, 0) + COALESCE(sp.pending_qty, 0))::numeric / sl.avg_daily_sales >= 30 THEN 'HEALTHY'
          WHEN (COALESCE(ss.total_stock, 0) + COALESCE(sp.pending_qty, 0))::numeric / sl.avg_daily_sales >= 15 THEN 'WARNING'
          ELSE 'CRITICAL'
        END AS stock_status
      FROM all_subs a
      LEFT JOIN sub_sales sl ON a.sub_category = sl.sub_category
      LEFT JOIN sub_stock ss ON a.sub_category = ss.sub_category
      LEFT JOIN sub_production sp ON a.sub_category = sp.sub_category
      WHERE COALESCE(ss.product_count, 0) > 0 OR COALESCE(sl.total_sold_90d, 0) > 0 OR COALESCE(sp.pending_qty, 0) > 0
      ORDER BY stock_coverage_days ASC, a.sub_category`;

    const result = await pool.query(sql, [category]);
    return result.rows;
  }

  async productVariantDetail(productCode: string): Promise<any[]> {
    const pool = getPool();
    // 설정값: 자동생산등급용 판매기간
    const settingsResult = await pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value IN ('AUTO_PROD_SALES_PERIOD_DAYS', 'PRODUCTION_SALES_PERIOD_DAYS')",
    );
    const settingsMap: Record<string, string> = {};
    for (const r of settingsResult.rows) settingsMap[r.code_value] = r.code_label;
    const salesPeriodDays = parseInt(settingsMap.AUTO_PROD_SALES_PERIOD_DAYS || '14', 10);

    const sql = `
      SELECT pv.color, pv.size, pv.sku,
        COALESCE(sold.qty, 0)::int AS sold_qty,
        COALESCE(stock.qty, 0)::int AS current_stock,
        CASE WHEN (COALESCE(sold.qty, 0) + COALESCE(stock.qty, 0)) > 0
          THEN ROUND(COALESCE(sold.qty, 0)::numeric / (COALESCE(sold.qty, 0) + COALESCE(stock.qty, 0)) * 100, 1)
          ELSE 0
        END AS sell_through_rate
      FROM product_variants pv
      LEFT JOIN (
        SELECT variant_id, SUM(qty)::int AS qty
        FROM sales
        WHERE sale_date >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY variant_id
      ) sold ON pv.variant_id = sold.variant_id
      LEFT JOIN (
        SELECT variant_id, SUM(qty)::int AS qty
        FROM inventory
        GROUP BY variant_id
      ) stock ON pv.variant_id = stock.variant_id
      WHERE pv.product_code = $1
      ORDER BY pv.color,
        CASE pv.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 ELSE 7 END`;

    const result = await pool.query(sql, [productCode, salesPeriodDays]);
    return result.rows;
  }

  async autoGenerateSettings(): Promise<{
    gradeS: { min: number; mult: number };
    gradeA: { min: number; mult: number };
    gradeB: { min: number; mult: number };
    safetyBuffer: number;
  }> {
    const pool = getPool();
    const result = await pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'AUTO_PROD_%'",
    );
    const map: Record<string, string> = {};
    for (const r of result.rows) map[r.code_value] = r.code_label;
    return {
      gradeS: { min: parseInt(map.AUTO_PROD_GRADE_S_MIN || '80', 10), mult: parseFloat(map.AUTO_PROD_GRADE_S_MULT || '1.5') },
      gradeA: { min: parseInt(map.AUTO_PROD_GRADE_A_MIN || '50', 10), mult: parseFloat(map.AUTO_PROD_GRADE_A_MULT || '1.2') },
      gradeB: { min: parseInt(map.AUTO_PROD_GRADE_B_MIN || '30', 10), mult: parseFloat(map.AUTO_PROD_GRADE_B_MULT || '1.0') },
      safetyBuffer: parseFloat(map.AUTO_PROD_SAFETY_BUFFER || '1.2'),
    };
  }

  async autoGeneratePlans(userId: string, season?: string): Promise<any[]> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      // 1) 설정값 로드
      const settings = await this.autoGenerateSettings();
      // 2) 추천 데이터 가져오기 (판매율 B급 이상만)
      const recs = await this.recommendations({ limit: 100 });
      if (recs.length === 0) return [];

      // 3) 등급별 배수 적용 + 카테고리 그룹핑
      const categoryGroups: Record<string, Array<{
        product_code: string; product_name: string; category: string;
        shortage_qty: number; sell_through_rate: number; grade: string;
        final_qty: number; season_weight: number; days_of_stock: number;
      }>> = {};

      for (const rec of recs) {
        const rate = Number(rec.sell_through_rate);
        const shortage = Number(rec.shortage_qty);
        if (shortage <= 0) continue;

        let grade: string;
        let mult: number;
        if (rate >= settings.gradeS.min) { grade = 'S'; mult = settings.gradeS.mult; }
        else if (rate >= settings.gradeA.min) { grade = 'A'; mult = settings.gradeA.mult; }
        else if (rate >= settings.gradeB.min) { grade = 'B'; mult = settings.gradeB.mult; }
        else continue; // C등급 제외

        const finalQty = Math.ceil(shortage * settings.safetyBuffer * mult);
        const cat = rec.category || '미분류';
        if (!categoryGroups[cat]) categoryGroups[cat] = [];
        categoryGroups[cat].push({
          product_code: rec.product_code,
          product_name: rec.product_name,
          category: cat,
          shortage_qty: shortage,
          sell_through_rate: rate,
          grade,
          final_qty: finalQty,
          season_weight: Number(rec.season_weight),
          days_of_stock: Number(rec.days_of_stock),
        });
      }

      if (Object.keys(categoryGroups).length === 0) return [];

      // 4) 현재 시즌 결정 (4자리 연도 사용: 2026SA, 2026SM, 2026WN)
      const m = new Date().getMonth() + 1;
      const y = new Date().getFullYear();
      const currentSeason = season || ([3, 4, 5, 9, 10, 11].includes(m) ? `${y}SA` : [6, 7, 8].includes(m) ? `${y}SM` : `${y}WN`);

      // 5) 카테고리별 생산계획 자동 생성
      await client.query('BEGIN');
      const createdPlans: any[] = [];

      for (const [cat, items] of Object.entries(categoryGroups)) {
        const totalQty = items.reduce((s, i) => s + i.final_qty, 0);
        const gradeBreakdown = items.reduce((acc, i) => {
          acc[i.grade] = (acc[i.grade] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const gradeSummary = Object.entries(gradeBreakdown).map(([g, c]) => `${g}급 ${c}건`).join(', ');

        const planNo = await this.generateNo(client);
        const planName = `[자동] ${cat} 생산기획 (${gradeSummary})`;

        // target_date: 현재 월 1일 (자금계획 연동을 위해 필수)
        const now = new Date();
        const targetDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        const planResult = await client.query(
          `INSERT INTO production_plans (plan_no, plan_name, season, target_date, memo, created_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [planNo, planName, currentSeason, targetDate,
           `판매율 기반 자동 생성. ${items.length}개 품목, 총 ${totalQty}개. ${gradeSummary}`,
           userId],
        );
        const plan = planResult.rows[0];

        // 카테고리 단위로 1개 아이템 (총합)
        await client.query(
          `INSERT INTO production_plan_items (plan_id, category, plan_qty, memo)
           VALUES ($1, $2, $3, $4)`,
          [plan.plan_id, cat, totalQty,
           items.map(i => `${i.product_code}(${i.grade}급/${i.sell_through_rate}%→${i.final_qty}개)`).join(', ')],
        );

        createdPlans.push({
          plan_id: plan.plan_id,
          plan_no: planNo,
          plan_name: planName,
          category: cat,
          total_qty: totalQty,
          item_count: items.length,
          items,
          grade_breakdown: gradeBreakdown,
        });
      }

      await client.query('COMMIT');
      return createdPlans;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async autoGeneratePreview(): Promise<any> {
    const settings = await this.autoGenerateSettings();
    const recs = await this.recommendations({ limit: 100 });
    if (recs.length === 0) return { settings, categories: {}, totalProducts: 0, totalQty: 0 };

    const categories: Record<string, any> = {};
    let totalProducts = 0;
    let totalQty = 0;

    for (const rec of recs) {
      const rate = Number(rec.sell_through_rate);
      const shortage = Number(rec.shortage_qty);
      if (shortage <= 0) continue;

      let grade: string;
      let mult: number;
      if (rate >= settings.gradeS.min) { grade = 'S'; mult = settings.gradeS.mult; }
      else if (rate >= settings.gradeA.min) { grade = 'A'; mult = settings.gradeA.mult; }
      else if (rate >= settings.gradeB.min) { grade = 'B'; mult = settings.gradeB.mult; }
      else continue;

      const finalQty = Math.ceil(shortage * settings.safetyBuffer * mult);
      const cat = rec.category || '미분류';
      if (!categories[cat]) categories[cat] = { items: [], totalQty: 0, grades: {} };
      categories[cat].items.push({
        product_code: rec.product_code,
        product_name: rec.product_name,
        sell_through_rate: rate,
        grade,
        shortage_qty: shortage,
        final_qty: finalQty,
        days_of_stock: Number(rec.days_of_stock),
        current_stock: Number(rec.current_stock),
        season_weight: Number(rec.season_weight),
      });
      categories[cat].totalQty += finalQty;
      categories[cat].grades[grade] = (categories[cat].grades[grade] || 0) + 1;
      totalProducts++;
      totalQty += finalQty;
    }

    return { settings, categories, totalProducts, totalQty };
  }

  async paymentSummary() {
    const pool = getPool();
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE pp.advance_status = 'PENDING' AND pp.status NOT IN ('DRAFT','CANCELLED'))::int as advance_pending_count,
        COALESCE(SUM(pp.total_amount) FILTER (WHERE pp.advance_status = 'PENDING' AND pp.status NOT IN ('DRAFT','CANCELLED')), 0)::bigint as advance_pending_amount,
        COUNT(*) FILTER (WHERE pp.advance_status = 'PAID' AND pp.inspect_status = 'PENDING')::int as inspect_pending_count,
        COUNT(*) FILTER (WHERE pp.advance_status = 'PAID' AND pp.inspect_status != 'PENDING')::int as advance_paid_count,
        COALESCE(SUM(pp.advance_amount) FILTER (WHERE pp.advance_status = 'PAID'), 0)::bigint as advance_paid_amount,
        COUNT(*) FILTER (WHERE pp.inspect_status = 'PASS' AND pp.balance_status = 'PENDING')::int as balance_pending_count,
        COALESCE(SUM(pp.balance_amount) FILTER (WHERE pp.inspect_status = 'PASS' AND pp.balance_status = 'PENDING'), 0)::bigint as balance_pending_amount,
        COUNT(*) FILTER (WHERE pp.settle_status = 'SETTLED')::int as settled_count,
        COALESCE(SUM(pp.total_amount) FILTER (WHERE pp.settle_status = 'SETTLED'), 0)::bigint as settled_amount
      FROM production_plans pp
      WHERE pp.status NOT IN ('DRAFT', 'CANCELLED')`;
    return (await pool.query(sql)).rows[0];
  }

  async updatePayment(planId: number, data: Record<string, any>, userId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM production_plans WHERE plan_id = $1 FOR UPDATE', [planId]);
      if (current.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다.');
      const plan = current.rows[0];
      if (['DRAFT', 'CANCELLED'].includes(plan.status)) throw new Error('초안/취소 상태에서는 대금 처리할 수 없습니다.');

      const { action } = data;

      if (action === 'advance') {
        // 선지급 처리
        if (plan.advance_status === 'PAID') throw new Error('이미 선지급 완료되었습니다.');
        const totalAmount = Number(data.total_amount) || 0;
        const advanceRate = Number(data.advance_rate) || 30;
        const advanceAmount = Number(data.advance_amount) || Math.round(totalAmount * advanceRate / 100);
        const balanceAmount = totalAmount - advanceAmount;
        await client.query(
          `UPDATE production_plans SET
            total_amount = $1, advance_rate = $2, advance_amount = $3,
            advance_date = COALESCE($4::date, CURRENT_DATE), advance_status = 'PAID',
            balance_amount = $5, updated_at = NOW()
          WHERE plan_id = $6`,
          [totalAmount, advanceRate, advanceAmount, data.advance_date || null, balanceAmount, planId],
        );
      } else if (action === 'inspect') {
        // 검수 처리
        if (plan.advance_status !== 'PAID') throw new Error('선지급 완료 후 검수 가능합니다.');
        if (plan.inspect_status !== 'PENDING') throw new Error('이미 검수 처리되었습니다.');
        const inspectStatus = data.inspect_status; // 'PASS' or 'FAIL'
        if (!['PASS', 'FAIL'].includes(inspectStatus)) throw new Error('검수 결과는 PASS 또는 FAIL이어야 합니다.');
        await client.query(
          `UPDATE production_plans SET
            inspect_date = COALESCE($1::date, CURRENT_DATE), inspect_qty = $2,
            inspect_status = $3, inspect_memo = $4, updated_at = NOW()
          WHERE plan_id = $5`,
          [data.inspect_date || null, data.inspect_qty || 0, inspectStatus, data.inspect_memo || null, planId],
        );
      } else if (action === 'balance') {
        // 잔금 지급
        if (plan.advance_status !== 'PAID') throw new Error('선지급 완료 후 잔금 지급 가능합니다.');
        if (plan.balance_status === 'PAID') throw new Error('이미 잔금 지급 완료되었습니다.');
        await client.query(
          `UPDATE production_plans SET
            balance_date = COALESCE($1::date, CURRENT_DATE), balance_status = 'PAID', updated_at = NOW()
          WHERE plan_id = $2`,
          [data.balance_date || null, planId],
        );
      } else if (action === 'settle') {
        // 정산 완료
        if (plan.balance_status !== 'PAID') throw new Error('잔금 지급 완료 후 정산 가능합니다.');
        if (plan.settle_status === 'SETTLED') throw new Error('이미 정산 완료되었습니다.');
        await client.query(
          `UPDATE production_plans SET settle_status = 'SETTLED', updated_at = NOW() WHERE plan_id = $1`,
          [planId],
        );
      } else {
        throw new Error('유효하지 않은 액션입니다.');
      }

      await client.query('COMMIT');
      return this.getWithItems(planId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateProducedQty(planId: number, items: Array<{ item_id: number; produced_qty: number }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 계획 상태 확인
      const planCheck = await client.query('SELECT status FROM production_plans WHERE plan_id = $1 FOR UPDATE', [planId]);
      if (planCheck.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다.');
      if (planCheck.rows[0].status !== 'IN_PRODUCTION') throw new Error('생산중 상태에서만 수량을 변경할 수 있습니다.');

      for (const item of items) {
        if (!Number.isInteger(item.produced_qty) || item.produced_qty < 0) throw new Error('생산수량은 0 이상의 정수여야 합니다.');
        const result = await client.query(
          'UPDATE production_plan_items SET produced_qty = $1 WHERE item_id = $2 AND plan_id = $3',
          [item.produced_qty, item.item_id, planId],
        );
        if (result.rowCount === 0) throw new Error(`품목(item_id: ${item.item_id})을 찾을 수 없습니다.`);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async saveMaterials(planId: number, materials: Array<{ material_id: number; required_qty: number; memo?: string }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 계획 상태 확인 — 완료/취소 상태에서는 자재 변경 불가
      const planCheck = await client.query('SELECT status FROM production_plans WHERE plan_id = $1 FOR UPDATE', [planId]);
      if (planCheck.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다.');
      if (['COMPLETED', 'CANCELLED'].includes(planCheck.rows[0].status)) throw new Error('완료 또는 취소된 계획의 자재는 수정할 수 없습니다.');

      await client.query('DELETE FROM production_material_usage WHERE plan_id = $1', [planId]);
      for (const m of materials) {
        await client.query(
          'INSERT INTO production_material_usage (plan_id, material_id, required_qty, memo) VALUES ($1, $2, $3, $4)',
          [planId, m.material_id, m.required_qty, m.memo || null],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

}

export const productionRepository = new ProductionRepository();
