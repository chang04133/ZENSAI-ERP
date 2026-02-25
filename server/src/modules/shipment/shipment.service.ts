import { BaseService } from '../../core/base.service';
import { ShipmentRequest } from '../../../../shared/types/shipment';
import { shipmentRepository } from './shipment.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { getPool } from '../../db/connection';
import { createNotification } from '../../core/notify';

class ShipmentService extends BaseService<ShipmentRequest> {
  constructor() {
    super(shipmentRepository);
  }

  async generateNo() { return shipmentRepository.generateNo(); }
  async getWithItems(id: number) { return shipmentRepository.getWithItems(id); }

  async createWithItems(headerData: Record<string, any>, items: Array<{ variant_id: number; request_qty: number }>) {
    return shipmentRepository.createWithItems(headerData, items);
  }

  /** 허용되는 상태 전환 정의 */
  private static ALLOWED_TRANSITIONS: Record<string, string[]> = {
    PENDING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['CANCELLED'],
    CANCELLED: [],
  };

  /** 상태 변경 시 재고 자동 연동 */
  async updateWithInventory(id: number, data: Record<string, any>, userId: string): Promise<ShipmentRequest | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT * FROM shipment_requests WHERE request_id = $1', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('출고의뢰를 찾을 수 없습니다');
      const current = currentResult.rows[0];
      const oldStatus = current.status;
      const newStatus = data.status || oldStatus;

