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
  createBatch: async (body: { sale_date: string; partner_code?: string; memo?: string; items: any[] }) => {
    return parse(await apiFetch('/api/sales/batch', { method: 'POST', body: JSON.stringify(body) }));
  },

  // 매출현황 대시보드
  dashboardStats: async (year?: number) => {
    const q = year ? `?year=${year}` : '';
    return parse(await apiFetch(`/api/sales/dashboard-stats${q}`));
  },

  // 스타일 판매 분석
  styleAnalytics: async (year: number) => {
    return parse(await apiFetch(`/api/sales/style-analytics?year=${year}`));
  },

  // 연단위 비교
  yearComparison: async (year: number) => {
    return parse(await apiFetch(`/api/sales/year-comparison?year=${year}`));
  },

  // 판매 리스트 (기간별)
  productsByRange: async (dateFrom: string, dateTo: string) => {
    return parse(await apiFetch(`/api/sales/products-by-range?date_from=${dateFrom}&date_to=${dateTo}`));
  },

  // 스타일별 판매현황 (기간별)
  styleByRange: async (dateFrom: string, dateTo: string, category?: string) => {
    let url = `/api/sales/style-by-range?date_from=${dateFrom}&date_to=${dateTo}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    return parse(await apiFetch(url));
  },

  // 상품별 컬러/사이즈 판매 상세
  productVariantSales: async (productCode: string, dateFrom: string, dateTo: string) => {
    return parse(await apiFetch(`/api/sales/product-variant-sales?product_code=${encodeURIComponent(productCode)}&date_from=${dateFrom}&date_to=${dateTo}`));
  },

  // 판매율 분석
  sellThrough: async (dateFrom: string, dateTo: string, category?: string) => {
    let url = `/api/sales/sell-through?date_from=${dateFrom}&date_to=${dateTo}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    return parse(await apiFetch(url));
  },

  // 드랍 분석 (출시일 기준)
  dropAnalysis: async (category?: string) => {
    const qp = new URLSearchParams();
    if (category) qp.set('category', category);
    const qs = qp.toString();
    return parse(await apiFetch(`/api/sales/drop-analysis${qs ? '?' + qs : ''}`));
  },

  // 종합 매출조회
  comprehensive: async (dateFrom: string, dateTo: string) => {
    const q = `?date_from=${dateFrom}&date_to=${dateTo}`;
    return parse(await apiFetch(`/api/sales/comprehensive${q}`));
  },

  // 매출 수정
  update: async (id: number, body: { qty: number; unit_price: number; sale_type: string; memo?: string }) => {
    return parse(await apiFetch(`/api/sales/${id}`, { method: 'PUT', body: JSON.stringify(body) }));
  },
  // 매출 삭제
  remove: async (id: number) => {
    return parse(await apiFetch(`/api/sales/${id}`, { method: 'DELETE' }));
  },
  // 반품 등록 (원본 매출 기반)
  createReturn: async (id: number, body: { qty: number; reason?: string }) => {
    return parse(await apiFetch(`/api/sales/${id}/return`, { method: 'POST', body: JSON.stringify(body) }));
  },
  // 직접 반품 등록 (매장 고객 반품용)
  createDirectReturn: async (body: { variant_id: number; qty: number; unit_price: number; reason?: string }) => {
    return parse(await apiFetch('/api/sales/direct-return', { method: 'POST', body: JSON.stringify(body) }));
  },

  // 바코드/SKU 스캔 조회
  scanProduct: async (code: string) => {
    return parse(await apiFetch(`/api/sales/scan?code=${encodeURIComponent(code)}`));
  },

  // 엑셀 업로드
  uploadExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/sales/excel/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { total: number; created: number; skipped: number; errors?: string[] };
  },

  // 엑셀 템플릿 다운로드 URL
  templateUrl: '/api/sales/excel/template',
};
