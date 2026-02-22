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
};
