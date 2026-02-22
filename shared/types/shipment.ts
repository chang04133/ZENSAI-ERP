export type ShipmentRequestType = '출고' | '반품' | '수평이동';
export type ShipmentStatus = 'PENDING' | 'SHIPPED' | 'RECEIVED' | 'CANCELLED';

export interface ShipmentRequest {
  request_id: number;
  request_no: string;
  request_date: string;
  from_partner: string | null;
  to_partner: string | null;
  request_type: ShipmentRequestType;
  status: ShipmentStatus;
  memo: string | null;
  requested_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  items?: ShipmentRequestItem[];
  from_partner_name?: string;
  to_partner_name?: string;
}

export interface ShipmentRequestItem {
  item_id: number;
  request_id: number;
  variant_id: number;
  request_qty: number;
  shipped_qty: number;
  received_qty: number;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
}
