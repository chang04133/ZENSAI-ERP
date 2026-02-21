import { apiFetch } from './api.client';
import type { PaginatedResponse } from '../../../shared/types/common';

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '요청 실패');
  return data.data;
}

export interface CrudApi<T> {
  list: (params?: Record<string, string>) => Promise<PaginatedResponse<T>>;
  get: (id: string | number) => Promise<T>;
  create: (body: any) => Promise<T>;
  update: (id: string | number, body: any) => Promise<T>;
  remove: (id: string | number) => Promise<void>;
}

export function createCrudApi<T>(basePath: string): CrudApi<T> {
  return {
    list: async (params?) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const res = await apiFetch(`${basePath}${query}`);
      return parse<PaginatedResponse<T>>(res);
    },
    get: async (id) => {
      const res = await apiFetch(`${basePath}/${id}`);
      return parse<T>(res);
    },
    create: async (body) => {
      const res = await apiFetch(basePath, { method: 'POST', body: JSON.stringify(body) });
      return parse<T>(res);
    },
    update: async (id, body) => {
      const res = await apiFetch(`${basePath}/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      return parse<T>(res);
    },
    remove: async (id) => {
      const res = await apiFetch(`${basePath}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '삭제 실패');
    },
  };
}
