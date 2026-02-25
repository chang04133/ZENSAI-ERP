const TOKEN_KEY = 'zensai_access_token';
const REFRESH_KEY = 'zensai_refresh_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetchWithTimeout('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }, 10000);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.success) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// 타임아웃 fetch (기본 30초)
function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** JSON 응답을 안전하게 파싱 (비JSON 응답 시 에러 메시지 반환) */
export async function safeJson(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(
      res.ok ? '서버 응답 형식 오류' : `서버 오류 (${res.status}): ${text.slice(0, 100) || res.statusText}`,
    );
  }
  return res.json();
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetchWithTimeout(path, { ...options, headers });

  if (res.status === 401 && getRefreshToken()) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryRefresh().finally(() => {
        isRefreshing = false;
      });
    }
    const refreshed = await refreshPromise;
    refreshPromise = null;

    if (refreshed) {
      headers['Authorization'] = `Bearer ${getToken()}`;
      res = await fetchWithTimeout(path, { ...options, headers });
    } else {
      clearTokens();
      window.location.href = '/login';
    }
  }
  return res;
}
