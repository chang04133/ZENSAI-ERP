import { BaseService } from '../../core/base.service';
import { orderRepository } from './order.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { getPool } from '../../db/connection';

class OrderService extends BaseService {
  constructor() {
    super(orderRepository);
  }

  async getWithItems(id: number) {
    return orderRepository.getWithItems(id);
  }

  async createWithItems(header: Record<string, any>, items: Array<{ variant_id: number; qty: number; unit_price: number }>) {
    return orderRepository.createWithItems(header, items);
  }

  /** 주문 완료 → 매출 전환 + 재고 차감 */
  async completeOrder(orderId: number, userId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const order = await client.query(
        `SELECT o.*, c.customer_id FROM orders o LEFT JOIN customers c ON o.customer_id = c.customer_id WHERE o.order_id = $1`, [orderId],
      );
      if (order.rows.length === 0) throw new Error('주문을 찾을 수 없습니다.');
      const o = order.rows[0];
      if (o.status === 'COMPLETED') throw new Error('이미 완료된 주문입니다.');
      if (o.status === 'CANCELLED') throw new Error('취소된 주문은 완료할 수 없습니다.');

      const items = await client.query(
        `SELECT * FROM order_items WHERE order_id = $1`, [orderId],
      );

      // 매출 생성 + 재고 차감
      for (const item of items.rows) {
        const sale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, customer_id, order_id, memo)
           VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '정상', $6, $7, $8) RETURNING *`,
          [o.partner_code, item.variant_id, item.qty, item.unit_price, item.total_price,
           o.customer_id || null, orderId, `주문#${o.order_no}`],
        );
        await inventoryRepository.applyChange(
          o.partner_code, item.variant_id, -item.qty, 'SALE', sale.rows[0].sale_id, userId, client,
        );
      }

      // 주문 상태 변경
      await client.query(
        `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE order_id = $1`, [orderId],
      );

      await client.query('COMMIT');
      return orderRepository.getWithItems(orderId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 상태 변경 */
  async updateStatus(id: number, newStatus: string) {
    const order = await orderRepository.getById(id) as any;
    if (!order) throw new Error('주문을 찾을 수 없습니다.');

    const transitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['COMPLETED', 'CANCELLED'],
    };
    const allowed = transitions[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`${order.status}에서 ${newStatus}로 변경할 수 없습니다.`);
    }
    return orderRepository.update(id, { status: newStatus });
  }
}

export const orderService = new OrderService();
