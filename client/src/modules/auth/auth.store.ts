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
    // 개발환경: 포트별 자동 로그인 (기존 토큰 무시하고 항상 포트 계정 사용)
    if (import.meta.env.DEV) {
      const port = window.location.port;
      const portAccounts: Record<string, [string, string]> = {
        '5172': ['admin', 'admin1234!'],          // 마스터
        '5173': ['hq_mgr', 'test1234!'],          // 본사 관리자
        '5174': ['gangnam', 'test1234!'],          // 매장 매니저
        '5175': ['daegu', 'test1234!'],            // 매장 직원
      };
      const account = portAccounts[port];
      if (account) {
        const token = getToken();
        // 기존 토큰이 있으면 유저 확인 후 계정이 다르면 재로그인
        if (token) {
          try {
            const user = await getMeApi();
            if (user.userId === account[0]) {
              set({ user, isAuthenticated: true, isLoading: false });
              return;
            }
            // 다른 계정 토큰 → 버리고 재로그인
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
  },
}));
