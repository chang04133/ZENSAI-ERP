import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { inventoryController } from './inventory.controller';

const router = Router();

const adminHQ = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const adminOnly = [authMiddleware, requireRole('ADMIN')];

// 범용 조회 (모든 인증된 사용자 — 컨트롤러에서 partner_code 필터링)
router.get('/dashboard-stats', authMiddleware, inventoryController.dashboardStats);
router.get('/search-item', authMiddleware, inventoryController.searchItem);
router.get('/search-suggest', authMiddleware, inventoryController.searchSuggest);
router.get('/summary/by-season', authMiddleware, inventoryController.summaryBySeason);
router.get('/by-season/:season', authMiddleware, inventoryController.listBySeason);
router.get('/', authMiddleware, inventoryController.list);
router.get('/by-product/:code', authMiddleware, inventoryController.byProduct);
router.get('/:id', authMiddleware, inventoryController.getById);

// 본사 이상 (ADMIN_HQ)
router.get('/reorder-alerts', ...adminHQ, inventoryController.reorderAlerts);
router.get('/by-partner', ...adminHQ, inventoryController.byPartner);
router.get('/warehouse', ...adminHQ, inventoryController.warehouseList);
router.get('/loss-history', ...adminHQ, inventoryController.lossHistory);
router.get('/dead-stock', ...adminHQ, inventoryController.deadStock);
router.post('/adjust', ...adminHQ, inventoryController.adjust);
router.post('/register-loss', ...adminHQ, inventoryController.registerLoss);

// 관리자만 (ADMIN_ONLY)
router.get('/transactions', ...adminOnly, inventoryController.transactions);

export default router;
