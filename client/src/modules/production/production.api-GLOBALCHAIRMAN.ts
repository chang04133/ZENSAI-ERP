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
  categoryDetailedStats: async (category: string) => {
    const res = await apiFetch(`/api/productions/category-stats/${encodeURIComponent(category)}/detailed`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as {
      monthlySales: Array<{ month: string; sub_category: string; sold_qty: number; sold_amount: number }>;
      topProducts: Array<{ product_code: string; product_name: string; sub_category: string; total_sold_1y: number; avg_monthly_sales: number; current_stock: number; total_revenue: number }>;
      yearSummary: Array<{ sub_category: string; sub_category_label: string; total_sold_1y: number; avg_monthly_sales: number; total_revenue: number; total_sold_30d: number; total_sold_90d: number; trend_pct: number }>;
    };
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
  excelTemplateUrl: '/api/productions/excel/template',
  excelImport: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/productions/excel/import', { method: 'POST', body: formData, headers: {} });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d;
  },
  seasonPlanData: async (season?: string) => {
    const qs = season ? `?season=${season}` : '';
    const res = await apiFetch(`/api/productions/season-plan/data${qs}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  seasonPlanExcelUrl: (season: string) => `/api/productions/season-plan/excel?season=${season}`,
  seasonPlanUploadExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/productions/season-plan/excel', { method: 'POST', body: formData, headers: {} });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
  seasonPlanApply: async (season: string, rows: any[]) => {
    const res = await apiFetch('/api/productions/season-plan/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, rows }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d;
  },
};
