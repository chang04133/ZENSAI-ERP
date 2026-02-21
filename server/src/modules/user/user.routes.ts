import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { userController } from './user.controller';

const router = Router();
const admin = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const adminOrStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

router.get('/roles', authMiddleware, userController.getRoles);
router.get('/',      ...adminOrStore, userController.list);
router.get('/:id',   ...adminOrStore, userController.getById);
router.post('/',     ...adminOrStore, validateRequired(['user_id', 'user_name', 'password', 'role_group']), userController.create);
router.put('/:id',   ...adminOrStore, userController.update);
router.delete('/:id', ...adminOrStore, userController.remove);

export default router;
