import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const seasonApi = {
  list: async () => parse(await apiFetch('/api/seasons')),

  getByCode: async (code: string) => parse(await apiFetch(`/api/seasons/${code}`)),

  getProducts: async (code: string) => parse(await apiFetch(`/api/seasons/${code}/products`)),

  getAnalytics: async (code: string) => parse(await apiFetch(`/api/seasons/${code}/analytics`)),

  create: async (body: any) => parse(await apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify(body) })),

  update: async (code: string, body: any) => parse(await apiFetch(`/api/seasons/${code}`, { method: 'PUT', body: JSON.stringify(body) })),
};
