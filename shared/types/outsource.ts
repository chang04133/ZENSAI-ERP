// ── 외주 운영 모듈 타입 ──

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
