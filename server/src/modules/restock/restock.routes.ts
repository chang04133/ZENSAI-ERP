import { Router } from 'express';
import { restockController } from './restock.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

// Custom routes (before CRUD to avoid /:id catch)
router.get('/generate-no', authMiddleware, restockController.generateNo);
router.get('/selling-velocity', authMiddleware, restockController.getSellingVelocity);
router.get('/suggestions', authMiddleware, restockController.getRestockSuggestions);
router.get('/progress-stats', authMiddleware, restockController.getProgressStats);
router.put('/:id/receive', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), restockController.receive);

// Base CRUD
restockController.registerCrudRoutes(router, {
  readRoles: ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'],
  writeRoles: ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'],
  requiredFields: ['partner_code'],
  entityName: '재입고 의뢰',
});

export default router;
