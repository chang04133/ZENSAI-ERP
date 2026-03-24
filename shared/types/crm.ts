export interface Customer {
  customer_id: number;
  customer_name: string;
  phone: string;
  email: string | null;
  birth_date: string | null;
  gender: '남' | '여' | null;
  customer_tier: 'VVIP' | 'VIP' | '일반' | '신규';
  partner_code: string;
  address: string | null;
  memo: string | null;
  is_active: boolean;
  sms_consent: boolean;
  email_consent: boolean;
  privacy_consent: boolean;
  consent_date: string | null;
  consent_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsentLog {
  log_id: number;
  customer_id: number;
  consent_type: 'SMS' | 'EMAIL' | 'PRIVACY';
  action: 'GRANT' | 'REVOKE';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface CustomerWithStats extends Customer {
  partner_name?: string;
  total_amount: number;
  purchase_count: number;
  last_purchase_date: string | null;
}

export interface CustomerPurchase {
  purchase_id: number;
  customer_id: number;
  partner_code: string;
  partner_name?: string;
  purchase_date: string;
  product_name: string;
  variant_info: string | null;
  qty: number;
  unit_price: number;
  total_price: number;
  payment_method: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

/* ═══════════════ 마케팅 캠페인 ═══════════════ */

export interface MarketingCampaign {
  campaign_id: number;
  campaign_name: string;
  campaign_type: 'SMS' | 'EMAIL';
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED';
  subject: string | null;
  content: string;
  target_filter: Record<string, any> | null;
  scheduled_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  created_by: string;
  partner_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  recipient_id: number;
  campaign_id: number;
  customer_id: number;
  customer_name?: string;
  recipient_addr: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'OPENED';
  sent_at: string | null;
  opened_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface MessageTemplate {
  template_id: number;
  template_name: string;
  template_type: 'SMS' | 'EMAIL';
  subject: string | null;
  content: string;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerSenderSettings {
  setting_id: number;
  partner_code: string;
  sms_api_key: string | null;
  sms_api_secret: string | null;
  sms_from_number: string | null;
  sms_enabled: boolean;
  email_user: string | null;
  email_password: string | null;
  email_enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

/* ═══════════════ 고객 태그 ═══════════════ */

export interface CustomerTag {
  tag_id: number;
  tag_name: string;
  tag_type: 'PREDEFINED' | 'CUSTOM';
  color: string;
  created_by: string | null;
  created_at: string;
}

/* ═══════════════ 고객 세그먼트 ═══════════════ */

export interface SegmentConditions {
  tiers?: string[];
  gender?: string;
  min_amount?: number;
  max_amount?: number;
  min_purchase_count?: number;
  max_purchase_count?: number;
  last_purchase_from?: string;
  last_purchase_to?: string;
  age_min?: number;
  age_max?: number;
  partner_codes?: string[];
  tags?: number[];
}

export interface CustomerSegment {
  segment_id: number;
  segment_name: string;
  description: string | null;
  conditions: SegmentConditions;
  auto_refresh: boolean;
  member_count: number;
  created_by: string | null;
  partner_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ═══════════════ A/S 관리 ═══════════════ */

export interface AfterSalesService {
  service_id: number;
  customer_id: number;
  customer_name?: string;
  partner_code: string;
  partner_name?: string;
  service_type: '수선' | '교환' | '클레임' | '기타';
  status: '접수' | '진행' | '완료' | '취소';
  product_name: string | null;
  variant_info: string | null;
  description: string | null;
  resolution: string | null;
  received_date: string;
  completed_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ═══════════════ 방문 이력 ═══════════════ */

export interface CustomerVisit {
  visit_id: number;
  customer_id: number;
  customer_name?: string;
  partner_code: string;
  partner_name?: string;
  visit_date: string;
  visit_time: string | null;
  purpose: string | null;
  is_purchase: boolean;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

/* ═══════════════ 상담/메모 이력 ═══════════════ */

export interface CustomerConsultation {
  consultation_id: number;
  customer_id: number;
  consultation_type: '상담' | '메모' | '전화' | '방문';
  content: string;
  created_by: string | null;
  created_at: string;
}

/* ═══════════════ 구매 패턴 ═══════════════ */

export interface PurchasePattern {
  customer_id: number;
  category_distribution: Array<{ category: string; count: number; amount: number }>;
  size_distribution: Array<{ size: string; count: number }>;
  color_distribution: Array<{ color: string; count: number }>;
  avg_purchase_cycle_days: number | null;
  preferred_payment: string | null;
  monthly_trend: Array<{ month: string; count: number; amount: number }>;
}
