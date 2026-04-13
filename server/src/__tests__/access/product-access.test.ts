/**
 * 상품 권한 테스트
 * - 읽기: 모든 인증 사용자
 * - 쓰기: ADMIN, SYS_ADMIN
 * - cost_price 숨김: STORE_MANAGER, STORE_STAFF
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens } from '../helpers';

describe('Product Access Control', () => {
  let tokens: ReturnType<typeof allRoleTokens>;

  beforeAll(async () => {
    const { getTestFixtures } = await import('../helpers');
    const fixtures = await getTestFixtures();
    tokens = allRoleTokens(fixtures.store.partner_code, fixtures.store.partner_name);
  });

  // ── GET /api/products ──
  describe('GET /api/products — 목록 조회', () => {
    const cases = [
      { role: 'ADMIN', key: 'admin' as const, expected: 200 },
      { role: 'SYS_ADMIN', key: 'sysAdmin' as const, expected: 200 },
      { role: 'HQ_MANAGER', key: 'hqManager' as const, expected: 200 },
      { role: 'STORE_MANAGER', key: 'storeManager' as const, expected: 200 },
      { role: 'STORE_STAFF', key: 'storeStaff' as const, expected: 200 },
    ];

    cases.forEach(({ role, key, expected }) => {
      it(`${role} → ${expected}`, async () => {
        const res = await request(app)
          .get('/api/products?limit=5')
          .set('Authorization', `Bearer ${tokens[key]}`);
        expect(res.status).toBe(expected);
      });
    });

    it('미인증 → 401', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(401);
    });
  });

  // ── cost_price 숨김 검증 ──
  describe('cost_price 노출 검증', () => {
    it('ADMIN → cost_price 포함', async () => {
      const res = await request(app)
        .get('/api/products?limit=1')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        expect(products[0]).toHaveProperty('cost_price');
      }
    });

    it('STORE_MANAGER → cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products?limit=1')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        expect(products[0]).not.toHaveProperty('cost_price');
      }
    });

    it('STORE_STAFF → cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products?limit=1')
        .set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        expect(products[0]).not.toHaveProperty('cost_price');
      }
    });
  });

  // ── 상품 등록 권한 ──
  describe('POST /api/products — 등록 권한', () => {
    // 실제 등록하지 않고, 필수값 누락으로 400이면 권한 통과, 403이면 권한 거부
    const dummyProduct = { product_name: '' }; // 필수값 누락

    it('ADMIN → 권한 통과 (400 or 201)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send(dummyProduct);
      expect(res.status).not.toBe(403);
    });

    it('SYS_ADMIN → 권한 통과', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokens.sysAdmin}`)
        .send(dummyProduct);
      expect(res.status).not.toBe(403);
    });

    it('HQ_MANAGER → 403', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokens.hqManager}`)
        .send(dummyProduct);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokens.storeManager}`)
        .send(dummyProduct);
      expect(res.status).toBe(403);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send(dummyProduct);
      expect(res.status).toBe(403);
    });
  });
});
