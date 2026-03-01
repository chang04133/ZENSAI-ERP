import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { Product } from '../../../../shared/types/product';

export const productApi = {
  ...createCrudApi<Product>('/api/products'),

  variantOptions: async () => {
    const res = await apiFetch('/api/products/variants/options');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { colors: string[]; sizes: string[] };
  },

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

  // 행사 상품
  listEventProducts: async (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await apiFetch(`/api/products/events${query}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { data: Product[]; total: number; page: number; limit: number };
  },

  updateEventPrice: async (productCode: string, eventPrice: number | null, startDate?: string | null, endDate?: string | null, storeCodes?: string[] | null) => {
    const res = await apiFetch(`/api/products/${productCode}/event-price`, {
      method: 'PUT', body: JSON.stringify({ event_price: eventPrice, event_start_date: startDate, event_end_date: endDate, event_store_codes: storeCodes }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Product;
  },

  bulkUpdateEventPrices: async (updates: Array<{ product_code: string; event_price: number | null }>, storeCodes?: string[] | null) => {
    const body: any = { updates };
    if (storeCodes !== undefined) body.event_store_codes = storeCodes;
    const res = await apiFetch('/api/products/events/bulk', {
      method: 'PUT', body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // 행사 추천
  eventRecommendations: async (params?: { category?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString() ? `?${qs}` : '';
    const res = await apiFetch(`/api/products/events/recommendations${q}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // 바코드 대시보드
  barcodeDashboard: async () => {
    const res = await apiFetch('/api/products/barcode-dashboard');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // 이미지 업로드
  uploadImage: async (productCode: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await apiFetch(`/api/products/${encodeURIComponent(productCode)}/image`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { image_url: string };
  },

  // SKU별 재입고 알림 토글
  toggleVariantAlert: async (variantId: number, low_stock_alert: boolean) => {
    const res = await apiFetch(`/api/products/variants/${variantId}/alert`, {
      method: 'PUT', body: JSON.stringify({ low_stock_alert }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // 부자재 연결
  getProductMaterials: async (productCode: string) => {
    const res = await apiFetch(`/api/products/${encodeURIComponent(productCode)}/materials`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as Array<{ product_material_id: number; material_id: number; usage_qty: number; material_code: string; material_name: string; material_type: string; unit: string; unit_price: number }>;
  },

  saveProductMaterials: async (productCode: string, materials: Array<{ material_id: number; usage_qty: number }>) => {
    const res = await apiFetch(`/api/products/${encodeURIComponent(productCode)}/materials`, {
      method: 'PUT',
      body: JSON.stringify({ materials }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { materials: any[]; cost_price: number };
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
