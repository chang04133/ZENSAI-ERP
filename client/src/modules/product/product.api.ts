import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { Product } from '../../../../shared/types/product';

export const productApi = {
  ...createCrudApi<Product>('/api/products'),

  searchVariants: async (search: string) => {
    const res = await apiFetch(`/api/products/variants/search?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ variant_id: number; sku: string; color: string; size: string; price: number; product_code: string; product_name: string; category: string }>;
  },

  // Variant 관련 API
  addVariant: async (productCode: string, body: any) => {
    const res = await apiFetch(`/api/products/${productCode}/variants`, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  updateVariant: async (productCode: string, variantId: number, body: any) => {
    const res = await apiFetch(`/api/products/${productCode}/variants/${variantId}`, { method: 'PUT', body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  deleteVariant: async (productCode: string, variantId: number) => {
    const res = await apiFetch(`/api/products/${productCode}/variants/${variantId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  },

  // 바코드 대시보드
  barcodeDashboard: async () => {
    const res = await apiFetch('/api/products/barcode-dashboard');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // 바코드 등록/수정
  updateBarcode: async (variantId: number, barcode: string | null) => {
    const res = await apiFetch(`/api/products/variants/${variantId}/barcode`, {
      method: 'PUT', body: JSON.stringify({ barcode }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
