import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

const COMBINED_CTE = `combined AS (
  SELECT sale_id, sale_date, partner_code, variant_id, qty, unit_price, total_price,
         COALESCE(sale_type, '정상') AS sale_type, memo, customer_id, tax_free, tax_free_amount,
         return_reason, shipment_request_id, sale_number, created_at, updated_at, 'sale' AS source
  FROM sales
  UNION ALL
  SELECT preorder_id, preorder_date, partner_code, variant_id, qty, unit_price, total_price,
         '예약판매', memo, customer_id, FALSE, 0,
         NULL, NULL, NULL AS sale_number, created_at, updated_at, 'preorder' AS source
  FROM preorders WHERE status = '대기'
)`;

export class SalesCrudRepository {
  private pool = getPool();

  async listWithDetails(options: any = {}) {
    const { page = 1, limit = 20, partner_code, search, date_from, date_to, exclude_type } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('s');
    if (partner_code) qb.eq('partner_code', partner_code);
    if (date_from) qb.raw('s.sale_date >= ?', date_from);
    if (date_to) qb.raw('s.sale_date <= ?', date_to);
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ?)', `%${search}%`, `%${search}%`);
    if (exclude_type) {
      const types = String(exclude_type).split(',').map(t => t.trim()).filter(Boolean);
      if (types.length === 1) {
        qb.raw("COALESCE(s.sale_type, '정상') != ?", types[0]);
      } else if (types.length > 1) {
        qb.raw(`COALESCE(s.sale_type, '정상') NOT IN (${types.map(() => '?').join(',')})`, ...types);
      }
    }
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `
      WITH ${COMBINED_CTE}
      SELECT COUNT(*) FROM combined s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      WITH ${COMBINED_CTE}
      SELECT s.*, pt.partner_name, pv.sku, pv.color, pv.size, p.product_code, p.product_name
      FROM combined s
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
