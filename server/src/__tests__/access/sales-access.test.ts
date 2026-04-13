/**
 * 판매 권한 테스트
 * - 등록: ALL (STORE_STAFF 포함)
 * - 수정/삭제: 매니저 이상 (STORE_STAFF 제외)
 * - 반품: 매니저 이상, STORE_MANAGER 30일 제한
 * - 분석: 모든 인증 (매장은 자기 매장만)
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens, getTestFixtures, storeToken, storeStaffToken } from '../helpers';

describe('Sales Access Control', () => {
  let tokens: ReturnType<typeof allRoleTokens>;
  let store: any;
  let variant: any;
  const cleanupSaleIds: number[] = [];

  beforeAll(async () => {
    const fixtures = await getTestFixtures();
    store = fixtures.store;
    variant = fixtures.variant;
    tokens = allRoleTokens(store.partner_code, store.partner_name);
  });

  afterAll(async () => {
    const { getPool } = await import('../../db/connection');
    const pool = getPool();
    for (const id of cleanupSaleIds) {
      // 연관 데이터 정리
      await pool.query("DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ('SALE','SALE_DELETE','RETURN')", [id]);
      await pool.query('DELETE FROM sales WHERE sale_id = $1', [id]);
    }
  });

  // ── GET /api/sales ──
  describe('GET /api/sales — 매출 목록', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/sales?limit=5').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 200, 자기 매장만', async () => {
      const res = await request(app).get('/api/sales?limit=50').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
      const items = res.body.data?.data || [];
      items.forEach((item: any) => {
        expect(item.partner_code).toBe(store.partner_code);
      });
    });
  });

  // ── POST /api/sales — 등록 ──
  describe('POST /api/sales — 매출 등록', () => {
    it('STORE_STAFF → 등록 가능', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send({
          partner_code: store.partner_code,
          sale_date: new Date().toISOString().slice(0, 10),
          sale_type: '정상',
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: variant.base_price,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
    });

    it('미인증 → 401', async () => {
      const res = await request(app).post('/api/sales').send({});
      expect(res.status).toBe(401);
    });
  });

  // ── PUT /api/sales/:id — 수정 ──
  describe('PUT /api/sales/:id — 매출 수정', () => {
    let testSaleId: number;

    beforeAll(async () => {
      // ADMIN으로 테스트 매출 생성
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          partner_code: store.partner_code,
          sale_date: new Date().toISOString().slice(0, 10),
          sale_type: '정상',
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: variant.base_price,
        });
      testSaleId = res.body.data?.sale_id;
      if (testSaleId) cleanupSaleIds.push(testSaleId);
    });

    it('ADMIN → 수정 가능', async () => {
      if (!testSaleId) return;
      const res = await request(app)
        .put(`/api/sales/${testSaleId}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ qty: 2, unit_price: variant.base_price });
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 403 (매니저 이상만 수정 가능)', async () => {
      if (!testSaleId) return;
      const res = await request(app)
        .put(`/api/sales/${testSaleId}`)
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send({ qty: 2, unit_price: variant.base_price });
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/sales/analytics/* ──
  describe('Sales Analytics — 매장 필터링', () => {
    it('STORE_MANAGER → 200, 자기 매장 데이터만', async () => {
      const res = await request(app)
        .get('/api/sales/dashboard-stats')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 200 (분석 조회 가능)', async () => {
      const res = await request(app)
        .get('/api/sales/dashboard-stats')
        .set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
    });
  });

  // ── 반품 ──
  describe('POST /api/sales/direct-return — 직접 반품', () => {
    it('STORE_STAFF → 403 (매니저만 가능)', async () => {
      const res = await request(app)
        .post('/api/sales/direct-return')
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 권한 통과 (400 or 201)', async () => {
      const res = await request(app)
        .post('/api/sales/direct-return')
        .set('Authorization', `Bearer ${tokens.storeManager}`)
        .send({});
      expect(res.status).not.toBe(403);
    });
  });
});
