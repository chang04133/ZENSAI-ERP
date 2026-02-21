import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const fundApi = {
  categories: async () => parse(await apiFetch('/api/funds/categories')),

  addCategory: async (body: { category_name: string; parent_id?: number | null }) =>
    parse(await apiFetch('/api/funds/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),

  updateCategory: async (id: number, body: { category_name: string }) =>
    parse(await apiFetch(`/api/funds/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),

  removeCategory: async (id: number) =>
    parse(await apiFetch(`/api/funds/categories/${id}`, { method: 'DELETE' })),

  list: async (year: number) => parse(await apiFetch(`/api/funds?year=${year}`)),

  summary: async (year: number) => parse(await apiFetch(`/api/funds/summary?year=${year}`)),

  save: async (body: any) =>
    parse(await apiFetch('/api/funds', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),

  saveBatch: async (items: any[]) =>
    parse(await apiFetch('/api/funds/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })),

  remove: async (id: number) => parse(await apiFetch(`/api/funds/${id}`, { method: 'DELETE' })),

  productionCosts: async (year: number) => parse(await apiFetch(`/api/funds/production-costs?year=${year}`)),
};
