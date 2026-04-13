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
const cleanup: { saleIds: number[]; shipmentIds: number[]; preorderIds: number[] } = { saleIds: [], shipmentIds: [], preorderIds: [] };

let token: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  token = adminToken();
  fixtures = await getTestFixtures();
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
      await client.query('DELETE FROM shipment_request_items WHERE request_id = $1', [shipId]);
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [shipId]);
    }
    for (const pid of cleanup.preorderIds) {
      await client.query('DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2', [pid, 'PREORDER']);
      await client.query('DELETE FROM preorders WHERE preorder_id = $1', [pid]);
    }
    // 재고 원복 (known clean state for subsequent test files)
    await client.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
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

async function getTxRecord(refId: number, txType: string, partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id DESC LIMIT 1',
    [refId, txType, partnerCode, variantId],
  );
  return r.rows[0] || null;
}

// ═══════════════════════════════════════════════════════════
// 매출 CRUD + 재고 연동
// ═══════════════════════════════════════════════════════════
describe('매출-재고 핵심 플로우', () => {
  it('사전조건: 테스트 재고 >= 10', async () => {
    const currentQty = await getInventoryQty(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(currentQty).toBeGreaterThanOrEqual(10);
  });

  // 1. 매출 등록 → 재고 차감
  let saleId: number;

  it('매출 등록 시 재고가 차감된다', async () => {
    const pc = fixtures.store.partner_code;
    const vid = fixtures.variant.variant_id;

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: today,
        partner_code: pc,
        variant_id: vid,
        qty: 2,
        unit_price: Number(fixtures.variant.base_price) || 50000,
        sale_type: '정상',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    saleId = res.body.data.sale_id;
    cleanup.saleIds.push(saleId);

    // Check SALE TX record instead of direct inventory qty
    const tx = await getTxRecord(saleId, 'SALE', pc, vid);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(-2);
  });

  // 2. 매출 수정 → 재고 보정
  it('매출 수량 수정 시 재고가 보정된다 (2→3)', async () => {
    const res = await request(app)
      .put(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qty: 3, unit_price: Number(fixtures.variant.base_price) || 50000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check SALE_EDIT TX record: qty changed from 2→3, so qty_change = -1
    const tx = await getTxRecord(saleId, 'SALE_EDIT', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(-1);
  });

  // 3. 매출 삭제 → 재고 복원 (sale had qty=3 after edit)
  it('매출 삭제 시 재고가 복원된다', async () => {
    const res = await request(app)
      .delete(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check SALE_DELETE TX record: sale had qty=3 (after edit), so qty_change = +3
    const tx = await getTxRecord(saleId, 'SALE_DELETE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(3);
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

    // Check SALE TX for the base sale
    const saleTx = await getTxRecord(baseSaleId2, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(saleTx).not.toBeNull();
    expect(Number(saleTx.qty_change)).toBe(-2);

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

    // Check RETURN TX record: qty_change = +1
    const returnTx = await getTxRecord(returnSaleId2, 'RETURN', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(returnTx).not.toBeNull();
    expect(Number(returnTx.qty_change)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// 직접 반품 (direct-return) + 출고 자동생성/자동취소
// ═══════════════════════════════════════════════════════════
describe('직접 반품 + 출고 자동생성', () => {
  let returnSaleId: number;
  let linkedShipmentId: number | null;

  it('direct-return 시 재고 복원 + 출고 자동생성', async () => {
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

    // Check RETURN TX record: qty_change = +1
    const tx = await getTxRecord(returnSaleId, 'RETURN', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(1);

    // 출고 자동생성 확인 (shipment_request_id가 설정되어야 함)
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
    const res = await request(app)
      .delete(`/api/sales/${returnSaleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check SALE_DELETE TX record: deleting a return (qty=1) undoes the +1, so qty_change = -1
    const tx = await getTxRecord(returnSaleId, 'SALE_DELETE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(-1);

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
// 재고 부족 허용 (allowNegative=true)
// ═══════════════════════════════════════════════════════════
describe('재고 부족 시 마이너스 허용', () => {
  it('재고보다 약간 많은 수량 매출 → 예약판매 전환 (afterStock >= -2)', async () => {
    // 재고를 1로 설정 → qty=2 → afterStock=-1 → 예약판매 전환
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 1, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

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
    expect(res.body.preorder).toBe(true); // 예약판매로 전환됨
    cleanup.preorderIds.push(res.body.data.preorder_id);

    // PREORDER TX 레코드 확인
    const tx = await getTxRecord(res.body.data.preorder_id, 'PREORDER', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(-2);

    // Restore inventory
    await pool.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [50, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
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
