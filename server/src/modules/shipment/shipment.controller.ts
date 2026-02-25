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
    if (!shipment) { res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' }); return false; }
    if (shipment.from_partner !== pc && shipment.to_partner !== pc) {
      res.status(403).json({ success: false, error: '해당 출고의뢰에 접근 권한이 없습니다.' });
      return false;
    }
    return true;
  }

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const item = await shipmentService.getWithItems(id);
    if (!item) { res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  /** 의뢰 생성 (품목 포함) */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...headerData } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '최소 1개 이상의 품목을 추가해주세요.' });
      return;
    }
    for (const item of items) {
      if (!item.variant_id || !item.request_qty || item.request_qty <= 0) {
        res.status(400).json({ success: false, error: '품목의 variant_id와 수량(1 이상)은 필수입니다.' });
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
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const result = await shipmentService.updateWithInventory(id, req.body, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 출고수량 일괄 업데이트 */
  updateShippedQty = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (!(await this.checkStoreAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, shipped_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '업데이트할 품목이 없습니다.' });
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
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

  /** 수령확인: received_qty 저장 + 상태 RECEIVED + 재고 연동 (단일 트랜잭션) */
  receive = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (!(await this.checkStoreAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, received_qty }]
    const result = await shipmentService.receiveWithInventory(requestId, items, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 삭제: PENDING 상태만 삭제 가능 (hard delete) */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const pool = getPool();
    const current = await pool.query('SELECT status FROM shipment_requests WHERE request_id = $1', [id]);
    if (current.rows.length === 0) {
      res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' });
      return;
    }
    if (current.rows[0].status !== 'PENDING') {
      res.status(400).json({ success: false, error: '대기(PENDING) 상태의 의뢰만 삭제할 수 있습니다.' });
      return;
    }
    await pool.query('DELETE FROM shipment_request_items WHERE request_id = $1', [id]);
    await pool.query('DELETE FROM shipment_requests WHERE request_id = $1', [id]);
    res.json({ success: true });
  });
}

export const shipmentController = new ShipmentController();
