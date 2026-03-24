import { apiFetch } from '../../core/api.client';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const financialApi = {
  // 손익계산서
  incomeStatement: async (year: number, month?: number) => {
    const q = month ? `year=${year}&month=${month}` : `year=${year}`;
    return parse(await apiFetch(`/api/financial/income-statement?${q}`));
  },

  // 대차대조표
  balanceSheet: async () =>
    parse(await apiFetch('/api/financial/balance-sheet')),

  // 현금흐름표
  cashFlow: async (year: number) =>
    parse(await apiFetch(`/api/financial/cash-flow?year=${year}`)),

  // 재고자산 평가
  inventoryValuation: async () =>
    parse(await apiFetch('/api/financial/inventory-valuation')),

  // 매출원가 상세
  cogsDetail: async (year: number, month?: number) => {
    const q = month ? `year=${year}&month=${month}` : `year=${year}`;
    return parse(await apiFetch(`/api/financial/cogs-detail?${q}`));
  },

  // 매출 자동연동
  salesRevenue: async (year: number) =>
    parse(await apiFetch(`/api/financial/sales-revenue?year=${year}`)),

  // 미수금 CRUD
  listAR: async (filters?: Record<string, string>) => {
    const q = filters ? '?' + new URLSearchParams(filters).toString() : '';
    return parse(await apiFetch(`/api/financial/ar${q}`));
  },
  createAR: async (body: any) =>
    parse(await apiFetch('/api/financial/ar', { method: 'POST', body: JSON.stringify(body) })),
  updateAR: async (id: number, body: any) =>
    parse(await apiFetch(`/api/financial/ar/${id}`, { method: 'PUT', body: JSON.stringify(body) })),
  deleteAR: async (id: number) =>
    parse(await apiFetch(`/api/financial/ar/${id}`, { method: 'DELETE' })),

  // 미지급금 CRUD
  listAP: async (filters?: Record<string, string>) => {
    const q = filters ? '?' + new URLSearchParams(filters).toString() : '';
    return parse(await apiFetch(`/api/financial/ap${q}`));
  },
  createAP: async (body: any) =>
    parse(await apiFetch('/api/financial/ap', { method: 'POST', body: JSON.stringify(body) })),
  updateAP: async (id: number, body: any) =>
    parse(await apiFetch(`/api/financial/ap/${id}`, { method: 'PUT', body: JSON.stringify(body) })),
  deleteAP: async (id: number) =>
    parse(await apiFetch(`/api/financial/ap/${id}`, { method: 'DELETE' })),
};
