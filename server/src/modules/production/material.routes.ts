import { Router } from 'express';
import { materialController } from './material.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

router.get('/generate-code', authMiddleware, requireRole('ADMIN'), materialController.generateCode);
router.get('/low-stock', authMiddleware, requireRole('ADMIN'), materialController.lowStock);
router.get('/summary', authMiddleware, requireRole('ADMIN'), materialController.summary);
router.put('/:id/adjust-stock', authMiddleware, requireRole('ADMIN'), materialController.adjustStock);

materialController.registerCrudRoutes(router, {
  readRoles: ['ADMIN'],
  writeRoles: ['ADMIN'],
  requiredFields: ['material_name', 'material_type'],
  entityName: '자재',
});

export default router;
