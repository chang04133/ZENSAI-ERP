import { apiFetch } from './client';

export async function getProductsApi(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await apiFetch(`/api/products${query}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getProductApi(code: string) {
  const res = await apiFetch(`/api/products/${code}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function createProductApi(body: any) {
  const res = await apiFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function updateProductApi(code: string, body: any) {
  const res = await apiFetch(`/api/products/${code}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function deleteProductApi(code: string) {
  const res = await apiFetch(`/api/products/${code}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

export async function addVariantApi(productCode: string, body: any) {
  const res = await apiFetch(`/api/products/${productCode}/variants`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function deleteVariantApi(productCode: string, variantId: number) {
  const res = await apiFetch(`/api/products/${productCode}/variants/${variantId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}
