import { create } from 'zustand';
import { getProductsApi } from '../api/product.api';

interface Product {
  product_code: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  season: string | null;
  base_price: number;
  is_active: boolean;
}

interface ProductState {
  products: Product[];
  total: number;
  loading: boolean;
  fetchProducts: (params?: Record<string, string>) => Promise<void>;
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  total: 0,
  loading: false,
  fetchProducts: async (params) => {
    set({ loading: true });
    try {
      const result = await getProductsApi(params);
      set({ products: result.data, total: result.total });
    } finally {
      set({ loading: false });
    }
  },
}));
