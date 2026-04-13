import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { mdAnalyticsRepository } from './md-analytics.repository';

const router = Router();

// 1. ABC 분석
router.get('/abc-analysis', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, dimension } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await mdAnalyticsRepository.abcAnalysis(date_from, date_to, partnerCode, category, dimension || 'product');
  res.json({ success: true, data });
}));

// 2. 마진 분석 (ADMIN 전용)
router.get('/margin-analysis', authMiddleware, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { date_from, date_to, category, group_by } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const data = await mdAnalyticsRepository.marginAnalysis(date_from, date_to, undefined, category, group_by || 'product');
  res.json({ success: true, data });
}));

// 3. 재고 회전율
router.get('/inventory-turnover', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, group_by } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await mdAnalyticsRepository.inventoryTurnover(date_from, date_to, partnerCode, category, group_by || 'product');
  res.json({ success: true, data });
}));

// 4. 시즌 성과
router.get('/season-performance', authMiddleware, asyncHandler(async (req, res) => {
  const { year } = req.query as Record<string, string | undefined>;
  const data = await mdAnalyticsRepository.seasonPerformance(year ? Number(year) : undefined);
  res.json({ success: true, data });
}));

// 5. 사이즈/컬러 트렌드
router.get('/size-color-trends', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await mdAnalyticsRepository.sizeColorTrends(date_from, date_to, partnerCode, category);
  res.json({ success: true, data });
}));

// 6. 마크다운 효과
router.get('/markdown-effectiveness', authMiddleware, asyncHandler(async (req, res) => {
  const { season_code, schedule_id } = req.query as Record<string, string | undefined>;
  const data = await mdAnalyticsRepository.markdownEffectiveness(season_code, schedule_id ? Number(schedule_id) : undefined);
  res.json({ success: true, data });
}));

// 7. 매장별 상품 적합도
router.get('/store-product-fit', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, metric } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const data = await mdAnalyticsRepository.storeProductFit(date_from, date_to, metric || 'sell_through');
  res.json({ success: true, data });
}));

export default router;
