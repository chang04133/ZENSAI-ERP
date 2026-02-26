import { BaseRepository } from '../../core/base.repository';
import { RestockRequest } from '../../../../shared/types/restock';
import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

export class RestockRepository extends BaseRepository<RestockRequest> {
  constructor() {
    super({
      tableName: 'restock_requests',
      primaryKey: 'request_id',
      searchFields: ['request_no'],
      filterFields: ['status', 'partner_code'],
      tableAlias: 'rr',
      defaultOrder: 'rr.created_at DESC',
    });
  }

  async list(options: any = {}) {
    const { page = 1, limit = 20, search, status, partner_code } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('rr');
    if (search) qb.search(['request_no'], search);
    if (status) qb.eq('status', status);
    if (partner_code) qb.eq('partner_code', partner_code);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM restock_requests rr ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT rr.*, p.partner_name,
        (SELECT COALESCE(SUM(ri.request_qty),0)::int FROM restock_request_items ri WHERE ri.request_id = rr.request_id) AS total_qty,
        (SELECT COUNT(*)::int FROM restock_request_items ri WHERE ri.request_id = rr.request_id) AS item_count
      FROM restock_requests rr
      LEFT JOIN partners p ON rr.partner_code = p.partner_code
      ${whereClause} ORDER BY rr.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async generateNo(): Promise<string> {
    const result = await this.pool.query('SELECT generate_restock_no() as no');
    return result.rows[0].no;
  }

  async createWithItems(
    headerData: Record<string, any>,
    items: Array<{ variant_id: number; request_qty: number; unit_cost?: number; memo?: string }>,
  ): Promise<RestockRequest | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const requestNo = await this.generateNo();
      const header = await client.query(
        `INSERT INTO restock_requests
         (request_no, request_date, partner_code, status, expected_date, memo, requested_by)
         VALUES ($1, CURRENT_DATE, $2, 'DRAFT', $3, $4, $5)
         RETURNING *`,
        [requestNo, headerData.partner_code, headerData.expected_date || null,
         headerData.memo || null, headerData.requested_by],
      );
      const requestId = header.rows[0].request_id;
      for (const item of items) {
        await client.query(
          `INSERT INTO restock_request_items (request_id, variant_id, request_qty, received_qty, unit_cost, memo)
           VALUES ($1, $2, $3, 0, $4, $5)`,
          [requestId, item.variant_id, item.request_qty, item.unit_cost || null, item.memo || null],
        );
      }
      await client.query('COMMIT');
      return this.getWithItems(requestId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getWithItems(id: number): Promise<RestockRequest | null> {
    const req = await this.pool.query(
      `SELECT rr.*, p.partner_name
       FROM restock_requests rr
       LEFT JOIN partners p ON rr.partner_code = p.partner_code
       WHERE rr.request_id = $1`, [id]);
    if (req.rows.length === 0) return null;
    const items = await this.pool.query(
      `SELECT ri.*, pv.sku, pv.color, pv.size, pr.product_name
       FROM restock_request_items ri
       JOIN product_variants pv ON ri.variant_id = pv.variant_id
       JOIN products pr ON pv.product_code = pr.product_code
       WHERE ri.request_id = $1
       ORDER BY ri.item_id`, [id]);
    return { ...req.rows[0], items: items.rows };
  }

  /** 판매 속도 조회 (7일/30일) */
  async getSellingVelocity(partnerCode?: string): Promise<any[]> {
    const partnerFilter = partnerCode ? 'AND t.partner_code = $1' : '';
    const invFilter = partnerCode ? 'WHERE partner_code = $1' : '';
    const params = partnerCode ? [partnerCode] : [];

    const sql = `
      WITH sales_7d AS (
        SELECT t.variant_id, COALESCE(SUM(-t.qty_change), 0)::int AS sold_7d
        FROM inventory_transactions t
        WHERE t.tx_type = 'SALE' AND t.created_at >= NOW() - INTERVAL '7 days' ${partnerFilter}
        GROUP BY t.variant_id
      ),
      sales_30d AS (
        SELECT t.variant_id, COALESCE(SUM(-t.qty_change), 0)::int AS sold_30d
        FROM inventory_transactions t
        WHERE t.tx_type = 'SALE' AND t.created_at >= NOW() - INTERVAL '30 days' ${partnerFilter}
        GROUP BY t.variant_id
      ),
      current_inv AS (
        SELECT variant_id, COALESCE(SUM(qty), 0)::int AS current_qty
        FROM inventory ${invFilter}
        GROUP BY variant_id
      )
      SELECT
        pv.variant_id, pv.sku, p.product_code, p.product_name, pv.color, pv.size,
        COALESCE(s7.sold_7d, 0)::int AS sold_7d,
        COALESCE(s30.sold_30d, 0)::int AS sold_30d,
        ROUND(COALESCE(s7.sold_7d, 0) / 7.0, 2)::float AS avg_daily_7d,
        ROUND(COALESCE(s30.sold_30d, 0) / 30.0, 2)::float AS avg_daily_30d,
        COALESCE(ci.current_qty, 0)::int AS current_qty,
        CASE WHEN COALESCE(s7.sold_7d, 0) > 0
          THEN FLOOR(COALESCE(ci.current_qty, 0) / (s7.sold_7d / 7.0))::int
          ELSE NULL END AS days_until_out_7d,
        CASE WHEN COALESCE(s30.sold_30d, 0) > 0
          THEN FLOOR(COALESCE(ci.current_qty, 0) / (s30.sold_30d / 30.0))::int
          ELSE NULL END AS days_until_out_30d
      FROM product_variants pv
      JOIN products p ON pv.product_code = p.product_code
      LEFT JOIN sales_7d s7 ON pv.variant_id = s7.variant_id
      LEFT JOIN sales_30d s30 ON pv.variant_id = s30.variant_id
      LEFT JOIN current_inv ci ON pv.variant_id = ci.variant_id
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND (COALESCE(s7.sold_7d, 0) > 0 OR COALESCE(s30.sold_30d, 0) > 0)
      ORDER BY sold_30d DESC, sold_7d DESC
      LIMIT 100`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 재입고 제안 목록 — 생산기획과 동일한 분석 엔진 (60일 판매, 판매율, 계절가중치) */
  async getRestockSuggestions(): Promise<any[]> {
    // 설정값 로드
    const settingsResult = await this.pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value IN ('PRODUCTION_SALES_PERIOD_DAYS', 'PRODUCTION_SELL_THROUGH_THRESHOLD')",
    );
    const settingsMap: Record<string, string> = {};
    for (const r of settingsResult.rows) settingsMap[r.code_value] = r.code_label;
    const salesPeriodDays = parseInt(settingsMap.PRODUCTION_SALES_PERIOD_DAYS || '60', 10);
    const sellThroughThreshold = parseFloat(settingsMap.PRODUCTION_SELL_THROUGH_THRESHOLD || '40');

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
      variant_count AS (
        SELECT product_code, COUNT(*)::int AS cnt
        FROM product_variants WHERE is_active = TRUE GROUP BY product_code
      ),
      sales_velocity AS (
        SELECT
          pv.variant_id, p.product_code, p.product_name, pv.sku, pv.color, pv.size,
          p.season,
          CASE
            WHEN p.season LIKE '%SA' THEN 'SA'
            WHEN p.season LIKE '%SM' THEN 'SM'
            WHEN p.season LIKE '%WN' THEN 'WN'
            WHEN p.season LIKE '%SS' THEN 'SA'
            WHEN p.season LIKE '%FW' THEN 'WN'
            ELSE 'SA'
          END AS product_season,
          COALESCE(SUM(s.qty), 0)::int AS total_sold,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / $1::numeric, 2) AS avg_daily,
          ROUND(COALESCE(SUM(s.qty), 0)::numeric / $1::numeric * 30)::int AS predicted_30d
        FROM product_variants pv
        JOIN products p ON pv.product_code = p.product_code
        JOIN sales s ON pv.variant_id = s.variant_id
          AND s.sale_date >= CURRENT_DATE - ($1 || ' days')::interval
        WHERE p.is_active = TRUE AND pv.is_active = TRUE AND p.sale_status = '판매중'
          AND COALESCE(pv.low_stock_alert, TRUE) = TRUE
        GROUP BY pv.variant_id, p.product_code, p.product_name, pv.sku, pv.color, pv.size, p.season
      ),
      current_stock AS (
        SELECT variant_id, COALESCE(SUM(qty), 0)::int AS total_stock
        FROM inventory GROUP BY variant_id
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
      ),
      pending_restocks AS (
        SELECT ri.variant_id, COALESCE(SUM(ri.request_qty - COALESCE(ri.received_qty, 0)), 0)::int AS pending_qty
        FROM restock_request_items ri
        JOIN restock_requests rr ON ri.request_id = rr.request_id
        WHERE rr.status IN ('DRAFT', 'APPROVED', 'ORDERED')
        GROUP BY ri.variant_id
      ),
      zero_stock AS (
        SELECT pv.variant_id, p.product_code, p.product_name, pv.sku, pv.color, pv.size,
               p.season, 'SA' AS product_season,
               0 AS total_sold, 0::numeric AS avg_daily, 0 AS predicted_30d
        FROM product_variants pv
        JOIN products p ON pv.product_code = p.product_code
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        WHERE p.is_active = TRUE AND pv.is_active = TRUE AND p.sale_status = '판매중'
          AND COALESCE(pv.low_stock_alert, TRUE) = TRUE
          AND COALESCE(i.qty, 0) = 0
          AND pv.variant_id NOT IN (SELECT variant_id FROM sales_velocity)
          AND pv.variant_id NOT IN (SELECT variant_id FROM pending_restocks WHERE pending_qty > 0)
        GROUP BY pv.variant_id, p.product_code, p.product_name, pv.sku, pv.color, pv.size, p.season
      ),
      combined AS (
        SELECT * FROM sales_velocity
        UNION ALL
        SELECT * FROM zero_stock
      )
      SELECT
        sv.variant_id, sv.product_code, sv.product_name, sv.sku, sv.color, sv.size,
        sv.season,
        sv.total_sold,
        sv.avg_daily::float,
        COALESCE(sw.weight, 1.0)::float AS season_weight,
        ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int AS demand_30d,
        COALESCE(cs.total_stock, 0)::int AS current_stock,
        COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0)::int AS in_production_qty,
        (COALESCE(cs.total_stock, 0) + COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0) + COALESCE(pr.pending_qty, 0))::int AS total_available,
        GREATEST(0,
          ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int
          - COALESCE(cs.total_stock, 0)
          - COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0)
          - COALESCE(pr.pending_qty, 0)
        )::int AS shortage_qty,
        CEIL(GREATEST(0,
          ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int
          - COALESCE(cs.total_stock, 0)
          - COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0)
          - COALESCE(pr.pending_qty, 0)
        ) * 1.2)::int AS suggested_qty,
        CASE
          WHEN (sv.avg_daily * COALESCE(sw.weight, 1.0)) > 0
            THEN ROUND(
              (COALESCE(cs.total_stock, 0) + COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0))::numeric
              / (sv.avg_daily * COALESCE(sw.weight, 1.0))
            )::int
          ELSE 0
        END AS days_of_stock,
        CASE
          WHEN (sv.total_sold + COALESCE(cs.total_stock, 0)) > 0
            THEN ROUND(sv.total_sold::numeric / (sv.total_sold + COALESCE(cs.total_stock, 0)) * 100, 1)::float
          ELSE 0
        END AS sell_through_rate,
        CASE
          WHEN COALESCE(cs.total_stock, 0) = 0 THEN 'CRITICAL'
          WHEN (sv.avg_daily * COALESCE(sw.weight, 1.0)) > 0
            AND ROUND(
              (COALESCE(cs.total_stock, 0) + COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0))::numeric
              / (sv.avg_daily * COALESCE(sw.weight, 1.0))
            ) < 7 THEN 'CRITICAL'
          WHEN (sv.avg_daily * COALESCE(sw.weight, 1.0)) > 0
            AND ROUND(
              (COALESCE(cs.total_stock, 0) + COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0))::numeric
              / (sv.avg_daily * COALESCE(sw.weight, 1.0))
            ) < 14 THEN 'WARNING'
          ELSE 'NORMAL'
        END AS urgency
      FROM combined sv
      CROSS JOIN current_season cs2
      LEFT JOIN season_weights sw ON sw.code_value = 'SEASON_WEIGHT_' || sv.product_season || '_' || cs2.season_code
      LEFT JOIN current_stock cs ON sv.variant_id = cs.variant_id
      LEFT JOIN in_production ip ON sv.product_code = ip.product_code
      LEFT JOIN variant_count vc ON sv.product_code = vc.product_code
      LEFT JOIN pending_restocks pr ON sv.variant_id = pr.variant_id
      WHERE
        (
          CASE WHEN (sv.total_sold + COALESCE(cs.total_stock, 0)) > 0
            THEN sv.total_sold::numeric / (sv.total_sold + COALESCE(cs.total_stock, 0)) * 100
            ELSE 0 END >= ${sellThroughThreshold}
          AND GREATEST(0,
            ROUND(sv.predicted_30d * COALESCE(sw.weight, 1.0))::int
            - COALESCE(cs.total_stock, 0)
            - COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0)
            - COALESCE(pr.pending_qty, 0)
          ) > 0
        )
        OR (COALESCE(cs.total_stock, 0) = 0 AND COALESCE(pr.pending_qty, 0) = 0)
      ORDER BY
        CASE
          WHEN COALESCE(cs.total_stock, 0) = 0 THEN 0
          WHEN (sv.avg_daily * COALESCE(sw.weight, 1.0)) > 0
            THEN ROUND(
              (COALESCE(cs.total_stock, 0) + COALESCE(ROUND(ip.pending_qty::numeric / GREATEST(vc.cnt, 1)), 0))::numeric
              / (sv.avg_daily * COALESCE(sw.weight, 1.0))
            )
          ELSE 9999
        END ASC,
        shortage_qty DESC
      LIMIT 200`;
    return (await this.pool.query(sql, [salesPeriodDays])).rows;
  }

  /** 진행중인 재입고 통계 */
  async getProgressStats(partnerCode?: string) {
    const whereClause = partnerCode ? 'WHERE rr.partner_code = $1' : '';
    const params = partnerCode ? [partnerCode] : [];
    const sql = `
      SELECT
        rr.status,
        COUNT(*)::int AS count,
        COALESCE(SUM(sub.total_qty), 0)::int AS total_qty
      FROM restock_requests rr
      LEFT JOIN LATERAL (
        SELECT SUM(request_qty) AS total_qty FROM restock_request_items WHERE request_id = rr.request_id
      ) sub ON TRUE
      ${whereClause}
      GROUP BY rr.status
      ORDER BY
        CASE rr.status WHEN 'DRAFT' THEN 1 WHEN 'APPROVED' THEN 2 WHEN 'ORDERED' THEN 3 WHEN 'RECEIVED' THEN 4 WHEN 'CANCELLED' THEN 5 END`;
    return (await this.pool.query(sql, params)).rows;
  }
}

export const restockRepository = new RestockRepository();
