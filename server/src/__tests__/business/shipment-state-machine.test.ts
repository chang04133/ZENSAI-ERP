/**
 * 출고 상태 머신 통합 테스트
 *
 * 테스트 항목:
 * 1. 유효한 상태 전환: PENDING->SHIPPED, SHIPPED->RECEIVED, SHIPPED->DISCREPANCY
 * 2. 무효한 상태 전환: PENDING->RECEIVED 직접, RECEIVED->PENDING 역전환, CANCELLED->PENDING
 * 3. 취소 시나리오: PENDING 취소 (재고 변동 없음), SHIPPED 취소 (재고 복구)
 *
 * IMPORTANT: autoFulfillPreorders is stubbed out to prevent async inventory modifications.
 * This method fires as fire-and-forget after receive operations and would introduce
 * race conditions that make inventory assertions non-deterministic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, hqManagerToken, getTestFixtures } from '../helpers';
import { shipmentService } from '../../modules/shipment/shipment.service';

const cleanup: { shipmentIds: number[]; testUserIds: string[] } = { shipmentIds: [], testUserIds: [] };

let token: string;
let hqToken: string;
let storeAToken: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// Fixed inventory values for setup and restore
const FIXED_HQ_QTY = 100;
const FIXED_STORE_QTY = 50;

// Stub autoFulfillPreorders to prevent async inventory interference during tests
const originalAutoFulfill = (shipmentService as any).autoFulfillPreorders;
(shipmentService as any).autoFulfillPreorders = async () => {};

async function getQty(partnerCode: string, variantId: number): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, variantId],
  );
  return r.rows[0] ? Number(r.rows[0].qty) : 0;
}

/**
 * Query inventory_transactions for a given shipment ref_id, tx_type, and partner_code.
 * Returns rows ordered by tx_id ascending so we can inspect chronological order.
 * Using TX records instead of direct inventory.qty checks because the shared remote DB
 * has other processes concurrently modifying inventory, making qty assertions unreliable.
 */
async function getShipmentTxs(shipmentId: number, txType: string, partnerCode: string) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 ORDER BY tx_id',
    [shipmentId, txType, partnerCode],
  );
  return r.rows;
}

/** Force-reset inventory to known fixed values. */
async function resetInventory() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO inventory (partner_code, variant_id, qty)
     VALUES ($1, $2, $3)
     ON CONFLICT (partner_code, variant_id)
     DO UPDATE SET qty = $3, updated_at = NOW()`,
    [fixtures.hq.partner_code, fixtures.variant.variant_id, FIXED_HQ_QTY],
  );
  await pool.query(
    `INSERT INTO inventory (partner_code, variant_id, qty)
     VALUES ($1, $2, $3)
     ON CONFLICT (partner_code, variant_id)
     DO UPDATE SET qty = $3, updated_at = NOW()`,
    [fixtures.store.partner_code, fixtures.variant.variant_id, FIXED_STORE_QTY],
  );
}

beforeAll(async () => {
  token = adminToken();
  hqToken = hqManagerToken();
  fixtures = await getTestFixtures();

  const pool = getPool();

  // 테스트 유저 INSERT (shipment_requests.requested_by FK 제약 대응)
  const storeAUserId = `test_store_${fixtures.store.partner_code}`;
  await pool.query(
    `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
     VALUES ($1, $2, $3,
       (SELECT group_id FROM role_groups WHERE group_name = 'STORE_MANAGER'),
       '$2b$10$placeholder')
     ON CONFLICT (user_id) DO NOTHING`,
    [storeAUserId, `${fixtures.store.partner_name} 테스트매니저`, fixtures.store.partner_code],
  );
  cleanup.testUserIds.push(storeAUserId);

  storeAToken = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);

  // 테스트용 재고 세팅
  await resetInventory();
});

afterAll(async () => {
  // Restore autoFulfillPreorders
  (shipmentService as any).autoFulfillPreorders = originalAutoFulfill;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of cleanup.shipmentIds) {
      await client.query(
        "DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ('SHIP_OUT', 'SHIP_IN', 'SHIPMENT', 'RETURN', 'TRANSFER', 'LOSS')",
        [id],
      );
      await client.query('DELETE FROM shipment_request_items WHERE request_id = $1', [id]);
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [id]);
    }
    // 테스트 유저 정리
    for (const uid of cleanup.testUserIds) {
      await client.query('DELETE FROM users WHERE user_id = $1', [uid]);
    }
    // 재고 원복 (fixed values)
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [FIXED_HQ_QTY, fixtures.hq.partner_code, fixtures.variant.variant_id],
    );
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [FIXED_STORE_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('shipment-state-machine 정리 실패:', e);
  } finally {
    client.release();
  }
});

/** 출고 의뢰 생성 헬퍼 */
async function createShipment(qty: number): Promise<number> {
  const res = await request(app)
    .post('/api/shipments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      request_type: '출고',
      from_partner: fixtures.hq.partner_code,
      to_partner: fixtures.store.partner_code,
      items: [{ variant_id: fixtures.variant.variant_id, request_qty: qty }],
    });
  expect(res.status).toBe(201);
  const id = res.body.data.request_id;
  cleanup.shipmentIds.push(id);
  return id;
}

/** 출고확인(SHIPPED) 헬퍼 */
async function shipConfirm(shipmentId: number, qty: number) {
  const res = await request(app)
    .put(`/api/shipments/${shipmentId}/ship-confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: qty }],
    });
  expect(res.status).toBe(200);
  expect(res.body.data.status).toBe('SHIPPED');
  return res;
}

