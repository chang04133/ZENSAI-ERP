/**
 * 출고 권한 테스트
 * - CRUD: ADMIN~STORE_MANAGER (STORE_STAFF 제외)
 * - 수평이동 생성: STORE_MANAGER만
 * - 수령확인: checkReceiverAccess (ADMIN은 반품만)
 * - 출고확인: checkSenderAccess
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens } from '../helpers';

describe('Shipment Access Control', () => {
  let tokens: ReturnType<typeof allRoleTokens>;

  beforeAll(async () => {
    const { getTestFixtures } = await import('../helpers');
    const fixtures = await getTestFixtures();
    tokens = allRoleTokens(fixtures.store.partner_code, fixtures.store.partner_name);
  });

  // ── GET /api/shipments/summary ──
  describe('GET /api/shipments/summary — 요약', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app)
        .get('/api/shipments/summary')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_MANAGER → 200', async () => {
      const res = await request(app)
        .get('/api/shipments/summary')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app)
        .get('/api/shipments/summary')
        .set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/shipments ──
  describe('GET /api/shipments — 목록', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app)
        .get('/api/shipments?limit=5')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app)
        .get('/api/shipments')
        .set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(403);
    });
  });

  // ── POST /api/shipments — 출고 등록 ──
  describe('POST /api/shipments — 등록 권한', () => {
    it('STORE_STAFF → 403', async () => {
      const res = await request(app)
        .post('/api/shipments')
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('ADMIN → 권한 통과 (400 or 201)', async () => {
      const res = await request(app)
        .post('/api/shipments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({});
      expect(res.status).not.toBe(403);
    });

    it('STORE_MANAGER → 권한 통과', async () => {
      const res = await request(app)
        .post('/api/shipments')
        .set('Authorization', `Bearer ${tokens.storeManager}`)
        .send({});
      expect(res.status).not.toBe(403);
    });
  });
});
