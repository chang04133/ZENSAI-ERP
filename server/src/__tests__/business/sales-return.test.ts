/**
 * 반품(Return) 비즈니스 룰 통합 테스트
 *
 * 1. 원본 반품 (POST /api/sales/:id/return)
 *    - 전량 반품, 부분 반품, 초과 수량 거부, return_reason 필수
 * 2. 30일 반품 기한
 *    - STORE_MANAGER: 30일 초과 시 403, ADMIN: 무제한
 * 3. 직접 반품 (POST /api/sales/direct-return)
 *    - return_reason 필수 검증
 * 4. 교환 (POST /api/sales/:id/exchange)
 *    - 교환 플로우, 사유 필수, 재고 부족 거부
 * 5. 반품 가능 수량 (GET /api/sales/:id/returnable)
 *    - 원본 수량, 반품 누적, 잔여 수량 확인
 *
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, getTestFixtures } from '../helpers';

// ── 정리 대상 추적 ──
const cleanup: {
  saleIds: number[];
  shipmentIds: number[];
  exchangeOriginalSaleIds: number[];
} = {
  saleIds: [],
  shipmentIds: [],
  exchangeOriginalSaleIds: [],
};

let admin: string;
let storeMgr: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;
let originalQty: number;
let secondVariant: { variant_id: number; base_price: number } | null = null;

const today = new Date().toISOString().slice(0, 10);

// ── 재고 조회 헬퍼 ──
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

// ── 매출 생성 헬퍼 (API 경유) ──
async function createSale(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<number> {
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
      ...overrides,
    });
  expect(res.status).toBe(201);
  const saleId = res.body.data.sale_id;
  cleanup.saleIds.push(saleId);
  return saleId;
}

// ── Setup / Teardown ──

beforeAll(async () => {
  admin = adminToken();
  fixtures = await getTestFixtures();
  storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);

  // Clean pending preorders and set known inventory
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

  // 교환 테스트용 두 번째 variant 조회 + 재고 세팅
  const v2 = await pool.query(
    `SELECT pv.variant_id, p.base_price
     FROM product_variants pv
     JOIN products p ON pv.product_code = p.product_code
     WHERE p.is_active = TRUE AND pv.is_active = TRUE AND p.base_price > 0
       AND pv.variant_id != $1
     ORDER BY pv.variant_id LIMIT 1`,
    [fixtures.variant.variant_id],
  );
  if (v2.rows[0]) {
    secondVariant = {
      variant_id: v2.rows[0].variant_id,
      base_price: Number(v2.rows[0].base_price),
    };
    // 교환 테스트용 재고 보장
    await pool.query(
      `INSERT INTO inventory (partner_code, variant_id, qty)
       VALUES ($1, $2, 10)
       ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = GREATEST(inventory.qty, 10), updated_at = NOW()`,
      [fixtures.store.partner_code, secondVariant.variant_id],
    );
  }
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 교환 레코드 삭제 (FK 제약으로 sales 삭제 전 필요)
    for (const origId of cleanup.exchangeOriginalSaleIds) {
      await client.query('DELETE FROM sales_exchanges WHERE original_sale_id = $1', [origId]);
    }

    // 매출 관련 정리 (역순: 최근 생성분부터)
    for (const saleId of [...cleanup.saleIds].reverse()) {
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

    // 재고 원복
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [originalQty, fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    // 교환 테스트용 두 번째 variant 재고도 원복
    if (secondVariant) {
      await client.query(
        'UPDATE inventory SET qty = 10, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
        [fixtures.store.partner_code, secondVariant.variant_id],
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('테스트 데이터 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// 1. 원본 반품 (POST /api/sales/:id/return)
// ═══════════════════════════════════════════════════════════
describe('원본 반품 (/:id/return)', () => {
  let baseSaleId: number;

  beforeAll(async () => {
    baseSaleId = await createSale(admin, { qty: 5 });
  });

  it('전량 반품 성공', async () => {
    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 5, return_reason: '고객변심', reason: '전량 테스트' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sale_type).toBe('반품');
    expect(Number(res.body.data.total_price)).toBeLessThan(0);
    cleanup.saleIds.push(res.body.data.sale_id);

    // RETURN TX 레코드로 재고 복원 확인 (공유 DB 영향 면역)
    const tx = await getTxRecord(res.body.data.sale_id, 'RETURN', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(5); // +5 복원
  });

  it('전량 반품 후 추가 반품 시 거부 (이미 전량 반품 처리)', async () => {
    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 1, return_reason: '고객변심' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('전량 반품 처리');
  });

  it('부분 반품 성공 + 잔여 확인', async () => {
    // 새 매출 생성 (5개)
    const newSaleId = await createSale(admin, { qty: 5 });

    // 부분 반품 (2개)
    const res = await request(app)
      .post(`/api/sales/${newSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 2, return_reason: '불량', reason: '부분 반품' });

    expect(res.status).toBe(201);
    expect(res.body.data.qty).toBe(2);
    cleanup.saleIds.push(res.body.data.sale_id);

    // 잔여 확인 (5 - 2 = 3)
    const returnableRes = await request(app)
      .get(`/api/sales/${newSaleId}/returnable`)
      .set('Authorization', `Bearer ${admin}`);

    expect(returnableRes.status).toBe(200);
    expect(returnableRes.body.data.total).toBe(5);
    expect(returnableRes.body.data.returned).toBe(2);
    expect(returnableRes.body.data.remaining).toBe(3);
  });

  it('초과 수량 반품 시 거부', async () => {
    // 새 매출 (2개)
    const newSaleId = await createSale(admin, { qty: 2 });

    const res = await request(app)
      .post(`/api/sales/${newSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 5, return_reason: '고객변심' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('반품 가능 수량을 초과');
  });

  it('return_reason 없으면 400', async () => {
    const newSaleId = await createSale(admin, { qty: 1 });

    const res = await request(app)
      .post(`/api/sales/${newSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('반품 사유');
  });

  it('존재하지 않는 매출 ID 시 404', async () => {
    const res = await request(app)
      .post('/api/sales/999999999/return')
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 1, return_reason: '고객변심' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('원본 매출 데이터를 찾을 수 없습니다');
  });

  it('qty 미지정 시 원본 전량 반품', async () => {
    const newSaleId = await createSale(admin, { qty: 3 });

    const res = await request(app)
      .post(`/api/sales/${newSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ return_reason: '고객변심' });

    expect(res.status).toBe(201);
    expect(res.body.data.qty).toBe(3);
    cleanup.saleIds.push(res.body.data.sale_id);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 30일 반품 기한
// ═══════════════════════════════════════════════════════════
describe('30일 반품 기한', () => {
  let oldSaleId: number;

  // 31일 전 날짜의 매출을 DB에 직접 INSERT (API는 당일만 가능하므로)
  beforeAll(async () => {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type)
       VALUES (CURRENT_DATE - INTERVAL '31 days', $1, $2, 2, $3, $4, '정상') RETURNING sale_id`,
      [
        fixtures.store.partner_code,
        fixtures.variant.variant_id,
        Number(fixtures.variant.base_price) || 50000,
        2 * (Number(fixtures.variant.base_price) || 50000),
      ],
    );
    oldSaleId = result.rows[0].sale_id;
    cleanup.saleIds.push(oldSaleId);
  });

  it('STORE_MANAGER: 30일 초과 매출 반품 시 403', async () => {
    const res = await request(app)
      .post(`/api/sales/${oldSaleId}/return`)
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({ qty: 1, return_reason: '고객변심' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('30일');
    expect(res.body.error).toContain('본사 승인');
  });

  it('ADMIN: 30일 초과 매출도 반품 가능', async () => {
    const res = await request(app)
      .post(`/api/sales/${oldSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 1, return_reason: '고객변심', reason: '본사 승인 반품' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    cleanup.saleIds.push(res.body.data.sale_id);
  });

  it('STORE_MANAGER: 30일 이내 매출은 반품 가능', async () => {
    // 당일 매출 생성 (admin으로 생성, 매장 코드 동일)
    const newSaleId = await createSale(admin, { qty: 1 });

    const res = await request(app)
      .post(`/api/sales/${newSaleId}/return`)
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({ qty: 1, return_reason: '고객변심' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    cleanup.saleIds.push(res.body.data.sale_id);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 직접 반품 (POST /api/sales/direct-return)
// ═══════════════════════════════════════════════════════════
describe('직접 반품 (direct-return)', () => {
  it('return_reason 없으면 400', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: 50000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('반품 사유');
  });

  it('variant_id 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        qty: 1,
        unit_price: 50000,
        return_reason: '불량',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('variant_id');
  });

  it('qty <= 0 시 400', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 0,
        unit_price: 50000,
        return_reason: '불량',
      });

    expect(res.status).toBe(400);
    // qty=0 is falsy, so the first validation (!qty) catches it with '필수' message
    expect(res.body.error).toContain('필수');
  });

  it('unit_price <= 0 시 400', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: 0,
        return_reason: '불량',
      });

    expect(res.status).toBe(400);
    // unit_price=0 is falsy, so the first validation (!unit_price) catches it with '필수' message
    expect(res.body.error).toContain('필수');
  });

  it('정상 직접 반품 시 재고 복원 + 출고 자동생성', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: Number(fixtures.variant.base_price) || 50000,
        return_reason: '불량',
        reason: '직접 반품 테스트',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sale_type).toBe('반품');
    expect(Number(res.body.data.total_price)).toBeLessThan(0);

    const saleId = res.body.data.sale_id;
    cleanup.saleIds.push(saleId);

    // RETURN TX 레코드로 재고 복원 확인 (공유 DB 영향 면역)
    const tx = await getTxRecord(saleId, 'RETURN', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(1); // +1 복원

    // 출고(물류반품) 자동생성 확인
    const shipId = res.body.data.shipment_request_id;
    if (shipId) {
      cleanup.shipmentIds.push(shipId);
      const pool = getPool();
      const shipRes = await pool.query(
        'SELECT * FROM shipment_requests WHERE request_id = $1',
        [shipId],
      );
      expect(shipRes.rows[0]).toBeTruthy();
      expect(shipRes.rows[0].request_type).toBe('반품');
      expect(shipRes.rows[0].from_partner).toBe(fixtures.store.partner_code);
    }
  });

  it('skip_shipment=true 시 출고 자동생성 안됨', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: 50000,
        return_reason: '고객변심',
        skip_shipment: true,
      });

    expect(res.status).toBe(201);
    cleanup.saleIds.push(res.body.data.sale_id);

    const pool = getPool();
    const check = await pool.query(
      'SELECT shipment_request_id FROM sales WHERE sale_id = $1',
      [res.body.data.sale_id],
    );
    expect(check.rows[0]?.shipment_request_id).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 교환 (POST /api/sales/:id/exchange)
// ═══════════════════════════════════════════════════════════
describe('교환 (/:id/exchange)', () => {
  it.skipIf(!secondVariant)('정상 교환: 원본 반품 + 새 상품 판매', async () => {
    const baseSaleId = await createSale(admin, { qty: 2 });
    cleanup.exchangeOriginalSaleIds.push(baseSaleId);

    const qtyBefore = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    const newQtyBefore = await getInventoryQty(fixtures.store.partner_code, secondVariant!.variant_id);

    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/exchange`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        new_variant_id: secondVariant!.variant_id,
        new_qty: 1,
        new_unit_price: secondVariant!.base_price || 50000,
        return_reason: '사이즈교환',
        memo: '교환 테스트',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.return_sale).toBeTruthy();
    expect(res.body.data.new_sale).toBeTruthy();
    expect(res.body.data.return_sale.sale_type).toBe('반품');
    expect(res.body.data.new_sale.sale_type).toBe('정상');

    cleanup.saleIds.push(res.body.data.return_sale.sale_id);
    cleanup.saleIds.push(res.body.data.new_sale.sale_id);

    // 원본 상품 재고 복원 (교환 반품 +2)
    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(qtyBefore + 2);

    // 새 상품 재고 차감 (-1)
    const newQtyAfter = await getInventoryQty(fixtures.store.partner_code, secondVariant!.variant_id);
    expect(newQtyAfter).toBe(newQtyBefore - 1);
  });

  it('return_reason 없으면 400', async () => {
    const baseSaleId = await createSale(admin, { qty: 1 });

    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/exchange`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        new_variant_id: fixtures.variant.variant_id,
        new_qty: 1,
        new_unit_price: 50000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('교환 사유');
  });

  it('new_variant_id 누락 시 400', async () => {
    const baseSaleId = await createSale(admin, { qty: 1 });

    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/exchange`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        new_qty: 1,
        new_unit_price: 50000,
        return_reason: '사이즈교환',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('new_variant_id');
  });

  it('존재하지 않는 매출 ID 시 404', async () => {
    const res = await request(app)
      .post('/api/sales/999999999/exchange')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        new_variant_id: fixtures.variant.variant_id,
        new_qty: 1,
        new_unit_price: 50000,
        return_reason: '사이즈교환',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('원본 매출을 찾을 수 없습니다');
  });

  it.skipIf(!secondVariant)('전량 반품 후 교환 시 거부', async () => {
    const baseSaleId = await createSale(admin, { qty: 2 });

    // 먼저 전량 반품
    const returnRes = await request(app)
      .post(`/api/sales/${baseSaleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 2, return_reason: '고객변심' });
    expect(returnRes.status).toBe(201);
    cleanup.saleIds.push(returnRes.body.data.sale_id);

    // 교환 시도 → 이미 전량 반품됨
    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/exchange`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        new_variant_id: secondVariant!.variant_id,
        new_qty: 1,
        new_unit_price: 50000,
        return_reason: '사이즈교환',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('전량 반품 처리');
  });

  it.skipIf(!secondVariant)('교환 상품 재고 부족 시 거부', async () => {
    const baseSaleId = await createSale(admin, { qty: 1 });
    cleanup.exchangeOriginalSaleIds.push(baseSaleId);

    // 재고가 매우 많은 수량을 요청
    const res = await request(app)
      .post(`/api/sales/${baseSaleId}/exchange`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        new_variant_id: secondVariant!.variant_id,
        new_qty: 999999,
        new_unit_price: 50000,
        return_reason: '사이즈교환',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('재고가 부족');
  });

  it('STORE_MANAGER: 30일 초과 매출 교환 시 403', async () => {
    // 31일 전 매출 직접 INSERT
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type)
       VALUES (CURRENT_DATE - INTERVAL '31 days', $1, $2, 1, $3, $4, '정상') RETURNING sale_id`,
      [
        fixtures.store.partner_code,
        fixtures.variant.variant_id,
        Number(fixtures.variant.base_price) || 50000,
        Number(fixtures.variant.base_price) || 50000,
      ],
    );
    const oldSaleId = result.rows[0].sale_id;
    cleanup.saleIds.push(oldSaleId);

    const res = await request(app)
      .post(`/api/sales/${oldSaleId}/exchange`)
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({
        new_variant_id: fixtures.variant.variant_id,
        new_qty: 1,
        new_unit_price: 50000,
        return_reason: '사이즈교환',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('30일');
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 반품 가능 수량 (GET /api/sales/:id/returnable)
// ═══════════════════════════════════════════════════════════
describe('반품 가능 수량 (/:id/returnable)', () => {
  it('반품 이력 없는 매출: remaining = total', async () => {
    const saleId = await createSale(admin, { qty: 4 });

    const res = await request(app)
      .get(`/api/sales/${saleId}/returnable`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.returned).toBe(0);
    expect(res.body.data.remaining).toBe(4);
  });

  it('부분 반품 후 잔여 수량 정확', async () => {
    const saleId = await createSale(admin, { qty: 5 });

    // 2개 반품
    const r1 = await request(app)
      .post(`/api/sales/${saleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 2, return_reason: '고객변심' });
    expect(r1.status).toBe(201);
    cleanup.saleIds.push(r1.body.data.sale_id);

    // 1개 추가 반품
    const r2 = await request(app)
      .post(`/api/sales/${saleId}/return`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 1, return_reason: '불량' });
    expect(r2.status).toBe(201);
    cleanup.saleIds.push(r2.body.data.sale_id);

    const res = await request(app)
      .get(`/api/sales/${saleId}/returnable`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.returned).toBe(3);
    expect(res.body.data.remaining).toBe(2);
  });

  it('존재하지 않는 매출 ID 시 404', async () => {
    const res = await request(app)
      .get('/api/sales/999999999/returnable')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('매출 데이터를 찾을 수 없습니다');
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 반품 목록 조회 (GET /api/sales/returns)
// ═══════════════════════════════════════════════════════════
describe('반품 목록 조회 (/returns)', () => {
  it('인증 토큰으로 반품 목록 조회 성공', async () => {
    const res = await request(app)
      .get('/api/sales/returns')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('total');
    expect(Array.isArray(res.body.data.data)).toBe(true);
  });

  it('토큰 없이 조회 시 401', async () => {
    const res = await request(app).get('/api/sales/returns');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. 인증/권한 검증
// ═══════════════════════════════════════════════════════════
describe('인증/권한 검증', () => {
  it('토큰 없이 반품 시 401', async () => {
    const res = await request(app)
      .post('/api/sales/1/return')
      .send({ qty: 1, return_reason: '고객변심' });

    expect(res.status).toBe(401);
  });

  it('토큰 없이 직접 반품 시 401', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .send({ variant_id: 1, qty: 1, unit_price: 50000, return_reason: '불량' });

    expect(res.status).toBe(401);
  });

  it('토큰 없이 교환 시 401', async () => {
    const res = await request(app)
      .post('/api/sales/1/exchange')
      .send({ new_variant_id: 1, new_qty: 1, new_unit_price: 50000, return_reason: '사이즈교환' });

    expect(res.status).toBe(401);
  });
});
