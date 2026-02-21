import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { ShipmentRequest } from '../../../../shared/types/shipment';
import { shipmentService } from './shipment.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

class ShipmentController extends BaseController<ShipmentRequest> {
  constructor() {
    super(shipmentService);
  }

  getById = asyncHandler(async (req: Request, res: Response) => {
    const item = await shipmentService.getWithItems(parseInt(req.params.id as string, 10));
    if (!item) { res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  /** 의뢰 생성 (품목 포함) */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...headerData } = req.body;
    const result = await shipmentService.createWithItems(
      { ...headerData, requested_by: req.user!.userId },
      items || [],
    );
    res.status(201).json({ success: true, data: result });
  });

  /** 상태 변경 (재고 연동 포함) */
  update = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const result = await shipmentService.updateWithInventory(id, req.body, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고의뢰를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 출고수량 일괄 업데이트 */
  updateShippedQty = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    const { items } = req.body; // [{ variant_id, shipped_qty }]
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          'UPDATE shipment_request_items SET shipped_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.shipped_qty, requestId, item.variant_id],
        );
      }
      await client.query('COMMIT');
      const result = await shipmentService.getWithItems(requestId);
      res.json({ success: true, data: result });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  /** 수령확인: received_qty 저장 + 상태 RECEIVED + 재고 연동 (원자적) */
  receive = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    const { items } = req.body; // [{ variant_id, received_qty }]
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // received_qty 업데이트
      for (const item of items) {
        await client.query(
          'UPDATE shipment_request_items SET received_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.received_qty, requestId, item.variant_id],
        );
      }
      await client.query('COMMIT');
      // 상태를 RECEIVED로 변경 (재고 연동은 updateWithInventory에서 처리)
      const result = await shipmentService.updateWithInventory(
        requestId, { status: 'RECEIVED' }, req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}

export const shipmentController = new ShipmentController();
