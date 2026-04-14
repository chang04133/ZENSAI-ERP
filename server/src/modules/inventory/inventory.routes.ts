import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { inventoryController } from './inventory.controller';

const router = Router();

const adminHQ = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const adminHQStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];
const allRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF')];
const adminOnly = [authMiddleware, requireRole('ADMIN')];

// 재고 조회 (STORE_STAFF 포함 — 자기 매장만 필터링됨)
router.get('/dashboard-stats', ...allRoles, inventoryController.dashboardStats);
router.get('/search-item', ...allRoles, inventoryController.searchItem);
router.get('/search-suggest', ...allRoles, inventoryController.searchSuggest);
router.get('/summary/by-season', ...allRoles, inventoryController.summaryBySeason);
router.get('/by-season/:season', ...allRoles, inventoryController.listBySeason);
router.get('/stock-map', ...allRoles, inventoryController.stockMap);
router.get('/', ...allRoles, inventoryController.list);
router.get('/by-product/:code', ...allRoles, inventoryController.byProduct);

// 본사 이상 (ADMIN_HQ)
router.get('/reorder-alerts', ...adminHQ, inventoryController.reorderAlerts);
router.get('/by-partner', ...allRoles, inventoryController.byPartner);
router.get('/warehouse', ...adminHQ, inventoryController.warehouseList);
router.get('/loss-history', ...adminHQ, inventoryController.lossHistory);
router.get('/dead-stock', ...adminHQ, inventoryController.deadStock);
router.post('/adjust', ...adminHQ, inventoryController.adjust);
router.post('/register-loss', ...adminHQ, inventoryController.registerLoss);

// 관리자만 (ADMIN_ONLY)
router.get('/transactions', ...adminOnly, inventoryController.transactions);

// /:id는 반드시 맨 마지막 (라우트 충돌 방지)
router.get('/:id', ...allRoles, inventoryController.getById);

export default router;
