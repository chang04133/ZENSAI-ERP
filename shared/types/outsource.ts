// ── 외주 운영 모듈 타입 ──

export type OsBriefStatus = 'DRAFT' | 'DISTRIBUTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type OsSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface OsBrief {
  brief_id: number;
  brief_no: string;
  brief_title: string;
  season?: string;
  category?: string;
  target_qty?: number;
  budget_amount?: number;
  deadline?: string;
  description?: string;
  attachments?: string;
  status: OsBriefStatus;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OsDesignSubmission {
  submission_id: number;
  brief_id: number;
  submission_no: string;
  version: number;
  material_research?: string;
  design_mockup?: string;
  work_order_draft?: string;
  attachments?: string;
  memo?: string;
  status: OsSubmissionStatus;
  submitted_by?: string;
  submitted_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_deadline?: string;
  reject_reason?: string;
  created_at: string;
  updated_at: string;
  // JOIN
  brief_title?: string;
  brief_no?: string;
}

export type OsWoStatus = 'CONFIRMED' | 'IN_PRODUCTION' | 'QC_1ST' | 'QC_FINAL' | 'COMPLETED' | 'CANCELLED';
export type OsSampleType = 'PROTO' | 'FITTING' | 'PP' | 'PRODUCTION';
export type OsSampleStatus = 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
export type OsVendorLogType = 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'ISSUE';
export type OsQcType = '1ST' | 'FINAL';
export type OsQcResult = 'PENDING' | 'PASS' | 'FAIL';
export type OsBlameParty = 'GAP' | 'EUL';
export type OsBlameReason = 'SPEC_ERROR' | 'DIMENSION_ERROR' | 'MATERIAL_MIS_ORDER' | 'BRIEF_CHANGE' | 'WO_MODIFICATION';
export type OsPaymentStep = 'P1' | 'P2' | 'P3';
export type OsPaymentStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface OsWorkOrder {
  wo_id: number;
  wo_no: string;
  brief_id: number;
  submission_id: number;
  current_version: number;
  status: OsWoStatus;
  partner_code?: string;
  target_qty?: number;
  unit_cost?: number;
  total_amount?: number;
  confirmed_at?: string;
  confirmed_by?: string;
  completed_at?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
  // JOIN fields
  brief_title?: string;
  partner_name?: string;
}

export interface OsWorkOrderVersion {
  version_id: number;
  wo_id: number;
  version_no: number;
  spec_data: Record<string, any>;
  change_summary?: string;
  created_by?: string;
  created_at: string;
}

export interface OsSample {
  sample_id: number;
  wo_id: number;
  sample_type: OsSampleType;
  status: OsSampleStatus;
  vendor_name?: string;
  vendor_contact?: string;
  send_date?: string;
  receive_date?: string;
  images?: string;
  memo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // JOIN
  wo_no?: string;
}

export interface OsVendorLog {
  log_id: number;
  wo_id: number;
  vendor_name?: string;
  log_type: OsVendorLogType;
  content: string;
  attachments?: string;
  created_by?: string;
  created_at: string;
  // JOIN
  created_by_name?: string;
}

export interface OsQcInspection {
  qc_id: number;
  wo_id: number;
  qc_type: OsQcType;
  qc_no: string;
  wo_version_at_qc: number;
  inspected_qty: number;
  passed_qty: number;
  defect_qty: number;
  result: OsQcResult;
  defect_details?: string;
  images?: string;
  blame_party?: OsBlameParty;
  blame_reason?: OsBlameReason;
  blame_memo?: string;
  rework_cost?: number;
  rework_wo_id?: number;
  inspected_by?: string;
  inspected_at?: string;
  created_at: string;
  updated_at: string;
  // JOIN
  wo_no?: string;
  brief_title?: string;
}

export interface OsPayment {
  payment_id: number;
  wo_id: number;
  payment_step: OsPaymentStep;
  trigger_type: string;
  trigger_ref_id?: number;
  amount: number;
  status: OsPaymentStatus;
  approved_by?: string;
  approved_at?: string;
  paid_at?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
  // JOIN
  wo_no?: string;
  brief_title?: string;
}

// ── 사이즈팩 ──
export type OsSizePackStatus = 'DRAFT' | 'SAVED' | 'CONVERTED';

export interface OsSizePack {
  pack_id: number;
  product_code: string;
  season?: string;
  category?: string;
  qty_xs: number;
  qty_s: number;
  qty_m: number;
  qty_l: number;
  qty_xl: number;
  qty_xxl: number;
  qty_free: number;
  total_qty: number;
  unit_cost: number;
  memo?: string;
  status: OsSizePackStatus;
  brief_id?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // JOIN
  product_name?: string;
  brief_no?: string;
}

export interface SizeBreakdown {
  size: string;
  qty: number;
  amount: number;
  pct: number;
}

export interface BestSellerProduct {
  product_code: string;
  product_name: string;
  category: string;
  season: string;
  base_price: number;
  total_qty: number;
  total_amount: number;
  size_breakdown: SizeBreakdown[];
  size_pack?: OsSizePack | null;
}
