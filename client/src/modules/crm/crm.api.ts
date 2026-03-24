import { apiFetch } from '../../core/api.client';

const BASE = '/api/crm';

export const crmApi = {
  /** 고객 목록 */
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}?${qs}`);
    return res.json();
  },

  /** 대시보드 통계 */
  dashboard: async () => {
    const res = await apiFetch(`${BASE}/dashboard`);
    const json = await res.json();
    return json.data;
  },

  /** 고객 상세 */
  detail: async (id: number) => {
    const res = await apiFetch(`${BASE}/${id}`);
    const json = await res.json();
    return json.data;
  },

  /** 고객 등록 */
  create: async (data: any) => {
    const res = await apiFetch(BASE, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },

  /** 고객 수정 */
  update: async (id: number, data: any) => {
    const res = await apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },

  /** 고객 삭제 */
  remove: async (id: number) => {
    const res = await apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
    return res.json();
  },

  /** 구매이력 조회 */
  purchases: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/purchases?${qs}`);
    return res.json();
  },

  /** 구매 기록 추가 */
  addPurchase: async (customerId: number, data: any) => {
    const res = await apiFetch(`${BASE}/${customerId}/purchases`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },

  /** 구매 기록 수정 */
  updatePurchase: async (customerId: number, purchaseId: number, data: any) => {
    const res = await apiFetch(`${BASE}/${customerId}/purchases/${purchaseId}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },

  /** 구매 기록 삭제 */
  removePurchase: async (customerId: number, purchaseId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/purchases/${purchaseId}`, { method: 'DELETE' });
    return res.json();
  },

  /* ─── Tags ─── */
  listTags: async () => {
    const res = await apiFetch(`${BASE}/tags`);
    const json = await res.json();
    return json.data;
  },
  createTag: async (data: any) => {
    const res = await apiFetch(`${BASE}/tags`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  deleteTag: async (tagId: number) => {
    const res = await apiFetch(`${BASE}/tags/${tagId}`, { method: 'DELETE' });
    return res.json();
  },
  getCustomerTags: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/tags`);
    const json = await res.json();
    return json.data;
  },
  addCustomerTag: async (customerId: number, tagId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/tags/${tagId}`, { method: 'POST' });
    return res.json();
  },
  removeCustomerTag: async (customerId: number, tagId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/tags/${tagId}`, { method: 'DELETE' });
    return res.json();
  },

  /* ─── Visits ─── */
  getVisits: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/visits?${qs}`);
    return res.json();
  },
  addVisit: async (customerId: number, data: any) => {
    const res = await apiFetch(`${BASE}/${customerId}/visits`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  deleteVisit: async (customerId: number, visitId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/visits/${visitId}`, { method: 'DELETE' });
    return res.json();
  },

  /* ─── Consultations ─── */
  getConsultations: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/consultations?${qs}`);
    return res.json();
  },
  addConsultation: async (customerId: number, data: any) => {
    const res = await apiFetch(`${BASE}/${customerId}/consultations`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  deleteConsultation: async (customerId: number, consultationId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/consultations/${consultationId}`, { method: 'DELETE' });
    return res.json();
  },

  /* ─── Dormant ─── */
  getDormantCustomers: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/dormant?${qs}`);
    return res.json();
  },
  getDormantCount: async () => {
    const res = await apiFetch(`${BASE}/dormant/count`);
    const json = await res.json();
    return json.data?.count || 0;
  },
  reactivateCustomer: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/reactivate`, { method: 'POST' });
    return res.json();
  },

  /* ─── Purchase Patterns ─── */
  getPurchasePatterns: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/patterns`);
    const json = await res.json();
    return json.data;
  },

  /* ─── Message History ─── */
  getMessageHistory: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/messages?${qs}`);
    return res.json();
  },

  /* ─── Excel ─── */
  exportCustomers: async () => {
    const res = await apiFetch(`${BASE}/excel/export`);
    return res.blob();
  },
  importCustomers: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch(`${BASE}/excel/import`, { method: 'POST', body: formData, headers: {} });
    return res.json();
  },
};

/* ═══════════════ 세그먼트 API ═══════════════ */

const SEG = `${BASE}/segments`;

export const segmentApi = {
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${SEG}?${qs}`);
    return res.json();
  },
  detail: async (id: number) => {
    const res = await apiFetch(`${SEG}/${id}`);
    const json = await res.json();
    return json.data;
  },
  create: async (data: any) => {
    const res = await apiFetch(SEG, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await apiFetch(`${SEG}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  remove: async (id: number) => {
    const res = await apiFetch(`${SEG}/${id}`, { method: 'DELETE' });
    return res.json();
  },
  refresh: async (id: number) => {
    const res = await apiFetch(`${SEG}/${id}/refresh`, { method: 'POST' });
    const json = await res.json();
    return json.data;
  },
  members: async (id: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${SEG}/${id}/members?${qs}`);
    return res.json();
  },
};

