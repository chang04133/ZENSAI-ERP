import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { Customer } from '../../../../shared/types/customer';

export const customerApi = {
  ...createCrudApi<Customer>('/api/customers'),

  getHistory: async (id: number) => {
    const res = await apiFetch(`/api/customers/${id}/history`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  recalculateGrade: async (id: number) => {
    const res = await apiFetch(`/api/customers/${id}/recalculate`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
