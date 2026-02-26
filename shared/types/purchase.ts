export interface PurchaseOrder {
  po_id: number;
  po_no: string;
  supplier_code: string;
  to_partner?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'RECEIVED' | 'CANCELLED';
  order_date: string;
  expected_date?: string;
  received_date?: string;
  total_amount: number;
  memo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
  to_partner_name?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  item_id: number;
  po_id: number;
  variant_id: number;
  order_qty: number;
  unit_cost: number;
  received_qty: number;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
}
