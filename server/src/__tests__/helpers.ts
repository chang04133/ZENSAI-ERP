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

/** SYS_ADMIN 토큰 */
export function sysAdminToken(): string {
  return signAccessToken({
    userId: 'test_sysadmin', userName: '시스템관리자',
    role: 'SYS_ADMIN', partnerCode: null, partnerName: null,
  });
}

/** HQ_MANAGER 토큰 */
export function hqManagerToken(): string {
  return signAccessToken({
    userId: 'test_hq', userName: '본사관리자',
    role: 'HQ_MANAGER', partnerCode: null, partnerName: null,
  });
}

/** STORE_STAFF 토큰 */
export function storeStaffToken(partnerCode: string, partnerName: string): string {
  return signAccessToken({
    userId: `test_staff_${partnerCode}`, userName: `${partnerName} 직원`,
    role: 'STORE_STAFF', partnerCode, partnerName,
  });
}

/** 5개 역할 토큰 일괄 생성 */
export function allRoleTokens(storeCode = 'SF001', storeName = '강남점') {
  return {
    admin: adminToken(),
    sysAdmin: sysAdminToken(),
    hqManager: hqManagerToken(),
    storeManager: storeToken(storeCode, storeName),
    storeStaff: storeStaffToken(storeCode, storeName),
  };
}

/** 두 번째 매장 토큰 (데이터 격리 테스트용) */
export async function getSecondStore() {
  const pool = getPool();
  const res = await pool.query(
    `SELECT partner_code, partner_name FROM partners
     WHERE is_active = TRUE AND partner_type != '본사'
     ORDER BY partner_code OFFSET 1 LIMIT 1`,
  );
  return res.rows[0] || null;
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

/**
 * Wait for in-flight background operations (e.g., autoFulfillPreorders) to settle,
 * then force-set inventory to known values. Call at the END of beforeAll in files
 * that depend on inventory accuracy.
 *
 * Pattern: clean preorders → set qty → wait for in-flight ops → re-set qty
 */
export async function settleAndResetInventory(
  entries: Array<{ partnerCode: string; variantId: number; qty: number }>,
): Promise<void> {
  const pool = getPool();
  for (const { partnerCode, variantId } of entries) {
    await pool.query(
      "DELETE FROM preorders WHERE partner_code = $1 AND variant_id = $2 AND status = '대기'",
      [partnerCode, variantId],
    );
  }
  for (const { partnerCode, variantId, qty } of entries) {
    await pool.query(
      `INSERT INTO inventory (partner_code, variant_id, qty) VALUES ($1, $2, $3)
       ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = $3, updated_at = NOW()`,
      [partnerCode, variantId, qty],
    );
  }
  // Wait for in-flight autoFulfillPreorders to finish DB operations
  // (autoFulfillPreorders is disabled in NODE_ENV=test, so short wait suffices)
  await new Promise(r => setTimeout(r, 200));
  // Re-set (overwrite changes from in-flight ops that raced with our SET)
  for (const { partnerCode, variantId, qty } of entries) {
    await pool.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [qty, partnerCode, variantId],
    );
  }
}
