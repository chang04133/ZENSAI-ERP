import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { inventoryController } from './inventory.controller';

const router = Router();

const adminHQ = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const adminHQStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];
const adminOnly = [authMiddleware, requireRole('ADMIN')];

// 재고 조회 (STORE_MANAGER 이상)
router.get('/dashboard-stats', ...adminHQStore, inventoryController.dashboardStats);
router.get('/search-item', ...adminHQStore, inventoryController.searchItem);
router.get('/search-suggest', ...adminHQStore, inventoryController.searchSuggest);
router.get('/summary/by-season', ...adminHQStore, inventoryController.summaryBySeason);
router.get('/by-season/:season', ...adminHQStore, inventoryController.listBySeason);
router.get('/stock-map', ...adminHQStore, inventoryController.stockMap);
router.get('/', ...adminHQStore, inventoryController.list);
router.get('/by-product/:code', ...adminHQStore, inventoryController.byProduct);

// 본사 이상 (ADMIN_HQ)
router.get('/reorder-alerts', ...adminHQ, inventoryController.reorderAlerts);
router.get('/by-partner', ...adminHQStore, inventoryController.byPartner);
router.get('/warehouse', ...adminHQ, inventoryController.warehouseList);
router.get('/loss-history', ...adminHQ, inventoryController.lossHistory);
router.get('/dead-stock', ...adminHQ, inventoryController.deadStock);
router.post('/adjust', ...adminHQ, inventoryController.adjust);
router.post('/register-loss', ...adminHQ, inventoryController.registerLoss);

// 관리자만 (ADMIN_ONLY)
router.get('/transactions', ...adminOnly, inventoryController.transactions);

// /:id는 반드시 맨 마지막 (라우트 충돌 방지)
router.get('/:id', ...adminHQStore, inventoryController.getById);

export default router;
