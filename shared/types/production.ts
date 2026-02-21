export type ProductionStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PRODUCTION' | 'COMPLETED' | 'CANCELLED';
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
  stock_qty?: number;
}