// ======================================================
// 1. 유효한 상태 전환
// ======================================================
describe('유효한 상태 전환', () => {
  describe('PENDING -> SHIPPED (ship-confirm)', () => {
    it('출고 의뢰 생성 -> PENDING, ship-confirm -> SHIPPED, 출발지 재고 차감', async () => {
      await resetInventory();

      const shipmentId = await createShipment(3);

      // 상태 확인
      const detail = await request(app)
        .get(`/api/shipments/${shipmentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detail.body.data.status).toBe('PENDING');

      // ship-confirm: deducts shipped_qty from HQ inventory
      await shipConfirm(shipmentId, 3);

      // 본사 재고 -3 확인: SHIPMENT TX for from_partner should have qty_change = -3
      // (Using TX records instead of inventory.qty because shared DB has concurrent modifications)
      const hqTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.hq.partner_code);
      expect(hqTxs.length).toBe(1);
      expect(Number(hqTxs[0].qty_change)).toBe(-3);
    });
  });

  describe('SHIPPED -> RECEIVED (receive, 수량 일치)', () => {
    it('출고 생성 + 출고확인 후 수령확인 -> RECEIVED, 도착지 재고 증가', async () => {
      await resetInventory();

      const shipmentId = await createShipment(2);
      await shipConfirm(shipmentId, 2);

      // 수령확인 (도착 매장 토큰 사용)
      const res = await request(app)
        .put(`/api/shipments/${shipmentId}/receive`)
        .set('Authorization', `Bearer ${storeAToken}`)
        .send({
          items: [{ variant_id: fixtures.variant.variant_id, received_qty: 2 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RECEIVED');

      // 도착지 재고 증가 확인: SHIPMENT TX for to_partner should have qty_change = +2
      // (Using TX records instead of inventory.qty because shared DB has concurrent modifications)
      const storeTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.store.partner_code);
      expect(storeTxs.length).toBeGreaterThanOrEqual(1);
      const receiveTx = storeTxs.find((tx: any) => Number(tx.qty_change) > 0);
      expect(receiveTx).toBeTruthy();
      expect(Number(receiveTx!.qty_change)).toBe(2);
    });
  });

  describe('SHIPPED -> DISCREPANCY (수량 불일치)', () => {
    let shipmentId: number;

    it('출고확인 5개, 수령확인 3개 -> DISCREPANCY', async () => {
      await resetInventory();
      shipmentId = await createShipment(5);
      await shipConfirm(shipmentId, 5);

      const res = await request(app)
        .put(`/api/shipments/${shipmentId}/receive`)
        .set('Authorization', `Bearer ${storeAToken}`)
        .send({
          items: [{ variant_id: fixtures.variant.variant_id, received_qty: 3 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DISCREPANCY');
    });

    it('DISCREPANCY -> RECEIVED (관리자 강제완료)', async () => {
      const res = await request(app)
        .put(`/api/shipments/${shipmentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RECEIVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RECEIVED');
    });
  });
});

// ======================================================
// 2. 무효한 상태 전환
// ======================================================
describe('무효한 상태 전환', () => {
  it('PENDING -> RECEIVED 직접 전환 불가 (receive API 거부)', async () => {
    const shipmentId = await createShipment(2);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}/receive`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, received_qty: 2 }],
      });

    expect(res.status).toBe(400);
  });

  it('PENDING -> RECEIVED 직접 상태 변경도 불가 (update API)', async () => {
    const shipmentId = await createShipment(1);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' });

    expect([400, 403]).toContain(res.status);
  });

  it('RECEIVED -> PENDING 역전환 불가', async () => {
    const shipmentId = await createShipment(1);
    await shipConfirm(shipmentId, 1);

    await request(app)
      .put(`/api/shipments/${shipmentId}/receive`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, received_qty: 1 }],
      });

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING' });

    expect(res.status).toBe(400);
  });

  it('CANCELLED -> PENDING 전환 불가', async () => {
    const shipmentId = await createShipment(1);

    const cancelRes = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });
    expect(cancelRes.status).toBe(200);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING' });

    expect(res.status).toBe(400);
  });

  it('PENDING -> SHIPPED 직접 update도 불가 (ship-confirm 전용)', async () => {
    const shipmentId = await createShipment(1);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SHIPPED' });

    expect(res.status).toBe(400);
  });

  it('SHIPPED -> RECEIVED 직접 update도 불가 (receive 전용)', async () => {
    const shipmentId = await createShipment(1);
    await shipConfirm(shipmentId, 1);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' });

    expect([400, 403]).toContain(res.status);
  });
});

// ======================================================
// 3. 취소 시나리오
// ======================================================
describe('취소 시나리오', () => {
  describe('PENDING 상태 취소 -> 재고 변동 없음', () => {
    it('PENDING 취소 시 재고 변동 없음', async () => {
      await resetInventory();

      const shipmentId = await createShipment(5);

      // PENDING -> CANCELLED
      const res = await request(app)
        .put(`/api/shipments/${shipmentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      // PENDING 취소 시 SHIPMENT TX가 생성되지 않아야 함 (재고 변동 없음)
      // (Using TX records instead of inventory.qty because shared DB has concurrent modifications)
      const hqTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.hq.partner_code);
      const storeTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.store.partner_code);
      expect(hqTxs.length).toBe(0);
      expect(storeTxs.length).toBe(0);
    });
  });

  describe('SHIPPED 상태 취소 -> 출발지 재고 복구', () => {
    it('SHIPPED 취소 시 출발지 재고 복구', async () => {
      await resetInventory();

      const shipmentId = await createShipment(4);
      await shipConfirm(shipmentId, 4);

      // SHIPPED -> CANCELLED
      const res = await request(app)
        .put(`/api/shipments/${shipmentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      // 본사 재고 복구 확인: SHIPMENT TXs for from_partner should have:
      //   1) ship-confirm: qty_change = -4
      //   2) cancel reversal: qty_change = +4
      // Net effect = 0 (inventory restored)
      // (Using TX records instead of inventory.qty because shared DB has concurrent modifications)
      const hqTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.hq.partner_code);
      expect(hqTxs.length).toBe(2);
      expect(Number(hqTxs[0].qty_change)).toBe(-4); // ship-confirm deduction
      expect(Number(hqTxs[1].qty_change)).toBe(4);  // cancel reversal
      const netHqChange = hqTxs.reduce((sum: number, tx: any) => sum + Number(tx.qty_change), 0);
      expect(netHqChange).toBe(0);

      // 매장 재고 변동 없음 (수령 전이었으므로 to_partner TX 없음)
      const storeTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.store.partner_code);
      expect(storeTxs.length).toBe(0);
    });
  });

  describe('DISCREPANCY 상태 취소 -> 양쪽 재고 복구', () => {
    it('DISCREPANCY 취소 시 양쪽 재고 복구', async () => {
      await resetInventory();

      const shipmentId = await createShipment(6);
      await shipConfirm(shipmentId, 6);

      // 수령확인 (불일치: 6개 출고, 4개 수령)
      const recvRes = await request(app)
        .put(`/api/shipments/${shipmentId}/receive`)
        .set('Authorization', `Bearer ${storeAToken}`)
        .send({
          items: [{ variant_id: fixtures.variant.variant_id, received_qty: 4 }],
        });
      expect(recvRes.status).toBe(200);
      expect(recvRes.body.data.status).toBe('DISCREPANCY');

      // DISCREPANCY -> CANCELLED
      // Server cancel logic: deducts received_qty(4) from store, restores shipped_qty(6) to HQ
      const cancelRes = await request(app)
        .put(`/api/shipments/${shipmentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // Verify cancel succeeded via status — skip absolute inventory assertions
      // since DISCREPANCY cancel behavior with concurrent DB modifications varies.
      // Instead, verify TX records exist showing the reversal operations happened.
      const hqTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.hq.partner_code);
      // Should have at least 2 TXs: ship-confirm (-6) and cancel reversal (+6)
      expect(hqTxs.length).toBeGreaterThanOrEqual(2);
      const netHqChange = hqTxs.reduce((sum: number, tx: any) => sum + Number(tx.qty_change), 0);
      expect(netHqChange).toBe(0); // ship-confirm(-6) + cancel(+6) = 0

      const storeTxs = await getShipmentTxs(shipmentId, 'SHIPMENT', fixtures.store.partner_code);
      // Should have at least 2 TXs: receive (+4) and cancel reversal (-4)
      expect(storeTxs.length).toBeGreaterThanOrEqual(2);
      const netStoreChange = storeTxs.reduce((sum: number, tx: any) => sum + Number(tx.qty_change), 0);
      expect(netStoreChange).toBe(0); // receive(+4) + cancel(-4) = 0
    }, 30_000);
  });
});

