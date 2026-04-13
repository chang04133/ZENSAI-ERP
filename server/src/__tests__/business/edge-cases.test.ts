/**
 * 엣지 케이스 통합 테스트
 *
 * 1. 경계 조건: 재고 0에서 판매, 반품 수량 경계
 * 2. 빈 데이터: 판매 없는 매장 대시보드, 고객 없는 CRM, 존재하지 않는 variant 재고
 * 3. 소프트 삭제: 삭제된 상품/고객이 목록에 미노출
 * 4. 대량 데이터: 배치 등록 10건 일괄 처리
 *
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, getTestFixtures } from '../helpers';

// 정리 대상 ID
const cleanup = {
  saleIds: [] as number[],
  preorderIds: [] as number[],
  shipmentIds: [] as number[],
  customerIds: [] as number[],
  restoredProducts: [] as { product_code: string; original_is_active: boolean }[],
};

let token: string;
let storeMgrToken: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;
let originalQty: number;

const today = new Date().toISOString().slice(0, 10);

async function getInventoryQty(partnerCode: string, variantId: number): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, variantId],
  );
  return r.rows[0] ? Number(r.rows[0].qty) : 0;
}

/** inventory_transactions 레코드 조회 헬퍼 */
async function getTxRecord(refId: number, txType: string, partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id DESC LIMIT 1',
    [refId, txType, partnerCode, variantId],
  );
  return r.rows[0] || null;
}

