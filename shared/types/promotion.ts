export interface Promotion {
  promo_id: number;
  promo_name: string;
  promo_type: 'PERCENT' | 'FIXED' | 'BOGO' | 'THRESHOLD';
  discount_value: number;
  min_qty?: number;
  min_amount?: number;
  target_categories?: string[];
  target_products?: string[];
  start_date: string;
  end_date: string;
  is_active: boolean;
  priority: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}
