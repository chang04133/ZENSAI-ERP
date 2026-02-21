import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Material } from '../../../../shared/types/production';
import { materialService } from './material.service';
import { asyncHandler } from '../../core/async-handler';

class MaterialController extends BaseController<Material> {
  constructor() {
    super(materialService);
  }

  generateCode = asyncHandler(async (_req: Request, res: Response) => {
    const code = await materialService.generateCode();
    res.json({ success: true, data: code });
  });

  adjustStock = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { qty_change } = req.body;
    if (qty_change === undefined) {
      res.status(400).json({ success: false, error: '수량 변동값이 필요합니다.' }); return;
    }
    const result = await materialService.adjustStock(id, qty_change);
    res.json({ success: true, data: result });
  });

  lowStock = asyncHandler(async (_req: Request, res: Response) => {
    const data = await materialService.lowStockItems();
    res.json({ success: true, data });
  });

  summary = asyncHandler(async (_req: Request, res: Response) => {
    const data = await materialService.summary();
    res.json({ success: true, data });
  });
}

export const materialController = new MaterialController();
