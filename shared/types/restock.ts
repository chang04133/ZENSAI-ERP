export type RestockStatus = 'DRAFT' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export interface RestockRequest {
  request_id: number;
  request_no: string;
  request_date: string;
  partner_code: string;
  status: RestockStatus;
  expected_date: string | null;
  received_date: string | null;
  memo: string | null;
  requested_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  items?: RestockRequestItem[];
  partner_name?: string;
}

export interface RestockRequestItem {
  item_id: number;
  request_id: number;
  variant_id: number;
  request_qty: number;
  received_qty: number;
  unit_cost: number | null;
  memo: string | null;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
}

export interface SellingVelocity {
  variant_id: number;
  sku: string;
  product_name: string;
  color: string;
  size: string;
  product_code: string;
  sold_7d: number;
  sold_30d: number;
  avg_daily_7d: number;
  avg_daily_30d: number;
  current_qty: number;
  days_until_out_7d: number | null;
  days_until_out_30d: number | null;
}

export interface RestockSuggestion {
  variant_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  season: string;
  // 판매 분석 (60일 기반)
  total_sold: number;
  avg_daily: number;
  sell_through_rate: number;
  // 수요 예측
  demand_30d: number;
  season_weight: number;
  // 재고 현황
  current_stock: number;
  in_production_qty: number;
  total_available: number;
  // 분석 결과
  shortage_qty: number;
  suggested_qty: number;
  days_of_stock: number;
  urgency: 'CRITICAL' | 'WARNING' | 'NORMAL';
  grade: 'S' | 'A' | 'B' | 'C';
}
