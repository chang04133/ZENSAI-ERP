import { BaseRepository } from '../../core/base.repository';
import { ShipmentRequest } from '../../../../shared/types/shipment';
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
    const { search, request_type, status, exclude_status, from_partner, to_partner, partner, direction, date_from, date_to } = options;
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const qb = new QueryBuilder('sr');
    if (search) {
      // request_no 직접 검색 + 상품명/SKU 서브쿼리 검색
      qb.raw(
        `(sr.request_no ILIKE ? OR EXISTS (
          SELECT 1 FROM shipment_request_items si2
          JOIN product_variants pv2 ON si2.variant_id = pv2.variant_id
          JOIN products p2 ON pv2.product_code = p2.product_code
          WHERE si2.request_id = sr.request_id
          AND (p2.product_name ILIKE ? OR pv2.sku ILIKE ? OR p2.product_code ILIKE ?)
        ))`,
        `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`,
      );
    }
    if (request_type) {
      if (request_type.includes(',')) {
        const arr = request_type.split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`sr.request_type IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.eq('request_type', request_type);
      }
    }
    if (status) {
      if (status.includes(',')) {
        const arr = status.split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`sr.status IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.eq('status', status);
      }
    }
    if (!status && exclude_status) qb.notIn('status', exclude_status);
    if (from_partner) qb.eq('from_partner', from_partner);
    if (to_partner) qb.eq('to_partner', to_partner);
    // 매장 사용자: direction으로 발신/수신 구분 가능
    if (partner && direction === 'from') {
      qb.eq('from_partner', partner);
    } else if (partner && direction === 'to') {
      qb.eq('to_partner', partner);
    } else if (partner) {
      qb.raw('(sr.from_partner = ? OR sr.to_partner = ? OR (sr.target_partners IS NOT NULL AND sr.from_partner IS NULL AND ? = ANY(string_to_array(sr.target_partners, \',\'))))', partner, partner, partner);
    }
    if (date_from || date_to) qb.dateRange('request_date', date_from, date_to);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM shipment_requests sr ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT sr.*, fp.partner_name as from_partner_name, tp.partner_name as to_partner_name,
        COALESCE(agg.item_count, 0)::int as item_count,
        COALESCE(agg.total_request_qty, 0)::int as total_request_qty,
        COALESCE(agg.total_shipped_qty, 0)::int as total_shipped_qty,
        COALESCE(agg.total_received_qty, 0)::int as total_received_qty,
        agg.item_summary
      FROM shipment_requests sr
      LEFT JOIN partners fp ON sr.from_partner = fp.partner_code
      LEFT JOIN partners tp ON sr.to_partner = tp.partner_code
      LEFT JOIN (
        SELECT si.request_id,
          COUNT(*) as item_count,
          SUM(si.request_qty) as total_request_qty,
          SUM(si.shipped_qty) as total_shipped_qty,
          SUM(si.received_qty) as total_received_qty,
          STRING_AGG(DISTINCT p.product_name, ', ') as item_summary
        FROM shipment_request_items si
        JOIN product_variants pv ON si.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        GROUP BY si.request_id
      ) agg ON agg.request_id = sr.request_id
      ${whereClause} ORDER BY sr.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, limit, offset]);
    return { data: data.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async generateNo(client?: any): Promise<string> {
    const conn = client || this.pool;
    const result = await conn.query('SELECT generate_shipment_no() as no');
    return result.rows[0].no;
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

  async summary(options: { partner?: string } = {}) {
    const { partner } = options;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    // partner가 있으면 방향별 카운트도 함께 반환
    const directionCols = partner
      ? `,
        COUNT(*) FILTER (WHERE sr.from_partner = $${idx})::int as as_from_count,
        COUNT(*) FILTER (WHERE sr.to_partner = $${idx})::int as as_to_count`
      : '';
    if (partner) {
      conditions.push(`(sr.from_partner = $${idx} OR sr.to_partner = $${idx + 1} OR (sr.target_partners IS NOT NULL AND sr.from_partner IS NULL AND $${idx + 2} = ANY(string_to_array(sr.target_partners, ','))))`);
      params.push(partner, partner, partner);
      idx += 3;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT sr.status, sr.request_type,
        COUNT(*)::int as count,
        COALESCE(SUM(CASE WHEN sr.status NOT IN ('CANCELLED','REJECTED') THEN agg.total_request_qty ELSE 0 END), 0)::int as total_request_qty,
        COALESCE(SUM(CASE WHEN sr.status NOT IN ('CANCELLED','REJECTED') THEN agg.total_shipped_qty ELSE 0 END), 0)::int as total_shipped_qty
        ${directionCols}
      FROM shipment_requests sr
      LEFT JOIN (
        SELECT request_id,
          SUM(request_qty) as total_request_qty,
          SUM(shipped_qty) as total_shipped_qty
        FROM shipment_request_items
        GROUP BY request_id
      ) agg ON agg.request_id = sr.request_id
      ${whereClause}
      GROUP BY sr.status, sr.request_type
      ORDER BY sr.status, sr.request_type`;
    const result = await this.pool.query(sql, params);
    return result.rows;
  }
}

export const shipmentRepository = new ShipmentRepository();
