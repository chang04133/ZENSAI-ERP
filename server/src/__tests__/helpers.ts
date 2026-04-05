/**
 * 통합 테스트 헬퍼
 * - 실제 DB + Express app 사용
 * - 테스트 데이터 정리는 각 테스트 파일의 afterAll에서 수행
 */
import { getPool } from '../db/connection';
import { signAccessToken } from '../auth/jwt';
import type { TokenPayload } from '../types';

/** admin 토큰 생성 (테스트용 — JWT만 발급) */
export function adminToken(): string {
  const payload: TokenPayload = {
    userId: 'admin',
    userName: '관리자',
    role: 'ADMIN',
    partnerCode: null,
    partnerName: null,
  };
  return signAccessToken(payload);
}

/** 매장관리자 토큰 생성 */
export function storeToken(partnerCode: string, partnerName: string): string {
  const payload: TokenPayload = {
    userId: `test_store_${partnerCode}`,
    userName: `${partnerName} 매니저`,
    role: 'STORE_MANAGER',
    partnerCode,
    partnerName,
  };
  return signAccessToken(payload);
}

/** 테스트에 필요한 기본 참조 데이터 조회 + 테스트용 재고 세팅 */
export async function getTestFixtures() {
  const pool = getPool();

  // 본사 코드 조회
  const hqRes = await pool.query(
    `SELECT partner_code, partner_name FROM partners
     WHERE is_active = TRUE AND partner_type = '본사'
     ORDER BY partner_code LIMIT 1`,
  );
  const hq = hqRes.rows[0];
  if (!hq) throw new Error('테스트용 본사가 없습니다');

  // 활성 매장 1개 조회 (본사 제외)
  const storeRes = await pool.query(
    `SELECT partner_code, partner_name, partner_type FROM partners
     WHERE is_active = TRUE AND partner_type != '본사'
     ORDER BY partner_code LIMIT 1`,
  );
  const store = storeRes.rows[0];
  if (!store) throw new Error('테스트용 활성 매장이 없습니다');

  // 활성 상품 variant 조회 (아무 상품이나)
  const varRes = await pool.query(
    `SELECT pv.variant_id, pv.sku, pv.color, pv.size, p.product_code, p.product_name, p.base_price
     FROM product_variants pv
     JOIN products p ON pv.product_code = p.product_code
     WHERE p.is_active = TRUE AND pv.is_active = TRUE AND p.base_price > 0
     ORDER BY pv.variant_id LIMIT 1`,
  );
  const variant = varRes.rows[0];
  if (!variant) throw new Error('테스트용 활성 상품이 없습니다');

  // 테스트 매장에 해당 variant 재고 세팅 (10개 보장)
  await pool.query(
    `INSERT INTO inventory (partner_code, variant_id, qty)
     VALUES ($1, $2, 10)
     ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = GREATEST(inventory.qty, 10), updated_at = NOW()`,
    [store.partner_code, variant.variant_id],
  );

  return { store, hq, variant };
}
