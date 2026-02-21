import { apiFetch } from '../../core/api.client';
import type { PaginatedResponse } from '../../../../shared/types/common';

async function parse(res: Response) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const salesApi = {
  // CRUD
  list: async (params?: Record<string, string>): Promise<PaginatedResponse<any>> => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/sales${q}`));
  },
  create: async (body: any) => {
    return parse(await apiFetch('/api/sales', { method: 'POST', body: JSON.stringify(body) }));
  },
  createBatch: async (body: { sale_date: string; partner_code?: string; items: any[] }) => {
    return parse(await apiFetch('/api/sales/batch', { method: 'POST', body: JSON.stringify(body) }));
  },

  // 매출현황 대시보드
  dashboardStats: async (year?: number) => {
    const q = year ? `?year=${year}` : '';
    return parse(await apiFetch(`/api/sales/dashboard-stats${q}`));
  },

  // 분석
  monthlySales: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/sales/monthly-sales${q}`));
  },
  monthlyRevenue: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/sales/monthly-revenue${q}`));
  },
  weeklyStyle: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return parse(await apiFetch(`/api/sales/weekly-style${q}`));
  },

  // 연단위 비교
  yearComparison: async (year: number) => {
    return parse(await apiFetch(`/api/sales/year-comparison?year=${year}`));
  },

  // 종합 매출조회
  comprehensive: async (dateFrom: string, dateTo: string) => {
    const q = `?date_from=${dateFrom}&date_to=${dateTo}`;
    return parse(await apiFetch(`/api/sales/comprehensive${q}`));
  },
};
