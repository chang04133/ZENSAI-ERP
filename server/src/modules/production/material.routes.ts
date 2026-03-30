import { Router } from 'express';
import { materialController } from './material.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { materialService } from './material.service';
import { productRepository } from '../product/product.repository';

const router = Router();

router.get('/generate-code', authMiddleware, requireRole('ADMIN'), materialController.generateCode);
router.get('/low-stock', authMiddleware, requireRole('ADMIN'), materialController.lowStock);
router.get('/summary', authMiddleware, requireRole('ADMIN'), materialController.summary);
router.put('/:id/adjust-stock', authMiddleware, requireRole('ADMIN'), materialController.adjustStock);

// 자재 수정 시 unit_price 변경되면 연관 상품 cost_price 재계산
router.put('/:id', authMiddleware, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const item = await materialService.update(id, req.body);
  if (!item) {
    res.status(404).json({ success: false, error: '자재를 찾을 수 없습니다.' });
    return;
  }
  // unit_price가 body에 포함되어 있으면 연관 상품 원가 재계산
  if (req.body.unit_price !== undefined) {
    await productRepository.recalculateCostPriceByMaterial(id);
  }
  res.json({ success: true, data: item });
}));

materialController.registerCrudRoutes(router, {
  readRoles: ['ADMIN'],
  writeRoles: ['ADMIN'],
  requiredFields: ['material_name', 'material_type'],
  entityName: '자재',
});

export default router;
