export interface Sale {
  sale_id: number;
  sale_date: string;
  partner_code: string;
  variant_id: number;
  qty: number;
  unit_price: number;
  total_price: number;
  sale_type?: string;
  tax_free?: boolean;
  memo?: string | null;
  created_at: string;
  updated_at?: string;
  partner_name?: string;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
  category?: string;
}

export interface MonthlySalesSummary {
  month: string;
  partner_code: string;
  partner_name: string;
  total_qty: number;
  total_amount: number;
}

export interface MonthlyRevenueSummary {
  month: string;
  total_qty: number;
  total_amount: number;
}

export interface WeeklyStyleSummary {
  week_start: string;
  product_code: string;
  product_name: string;
  category: string;
  total_qty: number;
  total_amount: number;
}
