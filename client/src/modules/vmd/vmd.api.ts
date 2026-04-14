import { apiFetch, safeJson } from '../../core/api.client';
import type { StoreFixture, FixtureSalesMap } from '../../../../shared/types/vmd';

async function parse(res: Response) {
  const data = await safeJson(res);
  if (!data.success) throw new Error(data.error || '요청 실패');
  return data.data;
}

export const vmdApi = {
  /** 행거/마네킹 목록 */
  fixtures: async (partnerCode: string): Promise<StoreFixture[]> => {
    const p = new URLSearchParams({ partner_code: partnerCode });
    return parse(await apiFetch(`/api/vmd/fixtures?${p}`));
  },

  /** 행거/마네킹 추가 */
  addFixture: async (body: { partner_code: string; fixture_type: string; fixture_name?: string }): Promise<StoreFixture> => {
    return parse(await apiFetch('/api/vmd/fixtures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  },

  /** 행거/마네킹 수정 (상품 등록 포함) */
  updateFixture: async (id: number, body: { fixture_name?: string; products?: string[] }): Promise<StoreFixture> => {
    return parse(await apiFetch(`/api/vmd/fixtures/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  },

  /** 행거/마네킹 삭제 */
  deleteFixture: async (id: number) => {
    return parse(await apiFetch(`/api/vmd/fixtures/${id}`, { method: 'DELETE' }));
  },

  /** 매장 평수 조회 */
  getStoreArea: async (partnerCode: string): Promise<number | null> => {
    const p = new URLSearchParams({ partner_code: partnerCode });
    return parse(await apiFetch(`/api/vmd/store-area?${p}`));
  },

  /** 매장 평수 저장 */
  saveStoreArea: async (partnerCode: string, storeArea: number | null) => {
    return parse(await apiFetch('/api/vmd/store-area', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_code: partnerCode, store_area: storeArea }),
    }));
  },

  /** 행거별 매출 조회 */
  fixtureSales: async (partnerCode: string, productCodes: string[]): Promise<FixtureSalesMap> => {
    if (!productCodes.length) return {};
    const p = new URLSearchParams({ partner_code: partnerCode, product_codes: productCodes.join(',') });
    return parse(await apiFetch(`/api/vmd/fixture-sales?${p}`));
  },
};