      // 상태 전환 검증
      if (oldStatus !== newStatus) {
        const allowed = ShipmentService.ALLOWED_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(newStatus)) {
          throw new Error(`상태를 ${oldStatus}에서 ${newStatus}(으)로 변경할 수 없습니다.`);
        }
      }

      const approvedBy = data.approved_by;

      // 상태 및 기타 필드 업데이트
      await client.query(
        `UPDATE shipment_requests
         SET status = COALESCE($1, status),
             memo = COALESCE($2, memo),
             approved_by = COALESCE($3, approved_by),
             updated_at = NOW()
         WHERE request_id = $4`,
        [data.status, data.memo, approvedBy, id],
      );

      const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER' };
      const txType = txTypeMap[current.request_type] || 'SHIPMENT';

      // SHIPPED 전환 시: from_partner 재고 차감
      if (oldStatus !== 'SHIPPED' && newStatus === 'SHIPPED' && current.from_partner) {
        const items = await client.query(
          'SELECT variant_id, shipped_qty FROM shipment_request_items WHERE request_id = $1', [id],
        );
        for (const item of items.rows) {
          if (item.shipped_qty > 0) {
            await inventoryRepository.applyChange(
              current.from_partner, item.variant_id, -item.shipped_qty,
              txType, id, userId, client,
            );
          }
        }
      }

      // RECEIVED 전환 시: to_partner 재고 증가
      if (oldStatus !== 'RECEIVED' && newStatus === 'RECEIVED' && current.to_partner) {
        const items = await client.query(
          'SELECT variant_id, received_qty FROM shipment_request_items WHERE request_id = $1', [id],
        );
        for (const item of items.rows) {
          if (item.received_qty > 0) {
            await inventoryRepository.applyChange(
              current.to_partner, item.variant_id, item.received_qty,
              txType, id, userId, client,
            );
          }
        }
      }

      // CANCELLED 전환 시: 이전 재고 변동 롤백
      if (oldStatus !== 'CANCELLED' && newStatus === 'CANCELLED') {
        const items = await client.query(
          'SELECT variant_id, shipped_qty, received_qty FROM shipment_request_items WHERE request_id = $1', [id],
        );
        // RECEIVED 상태였으면 to_partner에서 received_qty 차감
        if (oldStatus === 'RECEIVED' && current.to_partner) {
          for (const item of items.rows) {
            if (item.received_qty > 0) {
              await inventoryRepository.applyChange(
                current.to_partner, item.variant_id, -item.received_qty,
                txType, id, userId, client,
              );
            }
          }
        }
        // SHIPPED 또는 RECEIVED 상태였으면 from_partner에 shipped_qty 복구
        if ((oldStatus === 'SHIPPED' || oldStatus === 'RECEIVED') && current.from_partner) {
          for (const item of items.rows) {
            if (item.shipped_qty > 0) {
              await inventoryRepository.applyChange(
                current.from_partner, item.variant_id, item.shipped_qty,
                txType, id, userId, client,
              );
            }
          }
        }
      }

      await client.query('COMMIT');

      // 알림 생성 (비동기, 실패 무시)
      if (oldStatus !== newStatus) {
        const statusLabels: Record<string, string> = { SHIPPED: '출고확인', RECEIVED: '수령완료', CANCELLED: '취소' };
        const label = statusLabels[newStatus] || newStatus;
        const targetPartner = newStatus === 'SHIPPED' ? current.to_partner : current.from_partner;
        createNotification(
          'SHIPMENT', `출고의뢰 ${label}`,
          `${current.request_type} #${current.request_no}이(가) ${label} 처리되었습니다.`,
          id, targetPartner, userId,
        );
      }

      return shipmentRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 출고확인: shipped_qty 저장 + SHIPPED 상태 + 재고 차감 (단일 트랜잭션) */
  async shipAndConfirm(
    id: number,
    items: Array<{ variant_id: number; shipped_qty: number }>,
    userId: string,
  ): Promise<ShipmentRequest | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 현재 상태 조회
      const currentResult = await client.query(
        'SELECT * FROM shipment_requests WHERE request_id = $1', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('출고의뢰를 찾을 수 없습니다');
      const current = currentResult.rows[0];

      // 상태 전환 검증: PENDING → SHIPPED만 허용
      if (current.status !== 'PENDING') {
        throw new Error(`현재 상태(${current.status})에서는 출고확인할 수 없습니다. PENDING 상태만 가능합니다.`);
      }

      // shipped_qty 업데이트
      for (const item of items) {
        if (item.shipped_qty < 0) throw new Error('출고수량은 0 이상이어야 합니다.');
        const result = await client.query(
          'UPDATE shipment_request_items SET shipped_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.shipped_qty, id, item.variant_id],
        );
        if (result.rowCount === 0) {
          throw new Error(`품목(variant_id: ${item.variant_id})을 찾을 수 없습니다.`);
        }
      }

      // 상태를 SHIPPED로 변경
      await client.query(
        `UPDATE shipment_requests SET status = 'SHIPPED', approved_by = $1, updated_at = NOW() WHERE request_id = $2`,
        [userId, id],
      );

      // from_partner 재고 차감
      if (current.from_partner) {
        const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER' };
        const txType = txTypeMap[current.request_type] || 'SHIPMENT';
        for (const item of items) {
          if (item.shipped_qty > 0) {
            await inventoryRepository.applyChange(
              current.from_partner, item.variant_id, -item.shipped_qty,
              txType, id, userId, client,
            );
          }
        }
      }

      await client.query('COMMIT');

      // 알림 생성
      createNotification(
        'SHIPMENT', '출고확인',
        `${current.request_type} #${current.request_no}이(가) 출고확인 처리되었습니다.`,
        id, current.to_partner, userId,
      );

      return shipmentRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 수령확인: received_qty 저장 + RECEIVED 상태 + 재고 연동 (단일 트랜잭션) */
  async receiveWithInventory(
    id: number,
    items: Array<{ variant_id: number; received_qty: number }>,
    userId: string,
  ): Promise<ShipmentRequest | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 현재 상태 조회 (먼저 검증)
      const currentResult = await client.query(
        'SELECT * FROM shipment_requests WHERE request_id = $1', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('출고의뢰를 찾을 수 없습니다');
      const current = currentResult.rows[0];

      // 상태 검증: SHIPPED에서만 수령 가능
      if (current.status !== 'SHIPPED') {
        throw new Error(`현재 상태(${current.status})에서는 수령확인할 수 없습니다. SHIPPED 상태만 가능합니다.`);
      }

      // received_qty 검증 및 업데이트
      const shippedItems = await client.query(
        'SELECT variant_id, shipped_qty FROM shipment_request_items WHERE request_id = $1', [id],
      );
      const shippedMap = new Map(shippedItems.rows.map((r: any) => [r.variant_id, Number(r.shipped_qty)]));
      for (const item of items) {
        if (item.received_qty < 0) throw new Error('수령수량은 0 이상이어야 합니다.');
        const shipped = shippedMap.get(item.variant_id);
        if (shipped !== undefined && item.received_qty > shipped) {
          throw new Error(`수령수량(${item.received_qty})이 출고수량(${shipped})을 초과합니다.`);
        }
        await client.query(
          'UPDATE shipment_request_items SET received_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.received_qty, id, item.variant_id],
        );
      }

      // 상태를 RECEIVED로 변경
      await client.query(
        `UPDATE shipment_requests SET status = 'RECEIVED', updated_at = NOW() WHERE request_id = $1`,
        [id],
      );

      // to_partner 재고 증가
      if (current.status !== 'RECEIVED' && current.to_partner) {
        const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER' };
        const txType = txTypeMap[current.request_type] || 'SHIPMENT';
        for (const item of items) {
          if (item.received_qty > 0) {
            await inventoryRepository.applyChange(
              current.to_partner, item.variant_id, item.received_qty,
              txType, id, userId, client,
            );
          }
        }
      }

      await client.query('COMMIT');
      return shipmentRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const shipmentService = new ShipmentService();
