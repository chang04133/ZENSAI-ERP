import { create } from 'zustand';
import { loginApi, logoutApi, getMeApi } from './auth.api';
import { getToken, clearTokens } from '../../core/api.client';
import type { TokenPayload } from '../../../../shared/types/auth';

interface AuthState {
  user: TokenPayload | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (userId, password) => {
    try {
      const data = await loginApi(userId, password);
      set({ user: data.user, isAuthenticated: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  logout: async () => {
    try {
      await logoutApi();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
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
        };
        const account = portAccounts[port];
        if (account) {
          const token = getToken();
          if (token) {
            try {
              const user = await getMeApi();
              if (user.userId === account[0]) {
                set({ user, isAuthenticated: true, isLoading: false });
                return;
              }
              clearTokens();
            } catch {
              clearTokens();
            }
          }
          try {
            const data = await loginApi(account[0], account[1]);
            set({ user: data.user, isAuthenticated: true, isLoading: false });
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
        set({ user, isAuthenticated: true, isLoading: false });
      } catch {
        clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } finally {
      clearTimeout(safetyTimer);
    }
  },
}));
