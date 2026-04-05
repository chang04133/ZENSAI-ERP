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
router.get('/by-partner', authMiddleware, inventoryController.byPartner);
router.get('/warehouse', authMiddleware, inventoryController.warehouseList);
router.get('/loss-history', authMiddleware, inventoryController.lossHistory);
router.get('/transactions', authMiddleware, inventoryController.transactions);
router.get('/dead-stock', authMiddleware, inventoryController.deadStock);
router.get('/', authMiddleware, inventoryController.list);
router.get('/by-product/:code', authMiddleware, inventoryController.byProduct);
router.get('/:id', authMiddleware, inventoryController.getById);
router.post('/adjust', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), inventoryController.adjust);
router.post('/register-loss', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), inventoryController.registerLoss);

export default router;
