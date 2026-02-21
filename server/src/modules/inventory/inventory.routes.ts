import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { inventoryController } from './inventory.controller';

const router = Router();

router.get('/dashboard-stats', authMiddleware, inventoryController.dashboardStats);
router.get('/reorder-alerts', authMiddleware, inventoryController.reorderAlerts);
router.get('/search-item', authMiddleware, inventoryController.searchItem);
router.get('/search-suggest', authMiddleware, inventoryController.searchSuggest);
router.get('/summary/by-season', authMiddleware, inventoryController.summaryBySeason);
router.get('/by-season/:season', authMiddleware, inventoryController.listBySeason);
router.get('/transactions', authMiddleware, inventoryController.transactions);
router.get('/', authMiddleware, inventoryController.list);
router.get('/by-product/:code', authMiddleware, inventoryController.byProduct);
router.get('/:id', authMiddleware, inventoryController.getById);
router.post('/adjust', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), inventoryController.adjust);

export default router;
