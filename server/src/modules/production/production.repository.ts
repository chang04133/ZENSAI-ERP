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
    const { page = 1, limit = 20, status, season, partner_code, search } = options;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`pp.status = $${idx++}`); params.push(status); }
    if (season) { conditions.push(`pp.season = $${idx++}`); params.push(season); }
    if (partner_code) { conditions.push(`pp.partner_code = $${idx++}`); params.push(partner_code); }
    if (search) {
      conditions.push(`(pp.plan_no ILIKE $${idx} OR pp.plan_name ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
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

  async generateNo(): Promise<string> {
    const pool = getPool();
    const result = await pool.query('SELECT generate_plan_no() as no');
    return result.rows[0].no;
  }

  async createWithItems(header: Record<string, any>, items: any[]): Promise<ProductionPlan> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const planNo = await this.generateNo();
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
    const [statusCounts, recentPlans, seasonSummary, progressItems] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*)::int as count,
               COALESCE(SUM(sub.total_qty), 0)::int as total_qty
        FROM production_plans pp
        LEFT JOIN LATERAL (
          SELECT SUM(plan_qty) as total_qty FROM production_plan_items WHERE plan_id = pp.plan_id
        ) sub ON TRUE
        GROUP BY status ORDER BY
          CASE status WHEN 'DRAFT' THEN 1 WHEN 'CONFIRMED' THEN 2
          WHEN 'IN_PRODUCTION' THEN 3 WHEN 'COMPLETED' THEN 4 ELSE 5 END
      `),
      pool.query(`
        SELECT pp.plan_id, pp.plan_no, pp.plan_name, pp.status, pp.target_date, pp.season,
               pt.partner_name,
               COALESCE(SUM(pi.plan_qty), 0)::int as total_plan_qty,
               COALESCE(SUM(pi.produced_qty), 0)::int as total_produced_qty
        FROM production_plans pp
        LEFT JOIN partners pt ON pp.partner_code = pt.partner_code
        LEFT JOIN production_plan_items pi ON pp.plan_id = pi.plan_id
        WHERE pp.status NOT IN ('COMPLETED', 'CANCELLED')
        GROUP BY pp.plan_id, pt.partner_name
        ORDER BY pp.target_date ASC NULLS LAST, pp.created_at DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT pp.season,
               COUNT(DISTINCT pp.plan_id)::int as plan_count,
               COALESCE(SUM(pi.plan_qty), 0)::int as total_plan_qty,
               COALESCE(SUM(pi.produced_qty), 0)::int as total_produced_qty
        FROM production_plans pp
        LEFT JOIN production_plan_items pi ON pp.plan_id = pi.plan_id
        WHERE pp.status NOT IN ('CANCELLED') AND pp.season IS NOT NULL
        GROUP BY pp.season ORDER BY pp.season DESC
      `),
      pool.query(`
        SELECT pi.item_id, pi.plan_id, pi.category, pi.sub_category, pi.fit, pi.length,
               pi.plan_qty, pi.produced_qty, pi.unit_cost,
               pp.plan_no, pp.plan_name, pp.status as plan_status
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status = 'IN_PRODUCTION' AND pi.produced_qty < pi.plan_qty
        ORDER BY (pi.produced_qty::float / NULLIF(pi.plan_qty, 0)) ASC
        LIMIT 15
      `),
    ]);

    return {
      statusCounts: statusCounts.rows,
      recentPlans: recentPlans.rows,
      seasonSummary: seasonSummary.rows,
      progressItems: progressItems.rows,
    };
  }

  async recommendations(options: { limit?: number; category?: string } = {}): Promise<any[]> {
    const pool = getPool();
    const limit = options.limit || 30;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

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
          COALESCE(SUM(s.qty), 0)::int AS total_sold_90d,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / 90, 2) AS avg_daily_sales,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / 90 * 30)::int AS predicted_30d
        FROM products p
        JOIN product_variants pv ON p.product_code = pv.product_code
        JOIN sales s ON pv.variant_id = s.variant_id
          AND s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
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
        WHERE pp.status IN ('CONFIRMED', 'IN_PRODUCTION')
        GROUP BY p.product_code
      )
      SELECT
        sv.product_code, sv.product_name, sv.category, sv.season,
        sv.product_season,
        sv.total_sold_90d,
        sv.avg_daily_sales,
        sv.predicted_30d AS raw_predicted_30d,
        COALESCE(sw.weight, 1.0) AS season_weight,
        ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int AS predicted_30d_demand,
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
        cs2.season_code AS current_season_code
      FROM sales_velocity sv
      CROSS JOIN current_season cs2
      LEFT JOIN season_weights sw ON sw.code_value = 'SEASON_WEIGHT_' || sv.product_season || '_' || cs2.season_code
      LEFT JOIN current_stock cs ON sv.product_code = cs.product_code
      LEFT JOIN in_production ip ON sv.product_code = ip.product_code
      WHERE sv.avg_daily_sales > 0
        AND (COALESCE(cs.total_stock, 0) + COALESCE(ip.pending_qty, 0)) < ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int
      ORDER BY days_of_stock ASC, shortage_qty DESC
      LIMIT $${idx}`;

    const result = await pool.query(sql, [...params, limit]);
    return result.rows;
  }

  async categorySummary(): Promise<any[]> {
    const pool = getPool();
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
        WHERE pp.status IN ('CONFIRMED', 'IN_PRODUCTION') AND pi.category IS NOT NULL
        GROUP BY pi.category
      )
      SELECT
        cs.category,
        COALESCE(cst.product_count, 0) AS product_count,
        cs.total_sold_90d,
        cs.avg_daily_sales,
        ROUND(cs.raw_predicted_30d * COALESCE(caw.avg_weight, 1.0))::int AS predicted_30d_demand,
        COALESCE(cst.total_stock, 0) AS current_stock,
        COALESCE(cp.pending_qty, 0) AS in_production_qty,
        (COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0)) AS total_available,
        CASE
          WHEN (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)) > 0
            THEN ROUND((COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0))::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)))::int
          ELSE 9999
        END AS stock_coverage_days,
        CASE
          WHEN (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)) = 0 THEN 'HEALTHY'
          WHEN (COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0))::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)) >= 30 THEN 'HEALTHY'
          WHEN (COALESCE(cst.total_stock, 0) + COALESCE(cp.pending_qty, 0))::numeric / (cs.avg_daily_sales * COALESCE(caw.avg_weight, 1.0)) >= 15 THEN 'WARNING'
          ELSE 'CRITICAL'
        END AS stock_status
      FROM category_sales cs
      LEFT JOIN category_avg_weight caw ON cs.category = caw.category
      LEFT JOIN category_stock cst ON cs.category = cst.category
      LEFT JOIN category_production cp ON cs.category = cp.category
      ORDER BY stock_coverage_days ASC, cs.category`;

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
        WHERE pp.status IN ('CONFIRMED', 'IN_PRODUCTION') AND pi.category = $1
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
        COALESCE(sl.predicted_30d_demand, 0) AS predicted_30d_demand,
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

  async updateProducedQty(planId: number, items: Array<{ item_id: number; produced_qty: number }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          'UPDATE production_plan_items SET produced_qty = $1 WHERE item_id = $2 AND plan_id = $3',
          [item.produced_qty, item.item_id, planId],
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

  async saveMaterials(planId: number, materials: Array<{ material_id: number; required_qty: number; memo?: string }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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
