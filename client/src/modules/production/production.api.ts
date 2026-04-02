import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import { ProductionPlan } from '../../../../shared/types/production';

const crud = createCrudApi<ProductionPlan>('/api/productions');

export const productionApi = {
  ...crud,
  generateNo: async () => {
    const res = await apiFetch('/api/productions/generate-no');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as string;
  },
  dashboard: async () => {
    const res = await apiFetch('/api/productions/dashboard');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  recommendations: async (options?: { limit?: number; category?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.category) params.set('category', options.category);
    const q = params.toString() ? `?${params}` : '';
    const res = await apiFetch(`/api/productions/recommendations${q}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  categoryStats: async () => {
    const res = await apiFetch('/api/productions/category-stats');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  categorySubStats: async (category: string) => {
    const res = await apiFetch(`/api/productions/category-stats/${encodeURIComponent(category)}/sub`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  productVariantDetail: async (productCode: string) => {
    const res = await apiFetch(`/api/productions/product-variants/${encodeURIComponent(productCode)}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as Array<{ color: string; size: string; sku: string; sold_qty: number; current_stock: number; sell_through_rate: number }>;
  },
  autoGeneratePreview: async () => {
    const res = await apiFetch('/api/productions/auto-generate/preview');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  autoGenerate: async (season?: string) => {
    const res = await apiFetch('/api/productions/auto-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  updateStatus: async (id: number, status: string) => {
    const res = await apiFetch(`/api/productions/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as ProductionPlan;
  },
  updateProducedQty: async (id: number, items: Array<{ item_id: number; produced_qty: number }>) => {
    const res = await apiFetch(`/api/productions/${id}/produced-qty`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as ProductionPlan;
  },
  saveMaterials: async (id: number, materials: Array<{ material_id: number; required_qty: number; memo?: string }>) => {
    const res = await apiFetch(`/api/productions/${id}/materials`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materials }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as ProductionPlan;
  },

  /** 대금 요약 */
  paymentSummary: async () => {
    const res = await apiFetch('/api/productions/payment-summary');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },

  /** 대금 처리 (선지급/검수/잔금/정산) */
  updatePayment: async (id: number, data: Record<string, any>) => {
    const res = await apiFetch(`/api/productions/${id}/payment`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as ProductionPlan;
  },

  /** 생산시작 + 선지급 (원자적) */
  startProduction: async (id: number, paymentData: Record<string, any>) => {
    const res = await apiFetch(`/api/productions/${id}/start-production`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as ProductionPlan;
  },

  /** 완료처리 + 잔금지급 (원자적) */
  completeProduction: async (id: number, paymentData: Record<string, any>) => {
    const res = await apiFetch(`/api/productions/${id}/complete-production`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as ProductionPlan;
  },

  // 엑셀 템플릿 다운로드 URL
  excelTemplateUrl: '/api/productions/excel/template',

  // 엑셀 업로드
  uploadExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/productions/excel/upload', {
      method: 'POST',
      body: formData,
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as { total: number; createdPlans: number; createdItems: number; errors?: string[] };
  },

  // ── 시즌 기획시트 ──

  seasonPlanData: async (season: string) => {
    const res = await apiFetch(`/api/productions/season-plan/data?season=${encodeURIComponent(season)}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },

  seasonPlanExcelUrl: (season: string) =>
    `/api/productions/season-plan/excel?season=${encodeURIComponent(season)}`,

  seasonPlanUploadExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/productions/season-plan/excel', {
      method: 'POST',
      body: formData,
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },

  seasonPlanApply: async (season: string, rows: any[]) => {
    const res = await apiFetch('/api/productions/season-plan/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, rows }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d;
  },
};
