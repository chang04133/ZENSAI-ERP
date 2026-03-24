import { Router } from 'express';
import { productionController } from './production.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

// 커스텀 라우트
router.get('/dashboard', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.dashboard);
router.get('/generate-no', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN'), productionController.generateNo);
router.get('/category-stats', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.categoryStats);
router.get('/category-stats/:category/sub', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.categorySubStats);
router.get('/recommendations', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN'), productionController.recommendations);
router.get('/auto-generate/preview', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN'), productionController.autoGeneratePreview);
router.post('/auto-generate', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN'), productionController.autoGenerate);
router.get('/product-variants/:productCode', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.productVariantDetail);
router.get('/payment-summary', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.paymentSummary);
router.put('/:id/payment', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.updatePayment);
router.put('/:id/status', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.updateStatus);
router.put('/:id/produced-qty', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.updateProducedQty);
router.put('/:id/materials', authMiddleware, requireRole('SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'), productionController.saveMaterials);

// 기본 CRUD
productionController.registerCrudRoutes(router, {
  readRoles: ['SYS_ADMIN', 'ADMIN', 'HQ_MANAGER'],
  writeRoles: ['SYS_ADMIN', 'ADMIN'],
  requiredFields: ['plan_name'],
  entityName: '생산계획',
});

export default router;
