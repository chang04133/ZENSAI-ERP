import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { Inventory } from '../../../../shared/types/inventory';

export const inventoryApi = {
  ...createCrudApi<Inventory>('/api/inventory'),

  dashboardStats: async () => {
    const res = await apiFetch('/api/inventory/dashboard-stats');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as {
      overall: { total_qty: number; total_items: number; total_partners: number; zero_stock_count: number };
      byCategory: Array<{ category: string; product_count: number; variant_count: number; total_qty: number }>;
      bySeason: Array<{ season: string; product_count: number; variant_count: number; total_qty: number; partner_count: number }>;
      byFit: Array<{ fit: string; product_count: number; variant_count: number; total_qty: number }>;
      byLength: Array<{ length: string; product_count: number; variant_count: number; total_qty: number }>;
      isStore: boolean;
    };
  },

  summaryBySeason: async () => {
    const res = await apiFetch('/api/inventory/summary/by-season');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ season: string; product_count: number; variant_count: number; total_qty: number; partner_count: number }>;
  },

  listBySeason: async (season: string, params?: Record<string, string>) => {
    const q = params ? '&' + new URLSearchParams(params).toString() : '';
    const res = await apiFetch(`/api/inventory/by-season/${encodeURIComponent(season)}?_=1${q}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  byProduct: async (productCode: string) => {
    const res = await apiFetch(`/api/inventory/by-product/${productCode}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ inventory_id: number; partner_code: string; variant_id: number; qty: number; partner_name: string; sku: string; color: string; size: string }>;
  },

  adjust: async (body: { partner_code: string; variant_id: number; qty_change: number; memo?: string }) => {
    const res = await apiFetch('/api/inventory/adjust', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  searchItem: async (q: string) => {
    const res = await apiFetch(`/api/inventory/search-item?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as {
      product: { product_code: string; product_name: string; category: string; fit: string; length: string; season: string } | null;
      variants: Array<{ variant_id: number; sku: string; color: string; size: string; total_qty: number; locations: Array<{ partner_code: string; partner_name: string; partner_type: string; qty: number }> }>;
    };
  },

  searchSuggest: async (q: string) => {
    const res = await apiFetch(`/api/inventory/search-suggest?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ product_code: string; product_name: string; category: string }>;
  },

  reorderAlerts: async (urgent = 5, recommend = 10) => {
    const res = await apiFetch(`/api/inventory/reorder-alerts?urgent=${urgent}&recommend=${recommend}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as {
      urgent: Array<any>;
      recommend: Array<any>;
      isStore: boolean;
    };
  },

  transactions: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await apiFetch(`/api/inventory/transactions${q}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
