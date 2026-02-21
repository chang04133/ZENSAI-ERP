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
};
