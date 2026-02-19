import { apiFetch } from './client';

export async function getUsersApi(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await apiFetch(`/api/users${query}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getUserApi(id: string) {
  const res = await apiFetch(`/api/users/${id}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function createUserApi(body: any) {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function updateUserApi(id: string, body: any) {
  const res = await apiFetch(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function deleteUserApi(id: string) {
  const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

export async function getRoleGroupsApi() {
  const res = await apiFetch('/api/users/roles');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}
