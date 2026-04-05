/**
 * Sales Repository — Facade
 *
 * 실제 구현은 아래 3개 파일로 분리:
 *  - sales-crud.repository.ts        (CRUD: listWithDetails)
 *  - sales-analytics.repository.ts   (대시보드/통계 8개)
 *  - sales-detailed-analysis.repository.ts (상세분석 5개)
 *
 * 기존 import 경로 호환을 위해 salesRepository 싱글턴을 re-export.
 */
import { SalesCrudRepository } from './sales-crud.repository';
import { SalesAnalyticsRepository } from './sales-analytics.repository';
import { SalesDetailedAnalysisRepository } from './sales-detailed-analysis.repository';

const crud = new SalesCrudRepository();
const analytics = new SalesAnalyticsRepository();
const detailed = new SalesDetailedAnalysisRepository();

export const salesRepository = {
  // ── CRUD ──
  listWithDetails: crud.listWithDetails.bind(crud),

  // ── Analytics ──
  monthlySales: analytics.monthlySales.bind(analytics),
  monthlyRevenue: analytics.monthlyRevenue.bind(analytics),
  dashboardStats: analytics.dashboardStats.bind(analytics),
  comprehensiveSales: analytics.comprehensiveSales.bind(analytics),
  yearComparison: analytics.yearComparison.bind(analytics),
  styleAnalytics: analytics.styleAnalytics.bind(analytics),
  yearlyOverview: analytics.yearlyOverview.bind(analytics),
  weeklyStyleSales: analytics.weeklyStyleSales.bind(analytics),

  // ── Detailed Analysis ──
  salesProductsByRange: detailed.salesProductsByRange.bind(detailed),
  styleSalesByRange: detailed.styleSalesByRange.bind(detailed),
  productVariantSales: detailed.productVariantSales.bind(detailed),
  sellThroughAnalysis: detailed.sellThroughAnalysis.bind(detailed),
  dropAnalysis: detailed.dropAnalysis.bind(detailed),
};

export type SalesRepository = typeof salesRepository;
