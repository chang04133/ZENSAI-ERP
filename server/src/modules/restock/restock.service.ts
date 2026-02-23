import { BaseService } from '../../core/base.service';
import { RestockRequest } from '../../../../shared/types/restock';
import { restockRepository } from './restock.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { getPool } from '../../db/connection';

class RestockService extends BaseService<RestockRequest> {
  constructor() {
    super(restockRepository);
  }

  async generateNo() { return restockRepository.generateNo(); }
  async getWithItems(id: number) { return restockRepository.getWithItems(id); }
  async createWithItems(headerData: Record<string, any>, items: any[]) {
    return restockRepository.createWithItems(headerData, items);
  }
  async getSellingVelocity(partnerCode?: string) {
    return restockRepository.getSellingVelocity(partnerCode);
  }
  async getRestockSuggestions() {
    return restockRepository.getRestockSuggestions();
  }
  async getProgressStats(partnerCode?: string) {
    return restockRepository.getProgressStats(partnerCode);
  }

  /** 상태 변경 + RECEIVED 시 재고 자동 증가 */
  async updateWithInventory(id: number, data: Record<string, any>, userId: string): Promise<RestockRequest | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT * FROM restock_requests WHERE request_id = $1', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('재입고 의뢰를 찾을 수 없습니다');
      const current = currentResult.rows[0];
      const oldStatus = current.status;
      const newStatus = data.status || oldStatus;

      // 헤더 업데이트
      const sets: string[] = ['updated_at = NOW()'];
      const vals: any[] = [];
      let idx = 1;
      if (data.status) { sets.push(`status = $${idx++}`); vals.push(data.status); }
      if (data.expected_date !== undefined) { sets.push(`expected_date = $${idx++}`); vals.push(data.expected_date); }
      if (data.received_date !== undefined) { sets.push(`received_date = $${idx++}`); vals.push(data.received_date); }
      if (data.memo !== undefined) { sets.push(`memo = $${idx++}`); vals.push(data.memo); }
      if (data.status === 'APPROVED') { sets.push(`approved_by = $${idx++}`); vals.push(userId); }
      vals.push(id);
      await client.query(`UPDATE restock_requests SET ${sets.join(', ')} WHERE request_id = $${idx}`, vals);

      // RECEIVED 전환 시: 재고 자동 증가
      if (oldStatus !== 'RECEIVED' && newStatus === 'RECEIVED') {
        const items = await client.query(
          'SELECT variant_id, received_qty FROM restock_request_items WHERE request_id = $1', [id],
        );
        for (const item of items.rows) {
          if (item.received_qty > 0) {
            await inventoryRepository.applyChange(
              current.partner_code, item.variant_id, item.received_qty,
              'RESTOCK', id, userId, client,
            );
          }
        }
        // received_date 자동 설정
        if (!data.received_date) {
          await client.query(
            'UPDATE restock_requests SET received_date = CURRENT_DATE WHERE request_id = $1', [id],
          );
        }
      }

      await client.query('COMMIT');
      return restockRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 수령확인: received_qty 저장 + RECEIVED + 재고 연동 (단일 트랜잭션) */
  async receive(id: number, items: Array<{ item_id: number; received_qty: number }>, userId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 현재 상태 확인
      const currentResult = await client.query(
        'SELECT * FROM restock_requests WHERE request_id = $1', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('재입고 의뢰를 찾을 수 없습니다');
      const current = currentResult.rows[0];
      if (current.status !== 'ORDERED') throw new Error('발주(ORDERED) 상태에서만 수령확인이 가능합니다');

      // 1) received_qty 업데이트
      for (const item of items) {
        await client.query(
          'UPDATE restock_request_items SET received_qty = $1 WHERE item_id = $2 AND request_id = $3',
          [item.received_qty, item.item_id, id],
        );
      }

      // 2) 상태를 RECEIVED로 전환
      await client.query(
        `UPDATE restock_requests SET status = 'RECEIVED', received_date = CURRENT_DATE, updated_at = NOW() WHERE request_id = $1`,
        [id],
      );

      // 3) 재고 자동 증가: received_qty > 0인 아이템
      const allItems = await client.query(
        'SELECT item_id, variant_id, received_qty FROM restock_request_items WHERE request_id = $1', [id],
      );
      for (const row of allItems.rows) {
        if (row.received_qty > 0) {
          await inventoryRepository.applyChange(
            current.partner_code, row.variant_id, row.received_qty,
            'RESTOCK', id, userId, client,
          );
        }
      }

      await client.query('COMMIT');
      return restockRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const restockService = new RestockService();
