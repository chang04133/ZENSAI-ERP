export interface Customer {
  customer_id: number;
  customer_name: string;
  phone?: string;
  email?: string;
  grade: 'NORMAL' | 'SILVER' | 'GOLD' | 'VIP';
  total_purchases: number;
  visit_count: number;
  memo?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
