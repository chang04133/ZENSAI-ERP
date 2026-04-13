// ── ABC Analysis ──
export interface AbcItem {
  key: string;
  label: string;
  category?: string;
  season?: string;
  total_price: number;
  qty: number;
  cumulative_pct: number;
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
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  qty: number;
}

export interface MarginSummary {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  avg_base_margin: number;
  avg_actual_margin: number;
  margin_distribution: Array<{ range: string; count: number }>;
}

export interface MarginAnalysisResult {
  items: MarginItem[];
  summary: MarginSummary;
}

// ── Inventory Turnover ──
export interface TurnoverItem {
  key: string;
  label: string;
  category?: string;
  sold_qty: number;
  avg_inventory: number;
  turnover_rate: number;
  dio: number;
  current_stock: number;
}

export interface TurnoverSummary {
  avg_turnover: number;
  avg_dio: number;
  slow_movers_count: number;
  fast_movers_count: number;
}

export interface InventoryTurnoverResult {
  items: TurnoverItem[];
  summary: TurnoverSummary;
  slow_movers: Array<{ product_code: string; product_name: string; category: string; turnover_rate: number; current_stock: number; stock_value: number }>;
  thresholds?: { slow: number; fast: number };
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
}

// ── Size/Color Trends ──
export interface SizeColorTrendsResult {
  by_size: Array<{ size: string; sold_qty: number; sold_pct: number; inbound_qty: number; inbound_pct: number; gap: number }>;
  by_color: Array<{ color: string; sold_qty: number; sold_pct: number; rank: number }>;
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
}

export interface MarkdownEffectivenessResult {
  schedules: MarkdownScheduleAnalysis[];
  by_round: Array<{ markdown_round: number; avg_velocity_change: number; total_additional_revenue: number; schedule_count: number }>;
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
