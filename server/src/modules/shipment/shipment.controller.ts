import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { ShipmentRequest } from '../../../../shared/types/shipment';
import { shipmentService } from './shipment.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { getStorePartnerCode } from '../../core/store-filter';


class ShipmentController extends BaseController<ShipmentRequest> {
  constructor() {
    super(shipmentService);
  }

  /** 상태별 요약 */
  summary = asyncHandler(async (req: Request, res: Response) => {
    const query: any = {};
    const pc = getStorePartnerCode(req);
    if (pc) query.partner = pc;
    const result = await shipmentService.summary(query);
    res.json({ success: true, data: result });
  });

  /** 목록 조회 — 매장 사용자는 자기 매장 관련만 */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner = pc;
    const result = await shipmentService.list(query);
    res.json({ success: true, data: result });
  });

  /** 매장 사용자 권한 검증 (자기 매장 관련 출고만 접근 가능) */
  private async checkStoreAccess(req: Request, res: Response, requestId: number): Promise<boolean> {
    const role = req.user?.role;
    if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') return true;
    const pc = req.user?.partnerCode;
    if (!pc) { res.status(403).json({ success: false, error: '권한이 없습니다.' }); return false; }
    const shipment = await shipmentService.getWithItems(requestId);
    if (!shipment) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return false; }
    if (shipment.from_partner !== pc && shipment.to_partner !== pc) {
      res.status(403).json({ success: false, error: '해당 출고건에 접근 권한이 없습니다.' });
      return false;
    }
    return true;
  }

  /** 보내는 측만 (from_partner) */
  private async checkSenderAccess(req: Request, res: Response, requestId: number): Promise<boolean> {
    const role = req.user?.role;
    if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') return true;
    const pc = req.user?.partnerCode;
    if (!pc) { res.status(403).json({ success: false, error: '권한이 없습니다.' }); return false; }
    const shipment = await shipmentService.getWithItems(requestId);
    if (!shipment) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return false; }
    if (shipment.from_partner !== pc) {
      res.status(403).json({ success: false, error: '출고확인은 출발 거래처만 가능합니다.' });
      return false;
    }
    return true;
  }

  /** 받는 측만 (to_partner) */
  private async checkReceiverAccess(req: Request, res: Response, requestId: number): Promise<boolean> {
    const role = req.user?.role;
    if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') return true;
    const pc = req.user?.partnerCode;
    if (!pc) { res.status(403).json({ success: false, error: '권한이 없습니다.' }); return false; }
    const shipment = await shipmentService.getWithItems(requestId);
    if (!shipment) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return false; }
    if (shipment.to_partner !== pc) {
      res.status(403).json({ success: false, error: '수령확인은 도착 거래처만 가능합니다.' });
      return false;
    }
    return true;
  }

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const item = await shipmentService.getWithItems(id);
    if (!item) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  /** 의뢰 생성 (품목 포함) */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...headerData } = req.body;
    // request_type 검증
    const validTypes = ['출고', '반품', '수평이동'];
    if (!validTypes.includes(headerData.request_type)) {
      res.status(400).json({ success: false, error: `의뢰유형은 ${validTypes.join('/')} 중 하나여야 합니다.` });
      return;
    }
    // 수평이동은 to_partner 필수
    if (headerData.request_type === '수평이동' && !headerData.to_partner) {
      res.status(400).json({ success: false, error: '수평이동은 도착 거래처가 필수입니다.' });
      return;
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '최소 1개 이상의 품목을 추가해주세요.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.request_qty);
      if (!item.variant_id || !qty || qty <= 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '품목의 variant_id와 수량(1 이상 정수)은 필수입니다.' });
        return;
      }
    }
    const result = await shipmentService.createWithItems(
      { ...headerData, requested_by: req.user!.userId },
      items,
    );
    res.status(201).json({ success: true, data: result });
  });

  /** 상태 변경 (재고 연동 포함) */
  update = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const result = await shipmentService.updateWithInventory(id, req.body, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 출고수량 일괄 업데이트 (PENDING 상태에서만 가능) */
  updateShippedQty = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, shipped_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '업데이트할 품목이 없습니다.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.shipped_qty);
      if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '출고수량은 0 이상의 정수여야 합니다.' });
        return;
      }
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 상태 검증: PENDING에서만 수량 변경 가능
      const current = await client.query('SELECT status FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [requestId]);
      if (current.rows.length === 0) throw new Error('출고건을 찾을 수 없습니다.');
      if (current.rows[0].status !== 'PENDING') {
        throw new Error(`현재 상태(${current.rows[0].status})에서는 출고수량을 변경할 수 없습니다. PENDING 상태만 가능합니다.`);
      }
      // request_qty 조회하여 초과 검증
      const reqItems = await client.query(
        'SELECT variant_id, request_qty FROM shipment_request_items WHERE request_id = $1', [requestId],
      );
      const reqMap = new Map(reqItems.rows.map((r: any) => [r.variant_id, Number(r.request_qty)]));
      for (const item of items) {
        const reqQty = reqMap.get(item.variant_id);
        if (reqQty !== undefined && Number(item.shipped_qty) > reqQty) {
          throw new Error(`출고수량(${item.shipped_qty})이 의뢰수량(${reqQty})을 초과합니다.`);
        }
        const result = await client.query(
          'UPDATE shipment_request_items SET shipped_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.shipped_qty, requestId, item.variant_id],
        );
        if (result.rowCount === 0) {
          throw new Error(`품목(variant_id: ${item.variant_id})을 찾을 수 없습니다.`);
        }
      }
      await client.query('COMMIT');
      const updated = await shipmentService.getWithItems(requestId);
      res.json({ success: true, data: updated });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  /** 출고확인: shipped_qty 저장 + SHIPPED 상태 + 재고 차감 (단일 트랜잭션) — 보내는 측만 */
  shipConfirm = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkSenderAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, shipped_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '출고수량 품목이 없습니다.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.shipped_qty);
      if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '출고수량은 0 이상의 정수여야 합니다.' });
        return;
      }
    }
    const result = await shipmentService.shipAndConfirm(requestId, items, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 수령확인: received_qty 저장 + 상태 RECEIVED + 재고 연동 (단일 트랜잭션) — 받는 측만 */
  receive = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkReceiverAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, received_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '수령수량 품목이 없습니다.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.received_qty);
      if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '수령수량은 0 이상의 정수여야 합니다.' });
        return;
      }
    }
    const result = await shipmentService.receiveWithInventory(requestId, items, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 삭제: SHIPPED 상태까지 삭제 가능 (재고 롤백 포함) */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [id]);
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' });
        return;
      }
      const shipment = current.rows[0];
      if (shipment.status === 'RECEIVED') {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: '수령완료(RECEIVED) 상태의 출고건은 삭제할 수 없습니다.' });
        return;
      }
      // SHIPPED 상태: from_partner 재고 복구
      if (shipment.status === 'SHIPPED' && shipment.from_partner) {
        const { inventoryRepository } = await import('../inventory/inventory.repository');
        const items = await client.query(
          'SELECT variant_id, shipped_qty FROM shipment_request_items WHERE request_id = $1', [id],
        );
        const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER' };
        const txType = txTypeMap[shipment.request_type] || 'SHIPMENT';
        for (const item of items.rows) {
          if (item.shipped_qty > 0) {
            await inventoryRepository.applyChange(
              shipment.from_partner, item.variant_id, item.shipped_qty,
              txType, id, req.user!.userId, client,
            );
          }
        }
      }
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}

export const shipmentController = new ShipmentController();
