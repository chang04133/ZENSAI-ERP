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
  partner_code: string;
  partner_name: string;
  sku: string;
  product_name: string;
  color: string;
  size: string;
  current_qty: number;
  low_threshold: number;
  medium_threshold: number;
  alert_level: 'ZERO' | 'LOW' | 'MEDIUM';
  sold_7d: number;
  sold_30d: number;
  avg_daily_7d: number;
  suggested_qty: number;
}
