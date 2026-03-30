export type InboundStatus = 'PENDING' | 'COMPLETED';

export interface InboundRecord {
  record_id: number;
  inbound_no: string;
  inbound_date: string;
  partner_code: string;
  status: InboundStatus;
  source_type?: string | null;
  source_id?: number | null;
  expected_qty?: number | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: InboundItem[];
  partner_name?: string;
  total_qty?: number;
  item_count?: number;
  // joined
  plan_no?: string;
  plan_name?: string;
  // 생산계획 품목 (PENDING + PRODUCTION 소스일 때)
  production_items?: Array<{
    item_id: number; category: string; sub_category: string | null;
    fit: string | null; length: string | null;
    product_code: string | null; product_name: string | null;
    plan_qty: number; produced_qty: number; unit_cost: number | null;
  }>;
}

export interface InboundItem {
  item_id: number;
  record_id: number;
  variant_id: number;
  qty: number;
  unit_price: number | null;
  memo: string | null;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
  product_code?: string;
}
