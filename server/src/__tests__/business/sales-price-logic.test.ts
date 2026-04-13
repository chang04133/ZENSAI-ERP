/**
 * 매출 등록 시 가격 결정 로직 통합 테스트
 *
 * 가격 우선순위:
 *   1. product_event_prices (거래처별 행사가)
 *   2. products.event_price + event_store_codes (전체/특정 매장 행사가)
 *   3. products.discount_price (할인가)
 *   4. products.base_price (정상가)
 *
 * POST /api/sales 와 POST /api/sales/batch 양쪽 모두 동일한 로직을 적용한다.
 * 테스트는 실제 DB 상태를 일시 변경한 뒤 원복하는 방식으로 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, getTestFixtures } from '../helpers';

describe('Sales Price Determination Logic', () => {
  let pool: ReturnType<typeof getPool>;
  let token: string;              // ADMIN token (partner_code 제한 없음)
  let storeManagerToken: string;  // STORE_MANAGER token (매장 역할)
  let store: any;
  let variant: any;

  // 원본 상품 가격 (afterAll 복원용)
  let originalProduct: {
    base_price: number;
    discount_price: number | null;
    event_price: number | null;
    event_store_codes: string[] | null;
  };

  // 정리 대상
  const cleanupSaleIds: number[] = [];
  let insertedEventPriceId: number | null = null;

  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    pool = getPool();
    const fixtures = await getTestFixtures();
    store = fixtures.store;
    variant = fixtures.variant;

    token = adminToken();
    storeManagerToken = storeToken(store.partner_code, store.partner_name);

    // 원본 상품 가격 저장
    const orig = await pool.query(
      `SELECT base_price, discount_price, event_price, event_store_codes
       FROM products WHERE product_code = $1`,
      [variant.product_code],
    );
    const row = orig.rows[0];
    originalProduct = {
      base_price: Number(row.base_price),
      discount_price: row.discount_price != null ? Number(row.discount_price) : null,
      event_price: row.event_price != null ? Number(row.event_price) : null,
      event_store_codes: row.event_store_codes,
    };

    // 초기 상태를 "정상가만 존재"로 세팅 (다른 테스트 간섭 방지)
    await pool.query(
      `UPDATE products
       SET discount_price = NULL, event_price = NULL, event_store_codes = NULL
       WHERE product_code = $1`,
      [variant.product_code],
    );
    // 기존 product_event_prices 레코드가 있으면 제거 (테스트 간섭 방지)
    await pool.query(
      `DELETE FROM product_event_prices
       WHERE product_code = $1 AND partner_code = $2`,
      [variant.product_code, store.partner_code],
    );

    // Clean pending preorders and set known inventory
    await pool.query(
      "DELETE FROM preorders WHERE partner_code = $1 AND variant_id = $2 AND status = '대기'",
      [store.partner_code, variant.variant_id],
    );
    await pool.query(
      `INSERT INTO inventory (partner_code, variant_id, qty) VALUES ($1, $2, 50)
       ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = 50, updated_at = NOW()`,
      [store.partner_code, variant.variant_id],
    );
  });

  afterAll(async () => {
    // 생성한 매출 레코드 정리
    for (const saleId of cleanupSaleIds) {
      await pool.query(
        "DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ('SALE','SALE_DELETE','RETURN')",
        [saleId],
      );
      await pool.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
    }
    // customer_purchases 정리 (auto_created)
    for (const saleId of cleanupSaleIds) {
      await pool.query('DELETE FROM customer_purchases WHERE sale_id = $1', [saleId]);
    }
    // 삽입한 product_event_prices 정리
    if (insertedEventPriceId) {
      await pool.query('DELETE FROM product_event_prices WHERE id = $1', [insertedEventPriceId]);
    }
    // 상품 가격 원복
    await pool.query(
      `UPDATE products
       SET base_price = $1, discount_price = $2, event_price = $3, event_store_codes = $4
       WHERE product_code = $5`,
      [
        originalProduct.base_price,
        originalProduct.discount_price,
        originalProduct.event_price,
        originalProduct.event_store_codes,
        variant.product_code,
      ],
    );
    // 재고 보충 (테스트 소모분 복원 — 50개로 강제 세팅)
    await pool.query(
      `UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2`,
      [store.partner_code, variant.variant_id],
    );
  });

  // ========================================================================
  // 헬퍼: 단건 매출 등록 후 sale record 반환
  // ========================================================================
  async function createSingleSale(overrides: Record<string, any> = {}) {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: today,
        partner_code: store.partner_code,
        variant_id: variant.variant_id,
        qty: 1,
        unit_price: variant.base_price, // 서버가 덮어쓰므로 어떤 값이든 무관
        ...overrides,
      });
    if (res.status === 201 && res.body.data?.sale_id) {
      cleanupSaleIds.push(res.body.data.sale_id);
    }
    return res;
  }

  // 헬퍼: 배치 매출 등록 후 첫 번째 sale record 반환
  async function createBatchSale(overrides: Record<string, any> = {}) {
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: today,
        partner_code: store.partner_code,
        items: [
          {
            variant_id: variant.variant_id,
            qty: 1,
            unit_price: variant.base_price,
            ...overrides,
          },
        ],
      });
    if (res.status === 201 && Array.isArray(res.body.data)) {
      for (const s of res.body.data) {
        if (s.sale_id) cleanupSaleIds.push(s.sale_id);
      }
    }
    return res;
  }

  // ========================================================================
  // 1. 기본 가격 (정상가)
  // ========================================================================
  describe('1. 기본 가격: base_price, sale_type="정상"', () => {
    it('POST /api/sales -- discount/event 없으면 base_price 적용, sale_type="정상"', async () => {
      const res = await createSingleSale();
      expect(res.status).toBe(201);
      const sale = res.body.data;
      expect(Number(sale.unit_price)).toBe(Number(variant.base_price));
      expect(sale.sale_type).toBe('정상');
    });

    it('POST /api/sales/batch -- 동일하게 base_price, sale_type="정상"', async () => {
      // Set known inventory state
      await pool.query(
        'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
        [store.partner_code, variant.variant_id],
      );

      // 중복방지 5초 대기 회피: 약간 다른 날짜 사용
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: yesterday,
          partner_code: store.partner_code,
          items: [
            {
              variant_id: variant.variant_id,
              qty: 1,
              unit_price: 999999, // 서버가 덮어쓰므로 무관
            },
          ],
        });
      if (res.status === 201 && Array.isArray(res.body.data)) {
        for (const s of res.body.data) {
          if (s.sale_id) cleanupSaleIds.push(s.sale_id);
        }
      }
      expect(res.status).toBe(201);
      const sale = res.body.data[0];
      expect(Number(sale.unit_price)).toBe(Number(variant.base_price));
      expect(sale.sale_type).toBe('정상');
    });
  });

  // ========================================================================
  // 2. 할인가 (discount_price)
  // ========================================================================
  describe('2. 할인가: discount_price > 0 -> sale_type="할인"', () => {
    const discountPrice = 59000;

    beforeAll(async () => {
      // discount_price 세팅 (event 계열은 NULL 유지)
      await pool.query(
        `UPDATE products
         SET discount_price = $1, event_price = NULL, event_store_codes = NULL
         WHERE product_code = $2`,
        [discountPrice, variant.product_code],
      );
      // product_event_prices 정리
      await pool.query(
        `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
        [variant.product_code, store.partner_code],
      );
    });

    it('POST /api/sales -- discount_price 적용, sale_type="할인"', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: twoDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1, // 서버가 덮어씀
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      const sale = res.body.data;
      expect(Number(sale.unit_price)).toBe(discountPrice);
      expect(sale.sale_type).toBe('할인');
    });

    it('POST /api/sales/batch -- 동일하게 discount_price, sale_type="할인"', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: threeDaysAgo,
          partner_code: store.partner_code,
          items: [
            { variant_id: variant.variant_id, qty: 1, unit_price: 1 },
          ],
        });
      if (res.status === 201 && Array.isArray(res.body.data)) {
        for (const s of res.body.data) {
          if (s.sale_id) cleanupSaleIds.push(s.sale_id);
        }
      }
      expect(res.status).toBe(201);
      const sale = res.body.data[0];
      expect(Number(sale.unit_price)).toBe(discountPrice);
      expect(sale.sale_type).toBe('할인');
    });
  });

  // ========================================================================
  // 3. 행사가 (products.event_price -- 전체 매장)
  // ========================================================================
  describe('3. 행사가: products.event_price (전체 매장) -> sale_type="행사"', () => {
    const eventPrice = 39000;

    beforeAll(async () => {
      // event_price 세팅, event_store_codes 비우기 (전 매장 적용)
      await pool.query(
        `UPDATE products
         SET event_price = $1, event_store_codes = NULL, discount_price = 59000
         WHERE product_code = $2`,
        [eventPrice, variant.product_code],
      );
      // product_event_prices 정리
      await pool.query(
        `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
        [variant.product_code, store.partner_code],
      );
    });

    it('event_store_codes 비어있으면 전 매장 적용 -> 행사', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: fourDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      const sale = res.body.data;
      expect(Number(sale.unit_price)).toBe(eventPrice);
      expect(sale.sale_type).toBe('행사');
    });
  });

  // ========================================================================
  // 4. 행사가 (products.event_price -- 특정 매장 제한)
  // ========================================================================
  describe('4. 행사가: event_store_codes 지정 매장에만 적용', () => {
    const eventPrice = 35000;
    const discountPrice = 59000;

    beforeAll(async () => {
      // event_store_codes에 테스트 매장 포함
      await pool.query(
        `UPDATE products
         SET event_price = $1, event_store_codes = $2, discount_price = $3
         WHERE product_code = $4`,
        [eventPrice, [store.partner_code], discountPrice, variant.product_code],
      );
      await pool.query(
        `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
        [variant.product_code, store.partner_code],
      );
    });

    it('지정 매장 -> event_price 적용, sale_type="행사"', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: fiveDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      expect(Number(res.body.data.unit_price)).toBe(eventPrice);
      expect(res.body.data.sale_type).toBe('행사');
    });

    it('지정 매장이 아닌 경우 -> discount_price 적용 (fallback)', async () => {
      // event_store_codes에 없는 다른 매장코드로 세팅
      await pool.query(
        `UPDATE products
         SET event_store_codes = $1
         WHERE product_code = $2`,
        [['NONEXISTENT_STORE'], variant.product_code],
      );

      const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: sixDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      // 행사가 대상이 아니므로 할인가(discount_price)가 적용
      expect(Number(res.body.data.unit_price)).toBe(discountPrice);
      expect(res.body.data.sale_type).toBe('할인');
    });
  });

  // ========================================================================
  // 5. 거래처별 행사가 (product_event_prices -- 최우선)
  // ========================================================================
  describe('5. product_event_prices: 거래처별 행사가 (최우선)', () => {
    const partnerEventPrice = 29000;

    beforeAll(async () => {
      // products에도 event_price, discount_price 세팅 (둘 다 있어도 product_event_prices가 우선)
      await pool.query(
        `UPDATE products
         SET event_price = 39000, event_store_codes = NULL, discount_price = 59000
         WHERE product_code = $1`,
        [variant.product_code],
      );
      // product_event_prices INSERT (날짜 제한 없음 = 항상 활성)
      const insRes = await pool.query(
        `INSERT INTO product_event_prices (product_code, partner_code, event_price, event_start_date, event_end_date)
         VALUES ($1, $2, $3, NULL, NULL)
         ON CONFLICT (product_code, partner_code) DO UPDATE SET event_price = $3, event_start_date = NULL, event_end_date = NULL
         RETURNING id`,
        [variant.product_code, store.partner_code, partnerEventPrice],
      );
      insertedEventPriceId = insRes.rows[0].id;
    });

    it('product_event_prices > products.event_price > discount_price', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: sevenDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      expect(Number(res.body.data.unit_price)).toBe(partnerEventPrice);
      expect(res.body.data.sale_type).toBe('행사');
    });

    it('batch 등록에서도 product_event_prices 우선 적용', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: eightDaysAgo,
          partner_code: store.partner_code,
          items: [
            { variant_id: variant.variant_id, qty: 1, unit_price: 1 },
          ],
        });
      if (res.status === 201 && Array.isArray(res.body.data)) {
        for (const s of res.body.data) {
          if (s.sale_id) cleanupSaleIds.push(s.sale_id);
        }
      }
      expect(res.status).toBe(201);
      expect(Number(res.body.data[0].unit_price)).toBe(partnerEventPrice);
      expect(res.body.data[0].sale_type).toBe('행사');
    });

    afterAll(async () => {
      // 이 describe의 product_event_prices 정리 (다음 테스트 간섭 방지)
      if (insertedEventPriceId) {
        await pool.query('DELETE FROM product_event_prices WHERE id = $1', [insertedEventPriceId]);
        insertedEventPriceId = null;
      }
    });
  });

  // ========================================================================
  // 6. 날짜 범위 밖의 거래처별 행사가는 무시
  // ========================================================================
  describe('6. product_event_prices 날짜 범위 밖이면 무시', () => {
    beforeAll(async () => {
      // discount/event 모두 세팅
      await pool.query(
        `UPDATE products
         SET event_price = NULL, event_store_codes = NULL, discount_price = 59000
         WHERE product_code = $1`,
        [variant.product_code],
      );
      // 만료된 행사가 삽입 (어제 종료)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const insRes = await pool.query(
        `INSERT INTO product_event_prices (product_code, partner_code, event_price, event_start_date, event_end_date)
         VALUES ($1, $2, 19000, $3, $4)
         ON CONFLICT (product_code, partner_code) DO UPDATE SET event_price = 19000, event_start_date = $3, event_end_date = $4
         RETURNING id`,
        [variant.product_code, store.partner_code, lastWeek, yesterday],
      );
      insertedEventPriceId = insRes.rows[0].id;
    });

    it('만료된 product_event_prices는 무시 -> discount_price 적용', async () => {
      const nineDaysAgo = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: nineDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      // 행사가 만료 -> discount_price 로 폴백
      expect(Number(res.body.data.unit_price)).toBe(59000);
      expect(res.body.data.sale_type).toBe('할인');
    });

    afterAll(async () => {
      if (insertedEventPriceId) {
        await pool.query('DELETE FROM product_event_prices WHERE id = $1', [insertedEventPriceId]);
        insertedEventPriceId = null;
      }
    });
  });

  // ========================================================================
  // 7. 우선순위 종합: event > discount > base
  // ========================================================================
  describe('7. 우선순위 종합 검증', () => {
    it('discount_price=0 이면 base_price 적용 (할인가가 0원은 무시)', async () => {
      await pool.query(
        `UPDATE products
         SET discount_price = 0, event_price = NULL, event_store_codes = NULL
         WHERE product_code = $1`,
        [variant.product_code],
      );
      await pool.query(
        `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
        [variant.product_code, store.partner_code],
      );

      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: tenDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      expect(Number(res.body.data.unit_price)).toBe(Number(variant.base_price));
      expect(res.body.data.sale_type).toBe('정상');
    });

    it('event_price가 있으면 discount_price보다 우선', async () => {
      const eventP = 45000;
      const discountP = 55000;
      await pool.query(
        `UPDATE products
         SET event_price = $1, event_store_codes = NULL, discount_price = $2
         WHERE product_code = $3`,
        [eventP, discountP, variant.product_code],
      );

      const elevenDaysAgo = new Date(Date.now() - 11 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: elevenDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      expect(Number(res.body.data.unit_price)).toBe(eventP);
      expect(res.body.data.sale_type).toBe('행사');
    });

    it('total_price = qty * effectivePrice 검증', async () => {
      const eventP = 42000;
      await pool.query(
        `UPDATE products
         SET event_price = $1, event_store_codes = NULL, discount_price = NULL
         WHERE product_code = $2`,
        [eventP, variant.product_code],
      );

      const twelveDaysAgo = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
      const qty = 3;
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: twelveDaysAgo,
          partner_code: store.partner_code,
          variant_id: variant.variant_id,
          qty,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      const sale = res.body.data;
      expect(Number(sale.unit_price)).toBe(eventP);
      expect(Number(sale.total_price)).toBe(Math.round(qty * eventP));
    });
  });

  // ========================================================================
  // 8. 바코드/SKU 스캔 엔드포인트의 가격 반환 검증
  // ========================================================================
  describe('8. GET /api/sales/scan -- 가격 정보 반환', () => {
    beforeAll(async () => {
      // base_price만 있는 상태로 세팅
      await pool.query(
        `UPDATE products
         SET discount_price = NULL, event_price = NULL, event_store_codes = NULL
         WHERE product_code = $1`,
        [variant.product_code],
      );
      await pool.query(
        `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
        [variant.product_code, store.partner_code],
      );
    });

    it('스캔 결과에 base_price, discount_price, event_price 포함', async () => {
      const res = await request(app)
        .get(`/api/sales/scan?code=${variant.sku}&partner_code=${store.partner_code}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Number(res.body.data.base_price)).toBe(Number(variant.base_price));
      // discount_price, event_price 는 null 이어야 함
      expect(res.body.data.discount_price).toBeNull();
      expect(res.body.data.event_price).toBeNull();
    });

    it('product_event_prices 있으면 scan에서 event_price 반환', async () => {
      const pepPrice = 25000;
      const insRes = await pool.query(
        `INSERT INTO product_event_prices (product_code, partner_code, event_price, event_start_date, event_end_date)
         VALUES ($1, $2, $3, NULL, NULL)
         ON CONFLICT (product_code, partner_code) DO UPDATE SET event_price = $3, event_start_date = NULL, event_end_date = NULL
         RETURNING id`,
        [variant.product_code, store.partner_code, pepPrice],
      );
      insertedEventPriceId = insRes.rows[0].id;

      const res = await request(app)
        .get(`/api/sales/scan?code=${variant.sku}&partner_code=${store.partner_code}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Number(res.body.data.event_price)).toBe(pepPrice);

      // 정리
      await pool.query('DELETE FROM product_event_prices WHERE id = $1', [insertedEventPriceId]);
      insertedEventPriceId = null;
    });

    it('event_store_codes에 포함 안 된 매장 -> event_price=null', async () => {
      await pool.query(
        `UPDATE products
         SET event_price = 30000, event_store_codes = $1
         WHERE product_code = $2`,
        [['OTHER_STORE'], variant.product_code],
      );

      const res = await request(app)
        .get(`/api/sales/scan?code=${variant.sku}&partner_code=${store.partner_code}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      // 매장이 event_store_codes에 없으므로 event_price null
      expect(res.body.data.event_price).toBeNull();

      // 원복
      await pool.query(
        `UPDATE products SET event_price = NULL, event_store_codes = NULL WHERE product_code = $1`,
        [variant.product_code],
      );
    });
  });

  // ========================================================================
  // 9. 매장 역할 사용자 매출 등록 시에도 가격 로직 동일 적용
  // ========================================================================
  describe('9. STORE_MANAGER 역할로 등록해도 동일 가격 로직', () => {
    const discountPrice = 48000;

    beforeAll(async () => {
      await pool.query(
        `UPDATE products
         SET discount_price = $1, event_price = NULL, event_store_codes = NULL
         WHERE product_code = $2`,
        [discountPrice, variant.product_code],
      );
      await pool.query(
        `DELETE FROM product_event_prices WHERE product_code = $1 AND partner_code = $2`,
        [variant.product_code, store.partner_code],
      );
    });

    it('STORE_MANAGER token으로 등록 -> discount_price 적용', async () => {
      const thirteenDaysAgo = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${storeManagerToken}`)
        .send({
          sale_date: thirteenDaysAgo,
          partner_code: store.partner_code, // 매장 역할이면 무시되고 자기 매장 코드 사용
          variant_id: variant.variant_id,
          qty: 1,
          unit_price: 1,
        });
      if (res.status === 201 && res.body.data?.sale_id) {
        cleanupSaleIds.push(res.body.data.sale_id);
      }
      expect(res.status).toBe(201);
      expect(Number(res.body.data.unit_price)).toBe(discountPrice);
      expect(res.body.data.sale_type).toBe('할인');
    });
  });
});
