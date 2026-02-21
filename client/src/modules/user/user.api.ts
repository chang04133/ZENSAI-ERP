import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { User, RoleGroup } from '../../../../shared/types/user';

export const userApi = {
  ...createCrudApi<User>('/api/users'),

  getRoleGroups: async (): Promise<RoleGroup[]> => {
    const res = await apiFetch('/api/users/roles');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
