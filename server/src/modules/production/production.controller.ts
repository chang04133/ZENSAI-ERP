import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { ProductionPlan } from '../../../../shared/types/production';
import { productionService } from './production.service';
import { asyncHandler } from '../../core/async-handler';

class ProductionController extends BaseController<ProductionPlan> {
  constructor() {
    super(productionService);
  }

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await productionService.list(req.query);
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const item = await productionService.getWithItems(parseInt(req.params.id as string, 10));
    if (!item) { res.status(404).json({ success: false, error: '생산계획을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...header } = req.body;
    if (!items || items.length === 0) {
      res.status(400).json({ success: false, error: '품목을 1개 이상 추가해주세요.' }); return;
    }
    for (const item of items) {
      if (!item.category) {
        res.status(400).json({ success: false, error: '각 품목의 카테고리는 필수입니다.' }); return;
      }
      if (!item.plan_qty || item.plan_qty <= 0) {
        res.status(400).json({ success: false, error: '수량은 1 이상이어야 합니다.' }); return;
      }
    }
    const result = await productionService.createWithItems(
      { ...header, created_by: req.user!.userId }, items,
    );
    res.status(201).json({ success: true, data: result });
  });

  generateNo = asyncHandler(async (_req: Request, res: Response) => {
    const no = await productionService.generateNo();
    res.json({ success: true, data: no });
  });

  dashboard = asyncHandler(async (_req: Request, res: Response) => {
    const data = await productionService.dashboardStats();
    res.json({ success: true, data });
  });

  recommendations = asyncHandler(async (req: Request, res: Response) => {
    const { limit, category } = req.query;
    const data = await productionService.recommendations({
      limit: limit ? parseInt(limit as string, 10) : undefined,
      category: category as string | undefined,
    });
    res.json({ success: true, data });
  });

  categoryStats = asyncHandler(async (_req: Request, res: Response) => {
    const data = await productionService.categorySummary();
    res.json({ success: true, data });
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { status } = req.body;
    if (!status) { res.status(400).json({ success: false, error: '상태값이 필요합니다.' }); return; }
    const result = await productionService.updateStatus(id, status, req.user!.userId);
    res.json({ success: true, data: result });
  });

  updateProducedQty = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { items } = req.body;
    await productionService.updateProducedQty(id, items);
    const result = await productionService.getWithItems(id);
    res.json({ success: true, data: result });
  });

  saveMaterials = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { materials } = req.body;
    await productionService.saveMaterials(id, materials);
    const result = await productionService.getWithItems(id);
    res.json({ success: true, data: result });
  });
}

export const productionController = new ProductionController();