/* ═══════════════ A/S API ═══════════════ */

const AS = `${BASE}/after-sales`;

export const afterSalesApi = {
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${AS}?${qs}`);
    return res.json();
  },
  detail: async (id: number) => {
    const res = await apiFetch(`${AS}/${id}`);
    const json = await res.json();
    return json.data;
  },
  create: async (data: any) => {
    const res = await apiFetch(AS, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await apiFetch(`${AS}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  remove: async (id: number) => {
    const res = await apiFetch(`${AS}/${id}`, { method: 'DELETE' });
    return res.json();
  },
  stats: async () => {
    const res = await apiFetch(`${AS}/stats`);
    const json = await res.json();
    return json.data;
  },
};

/* ═══════════════ 캠페인 API ═══════════════ */

const CAMP = `${BASE}/campaigns`;

export const campaignApi = {
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${CAMP}?${qs}`);
    return res.json();
  },
  detail: async (id: number) => {
    const res = await apiFetch(`${CAMP}/${id}`);
    const json = await res.json();
    return json.data;
  },
  create: async (data: any) => {
    const res = await apiFetch(CAMP, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await apiFetch(`${CAMP}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  remove: async (id: number) => {
    const res = await apiFetch(`${CAMP}/${id}`, { method: 'DELETE' });
    return res.json();
  },
  send: async (id: number) => {
    const res = await apiFetch(`${CAMP}/${id}/send`, { method: 'POST' });
    return res.json();
  },
  cancel: async (id: number) => {
    const res = await apiFetch(`${CAMP}/${id}/cancel`, { method: 'POST' });
    return res.json();
  },
  recipients: async (id: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${CAMP}/${id}/recipients?${qs}`);
    return res.json();
  },
  previewTargets: async (filter: Record<string, any>) => {
    const res = await apiFetch(`${CAMP}/preview-targets`, { method: 'POST', body: JSON.stringify({ filter }) });
    const json = await res.json();
    return json.count;
  },
};

/* ═══════════════ 템플릿 API ═══════════════ */

const TPL = `${CAMP}/templates`;

export const templateApi = {
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${TPL}/list?${qs}`);
    const json = await res.json();
    return json.data;
  },
  create: async (data: any) => {
    const res = await apiFetch(TPL, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await apiFetch(`${TPL}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  remove: async (id: number) => {
    const res = await apiFetch(`${TPL}/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

/* ═══════════════ 발송 설정 API ═══════════════ */

const SENDER = `${CAMP}/sender-settings`;

export const senderSettingsApi = {
  get: async (partnerCode?: string) => {
    const qs = partnerCode ? `?partner_code=${partnerCode}` : '';
    const res = await apiFetch(`${SENDER}${qs}`);
    const json = await res.json();
    return json.data;
  },
  save: async (data: any) => {
    const res = await apiFetch(SENDER, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
};

/* ═══════════════ 수신동의 QR API ═══════════════ */

export const consentQrApi = {
  get: async (partnerCode?: string) => {
    const qs = partnerCode ? `?partner_code=${partnerCode}` : '';
    const res = await apiFetch(`${CAMP}/consent-qr${qs}`);
    const json = await res.json();
    return json.data;
  },
};
