import { Request } from 'express';

/**
 * 매장 사용자(STORE_MANAGER / STORE_STAFF)인 경우 partnerCode를 반환.
 * 본사 이상이면 undefined 반환 → 전체 데이터 조회.
 */
export function getStorePartnerCode(req: Request): string | undefined {
  const role = req.user?.role;
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && req.user?.partnerCode) {
    return req.user.partnerCode;
  }
  return undefined;
}
