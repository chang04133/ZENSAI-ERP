/**
 * 재고 권한 테스트
 * - 조회: 모든 인증 (STORE_STAFF는 자기 매장만)
 * - 조정/처리: ADMIN~HQ_MANAGER
 * - 변동내역: ADMIN만
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens, getTestFixtures } from '../helpers';

describe('Inventory Access Control', () => {
  let tokens: ReturnType<typeof allRoleTokens>;
  let store: any;

  beforeAll(async () => {
    const fixtures = await getTestFixtures();
    store = fixtures.store;
    tokens = allRoleTokens(store.partner_code, store.partner_name);
  });

  // ── GET /api/inventory ──
  describe('GET /api/inventory — 재고 목록', () => {
    it('ADMIN → 200, 전체 재고', async () => {
      const res = await request(app)
        .get('/api/inventory?limit=5')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_MANAGER → 200, 전체 재고 (매장 필터 없음)', async () => {
      const res = await request(app)
        .get('/api/inventory?limit=50')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
      // STORE_MANAGER는 전체 조회 가능 (컨트롤러에서 필터 안 걸림)
    });

    it('STORE_STAFF → 200, 자기 매장만', async () => {
      const res = await request(app)
        .get('/api/inventory?limit=50')
        .set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
      const items = res.body.data?.data || [];
      items.forEach((item: any) => {
        expect(item.partner_code).toBe(store.partner_code);
      });
    });

    it('미인증 → 401', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/inventory/adjust ──
  describe('POST /api/inventory/adjust — 재고 조정', () => {
    it('ADMIN → 권한 통과', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({}); // 빈 데이터 → 400, but not 403
      expect(res.status).not.toBe(403);
    });

    it('HQ_MANAGER → 권한 통과', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${tokens.hqManager}`)
        .send({});
      expect(res.status).not.toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${tokens.storeManager}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send({});
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/inventory/transactions ──
  describe('GET /api/inventory/transactions — ADMIN 전용', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app)
        .get('/api/inventory/transactions?limit=5')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('HQ_MANAGER → 403', async () => {
      const res = await request(app)
        .get('/api/inventory/transactions')
        .set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app)
        .get('/api/inventory/transactions')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(403);
    });
  });
});
