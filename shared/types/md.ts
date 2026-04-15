// ── ABC Analysis (글로벌 누적매출 기반) ──
export interface AbcItem {
  key: string;
  label: string;
  category: string;
  total_price: number;
  qty: number;
  cumulative_pct: number;     // 누적 매출 비중%
  grade: 'A' | 'B' | 'C';
}

export interface AbcSummary {
  total_revenue: number;
  a_count: number; b_count: number; c_count: number;
  a_revenue: number; b_revenue: number; c_revenue: number;
}

export interface AbcAnalysisResult {
  items: AbcItem[];
  summary: AbcSummary;
}

// ── Margin Analysis ──
export interface MarginItem {
  key: string;
  label: string;
  category?: string;
  cost_price: number;
  base_price: number;
  avg_selling_price: number;
  base_margin_pct: number;
  actual_margin_pct: number;
  distribution_fee_pct: number;
  manager_fee_pct: number;
  distribution_fee_amount: number;
  manager_fee_amount: number;
  net_margin_pct: number;
  net_profit: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  qty: number;
}

export interface MarginSummary {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  total_net_profit: number;
  avg_base_margin: number;
  avg_actual_margin: number;
  avg_net_margin: number;
  distribution_fee_pct: number;
  manager_fee_pct: number;
  total_distribution_fee: number;
  total_manager_fee: number;
  cost_multiplier?: number;
  margin_distribution: Array<{ range: string; count: number }>;
}

export interface MarginAnalysisResult {
  items: MarginItem[];
  summary: MarginSummary;
}


// ── Season Performance ──
export interface SeasonRow {
  season_code: string;
  season_name: string;
  status: string;
  target_styles: number;
  target_qty: number;
  target_revenue: number;
  actual_styles: number;
  actual_qty: number;
  actual_revenue: number;
  achievement_rate_qty: number;
  achievement_rate_revenue: number;
  remaining_stock: number;
  remaining_stock_value: number;
}

export interface SeasonPerformanceResult {
  seasons: SeasonRow[];
  prev_seasons: SeasonRow[];
  compare_seasons?: Record<number, SeasonRow[]>;  // year → SeasonRow[]
}

// ── Season Category Performance ──
export interface SeasonCategoryRow {
  category: string;
  season_code: string;
  style_count: number;
  sold_qty: number;
  revenue: number;
}

// year → SeasonCategoryRow[]
export type SeasonCategoryResult = Record<number, SeasonCategoryRow[]>;

// ── Size/Color Trends ──
export interface SizeColorTrendsResult {
  by_size: Array<{ size: string; sold_qty: number; sold_pct: number; inbound_qty: number; inbound_pct: number; gap: number; prev1_qty: number; prev2_qty: number; prev1_growth: number | null; prev2_growth: number | null }>;
  by_color: Array<{ color: string; sold_qty: number; sold_pct: number; rank: number; prev1_qty: number; prev2_qty: number; prev1_growth: number | null; prev2_growth: number | null }>;
  by_category_size: Array<{ category: string; size: string; sold_qty: number; sold_pct: number }>;
  by_category_color: Array<{ category: string; color: string; sold_qty: number; sold_pct: number }>;
}

// ── Markdown Effectiveness ──
export interface MarkdownScheduleAnalysis {
  schedule_id: number;
  schedule_name: string;
  season_code: string;
  markdown_round: number;
  discount_rate: number;
  applied_at: string;
  start_date: string;
  end_date: string;
  pre_velocity: number;
  post_velocity: number;
  velocity_change_pct: number;
  pre_revenue: number;
  post_revenue: number;
  additional_revenue: number;
  affected_products: number;
  // 대조군 비교
  control_pre_velocity: number;
  control_post_velocity: number;
  control_velocity_change_pct: number;
  net_effect_pct: number;
  // 재고 소진
  stock_at_markdown: number;        // 마크다운 시점 추정 재고
  stock_remaining: number;          // 현재 잔여 재고
  clearance_rate: number;           // 소진율 %
  // 마진 회수
  discount_loss: number;            // 할인 손실 = (정가-할인가) × 할인후 판매수량
  marginal_profit: number;          // 추가 판매 이익 = (추가수량) × (할인가-원가)
  net_markdown_value: number;       // 순 효과 = marginal_profit - discount_loss
  // 상대 판매율 비교 (비할인 상품 대비)
  relative_velocity_index: number;  // 상대 판매속도 지수 (0=동일, +면 할인효과, -면 역효과)
  control_sell_through: number;     // 대조군 판매소진율 %
  sell_through_gap: number;         // 소진율 격차 pp (target - control)
}

