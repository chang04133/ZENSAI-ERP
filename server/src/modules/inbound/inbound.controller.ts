import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { InboundRecord } from '../../../../shared/types/inbound';
import { inboundService } from './inbound.service';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';

class InboundController extends BaseController<InboundRecord> {
  constructor() {
    super(inboundService);
  }

  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inboundService.list(query);
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const item = await inboundService.getWithItems(parseInt(req.params.id as string, 10));
    if (!item) {
      res.status(404).json({ success: false, error: '입고 기록을 찾을 수 없습니다.' });
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
    const result = await inboundService.createWithItems(
      { ...headerData, created_by: req.user!.userId },
      items,
    );
    res.status(201).json({ success: true, data: result });
  });

  generateNo = asyncHandler(async (_req: Request, res: Response) => {
    const no = await inboundService.generateNo();
    res.json({ success: true, data: no });
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    await inboundService.deleteWithRollback(id, req.user!.userId);
    res.json({ success: true, message: '입고가 삭제되었습니다.' });
  });
}

export const inboundController = new InboundController();
