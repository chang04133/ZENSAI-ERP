import { Router } from 'express';
import { productionController } from './production.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

// 커스텀 라우트
router.get('/dashboard', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), productionController.dashboard);
router.get('/generate-no', authMiddleware, requireRole('ADMIN'), productionController.generateNo);
router.get('/recommendations', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), productionController.recommendations);
router.get('/category-stats', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), productionController.categoryStats);
router.get('/category-stats/:category/sub', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), productionController.categorySubStats);
router.get('/product-variants/:productCode', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), productionController.productVariantDetail);
router.get('/auto-generate/preview', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), productionController.autoGeneratePreview);
router.post('/auto-generate', authMiddleware, requireRole('ADMIN'), productionController.autoGenerate);
router.put('/:id/status', authMiddleware, requireRole('ADMIN'), productionController.updateStatus);
router.put('/:id/produced-qty', authMiddleware, requireRole('ADMIN'), productionController.updateProducedQty);
router.put('/:id/materials', authMiddleware, requireRole('ADMIN'), productionController.saveMaterials);

// 기본 CRUD
productionController.registerCrudRoutes(router, {
  readRoles: ['ADMIN', 'HQ_MANAGER'],
  writeRoles: ['ADMIN'],
  requiredFields: ['plan_name'],
  entityName: '생산계획',
});

export default router;
