import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { SizeRun } from '../../../../shared/types/size-run';

export const sizeRunApi = {
  ...createCrudApi<SizeRun>('/api/size-runs'),

  applyToQuantity: async (runId: number, totalQty: number) => {
    const res = await apiFetch(`/api/size-runs/${runId}/apply?total_qty=${totalQty}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ size: string; ratio: number; qty: number }>;
  },
};
