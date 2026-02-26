import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { Promotion } from '../../../../shared/types/promotion';

export const promotionApi = {
  ...createCrudApi<Promotion>('/api/promotions'),

  getActive: async () => {
    const res = await apiFetch('/api/promotions/active');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Promotion[];
  },

  evaluate: async (items: any[], date?: string) => {
    const res = await apiFetch('/api/promotions/evaluate', {
      method: 'POST',
      body: JSON.stringify({ items, date }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
