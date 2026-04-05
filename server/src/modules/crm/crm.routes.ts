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
const router = Router();
const readRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];
const writeRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

router.use(authMiddleware);

// 하위 라우트
router.use('/campaigns', campaignRoutes);
router.use('/segments', segmentRoutes);
router.use('/after-sales', asRoutes);
router.use('/auto-campaigns', autoCampaignRoutes);
// 대시보드
router.get('/dashboard', requireRole(...readRoles), crmController.dashboard);

// 상품 추천
router.get('/recommendations/customer/:id', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const { recommendationService } = await import('./recommendation.service');
  const data = await recommendationService.getForCustomer(Number(req.params.id));
  res.json({ success: true, data });
}));
router.post('/recommendations/recalculate', requireRole(...writeRoles), asyncHandler(async (_req: Request, res: Response) => {
  const { recommendationService } = await import('./recommendation.service');
  const result = await recommendationService.recalculateAll();
  res.json({ success: true, data: result, message: `${result.calculated}건 추천 데이터 생성` });
}));

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

// Flags (전역)
router.get('/flags', requireRole(...readRoles), crmController.listFlags);

// RFM / LTV
router.get('/rfm/distribution', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const sc = getStorePartnerCode(req);
  const { rfmService } = await import('./rfm.service');
  const data = await rfmService.getDistribution(sc || undefined);
  res.json({ success: true, data });
}));
router.get('/rfm/ltv-top', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const sc = getStorePartnerCode(req);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { rfmService } = await import('./rfm.service');
  const data = await rfmService.getLtvTop(limit, sc || undefined);
  res.json({ success: true, data });
}));
router.post('/rfm/recalculate', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const sc = getStorePartnerCode(req);
  const { rfmService } = await import('./rfm.service');
  const result = await rfmService.recalculateAll(sc || undefined);
  res.json({ success: true, data: result, message: `${result.updated}명 RFM 재계산 완료` });
}));

// 등급 자동 산정 (/:id 라우트보다 위에 배치)
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

// 생일 고객
router.get('/birthdays', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const sc = getStorePartnerCode(req);
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const data = await crmService.getBirthdayCustomers(month, sc || undefined);
  res.json({ success: true, data });
}));

// VIP 미방문 알림
router.get('/vip-alerts', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const sc = getStorePartnerCode(req);
  const days = Number(req.query.days) || 60;
  const data = await crmService.getVipAlerts(days, sc || undefined);
  res.json({ success: true, data });
}));

// 일일 요약
router.get('/daily-summary', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const sc = getStorePartnerCode(req);
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const data = await crmService.getDailySummary(date, sc || undefined);
  res.json({ success: true, data });
}));

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

// Shipments (택배발송)
router.get('/:id/shipments', requireRole(...readRoles), crmController.getShipments);
router.post('/:id/shipments', requireRole(...writeRoles), crmController.addShipment);
router.delete('/:id/shipments/:sid', requireRole(...writeRoles), crmController.deleteShipment);

// Purchase Patterns
router.get('/:id/patterns', requireRole(...readRoles), crmController.getPurchasePatterns);

// Message History
router.get('/:id/messages', requireRole(...readRoles), crmController.getMessageHistory);

// Feedback
router.get('/:id/feedback', requireRole(...readRoles), crmController.getFeedback);
router.post('/:id/feedback', requireRole(...writeRoles), crmController.addFeedback);
router.delete('/:id/feedback/:fid', requireRole(...writeRoles), crmController.deleteFeedback);

// Customer Flags
router.get('/:id/flags', requireRole(...readRoles), crmController.getCustomerFlags);
router.post('/:id/flags/:flagId', requireRole(...writeRoles), crmController.addCustomerFlag);
router.delete('/:id/flags/:flagId', requireRole(...writeRoles), crmController.removeCustomerFlag);

// Dormant per-customer
router.post('/:id/reactivate', requireRole(...writeRoles), crmController.reactivateCustomer);

/** 매장 매니저 → 자기 매장 고객만 접근 가능 (인라인 핸들러용) */
const checkCustomerAccess = async (req: Request, res: Response): Promise<boolean> => {
  const sc = getStorePartnerCode(req);
  if (!sc) return true;
  const c = await crmService.getDetail(Number(req.params.id));
  if (!c) { res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' }); return false; }
  if (c.partner_code !== sc) { res.status(403).json({ success: false, error: '다른 매장의 고객 정보에 접근할 수 없습니다.' }); return false; }
  return true;
};

// 등급 per-customer
router.post('/:id/tier/recalculate', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  if (!await checkCustomerAccess(req, res)) return;
  const result = await crmService.recalculateTier(Number(req.params.id));
  res.json({ success: true, data: result });
}));
router.get('/:id/tier-history', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  if (!await checkCustomerAccess(req, res)) return;
  const result = await crmService.getTierHistory(Number(req.params.id), req.query);
  res.json({ success: true, ...result });
}));

/* ─── RFM (개별 고객) ─── */
router.get('/:id/rfm', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  if (!await checkCustomerAccess(req, res)) return;
  const { rfmService } = await import('./rfm.service');
  const data = await rfmService.getCustomerRfm(Number(req.params.id));
  res.json({ success: true, data });
}));

export default router;
