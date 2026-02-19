import { apiFetch } from './client';

export async function getPartnersApi(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await apiFetch(`/api/partners${query}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getPartnerApi(code: string) {
  const res = await apiFetch(`/api/partners/${code}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function createPartnerApi(body: any) {
  const res = await apiFetch('/api/partners', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function updatePartnerApi(code: string, body: any) {
  const res = await apiFetch(`/api/partners/${code}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function deletePartnerApi(code: string) {
  const res = await apiFetch(`/api/partners/${code}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}
