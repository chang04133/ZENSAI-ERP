import { Router, Request, Response } from 'express';
import { crmController } from './crm.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';
import { crmService } from './crm.service';
import campaignRoutes from './campaign.routes';
import segmentRoutes from './segment.routes';
import asRoutes from './as.routes';
import autoCampaignRoutes from './auto-campaign.routes';
import rfmRoutes from './rfm.routes';

const router = Router();
const readRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];
const writeRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

router.use(authMiddleware);

// 하위 라우트
router.use('/campaigns', campaignRoutes);
router.use('/segments', segmentRoutes);
router.use('/after-sales', asRoutes);
router.use('/auto-campaigns', autoCampaignRoutes);
router.use('/rfm', rfmRoutes);

// 대시보드
router.get('/dashboard', requireRole(...readRoles), crmController.dashboard);

// Tags
router.get('/tags', requireRole(...readRoles), crmController.listTags);
router.post('/tags', requireRole(...writeRoles), crmController.createTag);
router.delete('/tags/:tagId', requireRole(...writeRoles), crmController.deleteTag);

// Dormant
router.get('/dormant', requireRole(...readRoles), crmController.getDormantCustomers);
router.get('/dormant/count', requireRole(...readRoles), crmController.getDormantCount);

// Excel
router.get('/excel/export', requireRole(...readRoles), crmController.exportCustomers);
router.post('/excel/import', requireRole(...writeRoles), crmController.importCustomers);

// 고객 CRUD
router.get('/', requireRole(...readRoles), crmController.list);
router.get('/:id', requireRole(...readRoles), crmController.detail);
router.post('/', requireRole(...writeRoles), crmController.createCustomer);
router.put('/:id', requireRole(...writeRoles), crmController.updateCustomer);
router.delete('/:id', requireRole(...writeRoles), crmController.deleteCustomer);

// 구매이력
router.get('/:id/purchases', requireRole(...readRoles), crmController.getPurchases);
router.post('/:id/purchases', requireRole(...writeRoles), crmController.addPurchase);
router.put('/:id/purchases/:pid', requireRole(...writeRoles), crmController.editPurchase);
router.delete('/:id/purchases/:pid', requireRole(...writeRoles), crmController.removePurchase);

// Customer tags
router.get('/:id/tags', requireRole(...readRoles), crmController.getCustomerTags);
router.post('/:id/tags/:tagId', requireRole(...writeRoles), crmController.addCustomerTag);
router.delete('/:id/tags/:tagId', requireRole(...writeRoles), crmController.removeCustomerTag);

// Visits
router.get('/:id/visits', requireRole(...readRoles), crmController.getVisits);
router.post('/:id/visits', requireRole(...writeRoles), crmController.addVisit);
router.delete('/:id/visits/:vid', requireRole(...writeRoles), crmController.deleteVisit);

// Consultations
router.get('/:id/consultations', requireRole(...readRoles), crmController.getConsultations);
router.post('/:id/consultations', requireRole(...writeRoles), crmController.addConsultation);
router.delete('/:id/consultations/:cid', requireRole(...writeRoles), crmController.deleteConsultation);

// Purchase Patterns
router.get('/:id/patterns', requireRole(...readRoles), crmController.getPurchasePatterns);

// Message History
router.get('/:id/messages', requireRole(...readRoles), crmController.getMessageHistory);

// Dormant per-customer
router.post('/:id/reactivate', requireRole(...writeRoles), crmController.reactivateCustomer);

/* ─── 등급 자동 산정 ─── */
router.get('/tiers/rules', requireRole(...readRoles), asyncHandler(async (_req: Request, res: Response) => {
  const data = await crmService.getTierRules();
  res.json({ success: true, data });
}));
router.post('/tiers/recalculate', requireRole(...writeRoles), asyncHandler(async (_req: Request, res: Response) => {
  const result = await crmService.recalculateAllTiers();
  res.json({ success: true, data: result });
}));
router.get('/tiers/history', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const result = await crmService.getTierHistory(undefined, req.query);
  res.json({ success: true, ...result });
}));
router.post('/:id/tier/recalculate', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const result = await crmService.recalculateTier(Number(req.params.id));
  res.json({ success: true, data: result });
}));
router.get('/:id/tier-history', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const result = await crmService.getTierHistory(Number(req.params.id), req.query);
  res.json({ success: true, ...result });
}));

/* ─── 포인트 ─── */
router.get('/:id/points', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const { pointsService } = await import('./points.service');
  const data = await pointsService.getPoints(Number(req.params.id));
  res.json({ success: true, data });
}));
router.post('/:id/points/earn', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const { pointsService } = await import('./points.service');
  const { amount, sale_id, description } = req.body;
  const data = await pointsService.earn(Number(req.params.id), sale_id || null, amount || 0, req.user?.userId);
  res.json({ success: true, data });
}));
router.post('/:id/points/use', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const { pointsService } = await import('./points.service');
  const { points, description } = req.body;
  if (!points || points <= 0) { res.status(400).json({ success: false, error: '포인트는 양수여야 합니다.' }); return; }
  const data = await pointsService.use(Number(req.params.id), points, description || '수동 사용', req.user?.userId);
  res.json({ success: true, data });
}));
router.get('/:id/points/transactions', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const { pointsService } = await import('./points.service');
  const result = await pointsService.getTransactions(Number(req.params.id), req.query);
  res.json({ success: true, ...result });
}));

export default router;
