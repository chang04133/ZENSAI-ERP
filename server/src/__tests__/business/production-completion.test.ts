/**
 * 생산 흐름 비즈니스 로직 통합 테스트
 *
 * 1. GET /api/productions — 목록 조회 (ADMIN only)
 * 2. GET /api/productions/dashboard — 대시보드 통계
 * 3. GET /api/productions/category-stats — 카테고리별 통계
 * 4. GET /api/productions/recommendations — 생산 추천
 * 5. GET /api/productions/payment-summary — 지급 현황
 * 6. PUT /api/productions/:id/status — 상태 전환 (DRAFT->IN_PRODUCTION->COMPLETED->CANCELLED)
 * 7. PUT /api/productions/:id/start-production — 생산시작 + 선지급 (원자적)
 * 8. PUT /api/productions/:id/complete-production — 완료처리 + 잔금지급 (원자적)
 *
 * 모든 생산 엔드포인트는 ADMIN 전용.
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, hqManagerToken, storeToken, getTestFixtures } from '../helpers';

let admin: string;
let hqMgr: string;
let storeMgr: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// 테스트에서 생성한 생산계획 ID (정리용)
const createdPlanIds: number[] = [];

beforeAll(async () => {
  admin = adminToken();
  fixtures = await getTestFixtures();
  hqMgr = hqManagerToken();
  storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const planId of [...createdPlanIds].reverse()) {
      // 입고 레코드 정리
      await client.query(
        `DELETE FROM inbound_record_items WHERE record_id IN (
          SELECT record_id FROM inbound_records WHERE source_type = 'PRODUCTION' AND source_id = $1
        )`,
        [planId],
      );
      await client.query(
        `DELETE FROM inbound_records WHERE source_type = 'PRODUCTION' AND source_id = $1`,
        [planId],
      );
      // 자재 사용 정리
      await client.query('DELETE FROM production_material_usage WHERE plan_id = $1', [planId]);
      // 품목 정리
      await client.query('DELETE FROM production_plan_items WHERE plan_id = $1', [planId]);
      // 계획 삭제
      await client.query('DELETE FROM production_plans WHERE plan_id = $1', [planId]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('생산 테스트 데이터 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// 1. 권한 검증 — ADMIN 전용
// ═══════════════════════════════════════════════════════════
describe('생산 모듈 권한 검증 (ADMIN only)', () => {
  it('ADMIN: GET /api/productions → 200', async () => {
    const res = await request(app)
      .get('/api/productions?limit=5')
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('HQ_MANAGER: GET /api/productions → 403', async () => {
    const res = await request(app)
      .get('/api/productions')
      .set('Authorization', `Bearer ${hqMgr}`);
    expect(res.status).toBe(403);
  });

  it('STORE_MANAGER: GET /api/productions → 403', async () => {
    const res = await request(app)
      .get('/api/productions')
      .set('Authorization', `Bearer ${storeMgr}`);
    expect(res.status).toBe(403);
  });

  it('미인증: GET /api/productions → 401', async () => {
    const res = await request(app).get('/api/productions');
    expect(res.status).toBe(401);
  });

  it('HQ_MANAGER: GET /api/productions/dashboard → 403', async () => {
    const res = await request(app)
      .get('/api/productions/dashboard')
      .set('Authorization', `Bearer ${hqMgr}`);
    expect(res.status).toBe(403);
  });

  it('STORE_MANAGER: PUT /api/productions/:id/status → 403', async () => {
    const res = await request(app)
      .put('/api/productions/1/status')
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({ status: 'IN_PRODUCTION' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 대시보드 / 통계 엔드포인트
// ═══════════════════════════════════════════════════════════
describe('생산 대시보드 및 통계', () => {
  it('GET /api/productions/dashboard — 통계 반환', async () => {
    const res = await request(app)
      .get('/api/productions/dashboard')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTruthy();
  });

  it('GET /api/productions/category-stats — 카테고리별 통계', async () => {
    const res = await request(app)
      .get('/api/productions/category-stats')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data) || typeof res.body.data === 'object').toBe(true);
  });

  it('GET /api/productions/recommendations — 생산 추천', async () => {
    const res = await request(app)
      .get('/api/productions/recommendations?limit=5')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/productions/payment-summary — 지급 현황', async () => {
    const res = await request(app)
      .get('/api/productions/payment-summary')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 생산계획 생성 + 상태 전환 흐름
// ═══════════════════════════════════════════════════════════
describe('생산계획 생성 및 상태 전환', () => {
  let testPlanId: number;

  it('생산번호 자동생성', async () => {
    const res = await request(app)
      .get('/api/productions/generate-no')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data).toBe('string');
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /api/productions — 생산계획 생성 (DRAFT)', async () => {
    // 먼저 생산번호 생성
    const noRes = await request(app)
      .get('/api/productions/generate-no')
      .set('Authorization', `Bearer ${admin}`);
    const planNo = noRes.body.data;

    const res = await request(app)
      .post('/api/productions')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        plan_name: '테스트 생산계획',
        plan_no: planNo,
        season: '25FW',
        target_date: '2026-06-30',
        items: [{
          category: '아우터',
          product_code: fixtures.variant.product_code,
          plan_qty: 100,
          unit_cost: 15000,
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    testPlanId = res.body.data.plan_id;
    createdPlanIds.push(testPlanId);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('POST /api/productions — items 없으면 400', async () => {
    const res = await request(app)
      .post('/api/productions')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        plan_name: '빈 생산계획',
        items: [],
      });

    expect(res.status).toBe(400);
  });

  it('POST /api/productions — plan_name 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/productions')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        items: [{ category: '아우터', plan_qty: 100 }],
      });

    expect(res.status).toBe(400);
  });

  it('PUT /:id/status — 유효하지 않은 상태값 시 400', async () => {
    const res = await request(app)
      .put(`/api/productions/${testPlanId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('유효하지 않은 상태값');
  });

  it('PUT /:id/status — DRAFT -> IN_PRODUCTION', async () => {
    const res = await request(app)
      .put(`/api/productions/${testPlanId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'IN_PRODUCTION' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('IN_PRODUCTION');
  });

  it('PUT /:id/status — IN_PRODUCTION -> DRAFT 불가 (잘못된 전환)', async () => {
    const res = await request(app)
      .put(`/api/productions/${testPlanId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'DRAFT' });

    // 허용되지 않는 전환이므로 에러
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('PUT /:id/status — IN_PRODUCTION -> CANCELLED', async () => {
    const res = await request(app)
      .put(`/api/productions/${testPlanId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('PUT /:id/status — CANCELLED 상태에서 추가 전환 불가', async () => {
    const res = await request(app)
      .put(`/api/productions/${testPlanId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'IN_PRODUCTION' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('PUT /:id/status — 존재하지 않는 ID 시 에러', async () => {
    const res = await request(app)
      .put('/api/productions/999999999/status')
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'IN_PRODUCTION' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 생산시작 (start-production) + 완료 (complete-production)
// ═══════════════════════════════════════════════════════════
describe('생산시작 / 완료 원자적 트랜잭션', () => {
  let draftPlanId: number;

  beforeAll(async () => {
    // DRAFT 상태 생산계획 생성
    const noRes = await request(app)
      .get('/api/productions/generate-no')
      .set('Authorization', `Bearer ${admin}`);
    const planNo = noRes.body.data;

    const res = await request(app)
      .post('/api/productions')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        plan_name: '시작/완료 테스트',
        plan_no: planNo,
        season: '25FW',
        target_date: '2026-07-31',
        items: [{
          category: '하의',
          product_code: fixtures.variant.product_code,
          plan_qty: 50,
          unit_cost: 12000,
        }],
      });

    draftPlanId = res.body.data.plan_id;
    createdPlanIds.push(draftPlanId);
  });

  it('PUT /:id/start-production — DRAFT에서 생산시작', async () => {
    const res = await request(app)
      .put(`/api/productions/${draftPlanId}/start-production`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        total_amount: 600000,
        advance_rate: 30,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('IN_PRODUCTION');
    // 선지급 정보 확인
    expect(res.body.data.advance_status).toBe('PAID');
    expect(Number(res.body.data.total_amount)).toBe(600000);
  });

  it('PUT /:id/start-production — 이미 IN_PRODUCTION 상태에서 재시작 시 에러', async () => {
    const res = await request(app)
      .put(`/api/productions/${draftPlanId}/start-production`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ total_amount: 600000 });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('PUT /:id/produced-qty — 생산수량 업데이트', async () => {
    // 먼저 items 조회
    const detailRes = await request(app)
      .get(`/api/productions/${draftPlanId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(detailRes.status).toBe(200);
    const items = detailRes.body.data.items || [];
    if (items.length > 0) {
      const res = await request(app)
        .put(`/api/productions/${draftPlanId}/produced-qty`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          items: items.map((item: any) => ({
            item_id: item.item_id,
            produced_qty: item.plan_qty, // 계획 수량만큼 생산 완료
          })),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });

  it('PUT /:id/complete-production — 생산완료 + 잔금지급', async () => {
    const res = await request(app)
      .put(`/api/productions/${draftPlanId}/complete-production`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        balance_date: '2026-04-08',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.balance_status).toBe('PAID');
  });

  it('완료된 계획에 대해 입고대기 레코드가 생성됨', async () => {
    const pool = getPool();
    const inbound = await pool.query(
      `SELECT * FROM inbound_records WHERE source_type = 'PRODUCTION' AND source_id = $1`,
      [draftPlanId],
    );

    expect(inbound.rows.length).toBeGreaterThanOrEqual(1);
    expect(inbound.rows[0].status).toBe('PENDING');
  });

  it('PUT /:id/complete-production — 이미 COMPLETED 상태에서 재완료 시 에러', async () => {
    const res = await request(app)
      .put(`/api/productions/${draftPlanId}/complete-production`)
      .set('Authorization', `Bearer ${admin}`)
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 생산수량 업데이트 및 자재 관리
// ═══════════════════════════════════════════════════════════
describe('생산수량 / 자재 관리', () => {
  it('PUT /:id/produced-qty — items 누락 시 400', async () => {
    const res = await request(app)
      .put('/api/productions/1/produced-qty')
      .set('Authorization', `Bearer ${admin}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('품목 데이터');
  });

  it('PUT /:id/produced-qty — 빈 items 시 400', async () => {
    const res = await request(app)
      .put('/api/productions/1/produced-qty')
      .set('Authorization', `Bearer ${admin}`)
      .send({ items: [] });

    expect(res.status).toBe(400);
  });

  it('PUT /:id/materials — materials 누락 시 400', async () => {
    const res = await request(app)
      .put('/api/productions/1/materials')
      .set('Authorization', `Bearer ${admin}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('자재 데이터');
  });

  it('유효하지 않은 ID 형식 시 400', async () => {
    const res = await request(app)
      .put('/api/productions/abc/status')
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'IN_PRODUCTION' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('유효하지 않은 ID');
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 자동 생성 미리보기
// ═══════════════════════════════════════════════════════════
describe('자동 생성 미리보기', () => {
  it('GET /api/productions/auto-generate/preview — ADMIN 접근 가능', async () => {
    const res = await request(app)
      .get('/api/productions/auto-generate/preview')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('HQ_MANAGER: 자동 생성 미리보기 403', async () => {
    const res = await request(app)
      .get('/api/productions/auto-generate/preview')
      .set('Authorization', `Bearer ${hqMgr}`);

    expect(res.status).toBe(403);
  });
});
