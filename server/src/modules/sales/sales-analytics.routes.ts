import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { salesRepository } from './sales.repository';
import { asyncHandler } from '../../core/async-handler';

const router = Router();

// 매출현황 대시보드
router.get('/dashboard-stats', authMiddleware, asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.dashboardStats(year, partnerCode);
  res.json({ success: true, data });
}));

// 분석 라우트 (CRUD보다 먼저 등록 - 경로 충돌 방지)
router.get('/monthly-sales', authMiddleware, asyncHandler(async (req, res) => {
  const query: any = { ...req.query };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc) query.partner_code = pc;
  const data = await salesRepository.monthlySales(query);
  res.json({ success: true, data });
}));

// 스타일 판매 분석 (전년대비 종합)
router.get('/style-analytics', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.styleAnalytics(year, partnerCode);
  res.json({ success: true, data });
}));

// 연도별 매출현황 (최근 6년)
router.get('/yearly-overview', authMiddleware, asyncHandler(async (req, res) => {
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.yearlyOverview(partnerCode);
  res.json({ success: true, data });
}));

// 연단위 비교
router.get('/year-comparison', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.yearComparison(year, partnerCode);
  res.json({ success: true, data });
}));

// 스타일별 판매현황 (기간별)
router.get('/style-by-range', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, sub_category, season, fit, color, size, search, sale_status, year_from, year_to, length } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const filters = { sub_category, season, fit, color, size, search, sale_status, year_from, year_to, length };
  const data = await salesRepository.styleSalesByRange(date_from, date_to, partnerCode, category || undefined, filters);
  res.json({ success: true, data });
}));

// 상품별 컬러/사이즈 판매 상세
router.get('/product-variant-sales', authMiddleware, asyncHandler(async (req, res) => {
  const { product_code, date_from, date_to } = req.query as { product_code?: string; date_from?: string; date_to?: string };
  if (!product_code || !date_from || !date_to) {
    res.status(400).json({ success: false, error: 'product_code, date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.productVariantSales(product_code, date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

// 판매 리스트 (기간별: 일별/주별/월별)
router.get('/products-by-range', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, sub_category, season, fit, length, color, size, search, partner_code, year_from, year_to, sale_status } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  // 매장 역할: 자기 매장만, 본사: partner_code 파라미터 or 전체
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : (partner_code || undefined);
  const filters = { category, sub_category, season, fit, length, color, size, search, year_from, year_to, sale_status };
  // 빈 문자열 제거
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as any;
  const data = await salesRepository.salesProductsByRange(date_from, date_to, partnerCode, Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined);
  res.json({ success: true, data });
}));

// 판매율 분석 (품번별/사이즈별/카테고리별/일자별)
router.get('/sell-through', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category } = req.query as { date_from?: string; date_to?: string; category?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.sellThroughAnalysis(date_from, date_to, partnerCode, category || undefined);
  res.json({ success: true, data });
}));

// 드랍 분석 (출시일 기준 판매율/코호트/판매속도)
router.get('/drop-analysis', authMiddleware, asyncHandler(async (req, res) => {
  const { category } = req.query as { category?: string };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.dropAnalysis(partnerCode, category || undefined);
  res.json({ success: true, data });
}));

export default router;
