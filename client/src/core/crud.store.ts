import { create } from 'zustand';
import type { CrudApi } from './crud.api';

export interface CrudState<T> {
  data: T[];
  total: number;
  loading: boolean;
  detail: T | null;
  fetchList: (params?: Record<string, string>) => Promise<void>;
  fetchDetail: (id: string | number) => Promise<void>;
  createItem: (body: any) => Promise<T>;
  updateItem: (id: string | number, body: any) => Promise<T>;
  removeItem: (id: string | number) => Promise<void>;
  clearDetail: () => void;
}

export function createCrudStore<T>(api: CrudApi<T>) {
  return create<CrudState<T>>((set) => ({
    data: [],
    total: 0,
    loading: false,
    detail: null,

    fetchList: async (params?) => {
      set({ loading: true });
      try {
        const result = await api.list(params);
        set({ data: result.data, total: result.total });
      } finally {
        set({ loading: false });
      }
    },

    fetchDetail: async (id) => {
      set({ loading: true });
      try {
        const item = await api.get(id);
        set({ detail: item });
      } finally {
        set({ loading: false });
      }
    },

    createItem: async (body) => {
      const item = await api.create(body);
      return item;
    },

    updateItem: async (id, body) => {
      const item = await api.update(id, body);
      return item;
    },

    removeItem: async (id) => {
      await api.remove(id);
    },

    clearDetail: () => set({ detail: null }),
  }));
}
