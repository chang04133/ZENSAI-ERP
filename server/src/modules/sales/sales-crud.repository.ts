import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

export class SalesCrudRepository {
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
}

export const salesCrudRepository = new SalesCrudRepository();
