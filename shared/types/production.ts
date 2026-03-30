export type ProductionStatus = 'DRAFT' | 'IN_PRODUCTION' | 'COMPLETED' | 'CANCELLED';
export type MaterialType = 'FABRIC' | 'ACCESSORY' | 'PACKAGING';

export interface ProductionPlan {
  plan_id: number;
  plan_no: string;
  plan_name: string;
  season: string | null;
  target_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProductionStatus;
  partner_code: string | null;
  memo: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  // 대금 관리
  total_amount?: number;
  advance_rate?: number;
  advance_amount?: number;
  advance_date?: string | null;
  advance_status?: string;
  inspect_date?: string | null;
  inspect_qty?: number;
  inspect_status?: string;
  inspect_memo?: string | null;
  balance_amount?: number;
  balance_date?: string | null;
  balance_status?: string;
  settle_status?: string;
  label_cost?: number;
  material_cost?: number;
  // Joined fields
  partner_name?: string;
  created_by_name?: string;
  items?: ProductionPlanItem[];
  materials?: ProductionMaterialUsage[];
  total_plan_qty?: number;
  total_produced_qty?: number;
  total_cost?: number;
  item_count?: number;
}

export interface ProductionPlanItem {
  item_id: number;
  plan_id: number;
  category: string;
  sub_category: string | null;
  fit: string | null;
  length: string | null;
  product_code?: string | null;
  variant_id?: number | null;
  plan_qty: number;
  produced_qty: number;
  unit_cost: number | null;
  memo: string | null;
}

export interface Material {
  material_id: number;
  material_code: string;
  material_name: string;
  material_type: MaterialType;
  unit: string;
  unit_price: number;
  stock_qty: number;
  min_stock_qty: number;
  supplier: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductionMaterialUsage {
  usage_id: number;
  plan_id: number;
  material_id: number;
  required_qty: number;
  used_qty: number;
  memo: string | null;
  // Joined
  material_name?: string;
  material_type?: string;
  unit?: string;
  unit_price?: number;
  stock_qty?: number;
}
