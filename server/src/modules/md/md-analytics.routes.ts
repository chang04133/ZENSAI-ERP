import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { mdAnalyticsRepository } from './md-analytics.repository';
import { getPool } from '../../db/connection';

const router = Router();

// 0. ABC 등급 기준 설정 조회/저장
router.get('/abc-settings', authMiddleware, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const result = await pool.query(
    "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value IN ('MD_ABC_A_THRESHOLD', 'MD_ABC_B_THRESHOLD')",
  );
  const map: Record<string, string> = {};
  for (const r of result.rows) map[r.code_value] = r.code_label;
  res.json({ success: true, data: { abc_a: parseInt(map.MD_ABC_A_THRESHOLD || '70', 10), abc_b: parseInt(map.MD_ABC_B_THRESHOLD || '90', 10) } });
}));

router.put('/abc-settings', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const { abc_a, abc_b } = req.body as { abc_a: number; abc_b: number };
  if (!abc_a || !abc_b || abc_a < 10 || abc_a > 95 || abc_b < abc_a + 5 || abc_b > 99) {
    res.status(400).json({ success: false, error: '유효하지 않은 값' }); return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, val] of [['MD_ABC_A_THRESHOLD', String(abc_a)], ['MD_ABC_B_THRESHOLD', String(abc_b)]]) {
      await client.query(
        `INSERT INTO master_codes (code_type, code_value, code_label, is_active, sort_order)
         VALUES ('SETTING', $1, $2, true, 0)
         ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = $2`,
        [key, val],
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  res.json({ success: true, data: { abc_a, abc_b } });
}));

// 1. ABC 분석
router.get('/abc-analysis', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, abc_a, abc_b } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const overrideA = abc_a ? parseInt(abc_a, 10) : undefined;
  const overrideB = abc_b ? parseInt(abc_b, 10) : undefined;
  const data = await mdAnalyticsRepository.abcAnalysis(date_from, date_to, partnerCode, category, overrideA, overrideB);
  res.json({ success: true, data });
}));

// 2. 마진 분석 (ADMIN 전용)
router.get('/margin-analysis', authMiddleware, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { date_from, date_to, category, group_by, cost_mode } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const mode = cost_mode === 'actual' ? 'actual' : 'multiplier';
  const data = await mdAnalyticsRepository.marginAnalysis(date_from, date_to, undefined, category, group_by || 'product', mode);
  res.json({ success: true, data });
}));


// 4. 시즌 성과
router.get('/season-performance', authMiddleware, asyncHandler(async (req, res) => {
  const { year, compare_years, month_from, month_to } = req.query as Record<string, string | undefined>;
  const cmpYears = compare_years ? compare_years.split(',').map(Number).filter(n => n > 2000 && n < 2100) : undefined;
  const mFrom = month_from ? Number(month_from) : undefined;
  const mTo = month_to ? Number(month_to) : undefined;
  const data = await mdAnalyticsRepository.seasonPerformance(year ? Number(year) : undefined, cmpYears, mFrom, mTo);
  res.json({ success: true, data });
}));

// 4-1. 시즌 목표 설정 (ADMIN / HQ_MANAGER)
router.post('/season-configs', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'), asyncHandler(async (req, res) => {
  const { year, items } = req.body as { year: number; items: Array<{ season_code: string; season_name?: string; status?: string; target_styles?: number; target_qty?: number; target_revenue?: number }> };
  if (!year || !items?.length) { res.status(400).json({ success: false, error: 'year, items 필요' }); return; }
  const data = await mdAnalyticsRepository.upsertSeasonConfigs(year, items, req.user?.userName);
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
  const { season_code, schedule_id, compare_days } = req.query as Record<string, string | undefined>;
  const data = await mdAnalyticsRepository.markdownEffectiveness(
    season_code, schedule_id ? Number(schedule_id) : undefined,
    compare_days ? Number(compare_days) : undefined,
  );
  res.json({ success: true, data });
}));

// 7. 매장별 상품 적합도
router.get('/store-product-fit', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, metric, exclude_partners } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const excludeArr = exclude_partners ? exclude_partners.split(',').map(s => s.trim()).filter(Boolean) : [];
  const data = await mdAnalyticsRepository.storeProductFit(date_from, date_to, metric || 'revenue', excludeArr);
  res.json({ success: true, data });
}));

// 7-1. 매장별 상품 판매 순위
router.get('/store-product-ranking', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, partner_code, metric } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to || !partner_code) { res.status(400).json({ success: false, error: 'date_from, date_to, partner_code 필요' }); return; }
  const data = await mdAnalyticsRepository.storeProductRanking(date_from, date_to, partner_code, metric || 'revenue');
  res.json({ success: true, data });
}));

// 8. 스타일 생산성 (연도 또는 날짜 기간)
router.get('/style-productivity', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to, category, year, compare_years } = req.query as Record<string, string | undefined>;
  let dateFrom: string, dateTo: string;
  const numYear = year ? Number(year) : undefined;
  if (numYear && numYear > 2000 && numYear < 2100) {
    dateFrom = `${numYear}-01-01`; dateTo = `${numYear}-12-31`;
  } else if (date_from && date_to) {
    dateFrom = date_from; dateTo = date_to;
  } else {
    const y = new Date().getFullYear();
    dateFrom = `${y}-01-01`; dateTo = `${y}-12-31`;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data: any = await mdAnalyticsRepository.styleProductivity(dateFrom, dateTo, partnerCode, category);
  if (compare_years) {
    const cmpYears = compare_years.split(',').map(Number).filter(n => n > 2000 && n < 2100);
    if (cmpYears.length) {
      const compare: Record<number, any> = {};
      await Promise.all(cmpYears.map(async cy => {
        const c = await mdAnalyticsRepository.styleProductivity(`${cy}-01-01`, `${cy}-12-31`, partnerCode, category);
        compare[cy] = { by_category: c.by_category, monthly: c.monthly };
      }));
      data.compare_years = compare;
    }
  }
  res.json({ success: true, data });
}));

// 9. VMD 진열 효과 분석
router.get('/vmd-effect', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  if (!date_from || !date_to) { res.status(400).json({ success: false, error: 'date_from, date_to 필요' }); return; }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await mdAnalyticsRepository.vmdEffectAnalysis(date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

export default router;
