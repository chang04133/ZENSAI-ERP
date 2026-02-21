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

  /** 재입고 제안 목록 */
  async getRestockSuggestions(partnerCode?: string): Promise<any[]> {
    const lowR = await this.pool.query(
      "SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'LOW_STOCK_THRESHOLD'",
    );
    const medR = await this.pool.query(
      "SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'MEDIUM_STOCK_THRESHOLD'",
    );
    const lowT = parseInt(lowR.rows[0]?.code_label, 10) || 5;
    const medT = parseInt(medR.rows[0]?.code_label, 10) || 10;

    const partnerFilter = partnerCode ? 'AND i.partner_code = $3' : '';
    const params: any[] = [lowT, medT];
    if (partnerCode) params.push(partnerCode);

    const sql = `
      WITH sales_7d AS (
        SELECT t.partner_code, t.variant_id, COALESCE(SUM(-t.qty_change), 0)::int AS sold_7d
        FROM inventory_transactions t
        WHERE t.tx_type = 'SALE' AND t.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY t.partner_code, t.variant_id
      ),
      sales_30d AS (
        SELECT t.partner_code, t.variant_id, COALESCE(SUM(-t.qty_change), 0)::int AS sold_30d
        FROM inventory_transactions t
        WHERE t.tx_type = 'SALE' AND t.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY t.partner_code, t.variant_id
      )
      SELECT
        i.variant_id, i.partner_code, pt.partner_name,
        pv.sku, p.product_name, pv.color, pv.size,
        i.qty::int AS current_qty,
        COALESCE(p.low_stock_threshold, $1)::int AS low_threshold,
        COALESCE(p.medium_stock_threshold, $2)::int AS medium_threshold,
        CASE
          WHEN i.qty = 0 THEN 'ZERO'
          WHEN i.qty <= COALESCE(p.low_stock_threshold, $1) THEN 'LOW'
          ELSE 'MEDIUM'
        END AS alert_level,
        COALESCE(s7.sold_7d, 0)::int AS sold_7d,
        COALESCE(s30.sold_30d, 0)::int AS sold_30d,
        ROUND(COALESCE(s7.sold_7d, 0) / 7.0, 2)::float AS avg_daily_7d,
        GREATEST(5, CEIL((COALESCE(s7.sold_7d, 0) / 7.0) * 30))::int AS suggested_qty
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code
      LEFT JOIN sales_7d s7 ON i.partner_code = s7.partner_code AND i.variant_id = s7.variant_id
      LEFT JOIN sales_30d s30 ON i.partner_code = s30.partner_code AND i.variant_id = s30.variant_id
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND p.low_stock_alert = TRUE
        AND i.qty <= COALESCE(p.medium_stock_threshold, $2)
        ${partnerFilter}
      ORDER BY
        CASE WHEN i.qty = 0 THEN 1 WHEN i.qty <= COALESCE(p.low_stock_threshold, $1) THEN 2 ELSE 3 END,
        COALESCE(s7.sold_7d, 0) DESC
      LIMIT 200`;
    return (await this.pool.query(sql, params)).rows;
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
