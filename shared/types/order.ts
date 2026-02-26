export interface Order {
  order_id: number;
  order_no: string;
  customer_id?: number;
  partner_code: string;
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  order_date: string;
  total_amount: number;
  memo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  partner_name?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  item_id: number;
  order_id: number;
  variant_id: number;
  qty: number;
  unit_price: number;
  total_price: number;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
}
