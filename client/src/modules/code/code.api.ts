import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const codeApi = {
  getAll: async () => parse(await apiFetch('/api/codes')),
  getByType: async (type: string) => parse(await apiFetch(`/api/codes/${type}`)),
  create: async (body: any) => parse(await apiFetch('/api/codes', { method: 'POST', body: JSON.stringify(body) })),
  update: async (id: number, body: any) => parse(await apiFetch(`/api/codes/${id}`, { method: 'PUT', body: JSON.stringify(body) })),
  remove: async (id: number) => parse(await apiFetch(`/api/codes/${id}`, { method: 'DELETE' })),
};
