import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const markdownApi = {
  list: async (seasonCode?: string) => {
    const q = seasonCode ? `?season_code=${seasonCode}` : '';
    return parse(await apiFetch(`/api/markdowns${q}`));
  },

  getById: async (id: number) => parse(await apiFetch(`/api/markdowns/${id}`)),

  create: async (body: any) => parse(await apiFetch('/api/markdowns', { method: 'POST', body: JSON.stringify(body) })),

  update: async (id: number, body: any) => parse(await apiFetch(`/api/markdowns/${id}`, { method: 'PUT', body: JSON.stringify(body) })),

  apply: async (id: number) => parse(await apiFetch(`/api/markdowns/${id}/apply`, { method: 'POST' })),

  revert: async (id: number) => parse(await apiFetch(`/api/markdowns/${id}/revert`, { method: 'POST' })),

  impact: async (id: number) => parse(await apiFetch(`/api/markdowns/${id}/impact`)),
};
