import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { Order } from '../../../../shared/types/order';

export const orderApi = {
  ...createCrudApi<Order>('/api/orders'),

  complete: async (id: number) => {
    const res = await apiFetch(`/api/orders/${id}/complete`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  updateStatus: async (id: number, status: string) => {
    const res = await apiFetch(`/api/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
