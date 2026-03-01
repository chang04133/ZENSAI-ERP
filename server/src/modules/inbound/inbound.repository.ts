import { BaseRepository } from '../../core/base.repository';
import { InboundRecord } from '../../../../shared/types/inbound';
import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';
import { inventoryRepository } from '../inventory/inventory.repository';

export class InboundRepository extends BaseRepository<InboundRecord> {
  constructor() {
    super({
      tableName: 'inbound_records',
      primaryKey: 'record_id',
      searchFields: ['inbound_no'],
      filterFields: ['partner_code'],
      tableAlias: 'ir',
      defaultOrder: 'ir.created_at DESC',
    });
  }

  async list(options: any = {}) {
    const { page = 1, limit = 20, search, partner_code, date_from, date_to } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('ir');
    if (search) qb.search(['inbound_no'], search);
    if (partner_code) qb.eq('partner_code', partner_code);
    if (date_from) qb.raw('ir.inbound_date >= ?', date_from);
    if (date_to) qb.raw('ir.inbound_date <= ?', date_to);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM inbound_records ir ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT ir.*, p.partner_name,
        (SELECT COALESCE(SUM(ii.qty),0)::int FROM inbound_items ii WHERE ii.record_id = ir.record_id) AS total_qty,
        (SELECT COUNT(*)::int FROM inbound_items ii WHERE ii.record_id = ir.record_id) AS item_count
      FROM inbound_records ir
      LEFT JOIN partners p ON ir.partner_code = p.partner_code
      ${whereClause} ORDER BY ir.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async generateNo(): Promise<string> {
    const result = await this.pool.query('SELECT generate_inbound_no() as no');
    return result.rows[0].no;
  }

  async getWithItems(id: number): Promise<InboundRecord | null> {
    const rec = await this.pool.query(
      `SELECT ir.*, p.partner_name
       FROM inbound_records ir
       LEFT JOIN partners p ON ir.partner_code = p.partner_code
       WHERE ir.record_id = $1`, [id]);
    if (rec.rows.length === 0) return null;
    const items = await this.pool.query(
      `SELECT ii.*, pv.sku, pv.color, pv.size, pr.product_name, pr.product_code
       FROM inbound_items ii
       JOIN product_variants pv ON ii.variant_id = pv.variant_id
       JOIN products pr ON pv.product_code = pr.product_code
       WHERE ii.record_id = $1
       ORDER BY ii.item_id`, [id]);
    return { ...rec.rows[0], items: items.rows };
  }

  async createWithItems(
    headerData: Record<string, any>,
    items: Array<{ variant_id: number; qty: number; unit_price?: number; memo?: string }>,
  ): Promise<InboundRecord | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inboundNo = await this.generateNo();
      const header = await client.query(
        `INSERT INTO inbound_records
         (inbound_no, inbound_date, partner_code, memo, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [inboundNo, headerData.inbound_date || new Date().toISOString().slice(0, 10),
         headerData.partner_code, headerData.memo || null, headerData.created_by],
      );
      const recordId = header.rows[0].record_id;

      for (const item of items) {
        await client.query(
          `INSERT INTO inbound_items (record_id, variant_id, qty, unit_price, memo)
           VALUES ($1, $2, $3, $4, $5)`,
          [recordId, item.variant_id, item.qty, item.unit_price || null, item.memo || null],
        );
        // 재고 즉시 반영
        await inventoryRepository.applyChange(
          headerData.partner_code, item.variant_id, item.qty,
          'INBOUND', recordId, headerData.created_by, client,
        );
      }

      await client.query('COMMIT');
      return this.getWithItems(recordId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteWithRollback(id: number, userId: string): Promise<boolean> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rec = await client.query(
        'SELECT * FROM inbound_records WHERE record_id = $1', [id],
      );
      if (rec.rows.length === 0) throw new Error('입고 기록을 찾을 수 없습니다');
      const record = rec.rows[0];

      // 아이템별 재고 원복 (역방향 수량)
      const items = await client.query(
        'SELECT * FROM inbound_items WHERE record_id = $1', [id],
      );
      for (const item of items.rows) {
        await inventoryRepository.applyChange(
          record.partner_code, item.variant_id, -item.qty,
          'INBOUND', id, userId, client,
        );
      }

      await client.query('DELETE FROM inbound_records WHERE record_id = $1', [id]);
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const inboundRepository = new InboundRepository();
