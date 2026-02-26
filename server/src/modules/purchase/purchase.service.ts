import { BaseService } from '../../core/base.service';
import { purchaseRepository } from './purchase.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { getPool } from '../../db/connection';

class PurchaseService extends BaseService {
  constructor() {
    super(purchaseRepository);
  }

  async getWithItems(id: number) {
    return purchaseRepository.getWithItems(id);
  }

  async createWithItems(header: Record<string, any>, items: Array<{ variant_id: number; order_qty: number; unit_cost: number }>) {
    return purchaseRepository.createWithItems(header, items);
  }

  /** 상태 변경 (DRAFT→CONFIRMED→SHIPPED→RECEIVED) */
  async updateStatus(id: number, newStatus: string, userId: string) {
    const po = await purchaseRepository.getById(id) as any;
    if (!po) throw new Error('발주를 찾을 수 없습니다.');

    const transitions: Record<string, string[]> = {
      DRAFT: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['RECEIVED', 'CANCELLED'],
    };
    const allowed = transitions[po.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`${po.status}에서 ${newStatus}로 변경할 수 없습니다.`);
    }

    const updates: Record<string, any> = { status: newStatus };
    if (newStatus === 'RECEIVED') updates.received_date = new Date().toISOString().slice(0, 10);

    return purchaseRepository.update(id, updates);
  }

  /** 입고 처리 (재고 증가) */
  async receiveWithInventory(poId: number, items: Array<{ item_id: number; received_qty: number }>, userId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const po = await client.query('SELECT * FROM purchase_orders WHERE po_id = $1', [poId]);
      if (po.rows.length === 0) throw new Error('발주를 찾을 수 없습니다.');
      if (po.rows[0].status !== 'SHIPPED' && po.rows[0].status !== 'CONFIRMED') {
        throw new Error('입고 가능한 상태가 아닙니다.');
      }

      const targetPartner = po.rows[0].to_partner || po.rows[0].supplier_code;

      for (const item of items) {
        if (item.received_qty <= 0) continue;
        // 발주 품목 업데이트
        const poItem = await client.query(
          `UPDATE purchase_order_items SET received_qty = received_qty + $1
           WHERE item_id = $2 RETURNING variant_id, order_qty, received_qty`,
          [item.received_qty, item.item_id],
        );
        if (poItem.rows.length === 0) continue;

        // 재고 증가
        await inventoryRepository.applyChange(
          targetPartner, poItem.rows[0].variant_id, item.received_qty,
          'PURCHASE', poId, userId, client,
        );
      }

      // 전체 수령 완료 확인
      const allReceived = await client.query(
        `SELECT BOOL_AND(received_qty >= order_qty) AS all_done FROM purchase_order_items WHERE po_id = $1`,
        [poId],
      );
      if (allReceived.rows[0]?.all_done) {
        await client.query(
          `UPDATE purchase_orders SET status = 'RECEIVED', received_date = CURRENT_DATE, updated_at = NOW() WHERE po_id = $1`,
          [poId],
        );
      } else {
        await client.query(
          `UPDATE purchase_orders SET status = 'SHIPPED', updated_at = NOW() WHERE po_id = $1`,
          [poId],
        );
      }

      await client.query('COMMIT');
      return purchaseRepository.getWithItems(poId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const purchaseService = new PurchaseService();
