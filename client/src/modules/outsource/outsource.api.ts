import { apiFetch } from '../../core/api.client';
import type {
  OsWorkOrder, OsWorkOrderVersion,
  OsSample, OsVendorLog, OsQcInspection, OsPayment,
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

  // 작업지시서
  listWorkOrders: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<{ data: OsWorkOrder[]; total: number }>(`${BASE}/work-orders${q}`);
  },
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

  // 브랜드 프로필
  getBrandProfile: () => fetchJson(`${BASE}/brand-profile`),
  saveBrandProfile: (body: Record<string, any>) =>
    fetchJson(`${BASE}/brand-profile`, { method: 'PUT', body: JSON.stringify(body) }),
};
