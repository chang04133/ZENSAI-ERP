import { apiFetch } from '../../core/api.client';
import type {
  OsBrief, OsDesignSubmission,
  OsWorkOrder, OsWorkOrderVersion,
  OsSample, OsVendorLog, OsQcInspection, OsPayment,
  OsSizePack, BestSellerProduct,
} from '../../../../shared/types/outsource';

const BASE = '/api/outsource';

async function fetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(url, options);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data as T;
}

export const outsourceApi = {
  // 대시보드
  dashboard: () => fetchJson(`${BASE}/dashboard`),

  // 브리프
  listBriefs: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ data: OsBrief[]; total: number }>(`${BASE}/briefs${q}`);
  },
  getBrief: (id: number) => fetchJson<OsBrief>(`${BASE}/briefs/${id}`),
  createBrief: (body: Partial<OsBrief>) =>
    fetchJson<OsBrief>(`${BASE}/briefs`, { method: 'POST', body: JSON.stringify(body) }),
  updateBrief: (id: number, body: Partial<OsBrief>) =>
    fetchJson<OsBrief>(`${BASE}/briefs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  distributeBrief: (id: number, assignedTo?: string) =>
    fetchJson<OsBrief>(`${BASE}/briefs/${id}/distribute`, { method: 'PUT', body: JSON.stringify({ assigned_to: assignedTo }) }),

  // 디자인 시안
  listSubmissions: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ data: OsDesignSubmission[]; total: number }>(`${BASE}/submissions${q}`);
  },
  createSubmission: (body: Partial<OsDesignSubmission>) =>
    fetchJson<OsDesignSubmission>(`${BASE}/submissions`, { method: 'POST', body: JSON.stringify(body) }),
  reviewSubmission: (id: number, result: 'APPROVED' | 'REJECTED', rejectReason?: string) =>
    fetchJson(`${BASE}/submissions/${id}/review`, { method: 'PUT', body: JSON.stringify({ result, reject_reason: rejectReason }) }),
  uploadSubmissionFiles: async (submissionId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await apiFetch(`${BASE}/submissions/${submissionId}/files`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { filename: string; originalName: string; size: number; url: string }[];
  },
  listSubmissionFiles: (submissionId: number) =>
    fetchJson<{ filename: string; url: string; size: number; isImage: boolean; uploadedAt: string }[]>(
      `${BASE}/submissions/${submissionId}/files`,
    ),

  // 작업지시서
  listWorkOrders: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ data: OsWorkOrder[]; total: number }>(`${BASE}/work-orders${q}`);
  },
  createWorkOrder: (body: Record<string, any>) =>
    fetchJson<OsWorkOrder>(`${BASE}/work-orders`, { method: 'POST', body: JSON.stringify(body) }),
  getWorkOrder: (id: number) => fetchJson<OsWorkOrder & { latest_spec: OsWorkOrderVersion | null; samples: OsSample[] }>(`${BASE}/work-orders/${id}`),
  updateWorkOrder: (id: number, body: Record<string, any>) =>
    fetchJson(`${BASE}/work-orders/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  listWorkOrderVersions: (woId: number) =>
    fetchJson<OsWorkOrderVersion[]>(`${BASE}/work-orders/${woId}/versions`),
  getWorkOrderVersion: (woId: number, versionNo: number) =>
    fetchJson<OsWorkOrderVersion>(`${BASE}/work-orders/${woId}/versions/${versionNo}`),

  // 샘플
  createSample: (woId: number, body: Partial<OsSample>) =>
    fetchJson<OsSample>(`${BASE}/work-orders/${woId}/samples`, { method: 'POST', body: JSON.stringify(body) }),
  updateSample: (id: number, body: Partial<OsSample>) =>
    fetchJson<OsSample>(`${BASE}/samples/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  // 업체 로그
  listVendorLogs: (woId: number) => fetchJson<OsVendorLog[]>(`${BASE}/work-orders/${woId}/vendor-logs`),
  createVendorLog: (woId: number, body: Partial<OsVendorLog>) =>
    fetchJson<OsVendorLog>(`${BASE}/work-orders/${woId}/vendor-logs`, { method: 'POST', body: JSON.stringify(body) }),

  // QC
  listQc: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ data: OsQcInspection[]; total: number }>(`${BASE}/qc${q}`);
  },
  createQc: (body: Partial<OsQcInspection>) =>
    fetchJson<OsQcInspection>(`${BASE}/qc`, { method: 'POST', body: JSON.stringify(body) }),
  submitQcResult: (id: number, body: Record<string, any>) =>
    fetchJson(`${BASE}/qc/${id}/result`, { method: 'PUT', body: JSON.stringify(body) }),

  // 결제
  listPayments: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ data: OsPayment[]; total: number }>(`${BASE}/payments${q}`);
  },
  paymentSummary: () => fetchJson(`${BASE}/payments/summary`),
  approvePayment: (id: number) =>
    fetchJson(`${BASE}/payments/${id}/approve`, { method: 'PUT' }),
  payPayment: (id: number) =>
    fetchJson(`${BASE}/payments/${id}/pay`, { method: 'PUT' }),

  // 작업지시서 파일 업로드
  uploadFiles: async (woId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await apiFetch(`${BASE}/work-orders/${woId}/files`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { filename: string; originalName: string; size: number; url: string }[];
  },
  listFiles: (woId: number) =>
    fetchJson<{ filename: string; url: string; size: number; isImage: boolean; uploadedAt: string }[]>(
      `${BASE}/work-orders/${woId}/files`,
    ),
  deleteFile: async (filename: string) => {
    const res = await apiFetch(`${BASE}/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  },

  // 베스트셀러 + 사이즈팩
  getBestSellers: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<BestSellerProduct[]>(`${BASE}/best-sellers${q}`);
  },
  saveSizePack: (body: Partial<OsSizePack>) =>
    fetchJson<OsSizePack>(`${BASE}/size-packs`, { method: 'POST', body: JSON.stringify(body) }),
  updateSizePack: (id: number, body: Partial<OsSizePack>) =>
    fetchJson<OsSizePack>(`${BASE}/size-packs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSizePack: async (id: number) => {
    const res = await apiFetch(`${BASE}/size-packs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  },
  createBriefFromSizePack: (id: number) =>
    fetchJson<OsBrief>(`${BASE}/size-packs/${id}/create-brief`, { method: 'POST' }),

  // 브랜드 프로필
  getBrandProfile: () => fetchJson(`${BASE}/brand-profile`),
  saveBrandProfile: (body: Record<string, any>) =>
    fetchJson(`${BASE}/brand-profile`, { method: 'PUT', body: JSON.stringify(body) }),
};
