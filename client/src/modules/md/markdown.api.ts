import { apiFetch, safeJson } from '../../core/api.client';

async function parse(res: Response) {
  const data = await safeJson(res);
  if (!data.success) throw new Error(data.error || '요청 실패');
  return data.data;
}

export const markdownApi = {
  list: async (seasonCode?: string, status?: string) => {
    const p = new URLSearchParams();
    if (seasonCode) p.set('season_code', seasonCode);
    if (status) p.set('status', status);
    return parse(await apiFetch(`/api/markdown-schedules?${p}`));
  },

  get: async (id: number) => {
    return parse(await apiFetch(`/api/markdown-schedules/${id}`));
  },

  create: async (body: {
    schedule_name: string; season_code: string; markdown_round: number;
    discount_rate: number; start_date: string; end_date?: string;
    items: Array<{ product_code: string; original_price: number; markdown_price: number }>;
  }) => {
    return parse(await apiFetch('/api/markdown-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  },

  update: async (id: number, body: any) => {
    return parse(await apiFetch(`/api/markdown-schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  },

  remove: async (id: number) => {
    return parse(await apiFetch(`/api/markdown-schedules/${id}`, { method: 'DELETE' }));
  },

  apply: async (id: number) => {
    return parse(await apiFetch(`/api/markdown-schedules/${id}/apply`, { method: 'POST' }));
  },

  revert: async (id: number) => {
    return parse(await apiFetch(`/api/markdown-schedules/${id}/revert`, { method: 'POST' }));
  },

  getProducts: async (category?: string, seasonCode?: string) => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (seasonCode) p.set('season_code', seasonCode);
    return parse(await apiFetch(`/api/markdown-schedules/products/list?${p}`));
  },

  recommend: async (seasonCode?: string, category?: string, excludeCodes?: string[]) => {
    const p = new URLSearchParams();
    if (seasonCode) p.set('season_code', seasonCode);
    if (category) p.set('category', category);
    if (excludeCodes?.length) p.set('exclude', excludeCodes.join(','));
    return parse(await apiFetch(`/api/markdown-schedules/products/recommend?${p}`));
  },
};
