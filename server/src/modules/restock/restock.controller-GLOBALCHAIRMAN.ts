import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { RestockRequest } from '../../../../shared/types/restock';
import { restockService } from './restock.service';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';

class RestockController extends BaseController<RestockRequest> {
  constructor() {
    super(restockService);
  }

  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await restockService.list(query);
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const item = await restockService.getWithItems(parseInt(req.params.id as string, 10));
    if (!item) {
      res.status(404).json({ success: false, error: '재입고 의뢰를 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: item });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...headerData } = req.body;
    if (!items || items.length === 0) {
      res.status(400).json({ success: false, error: '품목을 1개 이상 추가해주세요.' });
      return;
    }
    const result = await restockService.createWithItems(
      { ...headerData, requested_by: req.user!.userId },
      items,
    );
    res.status(201).json({ success: true, data: result });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const result = await restockService.updateWithInventory(id, req.body, req.user!.userId);
    if (!result) {
      res.status(404).json({ success: false, error: '재입고 의뢰를 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: result });
  });

  generateNo = asyncHandler(async (_req: Request, res: Response) => {
    const no = await restockService.generateNo();
    res.json({ success: true, data: no });
  });

  getSellingVelocity = asyncHandler(async (req: Request, res: Response) => {
    const pc = getStorePartnerCode(req) || (req.query.partner_code as string | undefined);
    const data = await restockService.getSellingVelocity(pc);
    res.json({ success: true, data });
  });

  getRestockSuggestions = asyncHandler(async (_req: Request, res: Response) => {
    const result = await restockService.getRestockSuggestions();
    res.json({ success: true, data: result });
  });

  getProgressStats = asyncHandler(async (req: Request, res: Response) => {
    const pc = getStorePartnerCode(req) || (req.query.partner_code as string | undefined);
    const data = await restockService.getProgressStats(pc);
    res.json({ success: true, data });
  });

  receive = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { items } = req.body;
    if (!items || items.length === 0) {
      res.status(400).json({ success: false, error: '수령 수량 정보가 필요합니다.' });
      return;
    }
    const result = await restockService.receive(id, items, req.user!.userId);
    res.json({ success: true, data: result });
  });
}

export const restockController = new RestockController();
