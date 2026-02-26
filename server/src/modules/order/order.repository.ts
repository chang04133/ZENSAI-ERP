import { BaseRepository } from '../../core/base.repository';
import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

export class OrderRepository extends BaseRepository {
  constructor() {
    super({
      tableName: 'orders',
      primaryKey: 'order_id',
      searchFields: ['order_no'],
      filterFields: ['status', 'partner_code', 'customer_id'],
      tableAlias: 'o',
      defaultOrder: 'o.created_at DESC',
    });
  }

  async list(options: any = {}) {
    const { page = 1, limit = 20, search, status, partner_code, customer_id } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('o');
    if (search) qb.search(['order_no'], search);
    if (status) qb.eq('status', status);
    if (partner_code) qb.eq('partner_code', partner_code);
    if (customer_id) qb.eq('customer_id', customer_id);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM orders o ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT o.*, c.customer_name, p.partner_name,
        (SELECT COALESCE(SUM(oi.qty), 0)::int FROM order_items oi WHERE oi.order_id = o.order_id) AS total_qty,
        (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN partners p ON o.partner_code = p.partner_code
      ${whereClause} ORDER BY o.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async generateNo(): Promise<string> {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const result = await this.pool.query(
      `SELECT COUNT(*)::int + 1 AS seq FROM orders WHERE order_no LIKE $1`,
      [`OD${dateStr}%`],
    );
    const seq = String(result.rows[0].seq).padStart(3, '0');
    return `OD${dateStr}${seq}`;
  }

  async getWithItems(id: number) {
    const order = await this.pool.query(
      `SELECT o.*, c.customer_name, p.partner_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.customer_id
       LEFT JOIN partners p ON o.partner_code = p.partner_code
       WHERE o.order_id = $1`, [id],
    );
    if (order.rows.length === 0) return null;
    const items = await this.pool.query(
      `SELECT oi.*, pv.sku, pv.color, pv.size, pr.product_name
       FROM order_items oi
       JOIN product_variants pv ON oi.variant_id = pv.variant_id
       JOIN products pr ON pv.product_code = pr.product_code
       WHERE oi.order_id = $1 ORDER BY oi.item_id`, [id],
    );
    return { ...order.rows[0], items: items.rows };
  }

  async createWithItems(
    header: Record<string, any>,
    items: Array<{ variant_id: number; qty: number; unit_price: number }>,
  ) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderNo = await this.generateNo();
      let totalAmount = 0;
      for (const item of items) totalAmount += item.qty * item.unit_price;

      const order = await client.query(
        `INSERT INTO orders (order_no, customer_id, partner_code, status, order_date, total_amount, memo, created_by)
         VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7) RETURNING *`,
        [orderNo, header.customer_id || null, header.partner_code, header.order_date || new Date().toISOString().slice(0, 10),
         totalAmount, header.memo || null, header.created_by],
      );
      const orderId = order.rows[0].order_id;
      for (const item of items) {
        const totalPrice = item.qty * item.unit_price;
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, qty, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.variant_id, item.qty, item.unit_price, totalPrice],
        );
      }
      await client.query('COMMIT');
      return this.getWithItems(orderId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const orderRepository = new OrderRepository();
