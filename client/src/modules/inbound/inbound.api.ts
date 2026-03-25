import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { InboundRecord } from '../../../../shared/types/inbound';

const crud = createCrudApi<InboundRecord>('/api/inbounds');

export const inboundApi = {
  ...crud,

  summary: async () => {
    const res = await apiFetch('/api/inbounds/summary');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as {
      total_count: number; total_qty: number;
      pending_count: number; pending_qty: number;
      completed_count: number; completed_qty: number;
      manual_count: number; manual_qty: number;
      by_partner: Array<{ partner_code: string; partner_name: string; count: number; total_qty: number }>;
    };
  },

  generateNo: async () => {
    const res = await apiFetch('/api/inbounds/generate-no');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as string;
  },

  confirm: async (id: number, items: Array<{ variant_id: number; qty: number; unit_price?: number; memo?: string }>) => {
    const res = await apiFetch(`/api/inbounds/${id}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as InboundRecord;
  },
};
