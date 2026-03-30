import { Router } from 'express';
import { productionController } from './production.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

// 커스텀 라우트 (ADMIN 전용)
router.get('/dashboard', authMiddleware, requireRole('ADMIN'), productionController.dashboard);
router.get('/generate-no', authMiddleware, requireRole('ADMIN'), productionController.generateNo);
router.get('/category-stats', authMiddleware, requireRole('ADMIN'), productionController.categoryStats);
router.get('/category-stats/:category/sub', authMiddleware, requireRole('ADMIN'), productionController.categorySubStats);
router.get('/recommendations', authMiddleware, requireRole('ADMIN'), productionController.recommendations);
router.get('/auto-generate/preview', authMiddleware, requireRole('ADMIN'), productionController.autoGeneratePreview);
router.post('/auto-generate', authMiddleware, requireRole('ADMIN'), productionController.autoGenerate);
router.get('/product-variants/:productCode', authMiddleware, requireRole('ADMIN'), productionController.productVariantDetail);
router.get('/payment-summary', authMiddleware, requireRole('ADMIN'), productionController.paymentSummary);
router.put('/:id/payment', authMiddleware, requireRole('ADMIN'), productionController.updatePayment);
router.put('/:id/status', authMiddleware, requireRole('ADMIN'), productionController.updateStatus);
router.put('/:id/produced-qty', authMiddleware, requireRole('ADMIN'), productionController.updateProducedQty);
router.put('/:id/materials', authMiddleware, requireRole('ADMIN'), productionController.saveMaterials);
router.put('/:id/start-production', authMiddleware, requireRole('ADMIN'), productionController.startProduction);
router.put('/:id/complete-production', authMiddleware, requireRole('ADMIN'), productionController.completeProduction);

// 기본 CRUD
productionController.registerCrudRoutes(router, {
  readRoles: ['ADMIN'],
  writeRoles: ['ADMIN'],
  requiredFields: ['plan_name'],
  entityName: '생산계획',
});

export default router;
