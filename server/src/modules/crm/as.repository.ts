import { getPool } from '../../db/connection';

class AsRepository {
  private get pool() { return getPool(); }

  async list(options: any = {}) {
    const { page = 1, limit: rawLimit = 50, service_type, status, partner_code, customer_id, search } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const params: any[] = [];
    const clauses: string[] = [];
    let idx = 1;
    if (service_type) { clauses.push(`a.service_type = $${idx++}`); params.push(service_type); }
    if (status) { clauses.push(`a.status = $${idx++}`); params.push(status); }
    if (partner_code) { clauses.push(`a.partner_code = $${idx++}`); params.push(partner_code); }
    if (customer_id) { clauses.push(`a.customer_id = $${idx++}`); params.push(Number(customer_id)); }
    if (search) { clauses.push(`(c.customer_name ILIKE $${idx} OR a.product_name ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const base = `FROM after_sales_services a JOIN customers c ON a.customer_id = c.customer_id LEFT JOIN partners pt ON a.partner_code = pt.partner_code ${where}`;
    const total = parseInt((await this.pool.query(`SELECT COUNT(*)::int AS cnt ${base}`, params)).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT a.*, c.customer_name, pt.partner_name ${base} ORDER BY a.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset])).rows;
    return { data, total, page, limit };
  }

  async getById(id: number) {
    return (await this.pool.query(
      `SELECT a.*, c.customer_name, pt.partner_name FROM after_sales_services a JOIN customers c ON a.customer_id = c.customer_id LEFT JOIN partners pt ON a.partner_code = pt.partner_code WHERE a.service_id = $1`, [id])).rows[0] || null;
  }

  async create(data: any) {
    return (await this.pool.query(
      `INSERT INTO after_sales_services (customer_id, partner_code, service_type, status, product_name, variant_info, description, received_date, created_by, variant_id, unit_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [data.customer_id, data.partner_code, data.service_type, data.status || '접수', data.product_name || null, data.variant_info || null, data.description || null, data.received_date || new Date().toISOString().slice(0, 10), data.created_by || null, data.variant_id || null, data.unit_price || null])).rows[0];
  }

  async update(id: number, data: any) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const key of ['service_type', 'status', 'product_name', 'variant_info', 'description', 'resolution', 'received_date', 'completed_date', 'variant_id', 'unit_price', 'return_sale_id', 'shipment_request_id']) {
      if (data[key] !== undefined) { sets.push(`${key} = $${idx++}`); params.push(data[key]); }
    }
    if (!sets.length) return this.getById(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    return (await this.pool.query(`UPDATE after_sales_services SET ${sets.join(', ')} WHERE service_id = $${idx} RETURNING *`, params)).rows[0];
  }

  async delete(id: number) {
    await this.pool.query('DELETE FROM after_sales_services WHERE service_id = $1', [id]);
  }

  async getStats(partnerCode?: string) {
    const params: any[] = [];
    const clauses: string[] = [];
    if (partnerCode) { params.push(partnerCode); clauses.push(`partner_code = $1`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const openWhere = clauses.length
      ? `WHERE ${clauses.join(' AND ')} AND status IN ('접수','진행')`
      : `WHERE status IN ('접수','진행')`;
    const [byStatus, byTypeOpen] = await Promise.all([
      this.pool.query(`SELECT status, COUNT(*)::int AS count FROM after_sales_services ${where} GROUP BY status`, params),
      this.pool.query(`SELECT service_type, COUNT(*)::int AS count FROM after_sales_services ${openWhere} GROUP BY service_type`, params),
    ]);
    const openCount = byStatus.rows.filter((r: any) => r.status === '접수' || r.status === '진행').reduce((sum: number, r: any) => sum + r.count, 0);
    return { byStatus: byStatus.rows, byType: byTypeOpen.rows, openCount };
  }
}

export const asRepository = new AsRepository();
