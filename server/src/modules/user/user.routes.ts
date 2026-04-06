import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { userController } from './user.controller';

const router = Router();
const adminHQStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];
const adminHQ = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];

router.get('/roles', authMiddleware, userController.getRoles);
router.put('/me', authMiddleware, userController.updateMyProfile);
router.get('/',      ...adminHQStore, userController.list);
router.get('/:id',   ...adminHQStore, userController.getById);
router.post('/',     ...adminHQStore, validateRequired(['user_id', 'user_name', 'password', 'role_group']), userController.create);
router.put('/:id',   ...adminHQStore, validateRequired(['user_name', 'role_group']), userController.update);
router.delete('/:id', ...adminHQStore, userController.remove);

export default router;
