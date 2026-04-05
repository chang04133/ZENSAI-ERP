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
  async summary(options: { partner?: string } = {}) { return shipmentRepository.summary(options); }

  async createWithItems(headerData: Record<string, any>, items: Array<{ variant_id: number; request_qty: number }>, options?: { externalClient?: any }) {
    const pool = getPool();
    const extClient = options?.externalClient;
    const client = extClient || await pool.connect();
    try {
      if (!extClient) await client.query('BEGIN');

      // 0) 거래처 활성 상태 검증
      const partnerCodes = [headerData.from_partner, headerData.to_partner].filter(Boolean);
      if (partnerCodes.length > 0) {
        const check = await client.query(
          `SELECT partner_code, partner_name, is_active FROM partners WHERE partner_code = ANY($1)`,
          [partnerCodes],
        );
        for (const row of check.rows) {
          if (!row.is_active) {
            throw new Error(`비활성 거래처(${row.partner_name})로는 출고/반품/이동을 처리할 수 없습니다.`);
          }
        }
      }

      // 1) 같은 출발/도착 거래처의 SHIPPED(수령대기) 케이스가 있으면 합치기
      let requestId: number;
      let mergedInto: string | null = null;
      const toPartner = headerData.to_partner || null;
      const existingCase = toPartner ? await client.query(
        `SELECT request_id, request_no FROM shipment_requests
         WHERE from_partner = $1 AND to_partner = $2
           AND request_type = $3 AND status = 'SHIPPED'
         ORDER BY created_at DESC LIMIT 1
         FOR UPDATE`,
        [headerData.from_partner, toPartner, headerData.request_type],
      ) : { rows: [] };

      const initialStatus = 'SHIPPED';

      if (existingCase.rows.length > 0) {
        // 기존 케이스에 품목 추가 (merge) — autoReceive 시에는 merge 안 함
        requestId = existingCase.rows[0].request_id;
        mergedInto = existingCase.rows[0].request_no;

        // 기존 품목 조회
        const existingItems = await client.query(
          'SELECT variant_id, request_qty, shipped_qty FROM shipment_request_items WHERE request_id = $1',
          [requestId],
        );
        const existingMap = new Map(existingItems.rows.map((r: any) => [r.variant_id, r]));

        for (const item of items) {
          const existing = existingMap.get(item.variant_id);
          if (existing) {
            // 같은 variant → 수량 합산
            await client.query(
              `UPDATE shipment_request_items
               SET request_qty = request_qty + $1, shipped_qty = shipped_qty + $1
               WHERE request_id = $2 AND variant_id = $3`,
              [item.request_qty, requestId, item.variant_id],
            );
          } else {
            // 새 variant → 추가
            await client.query(
              `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
               VALUES ($1, $2, $3, $3, 0)`,
              [requestId, item.variant_id, item.request_qty],
            );
          }
        }

        // 메모 추가
        if (headerData.memo) {
          await client.query(
            `UPDATE shipment_requests SET memo = CASE WHEN memo IS NULL OR memo = '' THEN $1 ELSE memo || ' / ' || $1 END, updated_at = NOW() WHERE request_id = $2`,
            [headerData.memo, requestId],
          );
        }
      } else {
        // 새 케이스 생성
        const requestNo = await shipmentRepository.generateNo(client);
        const header = await client.query(
          `INSERT INTO shipment_requests
           (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by, approved_by,
            is_customer_claim, claim_type, claim_reason, customer_name, customer_phone)
           VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [requestNo, headerData.from_partner, toPartner,
           headerData.request_type, initialStatus, headerData.memo || null, headerData.requested_by,
           headerData.is_customer_claim || false, headerData.claim_type || null,
           headerData.claim_reason || null, headerData.customer_name || null, headerData.customer_phone || null],
        );
        requestId = header.rows[0].request_id;

        const rcvQty = '0';
        for (const item of items) {
          await client.query(
            `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
             VALUES ($1, $2, $3, $3, ${rcvQty})`,
            [requestId, item.variant_id, item.request_qty],
          );
        }
      }

      // from_partner 재고 즉시 차감
      if (headerData.from_partner) {
        const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER', '출고요청': 'SHIPMENT' };
        const txType = txTypeMap[headerData.request_type] || 'SHIPMENT';
        for (const item of items) {
          if (item.request_qty > 0) {
            await inventoryRepository.applyChange(
              headerData.from_partner, item.variant_id, -item.request_qty,
              txType, requestId, headerData.requested_by, client,
            );
          }
        }
      }

      if (!extClient) await client.query('COMMIT');

      // 알림 생성 (비동기)
      if (mergedInto) {
        createNotification(
          'SHIPMENT', '출고추가',
          `${headerData.request_type} #${mergedInto}에 ${items.length}개 품목이 추가되었습니다.`,
          requestId, toPartner, headerData.requested_by,
        );
      } else {
        const notifTitle = '출고등록';
        const notifMsg = `${headerData.request_type} #${requestId}이(가) 출고 등록되었습니다.`;
        createNotification(
          'SHIPMENT', notifTitle, notifMsg,
          requestId, toPartner, headerData.requested_by,
        );
      }

      if (extClient) return { request_id: requestId } as any;
      return shipmentRepository.getWithItems(requestId);
    } catch (e: any) {
      if (!extClient) await client.query('ROLLBACK');
      if (e.code === '23503') {
        if (e.constraint?.includes('variant')) throw new Error('존재하지 않는 상품(variant_id)이 포함되어 있습니다.');
        if (e.constraint?.includes('partner')) throw new Error('존재하지 않는 거래처 코드입니다.');
        throw new Error('참조 데이터가 존재하지 않습니다.');
      }
      throw e;
    } finally {
      if (!extClient) client.release();
    }
  }

  /** 출고요청: PENDING 상태로 생성 (재고 차감 없음) */
  async createAsRequest(headerData: Record<string, any>, items: Array<{ variant_id: number; request_qty: number }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const requestNo = await shipmentRepository.generateNo(client);

      // 헤더 INSERT (PENDING 상태, shipped_qty=0, 재고 변동 없음)
      const header = await client.query(
        `INSERT INTO shipment_requests
         (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by)
         VALUES ($1, NOW(), $2, $3, $4, 'PENDING', $5, $6)
         RETURNING *`,
        [requestNo, headerData.from_partner, headerData.to_partner,
         headerData.request_type, headerData.memo || null, headerData.requested_by],
      );
      const requestId = header.rows[0].request_id;

      // 아이템 INSERT (shipped_qty=0, received_qty=0)
      for (const item of items) {
        await client.query(
          `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
           VALUES ($1, $2, $3, 0, 0)`,
          [requestId, item.variant_id, item.request_qty],
        );
      }

      await client.query('COMMIT');

      // 알림: 본사에 출고요청 등록 알림
      createNotification(
        'SHIPMENT', '출고요청',
        `출고요청 #${requestNo}이(가) 등록되었습니다.`,
        requestId, headerData.from_partner || null, headerData.requested_by,
      );

      return shipmentRepository.getWithItems(requestId);
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e.code === '23503') {
        if (e.constraint?.includes('variant')) throw new Error('존재하지 않는 상품(variant_id)이 포함되어 있습니다.');
        if (e.constraint?.includes('partner')) throw new Error('존재하지 않는 거래처 코드입니다.');
        throw new Error('참조 데이터가 존재하지 않습니다.');
      }
      throw e;
    } finally {
      client.release();
    }
  }

  /** 허용되는 상태 전환 정의 */
  private static ALLOWED_TRANSITIONS: Record<string, string[]> = {
    PENDING: ['SHIPPED', 'CANCELLED', 'REJECTED'],
    SHIPPED: ['RECEIVED', 'DISCREPANCY', 'CANCELLED'],
    DISCREPANCY: ['RECEIVED', 'CANCELLED'],
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
        'SELECT * FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('출고건을 찾을 수 없습니다');
      const current = currentResult.rows[0];
      const oldStatus = current.status;
      const newStatus = data.status || oldStatus;

      // 상태 전환 검증
      if (oldStatus !== newStatus) {
        const allowed = ShipmentService.ALLOWED_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(newStatus)) {
          throw new Error(`상태를 ${oldStatus}에서 ${newStatus}(으)로 변경할 수 없습니다.`);
        }
        // PENDING→SHIPPED는 shipAndConfirm 전용 (shipped_qty 설정 필요)
        if (oldStatus === 'PENDING' && newStatus === 'SHIPPED') {
          throw new Error('출고확인은 전용 API(/ship-confirm)를 사용해주세요.');
        }
        // SHIPPED→RECEIVED는 receiveWithInventory 전용 (received_qty 설정 필요)
        // DISCREPANCY→RECEIVED는 관리자 강제완료 (재고 이미 반영됨) → 허용
        if (oldStatus === 'SHIPPED' && newStatus === 'RECEIVED') {
          throw new Error('수령확인은 전용 API(/receive)를 사용해주세요.');
        }
      }

      // REJECTED: 거절 사유를 memo에 저장
      const memoValue = newStatus === 'REJECTED' && data.reject_reason
        ? `[거절] ${data.reject_reason}`
        : data.memo;

      // 상태 및 기타 필드 업데이트 (approved_by는 현재 사용자로 강제)
      await client.query(
        `UPDATE shipment_requests
         SET status = COALESCE($1, status),
             memo = COALESCE($2, memo),
             approved_by = COALESCE($3, approved_by),
             updated_at = NOW()
         WHERE request_id = $4`,
        [data.status, memoValue, userId, id],
      );

      const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER', '출고요청': 'SHIPMENT' };
      const txType = txTypeMap[current.request_type] || 'SHIPMENT';

      // DISCREPANCY→RECEIVED 완료처리: 차이분을 LOSS 트랜잭션으로 기록
      if (oldStatus === 'DISCREPANCY' && newStatus === 'RECEIVED') {
        const items = await client.query(
          'SELECT variant_id, shipped_qty, received_qty FROM shipment_request_items WHERE request_id = $1', [id],
        );
        for (const item of items.rows) {
          const lossQty = Number(item.shipped_qty) - Number(item.received_qty);
          if (lossQty > 0) {
            // LOSS 트랜잭션 기록 (재고는 이미 received_qty 기준으로 반영됨, 유실분만 기록)
            const inv = await client.query(
              'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
              [current.from_partner, item.variant_id],
            );
            const qtyAfter = inv.rows[0] ? Number(inv.rows[0].qty) : 0;
            await client.query(
              `INSERT INTO inventory_transactions (tx_type, ref_id, partner_code, variant_id, qty_change, qty_after, created_by, memo, loss_type)
               VALUES ('LOSS', $1, $2, $3, $4, $5, $6, $7, 'LOST')`,
              [id, current.from_partner, item.variant_id, -lossQty, qtyAfter,
               userId, `출고 #${current.request_no} 수량불일치 유실 (출고${item.shipped_qty} → 수령${item.received_qty})`],
            );
          }
        }
      }

      // CANCELLED 전환 시: 이전 재고 변동 롤백
      if (oldStatus !== 'CANCELLED' && newStatus === 'CANCELLED') {
        const items = await client.query(
          'SELECT variant_id, shipped_qty, received_qty FROM shipment_request_items WHERE request_id = $1', [id],
        );
        // RECEIVED 또는 DISCREPANCY 상태였으면 to_partner에서 received_qty 차감
        if ((oldStatus === 'RECEIVED' || oldStatus === 'DISCREPANCY') && current.to_partner) {
          for (const item of items.rows) {
            if (item.received_qty > 0) {
              await inventoryRepository.applyChange(
                current.to_partner, item.variant_id, -item.received_qty,
                txType, id, userId, client,
              );
            }
          }
        }
        // SHIPPED, RECEIVED, DISCREPANCY 상태였으면 from_partner에 shipped_qty 복구
        if ((oldStatus === 'SHIPPED' || oldStatus === 'RECEIVED' || oldStatus === 'DISCREPANCY') && current.from_partner) {
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
        if (newStatus === 'CANCELLED') {
          // 취소: 양쪽 파트너 모두에게 알림
          const msg = `${current.request_type} #${current.request_no}이(가) 취소 처리되었습니다.`;
          if (current.from_partner) {
            createNotification('SHIPMENT', '출고 취소', msg, id, current.from_partner, userId);
          }
          if (current.to_partner) {
            createNotification('SHIPMENT', '출고 취소', msg, id, current.to_partner, userId);
          }
        } else if (newStatus === 'REJECTED') {
          // 거절: 요청 매장(to_partner)에 알림
          const reason = data.reject_reason ? ` (사유: ${data.reject_reason})` : '';
          createNotification(
            'SHIPMENT', '출고요청 거절',
            `출고요청 #${current.request_no}이(가) 거절되었습니다.${reason}`,
            id, current.to_partner, userId,
          );
        } else {
          const statusLabels: Record<string, string> = { RECEIVED: '수령완료' };
          const label = statusLabels[newStatus] || newStatus;
          createNotification(
            'SHIPMENT', `출고 ${label}`,
            `${current.request_type} #${current.request_no}이(가) ${label} 처리되었습니다.`,
            id, current.from_partner, userId,
          );
        }
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

      // 현재 상태 조회 (FOR UPDATE로 잠금)
      const currentResult = await client.query(
        'SELECT * FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('출고건을 찾을 수 없습니다');
      const current = currentResult.rows[0];

      // 상태 전환 검증: PENDING → SHIPPED만 허용
      if (current.status !== 'PENDING') {
        throw new Error(`현재 상태(${current.status})에서는 출고확인할 수 없습니다. PENDING 상태만 가능합니다.`);
      }

      // request_qty 조회하여 초과 검증
      const reqItems = await client.query(
        'SELECT variant_id, request_qty FROM shipment_request_items WHERE request_id = $1', [id],
      );
      const reqMap = new Map(reqItems.rows.map((r: any) => [r.variant_id, Number(r.request_qty)]));

      // shipped_qty 업데이트
      for (const item of items) {
        if (item.shipped_qty < 0) throw new Error('출고수량은 0 이상이어야 합니다.');
        const reqQty = reqMap.get(item.variant_id);
        if (reqQty !== undefined && item.shipped_qty > reqQty) {
          throw new Error(`출고수량(${item.shipped_qty})이 의뢰수량(${reqQty})을 초과합니다.`);
        }
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
        const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER', '출고요청': 'SHIPMENT' };
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

      // 현재 상태 조회 (FOR UPDATE로 잠금)
      const currentResult = await client.query(
        'SELECT * FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [id],
      );
      if (currentResult.rows.length === 0) throw new Error('출고건을 찾을 수 없습니다');
      const current = currentResult.rows[0];

      // 상태 검증: SHIPPED 또는 DISCREPANCY에서만 수령 가능
      if (current.status !== 'SHIPPED' && current.status !== 'DISCREPANCY') {
        throw new Error(`현재 상태(${current.status})에서는 수령확인할 수 없습니다. SHIPPED 또는 DISCREPANCY 상태만 가능합니다.`);
      }

      // received_qty 검증 및 업데이트 (variant_id 타입 통일)
      const shippedItems = await client.query(
        'SELECT variant_id, shipped_qty, received_qty FROM shipment_request_items WHERE request_id = $1', [id],
      );
      const shippedMap = new Map(shippedItems.rows.map((r: any) => [Number(r.variant_id), Number(r.shipped_qty)]));
      let hasDiscrepancy = false;
      for (const item of items) {
        const recvQty = Number(item.received_qty);
        if (recvQty < 0) throw new Error('수령수량은 0 이상이어야 합니다.');
        const shipped = shippedMap.get(Number(item.variant_id));
        if (shipped !== undefined && recvQty > shipped) {
          throw new Error(`수령수량(${recvQty})이 출고수량(${shipped})을 초과합니다.`);
        }
        if (shipped !== undefined && recvQty !== shipped) {
          hasDiscrepancy = true;
        }
        const result = await client.query(
          'UPDATE shipment_request_items SET received_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.received_qty, id, item.variant_id],
        );
        if (result.rowCount === 0) {
          throw new Error(`품목(variant_id: ${item.variant_id})을 찾을 수 없습니다.`);
        }
      }
      // 아직 수령 입력하지 않은 품목도 불일치 체크
      for (const row of shippedItems.rows) {
        const vid = Number(row.variant_id);
        if (!items.find((i) => Number(i.variant_id) === vid)) {
          // 수령 입력 안 된 품목: shipped_qty > 0이면 불일치
          if (Number(row.shipped_qty) > 0 && Number(row.received_qty) !== Number(row.shipped_qty)) {
            hasDiscrepancy = true;
          }
        }
      }

      // 초회 수령: 불일치 시 DISCREPANCY / 재확인: 수량만 갱신, 상태는 DISCREPANCY 유지 (최종 확정은 ADMIN)
      const newStatus = hasDiscrepancy ? 'DISCREPANCY' : 'RECEIVED';
      await client.query(
        `UPDATE shipment_requests SET status = $1, updated_at = NOW() WHERE request_id = $2`,
        [newStatus, id],
      );

      // to_partner 재고 증가 (DISCREPANCY 재수령 시 이전 수령분과의 차이만 반영)
      if (current.to_partner) {
        const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER', '출고요청': 'SHIPMENT' };
        const txType = txTypeMap[current.request_type] || 'SHIPMENT';
        const isReReceive = current.status === 'DISCREPANCY';
        // 이전 received_qty 맵 (재수령 시 delta 계산용)
        const prevRecvMap = isReReceive
          ? new Map(shippedItems.rows.map((r: any) => [Number(r.variant_id), Number(r.received_qty)]))
          : null;
        for (const item of items) {
          const prevQty = prevRecvMap?.get(Number(item.variant_id)) || 0;
          const delta = item.received_qty - prevQty;
          if (delta !== 0) {
            await inventoryRepository.applyChange(
              current.to_partner, item.variant_id, delta,
              txType, id, userId, client,
            );
          }
        }
      }

      await client.query('COMMIT');

      // 알림 생성
      if (newStatus === 'DISCREPANCY') {
        // DISCREPANCY → ADMIN 대상 (targetPartner=null)
        createNotification(
          'SHIPMENT', '수량 불일치 발생',
          `${current.request_type} #${current.request_no} 수량 불일치가 발생했습니다.`,
          id, undefined, userId,
        );
      } else {
        // RECEIVED → from_partner 대상
        createNotification(
          'SHIPMENT', '수령확인 완료',
          `${current.request_type} #${current.request_no}이(가) 수령완료 처리되었습니다.`,
          id, current.from_partner, userId,
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
}

export const shipmentService = new ShipmentService();
