/**
 * CRM 등급(Tier) 재계산 통합 테스트
 *
 * 테스트 항목:
 * 1. GET /api/crm/tiers/rules — 등급 규칙 목록 조회
 * 2. POST /api/crm/tiers/recalculate — 전체 고객 등급 일괄 재계산
 * 3. POST /api/crm/:id/tier/recalculate — 개별 고객 등급 재계산
 * 4. GET /api/crm/:id/tier-history — 등급 변경 이력 조회
 * 5. 구매액에 따른 등급 변경 검증
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, getTestFixtures } from '../helpers';

let token: string;
let storeManagerToken: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// 테스트에서 생성한 데이터 추적 (정리용)
const cleanup = {
  customerIds: [] as number[],
  purchaseIds: [] as number[],
  tierRuleIds: [] as number[],
};

beforeAll(async () => {
  token = adminToken();
  fixtures = await getTestFixtures();
  storeManagerToken = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 등급 이력 삭제 (고객 삭제 전)
    for (const cid of cleanup.customerIds) {
      await client.query('DELETE FROM customer_tier_history WHERE customer_id = $1', [cid]);
    }

    // 구매기록 삭제
    for (const pid of cleanup.purchaseIds) {
      await client.query('DELETE FROM customer_purchases WHERE purchase_id = $1', [pid]);
    }

    // 테스트 고객 삭제
    for (const cid of cleanup.customerIds) {
      await client.query('DELETE FROM customer_purchases WHERE customer_id = $1', [cid]);
      await client.query('DELETE FROM customers WHERE customer_id = $1', [cid]);
    }

    // 테스트 등급 규칙 삭제
    for (const rid of cleanup.tierRuleIds) {
      await client.query('DELETE FROM customer_tier_rules WHERE rule_id = $1', [rid]);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('crm-tier 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════
// 1. 등급 규칙 조회
// ═══════════════════════════════════════════
describe('GET /api/crm/tiers/rules — 등급 규칙 조회', () => {
  it('ADMIN → 200, 규칙 목록 반환', async () => {
    const res = await request(app)
      .get('/api/crm/tiers/rules')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // 각 규칙에 필수 필드가 있어야 함
    if (res.body.data.length > 0) {
      const rule = res.body.data[0];
      expect(rule).toHaveProperty('tier_name');
      expect(rule).toHaveProperty('min_amount');
    }
  });

  it('인증 없이 접근 → 401', async () => {
    const res = await request(app).get('/api/crm/tiers/rules');
    expect(res.status).toBe(401);
  });

  it('STORE_MANAGER → 200 (readRoles 포함)', async () => {
    const res = await request(app)
      .get('/api/crm/tiers/rules')
      .set('Authorization', `Bearer ${storeManagerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 2. 개별 고객 등급 재계산 — 구매액 기반
// ═══════════════════════════════════════════
describe('POST /api/crm/:id/tier/recalculate — 개별 등급 재계산', () => {
  let testCustomerId: number;
  let tierRules: Array<{ tier_name: string; min_amount: number }>;

  beforeAll(async () => {
    // 현재 등급 규칙 조회
    const rulesRes = await request(app)
      .get('/api/crm/tiers/rules')
      .set('Authorization', `Bearer ${token}`);
    tierRules = (rulesRes.body.data || [])
      .filter((r: any) => r.is_active !== false)
      .sort((a: any, b: any) => Number(b.min_amount) - Number(a.min_amount));

    // 테스트 고객 생성 (초기 등급: 신규)
    const phone = `010-9999-${Date.now().toString().slice(-4)}`;
    const createRes = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '등급테스트고객',
        phone,
        customer_tier: '신규',
        partner_code: fixtures.store.partner_code,
      });

    expect(createRes.status).toBe(201);
    testCustomerId = createRes.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('구매 없는 신규 고객 재계산 → 등급 유지 (신규)', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/tier/recalculate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('old_tier');
    expect(res.body.data).toHaveProperty('new_tier');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data.new_tier).toBe('신규');
    expect(res.body.data.total_amount).toBe(0);
  });

  it('구매 추가 후 재계산 → 등급 변경 확인', async () => {
    // 등급 규칙이 없으면 스킵
    if (tierRules.length === 0) {
      console.log('등급 규칙이 없어 테스트를 스킵합니다.');
      return;
    }

    // 가장 낮은 등급(min_amount가 가장 작은 활성 규칙)의 기준액 이상 구매 추가
    const lowestRule = tierRules[tierRules.length - 1];
    const purchaseAmount = Number(lowestRule.min_amount) + 10000;

    const purchaseRes = await request(app)
      .post(`/api/crm/${testCustomerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '등급테스트상품',
        purchase_date: new Date().toISOString().slice(0, 10),
        qty: 1,
        unit_price: purchaseAmount,
        total_price: purchaseAmount,
        partner_code: fixtures.store.partner_code,
      });

    expect(purchaseRes.status).toBe(201);
    cleanup.purchaseIds.push(purchaseRes.body.data.purchase_id);

    // 재계산 실행
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/tier/recalculate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total_amount).toBeGreaterThanOrEqual(purchaseAmount);

    // 최소한 가장 낮은 규칙의 등급으로 변경되어야 함
    expect(res.body.data.new_tier).toBe(lowestRule.tier_name);
  });

  it('등급 변경 이력 조회 → 이력 존재 (등급이 실제로 변경된 경우)', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}/tier-history`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // DB에서 직접 확인 — 등급 변경 이력이 존재하면 필드 구조 검증
    const pool = getPool();
    const histCount = parseInt(
      (await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM customer_tier_history WHERE customer_id = $1',
        [testCustomerId],
      )).rows[0].cnt,
      10,
    );

    if (histCount > 0) {
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const history = res.body.data[0];
      expect(history).toHaveProperty('old_tier');
      expect(history).toHaveProperty('new_tier');
      expect(history).toHaveProperty('total_amount');
      expect(history).toHaveProperty('customer_name');
    }
    // 등급이 변경되지 않았다면 (lowestRule.tier_name === '신규') 이력이 없을 수 있음
  });

  it('존재하지 않는 고객 재계산 → 에러 (400/404/500)', async () => {
    const res = await request(app)
      .post('/api/crm/999999/tier/recalculate')
      .set('Authorization', `Bearer ${token}`);

    // error-handler가 throw된 에러를 400으로 변환하거나,
    // checkCustomerAccess가 404를 반환하거나, 서버 에러 500
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 3. 전체 고객 등급 일괄 재계산
// ═══════════════════════════════════════════
describe('POST /api/crm/tiers/recalculate — 전체 등급 재계산', () => {
  it('ADMIN → 200, 결과에 total/updated 포함', async () => {
    const res = await request(app)
      .post('/api/crm/tiers/recalculate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('updated');
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.updated).toBe('number');
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
    expect(res.body.data.updated).toBeGreaterThanOrEqual(0);
    expect(res.body.data.updated).toBeLessThanOrEqual(res.body.data.total);
  }, 60000);

  it('STORE_MANAGER → 200 (writeRoles 포함)', async () => {
    const res = await request(app)
      .post('/api/crm/tiers/recalculate')
      .set('Authorization', `Bearer ${storeManagerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, 60000);

  it('인증 없이 → 401', async () => {
    const res = await request(app).post('/api/crm/tiers/recalculate');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════
// 4. 등급 이력 전체 조회 (customerId 없이)
// ═══════════════════════════════════════════
describe('GET /api/crm/tiers/history — 전체 등급 이력', () => {
  it('ADMIN → 200, 페이징 포함', async () => {
    const res = await request(app)
      .get('/api/crm/tiers/history?limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });
});

// ═══════════════════════════════════════════
// 5. 구매액 누적에 따른 등급 단계적 변경
// ═══════════════════════════════════════════
describe('구매액 누적에 따른 등급 단계적 변경', () => {
  let customerId: number;
  let tierRules: Array<{ tier_name: string; min_amount: number }>;

  beforeAll(async () => {
    // 등급 규칙 조회
    const pool = getPool();
    const rulesRes = await pool.query(
      `SELECT tier_name, min_amount FROM customer_tier_rules
       WHERE is_active = TRUE ORDER BY min_amount ASC`,
    );
    tierRules = rulesRes.rows;

    // 테스트 고객 생성
    const phone = `010-8888-${Date.now().toString().slice(-4)}`;
    const createRes = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '단계등급테스트',
        phone,
        customer_tier: '신규',
        partner_code: fixtures.store.partner_code,
      });

    expect(createRes.status).toBe(201);
    customerId = createRes.body.data.customer_id;
    cleanup.customerIds.push(customerId);
  });

  it('등급 규칙이 2개 이상일 때: 낮은 등급 → 높은 등급 순차 변경', async () => {
    if (tierRules.length < 2) {
      console.log('등급 규칙이 2개 미만이라 단계적 변경 테스트를 스킵합니다.');
      return;
    }

    // 1단계: 첫 번째(가장 낮은) 등급 기준 충족
    const firstRule = tierRules[0];
    const firstAmount = Number(firstRule.min_amount) + 1000;

    const p1 = await request(app)
      .post(`/api/crm/${customerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '1단계상품',
        purchase_date: new Date().toISOString().slice(0, 10),
        qty: 1,
        unit_price: firstAmount,
        total_price: firstAmount,
        partner_code: fixtures.store.partner_code,
      });
    expect(p1.status).toBe(201);
    cleanup.purchaseIds.push(p1.body.data.purchase_id);

    const r1 = await request(app)
      .post(`/api/crm/${customerId}/tier/recalculate`)
      .set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.data.new_tier).toBe(firstRule.tier_name);

    // 2단계: 두 번째 등급 기준 충족 (추가 구매)
    const secondRule = tierRules[1];
    const additionalAmount = Number(secondRule.min_amount) - firstAmount + 1000;

    if (additionalAmount > 0) {
      const p2 = await request(app)
        .post(`/api/crm/${customerId}/purchases`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          product_name: '2단계상품',
          purchase_date: new Date().toISOString().slice(0, 10),
          qty: 1,
          unit_price: additionalAmount,
          total_price: additionalAmount,
          partner_code: fixtures.store.partner_code,
        });
      expect(p2.status).toBe(201);
      cleanup.purchaseIds.push(p2.body.data.purchase_id);

      const r2 = await request(app)
        .post(`/api/crm/${customerId}/tier/recalculate`)
        .set('Authorization', `Bearer ${token}`);
      expect(r2.status).toBe(200);
      expect(r2.body.data.new_tier).toBe(secondRule.tier_name);
      expect(r2.body.data.old_tier).toBe(firstRule.tier_name);
    }
  });

  it('동일 등급 재계산 → old_tier === new_tier (이력 미생성)', async () => {
    // 구매 추가 없이 재계산 → 등급 변경 없음
    const pool = getPool();
    const beforeCount = parseInt(
      (await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM customer_tier_history WHERE customer_id = $1',
        [customerId],
      )).rows[0].cnt,
      10,
    );

    const res = await request(app)
      .post(`/api/crm/${customerId}/tier/recalculate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.old_tier).toBe(res.body.data.new_tier);

    // 변경이 없으면 이력이 추가되지 않아야 함
    const afterCount = parseInt(
      (await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM customer_tier_history WHERE customer_id = $1',
        [customerId],
      )).rows[0].cnt,
      10,
    );

    expect(afterCount).toBe(beforeCount);
  });
});
