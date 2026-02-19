import { create } from 'zustand';
import { getUsersApi } from '../api/user.api';

interface UserInfo {
  user_id: string;
  user_name: string;
  partner_code: string | null;
  partner_name: string | null;
  role_name: string;
  role_group: number;
  is_active: boolean;
  last_login: string | null;
}

interface UserState {
  users: UserInfo[];
  total: number;
  loading: boolean;
  fetchUsers: (params?: Record<string, string>) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  users: [],
  total: 0,
  loading: false,
  fetchUsers: async (params) => {
    set({ loading: true });
    try {
      const result = await getUsersApi(params);
      set({ users: result.data, total: result.total });
    } finally {
      set({ loading: false });
    }
  },
}));
