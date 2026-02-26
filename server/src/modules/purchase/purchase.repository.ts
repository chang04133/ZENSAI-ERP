import { BaseRepository } from '../../core/base.repository';
import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';

export class PurchaseRepository extends BaseRepository {
  constructor() {
    super({
      tableName: 'purchase_orders',
      primaryKey: 'po_id',
      searchFields: ['po_no'],
      filterFields: ['status', 'supplier_code'],
      tableAlias: 'po',
      defaultOrder: 'po.created_at DESC',
    });
  }

  async list(options: any = {}) {
    const { page = 1, limit = 20, search, status, supplier_code } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('po');
    if (search) qb.search(['po_no'], search);
    if (status) qb.eq('status', status);
    if (supplier_code) qb.eq('supplier_code', supplier_code);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM purchase_orders po ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT po.*, sp.partner_name AS supplier_name, tp.partner_name AS to_partner_name,
        (SELECT COALESCE(SUM(poi.order_qty), 0)::int FROM purchase_order_items poi WHERE poi.po_id = po.po_id) AS total_qty,
        (SELECT COUNT(*)::int FROM purchase_order_items poi WHERE poi.po_id = po.po_id) AS item_count
      FROM purchase_orders po
      LEFT JOIN partners sp ON po.supplier_code = sp.partner_code
      LEFT JOIN partners tp ON po.to_partner = tp.partner_code
      ${whereClause} ORDER BY po.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async generateNo(): Promise<string> {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const result = await this.pool.query(
      `SELECT COUNT(*)::int + 1 AS seq FROM purchase_orders WHERE po_no LIKE $1`,
      [`PO${dateStr}%`],
    );
    const seq = String(result.rows[0].seq).padStart(3, '0');
    return `PO${dateStr}${seq}`;
  }

  async getWithItems(id: number) {
    const po = await this.pool.query(
      `SELECT po.*, sp.partner_name AS supplier_name, tp.partner_name AS to_partner_name
       FROM purchase_orders po
       LEFT JOIN partners sp ON po.supplier_code = sp.partner_code
       LEFT JOIN partners tp ON po.to_partner = tp.partner_code
       WHERE po.po_id = $1`, [id],
    );
    if (po.rows.length === 0) return null;
    const items = await this.pool.query(
      `SELECT poi.*, pv.sku, pv.color, pv.size, p.product_name
       FROM purchase_order_items poi
       JOIN product_variants pv ON poi.variant_id = pv.variant_id
       JOIN products p ON pv.product_code = p.product_code
       WHERE poi.po_id = $1 ORDER BY poi.item_id`, [id],
    );
    return { ...po.rows[0], items: items.rows };
  }

  async createWithItems(
    header: Record<string, any>,
    items: Array<{ variant_id: number; order_qty: number; unit_cost: number }>,
  ) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const poNo = await this.generateNo();
      let totalAmount = 0;
      for (const item of items) totalAmount += item.order_qty * item.unit_cost;

      const po = await client.query(
        `INSERT INTO purchase_orders (po_no, supplier_code, to_partner, status, order_date, expected_date, total_amount, memo, created_by)
         VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8) RETURNING *`,
        [poNo, header.supplier_code, header.to_partner || null, header.order_date || new Date().toISOString().slice(0, 10),
         header.expected_date || null, totalAmount, header.memo || null, header.created_by],
      );
      const poId = po.rows[0].po_id;
      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_order_items (po_id, variant_id, order_qty, unit_cost)
           VALUES ($1, $2, $3, $4)`,
          [poId, item.variant_id, item.order_qty, item.unit_cost],
        );
      }
      await client.query('COMMIT');
      return this.getWithItems(poId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const purchaseRepository = new PurchaseRepository();
