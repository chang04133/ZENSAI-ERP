import { Router } from 'express';
import { shipmentController } from './shipment.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

// 커스텀 라우트 (CRUD보다 먼저 등록)
router.put('/:id/shipped-qty', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'), shipmentController.updateShippedQty);
router.put('/:id/receive', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'), shipmentController.receive);

// 기본 CRUD
shipmentController.registerCrudRoutes(router, {
  readRoles: ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'],
  writeRoles: ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'],
  requiredFields: ['request_type', 'from_partner'],
  entityName: '출고의뢰',
});

export default router;
