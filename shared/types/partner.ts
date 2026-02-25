export interface Partner {
  partner_code: string;
  partner_name: string;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  contact: string | null;
  partner_type: '본사' | '대리점' | '직영점' | '백화점' | '아울렛' | '온라인';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
