import { BaseRepository } from '../../core/base.repository';
import { ShipmentRequest } from '../../../../shared/types/shipment';
import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

export class ShipmentRepository extends BaseRepository<ShipmentRequest> {
  constructor() {
    super({
      tableName: 'shipment_requests',
      primaryKey: 'request_id',
      searchFields: ['request_no'],
      filterFields: ['request_type', 'status'],
      tableAlias: 'sr',
      defaultOrder: 'sr.created_at DESC',
    });
  }

  async list(options: any = {}) {
    const { page = 1, limit = 20, search, request_type, status, from_partner, to_partner, partner } = options;
    const offset = (page - 1) * limit;
    const qb = new QueryBuilder('sr');
    if (search) qb.search(['request_no'], search);
    if (request_type) qb.eq('request_type', request_type);
    if (status) qb.eq('status', status);
    if (from_partner) qb.eq('from_partner', from_partner);
    if (to_partner) qb.eq('to_partner', to_partner);
    // 매장 사용자: 출발 또는 도착이 자기 매장인 건만
    if (partner) qb.raw('(sr.from_partner = ? OR sr.to_partner = ?)', partner, partner);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM shipment_requests sr ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT sr.*, fp.partner_name as from_partner_name, tp.partner_name as to_partner_name
      FROM shipment_requests sr
      LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
      LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
      ${whereClause} ORDER BY sr.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, limit, offset]);
    return { data: data.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async generateNo(): Promise<string> {
    const result = await this.pool.query('SELECT generate_shipment_no() as no');
    return result.rows[0].no;
  }

  async createWithItems(headerData: Record<string, any>, items: Array<{ variant_id: number; request_qty: number }>): Promise<ShipmentRequest | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const requestNo = await this.generateNo();
      const header = await client.query(
        `INSERT INTO shipment_requests
         (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, 'PENDING', $5, $6)
         RETURNING *`,
        [requestNo, headerData.from_partner, headerData.to_partner || null,
         headerData.request_type, headerData.memo || null, headerData.requested_by],
      );
      const requestId = header.rows[0].request_id;
      for (const item of items) {
        await client.query(
          `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
           VALUES ($1, $2, $3, 0, 0)`,
          [requestId, item.variant_id, item.request_qty],
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

  async getWithItems(id: number): Promise<ShipmentRequest | null> {
    const req = await this.pool.query(
      `SELECT sr.*, fp.partner_name as from_partner_name, tp.partner_name as to_partner_name
       FROM shipment_requests sr
       LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
       LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
       WHERE sr.request_id = $1`, [id]);
    if (req.rows.length === 0) return null;
    const items = await this.pool.query(
      `SELECT si.*, pv.sku, pv.color, pv.size, p.product_name
       FROM shipment_request_items si
       JOIN product_variants pv ON si.variant_id = pv.variant_id
       JOIN products p ON pv.product_code = p.product_code
       WHERE si.request_id = $1`, [id]);
    return { ...req.rows[0], items: items.rows };
  }
}

export const shipmentRepository = new ShipmentRepository();
