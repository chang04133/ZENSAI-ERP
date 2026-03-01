import { Router } from 'express';
import { inboundController } from './inbound.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

// Custom routes (before CRUD to avoid /:id catch)
router.get('/generate-no', authMiddleware, inboundController.generateNo);

// CRUD
router.get('/', authMiddleware, inboundController.list);
router.get('/:id', authMiddleware, inboundController.getById);
router.post('/', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), inboundController.create);
router.delete('/:id', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN'), inboundController.remove);

export default router;
