/**
 * 출고/수평이동 핵심 플로우 통합 테스트
 *
 * 테스트 항목:
 * 1. 출고: 생성 → 출고확인(재고차감) → 수령확인(재고증가) → 수량불일치
 * 2. 수평이동: 생성 → 병합 안됨 확인 → 출고확인 → 수령확인
 * 3. 취소: SHIPPED 상태 취소 → 재고 복구
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getPool } from '../db/connection';
import { adminToken, storeToken, getTestFixtures, settleAndResetInventory } from './helpers';
import { signAccessToken } from '../auth/jwt';

const cleanup: { shipmentIds: number[]; testUserIds: string[] } = { shipmentIds: [], testUserIds: [] };

let token: string;
let storeAToken: string;
let storeBToken: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;
let storeB: { partner_code: string; partner_name: string };

beforeAll(async () => {
  token = adminToken();
  fixtures = await getTestFixtures();

  // 2번째 매장 조회 (수평이동 테스트용)
  const pool = getPool();
  const res = await pool.query(
    `SELECT partner_code, partner_name FROM partners
     WHERE is_active = TRUE AND partner_type != '본사'
       AND partner_code != $1
     ORDER BY partner_code LIMIT 1`,
    [fixtures.store.partner_code],
  );
  storeB = res.rows[0];
  if (!storeB) throw new Error('수평이동 테스트용 2번째 매장이 없습니다');

  // 테스트 유저 INSERT (shipment_requests.requested_by FK 제약 대응)
  const storeAUserId = `test_store_${fixtures.store.partner_code}`;
  const storeBUserId = `test_store_${storeB.partner_code}`;
  for (const [userId, pc, pn] of [
    [storeAUserId, fixtures.store.partner_code, fixtures.store.partner_name],
    [storeBUserId, storeB.partner_code, storeB.partner_name],
  ] as [string, string, string][]) {
    await pool.query(
      `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
       VALUES ($1, $2, $3,
         (SELECT group_id FROM role_groups WHERE group_name = 'STORE_MANAGER'),
         '$2b$10$placeholder')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${pn} 테스트매니저`, pc],
    );
    cleanup.testUserIds.push(userId);
  }

  storeAToken = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
  storeBToken = storeToken(storeB.partner_code, storeB.partner_name);

  // Settle background ops + set known inventory
  await settleAndResetInventory([
    { partnerCode: fixtures.hq.partner_code, variantId: fixtures.variant.variant_id, qty: 50 },
    { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 20 },
    { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 5 },
  ]);
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of cleanup.shipmentIds) {
      await client.query('DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2, $3, $4)', [id, 'SHIPMENT', 'TRANSFER', 'RETURN']);
      await client.query('DELETE FROM shipment_request_items WHERE request_id = $1', [id]);
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [id]);
    }
    // 테스트 유저 정리
    for (const uid of cleanup.testUserIds) {
      await client.query('DELETE FROM users WHERE user_id = $1', [uid]);
    }
    // Reset inventory to known values for subsequent test files
    await client.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.hq.partner_code, fixtures.variant.variant_id],
    );
    await client.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    if (storeB) {
      await client.query(
        'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
        [storeB.partner_code, fixtures.variant.variant_id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('정리 실패:', e);
  } finally {
    client.release();
  }
});

async function getTxRecord(refId: number, txType: string, partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id DESC LIMIT 1',
    [refId, txType, partnerCode, variantId],
  );
  return r.rows[0] || null;
}

async function getTxRecords(refId: number, txType: string, partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id ASC',
    [refId, txType, partnerCode, variantId],
  );
  return r.rows;
}

// ═══════════════════════════════════════════
// 1. 출고 (본사→매장) 전체 플로우
// ═══════════════════════════════════════════
describe('출고 플로우 (본사→매장)', () => {
  let shipmentId: number;

  it('출고 의뢰 생성 → PENDING, 재고 변동 없음', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        request_type: '출고',
        from_partner: fixtures.hq.partner_code,
        to_partner: fixtures.store.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 3 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    shipmentId = res.body.data.request_id;
    cleanup.shipmentIds.push(shipmentId);

    // PENDING doesn't create any TXs — verify no SHIPMENT TX exists for this shipment
    const tx = await getTxRecord(shipmentId, 'SHIPMENT', fixtures.hq.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeNull();
  });

  it('출고확인 → SHIPPED, 출발지 재고 차감', async () => {
    // Re-settle inventory before ship-confirm to combat any in-flight autoFulfillPreorders
    await settleAndResetInventory([
      { partnerCode: fixtures.hq.partner_code, variantId: fixtures.variant.variant_id, qty: 50 },
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 20 },
    ]);

    const res = await request(app)
      .put(`/api/shipments/${shipmentId}/ship-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 3 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SHIPPED');

    // Check SHIPMENT TX for from_partner (본사): qty_change = -3
    const tx = await getTxRecord(shipmentId, 'SHIPMENT', fixtures.hq.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(-3);

    // No TX for to_partner yet (not received)
    const inTx = await getTxRecord(shipmentId, 'SHIPMENT', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(inTx).toBeNull();
  });

  it('수령확인 (수량 일치) → RECEIVED, 도착지 재고 증가', async () => {
    // Re-settle inventory before receive to combat prior test's autoFulfillPreorders
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 20 },
    ]);

    // 수령확인은 도착 거래처(매장)만 가능 — admin은 반품 수령만 가능
    const res = await request(app)
      .put(`/api/shipments/${shipmentId}/receive`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        items: [{ variant_id: fixtures.variant.variant_id, received_qty: 3 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');

    // Wait for autoFulfillPreorders to settle
    await new Promise(r => setTimeout(r, 500));

    // Check SHIPMENT TX for to_partner (매장): qty_change = +3
    const tx = await getTxRecord(shipmentId, 'SHIPMENT', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(3);
  });
});

// ═══════════════════════════════════════════
// 2. 수량불일치 플로우
// ═══════════════════════════════════════════
describe('수량불일치 플로우', () => {
  let shipmentId: number;

  it('수령 시 수량 다르면 → DISCREPANCY', async () => {
    // 출고 생성 + 확인
    const createRes = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        request_type: '출고',
        from_partner: fixtures.hq.partner_code,
        to_partner: fixtures.store.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 5 }],
      });
    shipmentId = createRes.body.data.request_id;
    cleanup.shipmentIds.push(shipmentId);

    await request(app)
      .put(`/api/shipments/${shipmentId}/ship-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 5 }] });

    // 수령 시 수량 불일치 (5개 출고, 4개 수령) — 도착 매장 토큰 사용
    const recvRes = await request(app)
      .put(`/api/shipments/${shipmentId}/receive`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 4 }] });

    expect(recvRes.status).toBe(200);
    expect(recvRes.body.data.status).toBe('DISCREPANCY');
  });
});

// ═══════════════════════════════════════════
// 3. 수평이동 — 병합 비활성화 확인
// ═══════════════════════════════════════════
describe('수평이동 — 별도 의뢰 생성', () => {
  let shipment1Id: number;
  let shipment2Id: number;

  it('같은 방향 수평이동 2건 → 별도 의뢰 (병합 안됨)', async () => {
    const res1 = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });

    expect(res1.status).toBe(201);
    shipment1Id = res1.body.data.request_id;
    cleanup.shipmentIds.push(shipment1Id);

    const res2 = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 2 }],
      });

    expect(res2.status).toBe(201);
    shipment2Id = res2.body.data.request_id;
    cleanup.shipmentIds.push(shipment2Id);

    // 서로 다른 의뢰여야 함
    expect(shipment2Id).not.toBe(shipment1Id);
  });

  it('수평이동 출고확인 → 출발 매장 재고 차감', async () => {
    // Re-settle inventory before ship-confirm to combat any in-flight autoFulfillPreorders
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 20 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 5 },
    ]);

    const res = await request(app)
      .put(`/api/shipments/${shipment1Id}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 1 }] });

    expect(res.status).toBe(200);

    // Check TRANSFER TX for from_partner (storeA): qty_change = -1
    const tx = await getTxRecord(shipment1Id, 'TRANSFER', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(-1);
  });

  it('수평이동 수령확인 → 도착 매장 재고 증가', async () => {
    // Re-settle inventory before receive to combat prior test's autoFulfillPreorders
    await settleAndResetInventory([
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 5 },
    ]);

    // 도착 매장(storeB) 토큰으로 수령 — admin은 반품 수령만 가능
    const res = await request(app)
      .put(`/api/shipments/${shipment1Id}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 1 }] });

    if (res.status !== 200) console.log('receive error:', res.body);
    expect(res.status).toBe(200);

    // Wait for autoFulfillPreorders to settle
    await new Promise(r => setTimeout(r, 500));

    // Check TRANSFER TX for to_partner (storeB): qty_change = +1
    const tx = await getTxRecord(shipment1Id, 'TRANSFER', storeB.partner_code, fixtures.variant.variant_id);
    expect(tx).not.toBeNull();
    expect(Number(tx.qty_change)).toBe(1);
  });
});

// ═══════════════════════════════════════════
// 4. 취소 → 재고 복구
// ═══════════════════════════════════════════
describe('출고 취소 → 재고 복구', () => {
  let shipmentId: number;

  it('SHIPPED 상태 취소 → 출발지 재고 복구', async () => {
    // Re-settle inventory before this test to combat any in-flight autoFulfillPreorders
    await settleAndResetInventory([
      { partnerCode: fixtures.hq.partner_code, variantId: fixtures.variant.variant_id, qty: 50 },
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 20 },
    ]);

    // 생성 + 출고확인
    const createRes = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        request_type: '출고',
        from_partner: fixtures.hq.partner_code,
        to_partner: fixtures.store.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 2 }],
      });
    shipmentId = createRes.body.data.request_id;
    cleanup.shipmentIds.push(shipmentId);

    await request(app)
      .put(`/api/shipments/${shipmentId}/ship-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 2 }] });

    // Verify SHIPMENT TX for the ship-confirm: qty_change = -2
    const shipOutTx = await getTxRecord(shipmentId, 'SHIPMENT', fixtures.hq.partner_code, fixtures.variant.variant_id);
    expect(shipOutTx).not.toBeNull();
    expect(Number(shipOutTx.qty_change)).toBe(-2);

    // 취소
    const cancelRes = await request(app)
      .put(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });

    expect(cancelRes.status).toBe(200);

    // Check that cancel created a reversal SHIPMENT TX: qty_change = +2
    const allTxs = await getTxRecords(shipmentId, 'SHIPMENT', fixtures.hq.partner_code, fixtures.variant.variant_id);
    expect(allTxs.length).toBeGreaterThanOrEqual(2);
    // The first TX is the original ship-out (-2), the last is the reversal (+2)
    expect(Number(allTxs[0].qty_change)).toBe(-2);
    expect(Number(allTxs[allTxs.length - 1].qty_change)).toBe(2);
  });
});

// ═══════════════════════════════════════════
// 5. 권한 테스트
// ═══════════════════════════════════════════
describe('출고 권한 테스트', () => {
  it('토큰 없이 출고 생성 → 401', async () => {
    const res = await request(app).post('/api/shipments').send({ request_type: '출고' });
    expect(res.status).toBe(401);
  });

  it('STORE_STAFF는 출고 생성 불가 → 403', async () => {
    const staffToken = signAccessToken({
      userId: 'test_staff', userName: '직원', role: 'STORE_STAFF',
      partnerCode: fixtures.store.partner_code, partnerName: fixtures.store.partner_name,
    } as any);

    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        request_type: '출고',
        from_partner: fixtures.hq.partner_code,
        to_partner: fixtures.store.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });

    // 403 또는 출고 생성 제한에 따라 다를 수 있음
    expect([401, 403]).toContain(res.status);
  });
});