export interface MarkdownDailyTrend {
  date: string;
  qty: number;
  revenue: number;
  control_qty: number;
  control_revenue: number;
  is_post: boolean;
}

export interface MarkdownEffectivenessResult {
  schedules: MarkdownScheduleAnalysis[];
  by_round: Array<{ markdown_round: number; avg_velocity_change: number; avg_net_effect: number; total_additional_revenue: number; schedule_count: number }>;
  compare_days: number;
  daily_trend?: MarkdownDailyTrend[];     // 특정 스케줄 선택 시
}

// ── Style Productivity (스타일 생산성) ──
export interface StyleProductivityRow {
  category: string;
  style_count: number;
  total_qty: number;
  total_revenue: number;
  qty_per_style: number;
  revenue_per_style: number;
}

export interface StyleProductivityMonthly {
  month: string;          // YYYY-MM
  style_count: number;
  total_qty: number;
  total_revenue: number;
  qty_per_style: number;
  revenue_per_style: number;
}

export interface StyleProductivityResult {
  by_category: StyleProductivityRow[];
  monthly: StyleProductivityMonthly[];
  by_category_monthly: Array<StyleProductivityMonthly & { category: string }>;
  compare_years?: Record<number, {
    by_category: StyleProductivityRow[];
    monthly: StyleProductivityMonthly[];
  }>;
}

// ── Markdown Schedule Management ──
export interface MarkdownSchedule {
  schedule_id: number;
  schedule_name: string;
  season_code: string;
  markdown_round: number;
  discount_rate: number;
  start_date: string;
  end_date: string | null;
  status: 'DRAFT' | 'APPLIED' | 'REVERTED';
  applied_at: string | null;
  reverted_at: string | null;
  created_by: string;
  created_at: string;
  items?: MarkdownItemRow[];
  item_count?: number;
}

export interface MarkdownItemRow {
  item_id: number;
  product_code: string;
  product_name?: string;
  original_price: number;
  markdown_price: number;
  status: string;
}

// ── Store Product Comparison (Auto Insights) ──
export interface StoreComparisonExclusive {
  product_code: string;
  product_name: string;
  category: string;
  partner_code: string;
  partner_name: string;
  qty: number;
  revenue: number;
  avg_qty: number;
  avg_revenue: number;
  vs_avg_pct: number;
  concentration_pct: number;
}

export interface StoreComparisonGap {
  product_code: string;
  product_name: string;
  category: string;
  top_store: string;
  top_qty: number;
  top_revenue: number;
  bottom_store: string;
  bottom_qty: number;
  bottom_revenue: number;
  gap_multiplier: number;
  store_count: number;
}

export interface StoreComparisonUniversal {
  product_code: string;
  product_name: string;
  category: string;
  total_qty: number;
  total_revenue: number;
  store_count: number;
  avg_rank: number;
  top10_count: number;
}

export interface StoreProductComparisonResult {
  exclusive_winners: StoreComparisonExclusive[];
  sales_gaps: StoreComparisonGap[];
  universal_bestsellers: StoreComparisonUniversal[];
  total_products: number;
  total_stores: number;
}

// ── Store-Product Fit ──
export interface StoreProductFitResult {
  matrix: Array<{
    partner_code: string;
    partner_name: string;
    categories: Record<string, { value: number; vs_avg: number }>;
  }>;
  categories: string[];
  top_combinations: Array<{ partner_name: string; category: string; value: number; rank: number }>;
  store_summary: Array<{ partner_code: string; partner_name: string; strength: string; weakness: string; overall: number }>;
}
