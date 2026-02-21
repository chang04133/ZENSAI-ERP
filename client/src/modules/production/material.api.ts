import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import { Material } from '../../../../shared/types/production';

const crud = createCrudApi<Material>('/api/materials');

export const materialApi = {
  ...crud,
  generateCode: async () => {
    const res = await apiFetch('/api/materials/generate-code');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as string;
  },
  adjustStock: async (id: number, qtyChange: number) => {
    const res = await apiFetch(`/api/materials/${id}/adjust-stock`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty_change: qtyChange }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as Material;
  },
  lowStock: async () => {
    const res = await apiFetch('/api/materials/low-stock');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data as Material[];
  },
  summary: async () => {
    const res = await apiFetch('/api/materials/summary');
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.data;
  },
};
