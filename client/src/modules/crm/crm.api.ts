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

  /* ─── Shipments (택배발송) ─── */
  getShipments: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/shipments?${qs}`);
    return res.json();
  },
  addShipment: async (customerId: number, data: { carrier: string; tracking_number: string; memo?: string }) => {
    const res = await apiFetch(`${BASE}/${customerId}/shipments`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  deleteShipment: async (customerId: number, shipmentId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/shipments/${shipmentId}`, { method: 'DELETE' });
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

  /* ─── Feedback (만족도) ─── */
  getFeedback: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/feedback?${qs}`);
    return res.json();
  },
  addFeedback: async (customerId: number, data: { rating: number; content?: string; feedback_type?: string; service_id?: number }) => {
    const res = await apiFetch(`${BASE}/${customerId}/feedback`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  deleteFeedback: async (customerId: number, feedbackId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/feedback/${feedbackId}`, { method: 'DELETE' });
    return res.json();
  },

  /* ─── Flags (고객 플래그) ─── */
  listFlags: async () => {
    const res = await apiFetch(`${BASE}/flags`);
    const json = await res.json();
    return json.data;
  },
  getCustomerFlags: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/flags`);
    const json = await res.json();
    return json.data;
  },
  addCustomerFlag: async (customerId: number, flagId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/flags/${flagId}`, { method: 'POST' });
    return res.json();
  },
  removeCustomerFlag: async (customerId: number, flagId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/flags/${flagId}`, { method: 'DELETE' });
    return res.json();
  },

  /* ─── Birthday / VIP Alerts / Daily Summary ─── */
  getBirthdayCustomers: async (month?: number) => {
    const qs = month ? `?month=${month}` : '';
    const res = await apiFetch(`${BASE}/birthdays${qs}`);
    const json = await res.json();
    return json.data;
  },
  getVipAlerts: async (days?: number) => {
    const qs = days ? `?days=${days}` : '';
    const res = await apiFetch(`${BASE}/vip-alerts${qs}`);
    const json = await res.json();
    return json.data;
  },
  getDailySummary: async (date?: string) => {
    const qs = date ? `?date=${date}` : '';
    const res = await apiFetch(`${BASE}/daily-summary${qs}`);
    const json = await res.json();
    return json.data;
  },

  /* ─── RFM / LTV ─── */
  getRfmDistribution: async () => {
    const res = await apiFetch(`${BASE}/rfm/distribution`);
    const json = await res.json();
    return json.data;
  },
  getLtvTop: async (limit = 20) => {
    const res = await apiFetch(`${BASE}/rfm/ltv-top?limit=${limit}`);
    const json = await res.json();
    return json.data;
  },
  recalculateRfm: async () => {
    const res = await apiFetch(`${BASE}/rfm/recalculate`, { method: 'POST' });
    return res.json();
  },
  getCustomerRfm: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/rfm`);
    const json = await res.json();
    return json.data;
  },

  /* ─── 상품 추천 ─── */
  getRecommendations: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/recommendations/customer/${customerId}`);
    const json = await res.json();
    return json.data;
  },
  recalculateRecommendations: async () => {
    const res = await apiFetch(`${BASE}/recommendations/recalculate`, { method: 'POST' });
    return res.json();
  },

  /* ─── 등급 자동 산정 ─── */
  getTierRules: async () => {
    const res = await apiFetch(`${BASE}/tiers/rules`);
    const json = await res.json();
    return json.data;
  },
  recalculateAllTiers: async () => {
    const res = await apiFetch(`${BASE}/tiers/recalculate`, { method: 'POST' });
    return res.json();
  },
  recalculateCustomerTier: async (id: number) => {
    const res = await apiFetch(`${BASE}/${id}/tier/recalculate`, { method: 'POST' });
    return res.json();
  },
  getTierHistory: async (customerId?: number, params: Record<string, string> = {}) => {
    const base = customerId ? `${BASE}/${customerId}/tier-history` : `${BASE}/tiers/history`;
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${base}?${qs}`);
    return res.json();
  },

  /* ─── 포인트 ─── */
  getPoints: async (customerId: number) => {
    const res = await apiFetch(`${BASE}/${customerId}/points`);
    const json = await res.json();
    return json.data;
  },
  earnPoints: async (customerId: number, data: { amount: number; sale_id?: number }) => {
    const res = await apiFetch(`${BASE}/${customerId}/points/earn`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  usePoints: async (customerId: number, data: { points: number; description: string }) => {
    const res = await apiFetch(`${BASE}/${customerId}/points/use`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  getPointTransactions: async (customerId: number, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${BASE}/${customerId}/points/transactions?${qs}`);
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
  campaigns: async (id: number) => {
    const res = await apiFetch(`${SEG}/${id}/campaigns`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '캠페인 이력 조회 실패');
    return json.data;
  },
};

/* ═══════════════ A/S API ═══════════════ */

const AS = `${BASE}/after-sales`;

async function asJson(res: Response) {
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '요청 실패');
  return json;
}

export const afterSalesApi = {
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return asJson(await apiFetch(`${AS}?${qs}`));
  },
  detail: async (id: number) => {
    const json = await asJson(await apiFetch(`${AS}/${id}`));
    return json.data;
  },
  create: async (data: any) => {
    const json = await asJson(await apiFetch(AS, { method: 'POST', body: JSON.stringify(data) }));
    return json.data;
  },
  update: async (id: number, data: any) => {
    const json = await asJson(await apiFetch(`${AS}/${id}`, { method: 'PUT', body: JSON.stringify(data) }));
    return json.data;
  },
  remove: async (id: number) => {
    await asJson(await apiFetch(`${AS}/${id}`, { method: 'DELETE' }));
  },
  stats: async () => {
    const json = await asJson(await apiFetch(`${AS}/stats`));
    return json.data;
  },
  /** 본사에 반품요청 (수선/클레임) */
  returnToHq: async (serviceId: number) => {
    const json = await asJson(await apiFetch(`${AS}/${serviceId}/return-to-hq`, { method: 'POST' }));
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
  previewTargets: async (filter: Record<string, any>, campaignType?: string, previewLimit = 5) => {
    const res = await apiFetch(`${CAMP}/preview-targets`, {
      method: 'POST',
      body: JSON.stringify({ filter, campaign_type: campaignType || 'SMS', preview_limit: previewLimit }),
    });
    const json = await res.json();
    return { total: json.total as number, preview: json.preview as any[] };
  },
  abResults: async (id: number) => {
    const res = await apiFetch(`${CAMP}/${id}/ab-results`);
    const json = await res.json();
    return json.data;
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
  testSend: async (data: { partner_code: string; type: 'sms' | 'email'; to: string }) => {
    const res = await apiFetch(`${SENDER}/test`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
};

/* ═══════════════ 자동 캠페인 API ═══════════════ */

const AUTO = `${BASE}/auto-campaigns`;

export const autoCampaignApi = {
  list: async () => {
    const res = await apiFetch(AUTO);
    const json = await res.json();
    return json.data;
  },
  create: async (data: any) => {
    const res = await apiFetch(AUTO, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await apiFetch(`${AUTO}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  remove: async (id: number) => {
    const res = await apiFetch(`${AUTO}/${id}`, { method: 'DELETE' });
    return res.json();
  },
  history: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`${AUTO}/history?${qs}`);
    return res.json();
  },
  execute: async () => {
    const res = await apiFetch(`${AUTO}/execute`, { method: 'POST' });
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

/* ═══════════════ 동의 로그 API ═══════════════ */

export const consentLogApi = {
  list: async (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await apiFetch(`/api/consent/logs?${qs}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '조회 실패');
    return json;
  },
};
