import { create } from 'zustand';
import { loginApi, logoutApi, getMeApi } from './auth.api';
import { getToken, clearTokens, apiFetch } from '../../core/api.client';
import type { TokenPayload } from '../../../../shared/types/auth';

interface AuthState {
  user: TokenPayload | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  permissions: Record<string, boolean>;
  login: (userId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  loadPermissions: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

async function fetchMyPermissions(): Promise<Record<string, boolean>> {
  try {
    const res = await apiFetch('/api/system/my-permissions');
    const data = await res.json();
    if (data.success) return data.data;
  } catch { /* ignore */ }
  return {};
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  permissions: {},

  login: async (userId, password) => {
    try {
      const data = await loginApi(userId, password);
      set({ user: data.user, isAuthenticated: true });
      // 로그인 후 권한 로드
      const perms = await fetchMyPermissions();
      set({ permissions: perms });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  logout: async () => {
    try {
      await logoutApi();
    } finally {
      set({ user: null, isAuthenticated: false, permissions: {} });
    }
  },

  loadPermissions: async () => {
    const perms = await fetchMyPermissions();
    set({ permissions: perms });
  },

  hasPermission: (key: string) => {
    const { user, permissions } = get();
    if (!user) return false;
    // ADMIN은 항상 모든 권한
    if (user.role === 'ADMIN') return true;
    // permissions가 비어있거나 토글 형식이 아니면 기본 허용 (시드 형식 / 미설정 호환)
    const keys = Object.keys(permissions);
    if (keys.length === 0 || !keys.some(k => k.startsWith('/'))) return true;
    // 정확한 키 매칭
    if (key in permissions) return permissions[key] === true;
    // 하위 라우트는 부모 메뉴 권한 상속 (예: /crm/list → /crm 체크)
    const segments = key.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 1; i--) {
      const parent = '/' + segments.slice(0, i).join('/');
      if (parent in permissions) return permissions[parent] === true;
    }
    // 매칭되는 키 없으면 허용 (하위 페이지, 상세 페이지 등)
    return true;
  },

  checkAuth: async () => {
    // 안전장치: 15초 내 완료 안 되면 강제 로딩 해제
    const safetyTimer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.isLoading) {
        console.warn('checkAuth 타임아웃 — 로딩 강제 해제');
        set({ isLoading: false, isAuthenticated: false, user: null });
      }
    }, 15000);

    try {
      // 개발환경: 포트별 자동 로그인
      if (import.meta.env.DEV) {
        const port = window.location.port;
        const portAccounts: Record<string, [string, string]> = {
          '5172': ['admin', 'admin1234!'],
          '5173': ['hq_mgr', 'test1234!'],
          '5174': ['gangnam', 'test1234!'],
          '5175': ['daegu', 'test1234!'],
          '5176': ['cheonan', 'test1234!'],
        };
        const account = portAccounts[port];
        if (account) {
          const token = getToken();
          if (token) {
            try {
              const user = await getMeApi();
              if (user.userId === account[0]) {
                const perms = await fetchMyPermissions();
                set({ user, isAuthenticated: true, isLoading: false, permissions: perms });
                return;
              }
              clearTokens();
            } catch {
              clearTokens();
            }
          }
          try {
            const data = await loginApi(account[0], account[1]);
            const perms = await fetchMyPermissions();
            set({ user: data.user, isAuthenticated: true, isLoading: false, permissions: perms });
            return;
          } catch {
            set({ isLoading: false, isAuthenticated: false, user: null });
            return;
          }
        }
      }
      const token = getToken();
      if (!token) {
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }
      try {
        const user = await getMeApi();
        const perms = await fetchMyPermissions();
        set({ user, isAuthenticated: true, isLoading: false, permissions: perms });
      } catch {
        clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } finally {
      clearTimeout(safetyTimer);
    }
  },
}));
