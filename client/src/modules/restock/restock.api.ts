import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { RestockRequest, SellingVelocity, RestockSuggestion } from '../../../../shared/types/restock';

const crud = createCrudApi<RestockRequest>('/api/restocks');

export const restockApi = {
  ...crud,

  generateNo: async () => {
    const res = await apiFetch('/api/restocks/generate-no');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as string;
  },

  getSellingVelocity: async (partnerCode?: string) => {
    const q = partnerCode ? `?partner_code=${encodeURIComponent(partnerCode)}` : '';
    const res = await apiFetch(`/api/restocks/selling-velocity${q}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as SellingVelocity[];
  },

  getRestockSuggestions: async (partnerCode?: string) => {
    const q = partnerCode ? `?partner_code=${encodeURIComponent(partnerCode)}` : '';
    const res = await apiFetch(`/api/restocks/suggestions${q}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as RestockSuggestion[];
  },

  getProgressStats: async (partnerCode?: string) => {
    const q = partnerCode ? `?partner_code=${encodeURIComponent(partnerCode)}` : '';
    const res = await apiFetch(`/api/restocks/progress-stats${q}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ status: string; count: number; total_qty: number }>;
  },

  receive: async (id: number, items: Array<{ variant_id: number; received_qty: number }>) => {
    const res = await apiFetch(`/api/restocks/${id}/receive`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as RestockRequest;
  },
};
