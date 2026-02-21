export type SaleStatus = '판매중' | '일시품절' | '단종' | '승인대기';

export interface Product {
  product_code: string;
  product_name: string;
  category: string | null;
  sub_category: string | null;
  brand: string | null;
  season: string | null;
  fit: string | null;
  length: string | null;
  base_price: number;
  cost_price: number;
  discount_price: number | null;
  event_price: number | null;
  sale_status: SaleStatus;
  low_stock_alert: boolean;
  low_stock_threshold: number | null;
  medium_stock_threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  variant_id: number;
  product_code: string;
  color: string;
  size: string;
  sku: string;
  barcode: string | null;
  warehouse_location: string | null;
  stock_qty: number;
  price: number | null;
  is_active: boolean;
  created_at: string;
}
