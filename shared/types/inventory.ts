export interface Inventory {
  inventory_id: number;
  partner_code: string;
  variant_id: number;
  qty: number;
  updated_at: string;
  partner_name?: string;
  sku?: string;
  product_name?: string;
  color?: string;
  size?: string;
}

export type TxType = 'SHIPMENT' | 'RETURN' | 'TRANSFER' | 'ADJUST' | 'SALE' | 'RESTOCK' | 'PRODUCTION';

export interface InventoryTransaction {
  tx_id: number;
  tx_type: TxType;
  ref_id: number | null;
  partner_code: string;
  variant_id: number;
  qty_change: number;
  qty_after: number;
  created_by: string | null;
  created_at: string;
}
