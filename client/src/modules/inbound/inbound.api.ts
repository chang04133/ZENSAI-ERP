import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { InboundRecord } from '../../../../shared/types/inbound';

const crud = createCrudApi<InboundRecord>('/api/inbounds');

export const inboundApi = {
  ...crud,

  generateNo: async () => {
    const res = await apiFetch('/api/inbounds/generate-no');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as string;
  },
};