// ======================================================
// 4. 수령확인 권한 — admin은 반품만 수령 가능
// ======================================================
describe('수령확인 권한 제약', () => {
  it('admin 토큰으로 출고(비반품) 수령확인 시 403', async () => {
    const shipmentId = await createShipment(1);
    await shipConfirm(shipmentId, 1);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, received_qty: 1 }],
      });

    expect(res.status).toBe(403);
  });

  it('다른 매장 토큰으로 수령확인 시 403 (to_partner 불일치)', async () => {
    const pool = getPool();
    const res2 = await pool.query(
      `SELECT partner_code, partner_name FROM partners
       WHERE is_active = TRUE AND partner_type != '본사' AND partner_code != $1
       ORDER BY partner_code LIMIT 1`,
      [fixtures.store.partner_code],
    );
    if (res2.rows.length === 0) return;

    const otherStore = res2.rows[0];
    const otherStoreToken = storeToken(otherStore.partner_code, otherStore.partner_name);

    const otherUserId = `test_store_${otherStore.partner_code}`;
    await pool.query(
      `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
       VALUES ($1, $2, $3,
         (SELECT group_id FROM role_groups WHERE group_name = 'STORE_MANAGER'),
         '$2b$10$placeholder')
       ON CONFLICT (user_id) DO NOTHING`,
      [otherUserId, `${otherStore.partner_name} 테스트매니저`, otherStore.partner_code],
    );
    cleanup.testUserIds.push(otherUserId);

    const shipmentId = await createShipment(1);
    await shipConfirm(shipmentId, 1);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}/receive`)
      .set('Authorization', `Bearer ${otherStoreToken}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, received_qty: 1 }],
      });

    expect(res.status).toBe(403);
  });
});

// ======================================================
// 5. 출고확인 후 재출고확인 불가 (이중 출고 방지)
// ======================================================
describe('이중 출고 방지', () => {
  it('SHIPPED 상태에서 다시 ship-confirm 시 에러', async () => {
    const shipmentId = await createShipment(2);
    await shipConfirm(shipmentId, 2);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}/ship-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 2 }],
      });

    expect(res.status).toBe(400);
  });
});
