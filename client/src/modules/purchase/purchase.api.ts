import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { PurchaseOrder } from '../../../../shared/types/purchase';

export const purchaseApi = {
  ...createCrudApi<PurchaseOrder>('/api/purchases'),

  updateStatus: async (id: number, status: string) => {
    const res = await apiFetch(`/api/purchases/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  receive: async (id: number, items: Array<{ item_id: number; received_qty: number }>) => {
    const res = await apiFetch(`/api/purchases/${id}/receive`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
