import { apiFetch, setTokens, clearTokens } from '../../core/api.client';
import type { LoginResponse } from '../../../../shared/types/auth';

export async function loginApi(userId: string, password: string): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, password }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data;
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    clearTokens();
  }
}

export async function getMeApi() {
  const res = await apiFetch('/api/auth/me');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}
