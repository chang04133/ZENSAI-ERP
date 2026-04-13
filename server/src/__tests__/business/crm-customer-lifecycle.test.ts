/**
 * CRM 고객 라이프사이클 통합 테스트
 *
 * 테스트 항목:
 * 1. POST /api/crm — 고객 생성 (name, phone 필수)
 * 2. 중복 전화번호 → 409
 * 3. PUT /api/crm/:id — 고객 수정
 * 4. DELETE /api/crm/:id — 소프트 삭제
 * 5. GET /api/crm/:id — 고객 상세 조회
 * 6. 방문(visits), 상담(consultations), 태그(tags), 피드백(feedback)
 * 7. 매장 필터링: STORE_MANAGER 고객 생성 시 partner_code 자동 설정
 * 8. 구매이력 CRUD
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, getTestFixtures } from '../helpers';

let token: string;
let storeManagerToken: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// 테스트 데이터 추적 (정리용)
const cleanup = {
  customerIds: [] as number[],
  tagIds: [] as number[],
  purchaseIds: [] as number[],
  visitIds: [] as number[],
  consultationIds: [] as number[],
  feedbackIds: [] as number[],
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

    // 피드백 삭제
    for (const fid of cleanup.feedbackIds) {
      await client.query('DELETE FROM customer_feedback WHERE feedback_id = $1', [fid]);
    }

    // 상담 삭제
    for (const cid of cleanup.consultationIds) {
      await client.query('DELETE FROM customer_consultations WHERE consultation_id = $1', [cid]);
    }

    // 방문 삭제
    for (const vid of cleanup.visitIds) {
      await client.query('DELETE FROM customer_visits WHERE visit_id = $1', [vid]);
    }

    // 태그 매핑 + 태그 삭제
    for (const cid of cleanup.customerIds) {
      await client.query('DELETE FROM customer_tag_map WHERE customer_id = $1', [cid]);
    }
    for (const tid of cleanup.tagIds) {
      await client.query('DELETE FROM customer_tag_map WHERE tag_id = $1', [tid]);
      await client.query('DELETE FROM customer_tags WHERE tag_id = $1', [tid]);
    }

    // 구매기록 삭제
    for (const pid of cleanup.purchaseIds) {
      await client.query('DELETE FROM customer_purchases WHERE purchase_id = $1', [pid]);
    }

    // 등급 이력 삭제
    for (const cid of cleanup.customerIds) {
      await client.query('DELETE FROM customer_tier_history WHERE customer_id = $1', [cid]);
    }

    // 고객 삭제 (구매기록 잔여분도 정리)
    for (const cid of cleanup.customerIds) {
      await client.query('DELETE FROM customer_purchases WHERE customer_id = $1', [cid]);
      await client.query('DELETE FROM customer_feedback WHERE customer_id = $1', [cid]);
      await client.query('DELETE FROM customer_consultations WHERE customer_id = $1', [cid]);
      await client.query('DELETE FROM customer_visits WHERE customer_id = $1', [cid]);
      await client.query('DELETE FROM customers WHERE customer_id = $1', [cid]);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('crm-customer-lifecycle 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════
// 1. 고객 생성 (POST /api/crm)
// ═══════════════════════════════════════════
describe('POST /api/crm — 고객 생성', () => {
  const uniquePhone = () => `010-7777-${Date.now().toString().slice(-4)}`;
  let createdPhone: string;

  it('정상 생성 → 201, customer_id 반환', async () => {
    createdPhone = uniquePhone();
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '테스트고객_생성',
        phone: createdPhone,
        email: 'test-lifecycle@test.com',
        gender: '여',
        partner_code: fixtures.store.partner_code,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('customer_id');
    expect(res.body.data.customer_name).toBe('테스트고객_생성');
    expect(res.body.data.phone).toBe(createdPhone);
    cleanup.customerIds.push(res.body.data.customer_id);
  });

  it('이름 누락 → 400', async () => {
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: uniquePhone() });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('전화번호 누락 → 400', async () => {
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_name: '이름만' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('중복 전화번호 → 409', async () => {
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '중복테스트',
        phone: createdPhone, // 위에서 생성한 번호
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('이미 등록된 전화번호');
  });

  it('인증 없이 → 401', async () => {
    const res = await request(app)
      .post('/api/crm')
      .send({ customer_name: '무인증', phone: uniquePhone() });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════
// 2. 매장관리자 고객 생성 → partner_code 자동 설정
// ═══════════════════════════════════════════
describe('STORE_MANAGER 고객 생성 — partner_code 자동 설정', () => {
  it('매장관리자가 생성하면 자기 매장 코드가 자동으로 설정됨', async () => {
    const phone = `010-6666-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${storeManagerToken}`)
      .send({
        customer_name: '매장고객_자동코드',
        phone,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.partner_code).toBe(fixtures.store.partner_code);
    cleanup.customerIds.push(res.body.data.customer_id);
  });
});

// ═══════════════════════════════════════════
// 3. 고객 상세 조회 (GET /api/crm/:id)
// ═══════════════════════════════════════════
describe('GET /api/crm/:id — 고객 상세', () => {
  let testCustomerId: number;

  beforeAll(async () => {
    const phone = `010-5555-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '상세조회테스트',
        phone,
        email: 'detail@test.com',
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('정상 조회 → 200, 구매 통계 포함', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customer_id).toBe(testCustomerId);
    expect(res.body.data.customer_name).toBe('상세조회테스트');
    // 구매 통계 필드 확인
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('purchase_count');
  });

  it('존재하지 않는 고객 → 404', async () => {
    const res = await request(app)
      .get('/api/crm/999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 4. 고객 수정 (PUT /api/crm/:id)
// ═══════════════════════════════════════════
describe('PUT /api/crm/:id — 고객 수정', () => {
  let testCustomerId: number;
  let originalPhone: string;

  beforeAll(async () => {
    originalPhone = `010-4444-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '수정전이름',
        phone: originalPhone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('이름 수정 → 200', async () => {
    const res = await request(app)
      .put(`/api/crm/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_name: '수정후이름' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 수정 확인
    const detail = await request(app)
      .get(`/api/crm/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.data.customer_name).toBe('수정후이름');
  });

  it('이메일 추가 수정 → 200', async () => {
    const res = await request(app)
      .put(`/api/crm/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'updated@test.com' });

    expect(res.status).toBe(200);
  });

  it('다른 고객과 동일한 전화번호로 수정 → 409', async () => {
    // 다른 고객 먼저 생성
    const otherPhone = `010-3333-${Date.now().toString().slice(-4)}`;
    const other = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '다른고객',
        phone: otherPhone,
        partner_code: fixtures.store.partner_code,
      });
    cleanup.customerIds.push(other.body.data.customer_id);

    // 기존 고객 전화번호를 다른 고객 번호로 변경 시도
    const res = await request(app)
      .put(`/api/crm/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: otherPhone });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('이미 등록된 전화번호');
  });
});

// ═══════════════════════════════════════════
// 5. 고객 삭제 (DELETE /api/crm/:id) — soft delete
// ═══════════════════════════════════════════
describe('DELETE /api/crm/:id — 소프트 삭제', () => {
  let testCustomerId: number;

  beforeAll(async () => {
    const phone = `010-2222-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '삭제대상고객',
        phone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('삭제 → 200', async () => {
    const res = await request(app)
      .delete(`/api/crm/${testCustomerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('삭제 후 is_active = FALSE 확인 (DB 직접 조회)', async () => {
    const pool = getPool();
    const dbRes = await pool.query(
      'SELECT is_active FROM customers WHERE customer_id = $1',
      [testCustomerId],
    );
    expect(dbRes.rows[0].is_active).toBe(false);
  });

  it('삭제된 고객은 목록에서 제외됨', async () => {
    const res = await request(app)
      .get('/api/crm?limit=200')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((c: any) => c.customer_id);
    expect(ids).not.toContain(testCustomerId);
  });
});

// ═══════════════════════════════════════════
// 6. 구매이력 CRUD
// ═══════════════════════════════════════════
describe('구매이력 CRUD', () => {
  let testCustomerId: number;
  let purchaseId: number;

  beforeAll(async () => {
    const phone = `010-1111-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '구매테스트고객',
        phone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('POST /:id/purchases — 구매기록 추가', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '테스트자켓',
        purchase_date: '2026-04-01',
        qty: 2,
        unit_price: 150000,
        total_price: 300000,
        payment_method: '카드',
        partner_code: fixtures.store.partner_code,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.product_name).toBe('테스트자켓');
    purchaseId = res.body.data.purchase_id;
    cleanup.purchaseIds.push(purchaseId);
  });

  it('GET /:id/purchases — 구매이력 조회', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}/purchases`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('totalAmount');
    expect(res.body).toHaveProperty('purchaseCount');
  });

  it('PUT /:id/purchases/:pid — 구매기록 수정', async () => {
    const res = await request(app)
      .put(`/api/crm/${testCustomerId}/purchases/${purchaseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '수정된자켓',
        purchase_date: '2026-04-02',
        qty: 3,
        unit_price: 150000,
        total_price: 450000,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.product_name).toBe('수정된자켓');
    expect(Number(res.body.data.total_price)).toBe(450000);
  });

  it('구매 추가 시 상품명/단가 필수', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qty: 1 });

    expect(res.status).toBe(400);
  });

  it('단가 0 이하 → 400', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '무료상품',
        unit_price: 0,
        qty: 1,
      });

    expect(res.status).toBe(400);
  });

  it('DELETE /:id/purchases/:pid — 구매기록 삭제', async () => {
    // 삭제용 구매 하나 더 추가
    const addRes = await request(app)
      .post(`/api/crm/${testCustomerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '삭제대상구매',
        purchase_date: '2026-04-03',
        qty: 1,
        unit_price: 50000,
        total_price: 50000,
        partner_code: fixtures.store.partner_code,
      });
    const delPurchaseId = addRes.body.data.purchase_id;

    const res = await request(app)
      .delete(`/api/crm/${testCustomerId}/purchases/${delPurchaseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 7. 방문(Visits)
// ═══════════════════════════════════════════
describe('방문이력 CRUD', () => {
  let testCustomerId: number;

  beforeAll(async () => {
    const phone = `010-0101-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '방문테스트고객',
        phone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('POST /:id/visits — 방문 기록 추가', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/visits`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        visit_date: '2026-04-08',
        purpose: '신상품 구경',
        is_purchase: false,
        partner_code: fixtures.store.partner_code,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('visit_id');
    cleanup.visitIds.push(res.body.data.visit_id);
  });

  it('GET /:id/visits — 방문이력 조회', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}/visits`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /:id/visits/:vid — 방문 삭제', async () => {
    // 삭제용 방문 추가
    const addRes = await request(app)
      .post(`/api/crm/${testCustomerId}/visits`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        visit_date: '2026-04-07',
        partner_code: fixtures.store.partner_code,
      });
    const vid = addRes.body.data.visit_id;

    const res = await request(app)
      .delete(`/api/crm/${testCustomerId}/visits/${vid}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 8. 상담(Consultations)
// ═══════════════════════════════════════════
describe('상담이력 CRUD', () => {
  let testCustomerId: number;

  beforeAll(async () => {
    const phone = `010-0202-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '상담테스트고객',
        phone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('POST /:id/consultations — 상담 기록 추가', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/consultations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        consultation_type: '전화',
        content: '사이즈 문의 — M 사이즈 추천',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('consultation_id');
    cleanup.consultationIds.push(res.body.data.consultation_id);
  });

  it('상담 내용 없이 → 400', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/consultations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consultation_type: '메모' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('내용은 필수');
  });

  it('GET /:id/consultations — 상담이력 조회', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}/consultations`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /:id/consultations/:cid — 상담 삭제', async () => {
    const addRes = await request(app)
      .post(`/api/crm/${testCustomerId}/consultations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consultation_type: '메모', content: '삭제될 상담' });
    const cid = addRes.body.data.consultation_id;

    const res = await request(app)
      .delete(`/api/crm/${testCustomerId}/consultations/${cid}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 9. 태그(Tags)
// ═══════════════════════════════════════════
describe('태그 관리', () => {
  let testCustomerId: number;
  let testTagId: number;

  beforeAll(async () => {
    const phone = `010-0303-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '태그테스트고객',
        phone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('POST /api/crm/tags — 태그 생성', async () => {
    const res = await request(app)
      .post('/api/crm/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ tag_name: '테스트VIP태그', color: '#ff0000' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('tag_id');
    expect(res.body.data.tag_name).toBe('테스트VIP태그');
    testTagId = res.body.data.tag_id;
    cleanup.tagIds.push(testTagId);
  });

  it('태그명 없이 생성 → 400', async () => {
    const res = await request(app)
      .post('/api/crm/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ color: '#000000' });

    expect(res.status).toBe(400);
  });

  it('GET /api/crm/tags — 태그 목록 조회', async () => {
    const res = await request(app)
      .get('/api/crm/tags')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const tagNames = res.body.data.map((t: any) => t.tag_name);
    expect(tagNames).toContain('테스트VIP태그');
  });

  it('POST /:id/tags/:tagId — 고객에 태그 부착', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/tags/${testTagId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /:id/tags — 고객 태그 조회', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}/tags`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const tagIds = res.body.data.map((t: any) => t.tag_id);
    expect(tagIds).toContain(testTagId);
  });

  it('DELETE /:id/tags/:tagId — 고객에서 태그 제거', async () => {
    const res = await request(app)
      .delete(`/api/crm/${testCustomerId}/tags/${testTagId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 제거 확인
    const check = await request(app)
      .get(`/api/crm/${testCustomerId}/tags`)
      .set('Authorization', `Bearer ${token}`);
    const tagIds = check.body.data.map((t: any) => t.tag_id);
    expect(tagIds).not.toContain(testTagId);
  });

  it('DELETE /api/crm/tags/:tagId — 태그 자체 삭제', async () => {
    // 삭제용 태그 생성
    const addRes = await request(app)
      .post('/api/crm/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ tag_name: '삭제될태그' });
    const delTagId = addRes.body.data.tag_id;

    const res = await request(app)
      .delete(`/api/crm/tags/${delTagId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 10. 피드백(Feedback)
// ═══════════════════════════════════════════
describe('피드백 CRUD', () => {
  let testCustomerId: number;

  beforeAll(async () => {
    const phone = `010-0404-${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '피드백테스트고객',
        phone,
        partner_code: fixtures.store.partner_code,
      });
    testCustomerId = res.body.data.customer_id;
    cleanup.customerIds.push(testCustomerId);
  });

  it('POST /:id/feedback — 피드백 추가 (평점 1~5)', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rating: 5,
        content: '매우 만족합니다.',
        feedback_type: '서비스',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('feedback_id');
    expect(res.body.data.rating).toBe(5);
    cleanup.feedbackIds.push(res.body.data.feedback_id);
  });

  it('평점 범위 밖 → 400', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 6, content: '범위초과' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('1~5');
  });

  it('평점 없이 → 400', async () => {
    const res = await request(app)
      .post(`/api/crm/${testCustomerId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '평점없음' });

    expect(res.status).toBe(400);
  });

  it('GET /:id/feedback — 피드백 조회', async () => {
    const res = await request(app)
      .get(`/api/crm/${testCustomerId}/feedback`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /:id/feedback/:fid — 피드백 삭제', async () => {
    const addRes = await request(app)
      .post(`/api/crm/${testCustomerId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 3, content: '삭제될 피드백' });
    const fid = addRes.body.data.feedback_id;

    const res = await request(app)
      .delete(`/api/crm/${testCustomerId}/feedback/${fid}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 11. 고객 목록 조회 (GET /api/crm)
// ═══════════════════════════════════════════
describe('GET /api/crm — 고객 목록', () => {
  it('정상 조회 → 200, 페이징 포함', async () => {
    const res = await request(app)
      .get('/api/crm?limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });

  it('검색 필터 → search 파라미터', async () => {
    const res = await request(app)
      .get('/api/crm?search=태그테스트고객&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // 검색어가 포함된 고객만 반환
    if (res.body.data && res.body.data.length > 0) {
      const names = res.body.data.map((c: any) => c.customer_name);
      expect(names.some((n: string) => n.includes('태그테스트'))).toBe(true);
    }
  });

  it('등급 필터 → customer_tier 파라미터', async () => {
    const res = await request(app)
      .get('/api/crm?customer_tier=신규&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    if (res.body.data && res.body.data.length > 0) {
      res.body.data.forEach((c: any) => {
        expect(c.customer_tier).toBe('신규');
      });
    }
  });

  it('STORE_MANAGER → 자기 매장 고객만 반환', async () => {
    const res = await request(app)
      .get('/api/crm?limit=50')
      .set('Authorization', `Bearer ${storeManagerToken}`);

    expect(res.status).toBe(200);
    const customers = res.body.data || [];
    customers.forEach((c: any) => {
      expect(c.partner_code).toBe(fixtures.store.partner_code);
    });
  });
});

// ═══════════════════════════════════════════
// 12. 전체 라이프사이클 시나리오
// ═══════════════════════════════════════════
describe('전체 라이프사이클 — 생성→수정→구매→조회→삭제', () => {
  let customerId: number;
  const phone = `010-9090-${Date.now().toString().slice(-4)}`;

  it('1단계: 고객 생성', async () => {
    const res = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '라이프사이클고객',
        phone,
        gender: '남',
        partner_code: fixtures.store.partner_code,
      });

    expect(res.status).toBe(201);
    customerId = res.body.data.customer_id;
    cleanup.customerIds.push(customerId);
  });

  it('2단계: 고객 정보 수정', async () => {
    const res = await request(app)
      .put(`/api/crm/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memo: 'VIP 후보 — 적극 관리',
        email: 'lifecycle@test.com',
      });

    expect(res.status).toBe(200);
  });

  it('3단계: 구매 기록 추가', async () => {
    const res = await request(app)
      .post(`/api/crm/${customerId}/purchases`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: '프리미엄코트',
        purchase_date: '2026-04-05',
        qty: 1,
        unit_price: 500000,
        total_price: 500000,
        partner_code: fixtures.store.partner_code,
      });

    expect(res.status).toBe(201);
    cleanup.purchaseIds.push(res.body.data.purchase_id);
  });

  it('4단계: 상세 조회 → 구매 통계 반영 확인', async () => {
    const res = await request(app)
      .get(`/api/crm/${customerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.memo).toBe('VIP 후보 — 적극 관리');
    expect(Number(res.body.data.total_amount)).toBeGreaterThanOrEqual(500000);
    expect(Number(res.body.data.purchase_count)).toBeGreaterThanOrEqual(1);
  });

  it('5단계: 소프트 삭제', async () => {
    const res = await request(app)
      .delete(`/api/crm/${customerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // DB에서 is_active 확인
    const pool = getPool();
    const dbRes = await pool.query(
      'SELECT is_active FROM customers WHERE customer_id = $1',
      [customerId],
    );
    expect(dbRes.rows[0].is_active).toBe(false);
  });
});
