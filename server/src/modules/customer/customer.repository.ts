import { BaseRepository } from '../../core/base.repository';

export class CustomerRepository extends BaseRepository {
  constructor() {
    super({
      tableName: 'customers',
      primaryKey: 'customer_id',
      searchFields: ['customer_name', 'phone'],
      filterFields: ['grade', 'is_active'],
      defaultOrder: 'created_at DESC',
    });
  }

  /** 고객 구매 이력 */
  async getHistory(customerId: number) {
    const result = await this.pool.query(
      `SELECT s.*, pv.sku, pv.color, pv.size, p.product_name, pa.partner_name
       FROM sales s
       JOIN product_variants pv ON s.variant_id = pv.variant_id
       JOIN products p ON pv.product_code = p.product_code
       JOIN partners pa ON s.partner_code = pa.partner_code
       WHERE s.customer_id = $1
       ORDER BY s.sale_date DESC, s.sale_id DESC
       LIMIT 100`,
      [customerId],
    );
    return result.rows;
  }

  /** 등급 자동 계산 */
  async recalculateGrade(customerId: number) {
    const stats = await this.pool.query(
      `SELECT COALESCE(SUM(total_price), 0)::numeric AS total,
              COUNT(DISTINCT sale_date)::int AS visits
       FROM sales WHERE customer_id = $1 AND sale_type != '반품'`,
      [customerId],
    );
    const total = Number(stats.rows[0]?.total || 0);
    const visits = Number(stats.rows[0]?.visits || 0);

    let grade = 'NORMAL';
    if (total >= 5000000 || visits >= 50) grade = 'VIP';
    else if (total >= 2000000 || visits >= 30) grade = 'GOLD';
    else if (total >= 500000 || visits >= 10) grade = 'SILVER';

    await this.pool.query(
      `UPDATE customers SET grade = $1, total_purchases = $2, visit_count = $3, updated_at = NOW()
       WHERE customer_id = $4`,
      [grade, total, visits, customerId],
    );
    return { grade, total_purchases: total, visit_count: visits };
  }
}

export const customerRepository = new CustomerRepository();
