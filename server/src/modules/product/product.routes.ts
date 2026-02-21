import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { productController } from './product.controller';

const router = Router();

const write = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];

router.get('/',      authMiddleware, productController.list);
router.get('/variants/search', authMiddleware, productController.searchVariants);
router.get('/:code', authMiddleware, productController.getById);
router.post('/',     ...write, validateRequired(['product_code', 'product_name']), productController.create);
router.put('/:code', ...write, productController.update);
router.delete('/:code', ...write, productController.remove);

// Variant sub-routes
router.post('/:code/variants',       ...write, validateRequired(['color', 'size']), productController.addVariant);
router.put('/:code/variants/:id',    ...write, productController.updateVariant);
router.delete('/:code/variants/:id', ...write, productController.removeVariant);

export default router;
