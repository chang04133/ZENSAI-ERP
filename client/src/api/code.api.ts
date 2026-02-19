import { apiFetch } from './client';

export async function getAllCodesApi() {
  const res = await apiFetch('/api/codes');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getCodesByTypeApi(type: string) {
  const res = await apiFetch(`/api/codes/${type}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function createCodeApi(body: any) {
  const res = await apiFetch('/api/codes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function updateCodeApi(id: number, body: any) {
  const res = await apiFetch(`/api/codes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function deleteCodeApi(id: number) {
  const res = await apiFetch(`/api/codes/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}
