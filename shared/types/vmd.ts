export interface DisplayAssignment {
  assignment_id: number;
  partner_code: string;
  partner_name?: string;
  product_code: string;
  product_name?: string;
  category?: string;
  zone_code: string;
  zone_label?: string;
  assigned_date: string;
  removed_date: string | null;
  notes: string | null;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface VmdZoneSummary {
  zone_code: string;
  zone_label: string;
  product_count: number;
  avg_daily_qty: number;
  avg_daily_revenue: number;
  total_qty: number;
  total_revenue: number;
}

export interface VmdProductEffect {
  product_code: string;
  product_name: string;
  category: string;
  zone_code: string;
  zone_label: string;
  partner_code?: string;
  partner_name?: string;
  days_displayed: number;
  qty: number;
  revenue: number;
  daily_velocity: number;
  normal_velocity: number;
  velocity_lift_pct: number;
}

export interface VmdEffectResult {
  by_zone: VmdZoneSummary[];
  products: VmdProductEffect[];
  total_products: number;
  avg_lift_pct: number;
}

export interface StoreFixture {
  fixture_id: number;
  partner_code: string;
  fixture_type: 'HANGER' | 'MANNEQUIN';
  fixture_name: string;
  products: string[];
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface FixtureSalesMap {
  [productCode: string]: { product_name: string; qty: number; revenue: number };
}
