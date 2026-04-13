/**
 * 상품 비즈니스 로직 통합 테스트
 *
 * 1. GET /api/products — 목록 조회 + 페이지네이션/필터 검증
 * 2. GET /api/products/variants/search — variant 검색
 * 3. GET /api/products/events — 행사 상품 목록
 * 4. PUT /api/products/:code/event-price — 개별 행사가 수정
 * 5. PUT /api/products/events/bulk — 일괄 행사가 수정
 * 6. GET /api/products/:code/event-partners — 거래처별 행사가 조회
 * 7. PUT /api/products/:code/event-partners — 거래처별 행사가 저장
 * 8. GET /api/products/variants/options — 색상/사이즈 옵션
 * 9. GET /api/products/search-suggest — 자동완성
 * 10. POST /api/products/variants/bulk — variant 일괄 조회
 *
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 원복.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, hqManagerToken, storeStaffToken, getTestFixtures } from '../helpers';

let admin: string;
let hqMgr: string;
let storeMgr: string;
let storeStaff: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// 테스트용 상품 코드 (기존 상품 활용)
let existingProductCode: string;
let existingVariantId: number;

// 이벤트 가격 원복용
let originalEventPrice: number | null = null;
let originalEventStartDate: string | null = null;
let originalEventEndDate: string | null = null;
let originalEventStoreCodes: string[] | null = null;

beforeAll(async () => {
  admin = adminToken();
  fixtures = await getTestFixtures();
  hqMgr = hqManagerToken();
  storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
  storeStaff = storeStaffToken(fixtures.store.partner_code, fixtures.store.partner_name);

  existingProductCode = fixtures.variant.product_code;
  existingVariantId = fixtures.variant.variant_id;

  // 기존 행사가 정보 백업
  const pool = getPool();
  const backup = await pool.query(
    'SELECT event_price, event_start_date, event_end_date, event_store_codes FROM products WHERE product_code = $1',
    [existingProductCode],
  );
  if (backup.rows[0]) {
    originalEventPrice = backup.rows[0].event_price;
    originalEventStartDate = backup.rows[0].event_start_date;
    originalEventEndDate = backup.rows[0].event_end_date;
    originalEventStoreCodes = backup.rows[0].event_store_codes;
  }
});

afterAll(async () => {
  // 행사가 원복
  const pool = getPool();
  await pool.query(
    `UPDATE products SET event_price = $1, event_start_date = $2, event_end_date = $3, event_store_codes = $4 WHERE product_code = $5`,
    [originalEventPrice, originalEventStartDate, originalEventEndDate, originalEventStoreCodes, existingProductCode],
  );

  // 테스트 중 생성된 거래처별 행사가 정리
  await pool.query(
    `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
    [existingProductCode, fixtures.store.partner_code],
  );
});

// ═══════════════════════════════════════════════════════════
// 1. 상품 목록 조회
// ═══════════════════════════════════════════════════════════
describe('GET /api/products - 목록 조회', () => {
  it('ADMIN: 200 + 페이지네이션 구조 반환', async () => {
    const res = await request(app)
      .get('/api/products?limit=5&page=1')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('total');
    expect(Array.isArray(res.body.data.data)).toBe(true);
    expect(res.body.data.data.length).toBeLessThanOrEqual(5);
  });

  it('ADMIN: cost_price 필드 포함', async () => {
    const res = await request(app)
      .get('/api/products?limit=1')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const products = res.body.data?.data || [];
    if (products.length > 0) {
      expect(products[0]).toHaveProperty('cost_price');
    }
  });

  it('STORE_MANAGER: cost_price 필드 제거됨', async () => {
    const res = await request(app)
      .get('/api/products?limit=1')
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(200);
    const products = res.body.data?.data || [];
    if (products.length > 0) {
      expect(products[0]).not.toHaveProperty('cost_price');
    }
  });

  it('STORE_STAFF: cost_price 필드 제거됨', async () => {
    const res = await request(app)
      .get('/api/products?limit=1')
      .set('Authorization', `Bearer ${storeStaff}`);

    expect(res.status).toBe(200);
    const products = res.body.data?.data || [];
    if (products.length > 0) {
      expect(products[0]).not.toHaveProperty('cost_price');
    }
  });

  it('미인증 시 401', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('search 파라미터로 필터링', async () => {
    // 기존 상품명 일부로 검색
    const productName = fixtures.variant.product_name;
    const keyword = productName.substring(0, 2); // 앞 2글자

    const res = await request(app)
      .get(`/api/products?search=${encodeURIComponent(keyword)}&limit=10`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. Variant 검색 (GET /api/products/variants/search)
// ═══════════════════════════════════════════════════════════
describe('GET /api/products/variants/search', () => {
  it('검색어 없이 호출 시 전체(최대 500) 반환', async () => {
    const res = await request(app)
      .get('/api/products/variants/search')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(500);
  });

  it('검색어로 SKU/상품명/코드 검색', async () => {
    const res = await request(app)
      .get(`/api/products/variants/search?search=${encodeURIComponent(existingProductCode)}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item).toHaveProperty('variant_id');
      expect(item).toHaveProperty('sku');
      expect(item).toHaveProperty('product_code');
      expect(item).toHaveProperty('product_name');
      expect(item).toHaveProperty('base_price');
    }
  });

  it('partner_code 파라미터로 매장별 재고 조회', async () => {
    const res = await request(app)
      .get(`/api/products/variants/search?partner_code=${fixtures.store.partner_code}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('current_stock');
    }
  });

  it('미인증 시 401', async () => {
    const res = await request(app).get('/api/products/variants/search');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 행사 상품 관리
// ═══════════════════════════════════════════════════════════
describe('행사 상품 관리', () => {
  describe('GET /api/products/events - 행사 상품 목록', () => {
    it('ADMIN: 200', async () => {
      const res = await request(app)
        .get('/api/products/events')
        .set('Authorization', `Bearer ${admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('STORE_MANAGER: 200 (읽기 가능)', async () => {
      const res = await request(app)
        .get('/api/products/events')
        .set('Authorization', `Bearer ${storeMgr}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/products/:code/event-price - 개별 행사가 수정', () => {
    it('ADMIN: 행사가 설정 성공', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-price`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          event_price: 29900,
          event_start_date: '2026-04-01',
          event_end_date: '2026-04-30',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('HQ_MANAGER: 행사가 설정 가능 (eventWrite 권한)', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-price`)
        .set('Authorization', `Bearer ${hqMgr}`)
        .send({ event_price: 25900 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('STORE_MANAGER: 행사가 수정 불가 (403)', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-price`)
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({ event_price: 19900 });

      expect(res.status).toBe(403);
    });

    it('존재하지 않는 상품 코드 시 404', async () => {
      const res = await request(app)
        .put('/api/products/NONEXISTENT_CODE_12345/event-price')
        .set('Authorization', `Bearer ${admin}`)
        .send({ event_price: 19900 });

      expect(res.status).toBe(404);
    });

    it('event_price를 null로 설정 (행사가 해제)', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-price`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ event_price: null });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/products/events/bulk - 일괄 행사가', () => {
    it('ADMIN: 일괄 행사가 업데이트', async () => {
      const res = await request(app)
        .put('/api/products/events/bulk')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          updates: [{ product_code: existingProductCode, event_price: 39900 }],
          event_start_date: '2026-04-01',
          event_end_date: '2026-04-30',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('updates 빈 배열 시 400', async () => {
      const res = await request(app)
        .put('/api/products/events/bulk')
        .set('Authorization', `Bearer ${admin}`)
        .send({ updates: [] });

      expect(res.status).toBe(400);
    });

    it('STORE_MANAGER: 403', async () => {
      const res = await request(app)
        .put('/api/products/events/bulk')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          updates: [{ product_code: existingProductCode, event_price: 39900 }],
        });

      expect(res.status).toBe(403);
    });
  });

  describe('거래처별 행사가 (event-partners)', () => {
    it('GET /api/products/:code/event-partners — 조회', async () => {
      const res = await request(app)
        .get(`/api/products/${existingProductCode}/event-partners`)
        .set('Authorization', `Bearer ${admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('PUT /api/products/:code/event-partners — 저장', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-partners`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          entries: [{
            partner_code: fixtures.store.partner_code,
            event_price: 24900,
          }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PUT event-partners: entries 미전달 시 400', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-partners`)
        .set('Authorization', `Bearer ${admin}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('entries');
    });

    it('STORE_MANAGER: event-partners 수정 불가 (403)', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProductCode}/event-partners`)
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          entries: [{ partner_code: fixtures.store.partner_code, event_price: 19900 }],
        });

      expect(res.status).toBe(403);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 4. Variant 옵션 (색상/사이즈)
// ═══════════════════════════════════════════════════════════
describe('GET /api/products/variants/options', () => {
  it('색상 + 사이즈 목록 반환', async () => {
    const res = await request(app)
      .get('/api/products/variants/options')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('colors');
    expect(res.body.data).toHaveProperty('sizes');
    expect(Array.isArray(res.body.data.colors)).toBe(true);
    expect(Array.isArray(res.body.data.sizes)).toBe(true);
  });

  it('미인증 시 401', async () => {
    const res = await request(app).get('/api/products/variants/options');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 자동완성 (search-suggest)
// ═══════════════════════════════════════════════════════════
describe('GET /api/products/search-suggest', () => {
  it('검색어로 자동완성 결과 반환', async () => {
    const keyword = existingProductCode.substring(0, 3);
    const res = await request(app)
      .get(`/api/products/search-suggest?q=${encodeURIComponent(keyword)}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(10);

    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('product_code');
      expect(res.body.data[0]).toHaveProperty('product_name');
    }
  });

  it('빈 검색어 시 빈 배열', async () => {
    const res = await request(app)
      .get('/api/products/search-suggest?q=')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// 6. Variant 일괄 조회 (POST /api/products/variants/bulk)
// ═══════════════════════════════════════════════════════════
describe('POST /api/products/variants/bulk', () => {
  it('유효한 variant_ids로 조회', async () => {
    const res = await request(app)
      .post('/api/products/variants/bulk')
      .set('Authorization', `Bearer ${admin}`)
      .send({ variant_ids: [existingVariantId] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item).toHaveProperty('variant_id');
      expect(item).toHaveProperty('product_code');
      expect(item).toHaveProperty('current_stock');
    }
  });

  it('ADMIN: cost_price 포함', async () => {
    const res = await request(app)
      .post('/api/products/variants/bulk')
      .set('Authorization', `Bearer ${admin}`)
      .send({ variant_ids: [existingVariantId] });

    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('cost_price');
    }
  });

  it('STORE_MANAGER: cost_price 제거됨', async () => {
    const res = await request(app)
      .post('/api/products/variants/bulk')
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({ variant_ids: [existingVariantId] });

    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).not.toHaveProperty('cost_price');
    }
  });

  it('빈 variant_ids 시 400', async () => {
    const res = await request(app)
      .post('/api/products/variants/bulk')
      .set('Authorization', `Bearer ${admin}`)
      .send({ variant_ids: [] });

    expect(res.status).toBe(400);
  });

  it('variant_ids 미전달 시 400', async () => {
    const res = await request(app)
      .post('/api/products/variants/bulk')
      .set('Authorization', `Bearer ${admin}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. 상품 상세 조회 (GET /api/products/:code)
// ═══════════════════════════════════════════════════════════
describe('GET /api/products/:code - 상세 조회', () => {
  it('존재하는 상품 코드 시 200 + variants 포함', async () => {
    const res = await request(app)
      .get(`/api/products/${existingProductCode}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('product_code');
    expect(res.body.data.product_code).toBe(existingProductCode);
  });

  it('존재하지 않는 상품 코드 시 404', async () => {
    const res = await request(app)
      .get('/api/products/NONEXISTENT_CODE_99999')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(404);
  });

  it('STORE_STAFF: 조회 가능 (cost_price 제거됨)', async () => {
    const res = await request(app)
      .get(`/api/products/${existingProductCode}`)
      .set('Authorization', `Bearer ${storeStaff}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).not.toHaveProperty('cost_price');
  });
});

// ═══════════════════════════════════════════════════════════
// 8. 상품 등록/수정 권한 검증
// ═══════════════════════════════════════════════════════════
describe('상품 쓰기 권한 (ADMIN, SYS_ADMIN only)', () => {
  it('STORE_MANAGER: POST /api/products 시 403', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({ product_code: 'TEST_PERM', product_name: '권한테스트' });

    expect(res.status).toBe(403);
  });

  it('STORE_MANAGER: PUT /api/products/:code 시 403', async () => {
    const res = await request(app)
      .put(`/api/products/${existingProductCode}`)
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({ product_name: '수정테스트' });

    expect(res.status).toBe(403);
  });

  it('STORE_MANAGER: DELETE /api/products/:code 시 403', async () => {
    const res = await request(app)
      .delete(`/api/products/${existingProductCode}`)
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(403);
  });

  it('HQ_MANAGER: POST /api/products 시 403 (쓰기는 ADMIN/SYS_ADMIN만)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${hqMgr}`)
      .send({ product_code: 'TEST_PERM', product_name: '권한테스트' });

    expect(res.status).toBe(403);
  });
});
