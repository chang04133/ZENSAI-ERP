export interface Partner {
  partner_code: string;
  partner_name: string;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  contact: string | null;
  partner_type: '직영' | '가맹' | '온라인';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
