export interface InboundRecord {
  record_id: number;
  inbound_no: string;
  inbound_date: string;
  partner_code: string;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: InboundItem[];
  partner_name?: string;
  total_qty?: number;
  item_count?: number;
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
