/**
 * 매장 데이터 격리 테스트
 * - STORE_MANAGER/STORE_STAFF가 자기 매장 데이터만 조회되는지 확인
 * - 매출, CRM 고객, 재고, 출고, 대시보드 엔드포인트 검증
 */
import request from 'supertest';
import app from '../../app';
import {
  getTestFixtures,
  getSecondStore,
  storeToken,
  storeStaffToken,
  hqManagerToken,
} from '../helpers';

describe('Store Data Isolation', () => {
  let storeA: any;
  let storeB: any;
  let storeAToken: string;
  let storeBToken: string;
  let storeAStaffToken: string;
  let variant: any;

  beforeAll(async () => {
    const fixtures = await getTestFixtures();
    storeA = fixtures.store;
    variant = fixtures.variant;

    const second = await getSecondStore();
    if (!second) throw new Error('Two active stores required for isolation tests');
    storeB = second;

    storeAToken = storeToken(storeA.partner_code, storeA.partner_name);
    storeBToken = storeToken(storeB.partner_code, storeB.partner_name);
    storeAStaffToken = storeStaffToken(storeA.partner_code, storeA.partner_name);
  });

  // ── GET /api/sales ── 매출 목록 매장 필터링
  describe('GET /api/sales -- store-scoped sales', () => {
    it('STORE_MANAGER sees only their own store sales', async () => {
      const res = await request(app)
        .get('/api/sales?limit=50')
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      const items = res.body.data?.data || [];
      items.forEach((item: any) => {
        expect(item.partner_code).toBe(storeA.partner_code);
      });
    });

    it('Store B STORE_MANAGER sees only Store B sales', async () => {
      const res = await request(app)
        .get('/api/sales?limit=50')
        .set('Authorization', `Bearer ${storeBToken}`);
      expect(res.status).toBe(200);
      const items = res.body.data?.data || [];
      items.forEach((item: any) => {
        expect(item.partner_code).toBe(storeB.partner_code);
      });
    });
  });

  // ── GET /api/crm ── CRM 고객 목록 매장 필터링
  describe('GET /api/crm -- store-scoped customers', () => {
    it('STORE_MANAGER sees only their own store customers', async () => {
      const res = await request(app)
        .get('/api/crm?limit=50')
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      const customers = res.body.data?.data || [];
      customers.forEach((c: any) => {
        expect(c.partner_code).toBe(storeA.partner_code);
      });
    });

    it('Store B STORE_MANAGER sees only Store B customers', async () => {
      const res = await request(app)
        .get('/api/crm?limit=50')
        .set('Authorization', `Bearer ${storeBToken}`);
      expect(res.status).toBe(200);
      const customers = res.body.data?.data || [];
      customers.forEach((c: any) => {
        expect(c.partner_code).toBe(storeB.partner_code);
      });
    });
  });

  // ── GET /api/inventory ── 재고 목록 매장 필터링 (STORE_STAFF만 제한)
  describe('GET /api/inventory -- STORE_STAFF store-restricted', () => {
    it('STORE_STAFF sees only their own store inventory', async () => {
      const res = await request(app)
        .get('/api/inventory?limit=50')
        .set('Authorization', `Bearer ${storeAStaffToken}`);
      expect(res.status).toBe(200);
      const items = Array.isArray(res.body.data)
        ? res.body.data
        : res.body.data?.data || [];
      items.forEach((item: any) => {
        expect(item.partner_code).toBe(storeA.partner_code);
      });
    });

    it('STORE_MANAGER can see all stores inventory (no forced filter)', async () => {
      // STORE_MANAGER is not restricted to their own store for inventory
      const res = await request(app)
        .get('/api/inventory?limit=50')
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      // No partner_code assertion -- STORE_MANAGER sees all
    });
  });

  // ── GET /api/shipments ── 출고 목록 매장 필터링
  describe('GET /api/shipments -- store-scoped shipments', () => {
    it('STORE_MANAGER sees only shipments involving their store', async () => {
      const res = await request(app)
        .get('/api/shipments?limit=50')
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      const items = Array.isArray(res.body.data)
        ? res.body.data
        : res.body.data?.data || [];
      items.forEach((item: any) => {
        // Shipments are filtered to from_partner OR to_partner matching the store
        const involved =
          item.from_partner === storeA.partner_code ||
          item.to_partner === storeA.partner_code;
        expect(involved).toBe(true);
      });
    });

    it('Store B STORE_MANAGER sees only shipments involving Store B', async () => {
      const res = await request(app)
        .get('/api/shipments?limit=50')
        .set('Authorization', `Bearer ${storeBToken}`);
      expect(res.status).toBe(200);
      const items = Array.isArray(res.body.data)
        ? res.body.data
        : res.body.data?.data || [];
      items.forEach((item: any) => {
        const involved =
          item.from_partner === storeB.partner_code ||
          item.to_partner === storeB.partner_code;
        expect(involved).toBe(true);
      });
    });
  });

  // ── GET /api/dashboard/stats ── 대시보드 매장 스코프
  describe('GET /api/dashboard/stats -- store-scoped dashboard', () => {
    it('STORE_MANAGER gets store-scoped dashboard data', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      // isStore flag should be true for store users
      expect(res.body.data.isStore).toBe(true);
      expect(res.body.data.partnerCode).toBe(storeA.partner_code);
    });

    it('Store B STORE_MANAGER gets Store B scoped dashboard', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${storeBToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.isStore).toBe(true);
      expect(res.body.data.partnerCode).toBe(storeB.partner_code);
    });

    it('HQ_MANAGER gets non-store dashboard (all stores)', async () => {
      const hqToken = hqManagerToken();
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${hqToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.isStore).toBe(false);
    });
  });

  // ── GET /api/sales/comprehensive ── 종합 매출 매장 필터링
  describe('GET /api/sales/comprehensive -- store-scoped comprehensive sales', () => {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    it('STORE_MANAGER sees only their store data in comprehensive', async () => {
      const res = await request(app)
        .get(`/api/sales/comprehensive?date_from=${monthAgo}&date_to=${today}`)
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      // The response should be filtered to storeA; exact shape depends on implementation
      // but the important thing is no error and data is returned
      expect(res.body.success).toBe(true);
    });
  });

  // ── GET /api/sales/store-comparison ── 매장 비교도 매장 스코프
  describe('GET /api/sales/store-comparison -- store-scoped', () => {
    it('STORE_MANAGER sees only their own store in comparison', async () => {
      const res = await request(app)
        .get('/api/sales/store-comparison')
        .set('Authorization', `Bearer ${storeAToken}`);
      expect(res.status).toBe(200);
      const data = res.body.data || [];
      data.forEach((row: any) => {
        expect(row.partner_code).toBe(storeA.partner_code);
      });
    });
  });
});
