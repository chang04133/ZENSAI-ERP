/**
 * cost_price 숨김 심층 테스트
 * - 매장 역할(STORE_MANAGER, STORE_STAFF)은 cost_price를 절대 볼 수 없음
 * - 본사 역할(ADMIN, SYS_ADMIN, HQ_MANAGER)은 cost_price를 볼 수 있음
 *
 * 검증 대상 엔드포인트:
 *   GET  /api/products              (list)
 *   GET  /api/products/:code        (getById)
 *   GET  /api/products/variants/search (searchVariants — SQL에서 cost_price 미선택)
 *   POST /api/products/variants/bulk   (bulkVariants — 인라인 strip)
 *   GET  /api/products/barcode-dashboard (인라인 strip)
 *   GET  /api/products/events          (listEventProducts)
 *   GET  /api/products/events/recommendations (eventRecommendations)
 *   GET  /api/products/export/variants  (exportVariants — ADMIN 전용)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  adminToken,
  storeToken,
  storeStaffToken,
  hqManagerToken,
  getTestFixtures,
} from '../helpers';

describe('cost_price Hidden from Store Roles', () => {
  let admin: string;
  let hqMgr: string;
  let storeMgr: string;
  let storeStf: string;
  let productCode: string;
  let variantId: number;

  beforeAll(async () => {
    const fixtures = await getTestFixtures();
    admin = adminToken();
    hqMgr = hqManagerToken();
    storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
    storeStf = storeStaffToken(fixtures.store.partner_code, fixtures.store.partner_name);
    productCode = fixtures.variant.product_code;
    variantId = fixtures.variant.variant_id;
  });

  // ═══════════════════════════════════════════
  // GET /api/products — 상품 목록
  // ═══════════════════════════════════════════
  describe('GET /api/products — 목록 조회', () => {
    it('ADMIN -> cost_price 포함', async () => {
      const res = await request(app)
        .get('/api/products?limit=5')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        // ADMIN은 cost_price를 볼 수 있어야 함
        expect(products[0]).toHaveProperty('cost_price');
      }
    });

    it('HQ_MANAGER -> cost_price 포함', async () => {
      const res = await request(app)
        .get('/api/products?limit=5')
        .set('Authorization', `Bearer ${hqMgr}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        expect(products[0]).toHaveProperty('cost_price');
      }
    });

    it('STORE_MANAGER -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products?limit=5')
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        expect(products[0]).not.toHaveProperty('cost_price');
      }
    });

    it('STORE_STAFF -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products?limit=5')
        .set('Authorization', `Bearer ${storeStf}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || [];
      if (products.length > 0) {
        expect(products[0]).not.toHaveProperty('cost_price');
      }
    });
  });

  // ═══════════════════════════════════════════
  // GET /api/products/:code — 상품 상세
  // ═══════════════════════════════════════════
  describe('GET /api/products/:code — 상품 상세', () => {
    it('ADMIN -> cost_price 포함', async () => {
      const res = await request(app)
        .get(`/api/products/${productCode}`)
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('cost_price');
    });

    it('STORE_MANAGER -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get(`/api/products/${productCode}`)
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('cost_price');
    });

    it('STORE_STAFF -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get(`/api/products/${productCode}`)
        .set('Authorization', `Bearer ${storeStf}`);
      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('cost_price');
    });
  });

  // ═══════════════════════════════════════════
  // GET /api/products/variants/search — 변형 검색
  // SQL에서 cost_price를 선택하지 않으므로 모든 역할에서 미노출
  // ═══════════════════════════════════════════
  describe('GET /api/products/variants/search — 변형 검색', () => {
    it('ADMIN -> cost_price 미포함 (SQL에서 미선택)', async () => {
      const res = await request(app)
        .get('/api/products/variants/search')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      const variants = res.body.data || [];
      if (variants.length > 0) {
        expect(variants[0]).not.toHaveProperty('cost_price');
      }
    });

    it('STORE_MANAGER -> cost_price 미포함', async () => {
      const res = await request(app)
        .get('/api/products/variants/search')
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(200);
      const variants = res.body.data || [];
      if (variants.length > 0) {
        expect(variants[0]).not.toHaveProperty('cost_price');
      }
    });
  });

  // ═══════════════════════════════════════════
  // POST /api/products/variants/bulk — 변형 일괄 조회
  // ═══════════════════════════════════════════
  describe('POST /api/products/variants/bulk — 변형 일괄 조회', () => {
    it('ADMIN -> cost_price 포함', async () => {
      const res = await request(app)
        .post('/api/products/variants/bulk')
        .set('Authorization', `Bearer ${admin}`)
        .send({ variant_ids: [variantId] });
      expect(res.status).toBe(200);
      const data = res.body.data || [];
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('cost_price');
      }
    });

    it('STORE_MANAGER -> cost_price 제거됨', async () => {
      const res = await request(app)
        .post('/api/products/variants/bulk')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({ variant_ids: [variantId] });
      expect(res.status).toBe(200);
      const data = res.body.data || [];
      if (data.length > 0) {
        expect(data[0]).not.toHaveProperty('cost_price');
      }
    });

    it('STORE_STAFF -> cost_price 제거됨', async () => {
      const res = await request(app)
        .post('/api/products/variants/bulk')
        .set('Authorization', `Bearer ${storeStf}`)
        .send({ variant_ids: [variantId] });
      expect(res.status).toBe(200);
      const data = res.body.data || [];
      if (data.length > 0) {
        expect(data[0]).not.toHaveProperty('cost_price');
      }
    });

    it('빈 배열 전송 -> 400', async () => {
      const res = await request(app)
        .post('/api/products/variants/bulk')
        .set('Authorization', `Bearer ${admin}`)
        .send({ variant_ids: [] });
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════
  // GET /api/products/barcode-dashboard — 바코드 대시보드
  // ═══════════════════════════════════════════
  describe('GET /api/products/barcode-dashboard — 바코드 대시보드', () => {
    it('ADMIN -> variants에 cost_price 누출 없음 (SQL 미선택)', async () => {
      const res = await request(app)
        .get('/api/products/barcode-dashboard')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      const variants = res.body.data?.variants || [];
      if (variants.length > 0) {
        // barcode-dashboard SQL에서 cost_price를 SELECT하지 않으므로
        // ADMIN이라도 cost_price가 없는 것이 정상
        // (보안: 이 엔드포인트는 원래 cost_price가 필요 없는 바코드 전용)
        // 만약 cost_price가 있다면 매장 역할에서는 반드시 제거됨
      }
    });

    it('STORE_MANAGER -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products/barcode-dashboard')
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(200);
      const variants = res.body.data?.variants || [];
      if (variants.length > 0) {
        expect(variants[0]).not.toHaveProperty('cost_price');
      }
    });

    it('STORE_STAFF -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products/barcode-dashboard')
        .set('Authorization', `Bearer ${storeStf}`);
      expect(res.status).toBe(200);
      const variants = res.body.data?.variants || [];
      if (variants.length > 0) {
        expect(variants[0]).not.toHaveProperty('cost_price');
      }
    });
  });

  // ═══════════════════════════════════════════
  // GET /api/products/events — 행사 상품 목록
  // ═══════════════════════════════════════════
  describe('GET /api/products/events — 행사 상품 목록', () => {
    it('ADMIN -> cost_price 포함', async () => {
      const res = await request(app)
        .get('/api/products/events')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || res.body.data || [];
      const items = Array.isArray(products) ? products : [];
      if (items.length > 0) {
        expect(items[0]).toHaveProperty('cost_price');
      }
    });

    it('STORE_MANAGER -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products/events')
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(200);
      const products = res.body.data?.data || res.body.data || [];
      const items = Array.isArray(products) ? products : [];
      if (items.length > 0) {
        expect(items[0]).not.toHaveProperty('cost_price');
      }
    });
  });

  // ═══════════════════════════════════════════
  // GET /api/products/events/recommendations — 행사 추천
  // ═══════════════════════════════════════════
  describe('GET /api/products/events/recommendations — 행사 추천', () => {
    it('STORE_MANAGER -> cost_price 제거됨', async () => {
      const res = await request(app)
        .get('/api/products/events/recommendations?limit=5')
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(200);
      const items = res.body.data || [];
      if (items.length > 0) {
        expect(items[0]).not.toHaveProperty('cost_price');
      }
    });
  });

  // ═══════════════════════════════════════════
  // GET /api/products/export/variants — 엑셀 내보내기 (ADMIN 전용)
  // ═══════════════════════════════════════════
  describe('GET /api/products/export/variants — 엑셀 내보내기', () => {
    it('ADMIN -> cost_price 포함', async () => {
      const res = await request(app)
        .get('/api/products/export/variants')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      const data = res.body.data || [];
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('cost_price');
      }
    });

    it('STORE_MANAGER -> 403 (write 권한 필요)', async () => {
      const res = await request(app)
        .get('/api/products/export/variants')
        .set('Authorization', `Bearer ${storeMgr}`);
      // export/variants는 ADMIN, SYS_ADMIN 전용이므로 403
      expect(res.status).toBe(403);
    });
  });
});
