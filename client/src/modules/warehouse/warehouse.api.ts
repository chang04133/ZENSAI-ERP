import { apiFetch } from '../../core/api.client';

const BASE = '/api/warehouses';

export const warehouseApi = {
  list: async () => {
    const res = await apiFetch(BASE);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  getDefault: async () => {
    const res = await apiFetch(`${BASE}/default`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  create: async (body: any) => {
    const res = await apiFetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  update: async (code: string, body: any) => {
    const res = await apiFetch(`${BASE}/${code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  remove: async (code: string) => {
    const res = await apiFetch(`${BASE}/${code}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  },
  setDefault: async (code: string) => {
    const res = await apiFetch(`${BASE}/${code}/set-default`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  },
};
