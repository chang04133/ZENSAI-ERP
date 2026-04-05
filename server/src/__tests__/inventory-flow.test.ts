/**
 * 핵심 플로우 통합 테스트: 매출 → 재고차감 → 반품 → 재고복원 → 출고자동생성 → 삭제시자동취소
 *
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getPool } from '../db/connection';
import { adminToken, getTestFixtures } from './helpers';

// 테스트 중 생성된 리소스 ID (정리용)
const cleanup: { saleIds: number[]; shipmentIds: number[] } = { saleIds: [], shipmentIds: [] };

let token: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;
let originalQty: number;

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  token = adminToken();
  fixtures = await getTestFixtures();
  originalQty = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const saleId of cleanup.saleIds) {
      await client.query('DELETE FROM customer_purchases WHERE sale_id = $1', [saleId]);
      await client.query('DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2, $3, $4, $5)', [saleId, 'SALE', 'RETURN', 'SALE_DELETE', 'SALE_EDIT']);
      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
    }
    for (const shipId of cleanup.shipmentIds) {
      await client.query('DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2, $3)', [shipId, 'SHIP_OUT', 'SHIP_IN']);
      await client.query('DELETE FROM shipment_items WHERE request_id = $1', [shipId]);
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [shipId]);
    }
    // 재고 원복
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [originalQty, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('테스트 데이터 정리 실패:', e);
  } finally {
    client.release();
  }
});

async function getInventoryQty(partnerCode: string, variantId: number): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, variantId],
  );
  return r.rows[0] ? Number(r.rows[0].qty) : 0;
}

// ═══════════════════════════════════════════════════════════
// 매출 CRUD + 재고 연동
// ═══════════════════════════════════════════════════════════
describe('매출-재고 핵심 플로우', () => {
  let initialQty: number;

  it('사전조건: 테스트 재고 >= 10', async () => {
    initialQty = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(initialQty).toBeGreaterThanOrEqual(10);
  });

  // 1. 매출 등록 → 재고 차감
  let saleId: number;

  it('매출 등록 시 재고가 차감된다', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: today,
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 2,
        unit_price: Number(fixtures.variant.base_price) || 50000,
        sale_type: '정상',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    saleId = res.body.data.sale_id;
    cleanup.saleIds.push(saleId);

    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(initialQty - 2);
  });

  // 2. 매출 수정 → 재고 보정
  it('매출 수량 수정 시 재고가 보정된다 (2→3)', async () => {
    const qtyBefore = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);

    const res = await request(app)
      .put(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qty: 3, unit_price: Number(fixtures.variant.base_price) || 50000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(qtyBefore - 1);
  });

  // 3. 매출 삭제 → 재고 복원
  it('매출 삭제 시 재고가 복원된다', async () => {
    const res = await request(app)
      .delete(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(initialQty);
  });

  // 4. 원본 반품(/:id/return) → 재고 복원
  let baseSaleId2: number;
  let returnSaleId2: number;

  it('원본 반품 시 재고가 복원된다', async () => {
    // 정상 매출 등록
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: today,
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 2,
        unit_price: Number(fixtures.variant.base_price) || 50000,
        sale_type: '정상',
      });
    expect(saleRes.status).toBe(201);
    baseSaleId2 = saleRes.body.data.sale_id;
    cleanup.saleIds.push(baseSaleId2);

    expect(await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id)).toBe(initialQty - 2);

    // 원본 반품 (1개)
    const returnRes = await request(app)
      .post(`/api/sales/${baseSaleId2}/return`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        qty: 1,
        reason: '테스트 반품',
        return_reason: '고객변심',
      });

    expect(returnRes.status).toBe(201);
    expect(returnRes.body.success).toBe(true);
    returnSaleId2 = returnRes.body.data.sale_id;
    cleanup.saleIds.push(returnSaleId2);

    // 재고: 2개 팔고 1개 반품 → 순 -1
    expect(await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id)).toBe(initialQty - 1);
  });
});

// ═══════════════════════════════════════════════════════════
// 직접 반품 (direct-return) + 출고 자동생성/자동취소
// ═══════════════════════════════════════════════════════════
describe('직접 반품 + 출고 자동생성', () => {
  let returnSaleId: number;
  let linkedShipmentId: number | null;

  it('direct-return 시 재고 복원 + 출고 자동생성', async () => {
    const qtyBefore = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);

    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: Number(fixtures.variant.base_price) || 50000,
        reason: '테스트 직접반품',
        return_reason: '불량',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    returnSaleId = res.body.data.sale_id;
    cleanup.saleIds.push(returnSaleId);

    // 반품(+1) + 출고(-1) = 매장 재고 변동 없음 (즉시 본사로 출고)
    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(qtyBefore);

    // 출고 자동생성 확인
    const pool = getPool();
    const shipRes = await pool.query(
      'SELECT shipment_request_id FROM sales WHERE sale_id = $1',
      [returnSaleId],
    );
    linkedShipmentId = shipRes.rows[0]?.shipment_request_id || null;
    expect(linkedShipmentId).toBeTruthy();
    if (linkedShipmentId) cleanup.shipmentIds.push(linkedShipmentId);
  });

  it('반품 삭제 시 재고 재차감 + 연결 출고 자동취소', async () => {
    const qtyBefore = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);

    const res = await request(app)
      .delete(`/api/sales/${returnSaleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 반품취소(-1) + 출고취소복구(+1) = 매장 재고 변동 없음
    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(qtyBefore);

    // 연결 출고 자동취소 확인
    if (linkedShipmentId) {
      const pool = getPool();
      const shipRes = await pool.query(
        'SELECT status FROM shipment_requests WHERE request_id = $1',
        [linkedShipmentId],
      );
      expect(shipRes.rows[0]?.status).toBe('CANCELLED');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// skip_shipment 옵션
// ═══════════════════════════════════════════════════════════
describe('skip_shipment 옵션', () => {
  it('skip_shipment=true 시 출고가 자동생성되지 않는다', async () => {
    const res = await request(app)
      .post('/api/sales/direct-return')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        unit_price: 50000,
        reason: '테스트 skip_shipment',
        return_reason: '고객변심',
        skip_shipment: true,
      });

    expect(res.status).toBe(201);
    const returnSaleId = res.body.data.sale_id;
    cleanup.saleIds.push(returnSaleId);

    const pool = getPool();
    const check = await pool.query(
      'SELECT shipment_request_id FROM sales WHERE sale_id = $1',
      [returnSaleId],
    );
    expect(check.rows[0]?.shipment_request_id).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// 재고 부족 방지
// ═══════════════════════════════════════════════════════════
describe('재고 부족 방지', () => {
  it('재고보다 많은 수량 매출 등록 시 실패한다', async () => {
    const currentQty = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: today,
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: currentQty + 100,
        unit_price: 50000,
        sale_type: '정상',
      });

    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/재고 부족/);

    const qtyAfter = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(qtyAfter).toBe(currentQty);
  });
});

// ═══════════════════════════════════════════════════════════
// 인증
// ═══════════════════════════════════════════════════════════
describe('인증 검증', () => {
  it('토큰 없이 매출 조회 시 401', async () => {
    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(401);
  });

  it('토큰 없이 매출 등록 시 401', async () => {
    const res = await request(app).post('/api/sales').send({ qty: 1 });
    expect(res.status).toBe(401);
  });
});