beforeAll(async () => {
  token = adminToken();
  fixtures = await getTestFixtures();
  storeMgrToken = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);

  const pool = getPool();
  await pool.query(
    "DELETE FROM preorders WHERE partner_code = $1 AND variant_id = $2 AND status = '대기'",
    [fixtures.store.partner_code, fixtures.variant.variant_id],
  );
  await pool.query(
    `INSERT INTO inventory (partner_code, variant_id, qty) VALUES ($1, $2, 50)
     ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = 50, updated_at = NOW()`,
    [fixtures.store.partner_code, fixtures.variant.variant_id],
  );
  originalQty = 50;
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 매출 관련 정리
    for (const saleId of cleanup.saleIds) {
      await client.query('DELETE FROM customer_purchases WHERE sale_id = $1', [saleId]);
      await client.query(
        'DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2, $3, $4, $5)',
        [saleId, 'SALE', 'RETURN', 'SALE_DELETE', 'SALE_EDIT'],
      );
      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
    }

    // 출고 관련 정리
    for (const shipId of cleanup.shipmentIds) {
      await client.query(
        'DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2, $3)',
        [shipId, 'SHIP_OUT', 'SHIP_IN'],
      );
      await client.query('DELETE FROM shipment_request_items WHERE request_id = $1', [shipId]);
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [shipId]);
    }

    // 테스트 고객 정리
    for (const customerId of cleanup.customerIds) {
      await client.query('DELETE FROM customer_purchases WHERE customer_id = $1', [customerId]);
      await client.query('DELETE FROM customer_tag_map WHERE customer_id = $1', [customerId]);
      await client.query('DELETE FROM customer_visits WHERE customer_id = $1', [customerId]);
      await client.query('DELETE FROM customers WHERE customer_id = $1', [customerId]);
    }

    // 테스트 예약판매 정리
    for (const pid of cleanup.preorderIds) {
      await client.query('DELETE FROM preorders WHERE preorder_id = $1', [pid]);
    }

    // 소프트 삭제된 상품 복원
    for (const p of cleanup.restoredProducts) {
      await client.query(
        'UPDATE products SET is_active = $1 WHERE product_code = $2',
        [p.original_is_active, p.product_code],
      );
    }

    // 재고 원복
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [50, fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('테스트 데이터 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// 1. 경계 조건
// ═══════════════════════════════════════════════════════════
describe('경계 조건', () => {
  describe('재고 0에서 매출 등록 → 예약판매 전환', () => {
    it('재고 0에서 매출 등록 시 예약판매로 전환 + 재고 차감', async () => {
      const partnerCode = fixtures.store.partner_code;
      const variantId = fixtures.variant.variant_id;

      // Set inventory to 0
      const pool = getPool();
      await pool.query(
        'UPDATE inventory SET qty = 0, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
        [partnerCode, variantId],
      );

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: today,
          partner_code: fixtures.store.partner_code,
          variant_id: fixtures.variant.variant_id,
          qty: 1,
          unit_price: Number(fixtures.variant.base_price) || 50000,
          sale_type: '정상',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.preorder).toBe(true); // 예약판매로 전환됨
      const preorderId = res.body.data.preorder_id;
      cleanup.preorderIds.push(preorderId);

      // PREORDER TX 레코드로 정확한 차감 확인
      const tx = await getTxRecord(preorderId, 'PREORDER', partnerCode, variantId);
      expect(tx).not.toBeNull();
      expect(Number(tx.qty_change)).toBe(-1);
    });
  });

  describe('반품 수량 경계', () => {
    let baseSaleId: number;

    beforeAll(async () => {
      const pool = getPool();
      // 재고를 충분히 세팅
      await pool.query(
        'UPDATE inventory SET qty = 20, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
        [fixtures.store.partner_code, fixtures.variant.variant_id],
      );

      // 기준 매출 등록 (3개 판매)
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: today,
          partner_code: fixtures.store.partner_code,
          variant_id: fixtures.variant.variant_id,
          qty: 3,
          unit_price: Number(fixtures.variant.base_price) || 50000,
          sale_type: '정상',
        });
      expect(res.status).toBe(201);
      baseSaleId = res.body.data.sale_id;
      cleanup.saleIds.push(baseSaleId);
    });

    it('반품 수량 = 잔여 수량(3) -> 허용', async () => {
      const res = await request(app)
        .post(`/api/sales/${baseSaleId}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          qty: 3,
          reason: '경계 테스트 - 전량 반품',
          return_reason: '고객변심',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      cleanup.saleIds.push(res.body.data.sale_id);
    });

    it('전량 반품 후 추가 반품(1개) -> 거부', async () => {
      const res = await request(app)
        .post(`/api/sales/${baseSaleId}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          qty: 1,
          reason: '경계 테스트 - 초과 반품',
          return_reason: '고객변심',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('전량 반품');
    });

    it('부분 반품 후 잔여+1 반품 -> 거부', async () => {
      // 새 매출 등록 (5개)
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sale_date: today,
          partner_code: fixtures.store.partner_code,
          variant_id: fixtures.variant.variant_id,
          qty: 5,
          unit_price: Number(fixtures.variant.base_price) || 50000,
          sale_type: '정상',
        });
      expect(saleRes.status).toBe(201);
      const saleId2 = saleRes.body.data.sale_id;
      cleanup.saleIds.push(saleId2);

      // 부분 반품 (2개)
      const partialReturn = await request(app)
        .post(`/api/sales/${saleId2}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          qty: 2,
          reason: '부분 반품',
          return_reason: '고객변심',
        });
      expect(partialReturn.status).toBe(201);
      cleanup.saleIds.push(partialReturn.body.data.sale_id);

      // 잔여(3) + 1 = 4개 반품 시도 -> 거부
      const overReturn = await request(app)
        .post(`/api/sales/${saleId2}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          qty: 4,
          reason: '잔여+1 초과 반품',
          return_reason: '고객변심',
        });
      expect(overReturn.status).toBe(400);
      expect(overReturn.body.success).toBe(false);
      expect(overReturn.body.error).toContain('초과');

      // 잔여(3) 정확히 반품 -> 허용
      const exactReturn = await request(app)
        .post(`/api/sales/${saleId2}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          qty: 3,
          reason: '정확히 잔여 수량 반품',
          return_reason: '고객변심',
        });
      expect(exactReturn.status).toBe(201);
      expect(exactReturn.body.success).toBe(true);
      cleanup.saleIds.push(exactReturn.body.data.sale_id);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 빈 데이터 처리
// ═══════════════════════════════════════════════════════════
describe('빈 데이터 처리', () => {
  // 존재하지 않는 매장 코드로 토큰 생성 (판매/재고 데이터 없음)
  const emptyStoreCode = 'ZTEST_EMPTY_999';
  const emptyStoreName = '테스트빈매장';
  let emptyStoreToken: string;

  beforeAll(() => {
    emptyStoreToken = storeToken(emptyStoreCode, emptyStoreName);
  });

  it('판매 없는 매장 대시보드 -> 0값 반환, 에러 없음', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${emptyStoreToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    // 숫자 필드들이 0 또는 '0'이어야 함 (에러가 아님)
    expect(data.todaySales).toBeDefined();
    expect(Number(data.todaySales.today_revenue)).toBe(0);
    expect(Number(data.todaySales.today_qty)).toBe(0);
    expect(data.sales).toBeDefined();
    expect(Number(data.sales.month_revenue)).toBe(0);
    expect(Number(data.sales.week_revenue)).toBe(0);
  });

  it('고객 없는 매장의 CRM 목록 -> 빈 배열, 에러 없음', async () => {
    const res = await request(app)
      .get('/api/crm')
      .set('Authorization', `Bearer ${emptyStoreToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // data or data.data 형태로 빈 배열 반환
    const list = res.body.data?.data || res.body.data;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });

  it('존재하지 않는 variant의 재고 -> 빈 결과, 에러 없음', async () => {
    const res = await request(app)
      .get('/api/inventory/by-product/NONEXIST_PRODUCT_CODE_XYZ')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    // 빈 배열 또는 빈 데이터
    if (Array.isArray(data)) {
      expect(data.length).toBe(0);
    } else if (data && typeof data === 'object') {
      // 일부 엔드포인트는 객체로 반환
      const items = data.data || data.items || [];
      expect(Array.isArray(items) ? items.length : 0).toBe(0);
    }
  });

  it('판매 없는 매장의 매출 목록 -> 빈 배열, 에러 없음', async () => {
    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', `Bearer ${emptyStoreToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    // sales list returns paginated format { data: [...], total: ... }
    const items = Array.isArray(data) ? data : (data?.data || []);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(0);
  });

  it('판매 없는 매장의 매장비교 -> 빈 배열, 에러 없음', async () => {
    const res = await request(app)
      .get('/api/sales/store-comparison')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${emptyStoreToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 소프트 삭제
// ═══════════════════════════════════════════════════════════
describe('소프트 삭제', () => {
  it('비활성 상품이 상품 목록에 나타나지 않는다', async () => {
    const pool = getPool();

    // 테스트용 상품을 비활성화
    const productCode = fixtures.variant.product_code;
    const prevState = await pool.query(
      'SELECT is_active FROM products WHERE product_code = $1',
      [productCode],
    );
    cleanup.restoredProducts.push({
      product_code: productCode,
      original_is_active: prevState.rows[0].is_active,
    });

    await pool.query(
      'UPDATE products SET is_active = FALSE WHERE product_code = $1',
      [productCode],
    );

    // 상품 목록 조회
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 목록에서 해당 상품이 제외되어야 함
    const products = res.body.data?.data || res.body.data;
    const found = Array.isArray(products)
      ? products.find((p: any) => p.product_code === productCode)
      : null;
    expect(found).toBeFalsy();

    // 복원 (afterAll에서도 복원하지만 다른 테스트를 위해 즉시 복원)
    await pool.query(
      'UPDATE products SET is_active = $1 WHERE product_code = $2',
      [prevState.rows[0].is_active, productCode],
    );
    // 복원했으므로 cleanup 배열에서 제거
    cleanup.restoredProducts.pop();
  });

  it('삭제된 고객이 CRM 목록에 나타나지 않는다', async () => {
    const pool = getPool();

    // 테스트 고객 생성 (유니크 전화번호)
    const uniquePhone = `010-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const createRes = await request(app)
      .post('/api/crm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customer_name: '삭제테스트_엣지케이스',
        phone: uniquePhone,
        partner_code: fixtures.store.partner_code,
      });

    expect(createRes.status).toBe(201);
    const customerId = createRes.body.data.customer_id;
    cleanup.customerIds.push(customerId);

    // CRM 목록에서 해당 고객이 존재하는지 확인
    const listBefore = await request(app)
      .get('/api/crm')
      .query({ search: '삭제테스트_엣지케이스' })
      .set('Authorization', `Bearer ${token}`);

    expect(listBefore.status).toBe(200);
    const dataBefore = listBefore.body.data?.data || listBefore.body.data;
    const foundBefore = Array.isArray(dataBefore)
      ? dataBefore.find((c: any) => c.customer_id === customerId)
      : null;
    expect(foundBefore).toBeTruthy();

    // 고객 삭제 (소프트 삭제)
    const deleteRes = await request(app)
      .delete(`/api/crm/${customerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);

    // CRM 목록에서 해당 고객이 제외되어야 함
    const listAfter = await request(app)
      .get('/api/crm')
      .query({ search: '삭제테스트_엣지케이스' })
      .set('Authorization', `Bearer ${token}`);

    expect(listAfter.status).toBe(200);
    const dataAfter = listAfter.body.data?.data || listAfter.body.data;
    const foundAfter = Array.isArray(dataAfter)
      ? dataAfter.find((c: any) => c.customer_id === customerId)
      : null;
    expect(foundAfter).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 대량 데이터 (배치 등록)
// ═══════════════════════════════════════════════════════════
describe('배치 등록 (10건)', () => {
  // 중복 등록 방지(5초 윈도우)를 피하기 위해 고유한 과거 날짜 사용
  const batchDate = '2024-01-15';

  it('10개 항목 배치 등록 -> 모두 성공', async () => {
    const pool = getPool();
    // 충분한 재고 세팅
    await pool.query(
      'UPDATE inventory SET qty = 100, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const items = Array.from({ length: 10 }, (_, i) => ({
      variant_id: fixtures.variant.variant_id,
      qty: 1,
      unit_price: Number(fixtures.variant.base_price) || 50000,
      sale_type: '정상',
    }));

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: batchDate,
        partner_code: fixtures.store.partner_code,
        items,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(10);

    // 모든 sale_id를 정리 대상에 추가
    for (const sale of res.body.data) {
      cleanup.saleIds.push(sale.sale_id);
    }

    // Verify inventory deducted via TX records (immune to concurrent DB modifications)
    // Each of the 10 sales should have a SALE TX with qty_change = -1
    let totalDeducted = 0;
    for (const sale of res.body.data) {
      const tx = await getTxRecord(sale.sale_id, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
      expect(tx).not.toBeNull();
      totalDeducted += Math.abs(Number(tx.qty_change));
    }
    expect(totalDeducted).toBe(10);
  });

  it('배치 등록 시 일부 항목 누락 -> 유효 항목만 등록 + skipped 반환', async () => {
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const items = [
      // 유효한 항목
      {
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: Number(fixtures.variant.base_price) || 50000,
      },
      // 필수값 누락 항목 (variant_id 없음)
      {
        qty: 1,
        unit_price: 50000,
      },
      // 수량 0 항목
      {
        variant_id: fixtures.variant.variant_id,
        qty: 0,
        unit_price: 50000,
      },
      // 유효한 항목
      {
        variant_id: fixtures.variant.variant_id,
        qty: 2,
        unit_price: Number(fixtures.variant.base_price) || 50000,
      },
    ];

    // 중복 등록 방지를 피하기 위해 고유한 과거 날짜 사용
    const batchDate2 = '2024-01-16';
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: batchDate2,
        partner_code: fixtures.store.partner_code,
        items,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // 유효한 항목만 등록 (2건)
    expect(res.body.data.length).toBe(2);
    // 건너뛴 항목 정보
    expect(res.body.skipped).toBeDefined();
    expect(res.body.skipped.length).toBe(2);

    for (const sale of res.body.data) {
      cleanup.saleIds.push(sale.sale_id);
    }
  });

  it('빈 items 배열 -> 400 에러', async () => {
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
        partner_code: fixtures.store.partner_code,
        items: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
