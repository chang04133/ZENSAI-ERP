/**
 * CRM 권한 테스트
 * - CRM 메인: ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER
 * - STORE_STAFF: 전체 접근 불가
 * - 캠페인: SYS_ADMIN 제외
 * - 매장 고객 격리
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens } from '../helpers';

describe('CRM Access Control', () => {
  let tokens: ReturnType<typeof allRoleTokens>;
  let store: any;

  beforeAll(async () => {
    const { getTestFixtures } = await import('../helpers');
    const fixtures = await getTestFixtures();
    store = fixtures.store;
    tokens = allRoleTokens(store.partner_code, store.partner_name);
  });

  // ── GET /api/crm — 고객 목록 ──
  describe('GET /api/crm — 고객 목록', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/crm?limit=5').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 200', async () => {
      const res = await request(app).get('/api/crm?limit=5').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(200);
    });

    it('HQ_MANAGER → 200', async () => {
      const res = await request(app).get('/api/crm?limit=5').set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(200);
    });

    it('STORE_MANAGER → 200', async () => {
      const res = await request(app).get('/api/crm?limit=5').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app).get('/api/crm').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 캠페인 — SYS_ADMIN 제외 ──
  describe('GET /api/crm/campaigns — 캠페인', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/crm/campaigns').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 403 (캠페인 접근 불가)', async () => {
      const res = await request(app).get('/api/crm/campaigns').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 200', async () => {
      const res = await request(app).get('/api/crm/campaigns').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app).get('/api/crm/campaigns').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(403);
    });
  });

  // ── A/S — SYS_ADMIN 제외 ──
  describe('GET /api/crm/after-sales — A/S', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/crm/after-sales').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 403', async () => {
      const res = await request(app).get('/api/crm/after-sales').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 200', async () => {
      const res = await request(app).get('/api/crm/after-sales').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
    });
  });

  // ── 세그먼트 — SYS_ADMIN 제외 ──
  describe('GET /api/crm/segments — 세그먼트', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/crm/segments').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 403', async () => {
      const res = await request(app).get('/api/crm/segments').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 매장 고객 격리 ──
  describe('매장 데이터 격리', () => {
    it('STORE_MANAGER → 자기 매장 고객만 반환', async () => {
      const res = await request(app)
        .get('/api/crm?limit=50')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
      const customers = res.body.data?.data || [];
      customers.forEach((c: any) => {
        expect(c.partner_code).toBe(store.partner_code);
      });
    });
  });
});
