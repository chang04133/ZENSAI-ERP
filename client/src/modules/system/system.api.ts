import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const systemApi = {
  getAuditLogs: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/system/audit-logs${q}`));
  },
  getDeletedData: async (tableName: string) => {
    return parse(await apiFetch(`/api/system/deleted-data?table_name=${tableName}`));
  },
  restore: async (tableName: string, id: string, pkColumn: string) => {
    return parse(await apiFetch('/api/system/restore', {
      method: 'POST',
      body: JSON.stringify({ table_name: tableName, id, pk_column: pkColumn }),
    }));
  },
  getStoreActivityLogs: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/system/store-activity-logs${q}`));
  },
  getActivityLogs: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/system/activity-logs${q}`));
  },
  getActivityLogUsers: async () => {
    return parse(await apiFetch('/api/system/activity-logs/users'));
  },
  getTestResults: async () => {
    const res = await apiFetch('/api/system/test-results');
    const data = await res.json();
    return data;  // { success, data?, error? } — 404일 때도 처리
  },
  getE2eResults: async () => {
    const res = await apiFetch('/api/system/e2e-results');
    const data = await res.json();
    return data;
  },
};
