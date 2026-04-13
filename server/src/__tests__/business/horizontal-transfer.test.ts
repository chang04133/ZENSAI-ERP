/**
 * 수평이동 (매장↔매장) 전체 비즈니스 로직 테스트
 *
 * 테스트 항목:
 * 1. 생성 검증: 역할 제한, 같은 매장 차단, 본사 참여 차단, 필수값 누락
 * 2. 전체 플로우: PENDING → SHIPPED → RECEIVED (재고 정합성)
 * 3. 수량불일치: DISCREPANCY 감지 + 관리자 강제 완료 (LOSS 기록)
 * 4. 취소 및 롤백: PENDING/SHIPPED/RECEIVED 각 상태에서 취소 → 재고 복구
 * 5. 권한 검증: 출발매장만 출고확인, 도착매장만 수령확인, 타매장 차단
 * 6. 수량 초과 차단: shipped_qty > request_qty, received_qty > shipped_qty
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, hqManagerToken, storeToken, storeStaffToken, getTestFixtures, settleAndResetInventory } from '../helpers';

const cleanup: { shipmentIds: number[]; testUserIds: string[] } = { shipmentIds: [], testUserIds: [] };

let token: string;       // ADMIN
let hqToken: string;     // HQ_MANAGER
let storeAToken: string; // StoreA STORE_MANAGER
let storeBToken: string; // StoreB STORE_MANAGER
let storeCToken: string; // StoreC STORE_MANAGER (제3 매장 — 권한 테스트용)
let staffAToken: string; // StoreA STORE_STAFF
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;
let storeB: { partner_code: string; partner_name: string };
let storeC: { partner_code: string; partner_name: string } | null;

beforeAll(async () => {
  token = adminToken();
  hqToken = hqManagerToken();
  fixtures = await getTestFixtures();

  const pool = getPool();

  // 2번째, 3번째 매장 조회
  const res = await pool.query(
    `SELECT partner_code, partner_name FROM partners
     WHERE is_active = TRUE AND partner_type != '본사'
       AND partner_code != $1
     ORDER BY partner_code LIMIT 2`,
    [fixtures.store.partner_code],
  );
  storeB = res.rows[0];
  storeC = res.rows[1] || null;
  if (!storeB) throw new Error('수평이동 테스트용 2번째 매장이 없습니다');

  // 테스트 유저 INSERT
  const users: [string, string, string][] = [
    [`test_store_${fixtures.store.partner_code}`, fixtures.store.partner_code, fixtures.store.partner_name],
    [`test_store_${storeB.partner_code}`, storeB.partner_code, storeB.partner_name],
  ];
  if (storeC) {
    users.push([`test_store_${storeC.partner_code}`, storeC.partner_code, storeC.partner_name]);
  }
  for (const [userId, pc, pn] of users) {
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

  // STORE_STAFF용 유저도 INSERT
  const staffUserId = `test_staff_${fixtures.store.partner_code}`;
  await pool.query(
    `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
     VALUES ($1, $2, $3,
       (SELECT group_id FROM role_groups WHERE group_name = 'STORE_STAFF'),
       '$2b$10$placeholder')
     ON CONFLICT (user_id) DO NOTHING`,
    [staffUserId, `${fixtures.store.partner_name} 테스트직원`, fixtures.store.partner_code],
  );
  cleanup.testUserIds.push(staffUserId);

  storeAToken = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
  storeBToken = storeToken(storeB.partner_code, storeB.partner_name);
  storeCToken = storeC ? storeToken(storeC.partner_code, storeC.partner_name) : storeAToken;
  staffAToken = storeStaffToken(fixtures.store.partner_code, fixtures.store.partner_name);

  // 재고 초기화
  const inventoryEntries = [
    { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
  ];
  if (storeC) {
    inventoryEntries.push({ partnerCode: storeC.partner_code, variantId: fixtures.variant.variant_id, qty: 5 });
  }
  await settleAndResetInventory(inventoryEntries);
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of cleanup.shipmentIds) {
      await client.query("DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ('TRANSFER', 'LOSS')", [id]);
      await client.query('DELETE FROM shipment_request_items WHERE request_id = $1', [id]);
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [id]);
    }
    // FK 제약 해결: shipment_requests.requested_by + approved_by가 참조하는 유저
    for (const uid of cleanup.testUserIds) {
      await client.query("UPDATE shipment_requests SET requested_by = 'admin' WHERE requested_by = $1", [uid]);
      await client.query("UPDATE shipment_requests SET approved_by = 'admin' WHERE approved_by = $1", [uid]);
      await client.query('DELETE FROM users WHERE user_id = $1', [uid]);
    }
    // 재고 복원
    for (const pc of [fixtures.store.partner_code, storeB.partner_code, storeC?.partner_code].filter(Boolean)) {
      await client.query(
        'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
        [pc, fixtures.variant.variant_id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('수평이동 테스트 정리 실패:', e);
  } finally {
    client.release();
  }
});

/** 수평이동 의뢰 생성 헬퍼 */
async function createTransfer(
  fromToken: string,
  fromPartner: string,
  toPartner: string,
  qty: number,
) {
  const res = await request(app)
    .post('/api/shipments')
    .set('Authorization', `Bearer ${fromToken}`)
    .send({
      request_type: '수평이동',
      from_partner: fromPartner,
      to_partner: toPartner,
      items: [{ variant_id: fixtures.variant.variant_id, request_qty: qty }],
    });
  if (res.status === 201) cleanup.shipmentIds.push(res.body.data.request_id);
  return res;
}

/** 재고 조회 헬퍼 */
async function getStock(partnerCode: string): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, fixtures.variant.variant_id],
  );
  return r.rows[0]?.qty ?? 0;
}

/** 트랜잭션 레코드 조회 */
async function getTxRecords(refId: number, txType: string, partnerCode: string) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id ASC',
    [refId, txType, partnerCode, fixtures.variant.variant_id],
  );
  return r.rows;
}

// ═══════════════════════════════════════════
// 1. 생성 검증
// ═══════════════════════════════════════════
describe('수평이동 — 생성 검증', () => {
  it('STORE_MANAGER가 정상적으로 수평이동 생성 → 201, PENDING', async () => {
    const res = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 2);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.request_type).toBe('수평이동');
  });

  it('ADMIN은 수평이동 생성 불가 → 403', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('매장매니저만');
  });

  it('HQ_MANAGER는 수평이동 생성 불가 → 403', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${hqToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });
    expect(res.status).toBe(403);
  });

  it('STORE_STAFF는 수평이동 생성 불가 → 403', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${staffAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });
    expect([401, 403]).toContain(res.status);
  });

  it('같은 매장으로 수평이동 → 400', async () => {
    const res = await createTransfer(storeAToken, fixtures.store.partner_code, fixtures.store.partner_code, 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('같은 매장');
  });

  it('본사를 from_partner로 수평이동 → 400', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.hq.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('본사');
  });

  it('본사를 to_partner로 수평이동 → 400', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: fixtures.hq.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('본사');
  });

  it('to_partner 누락 시 → 400', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('도착');
  });

  it('품목 없이 수평이동 → 400', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('품목');
  });

  it('수량 0 이하 → 400', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        request_type: '수평이동',
        from_partner: fixtures.store.partner_code,
        to_partner: storeB.partner_code,
        items: [{ variant_id: fixtures.variant.variant_id, request_qty: 0 }],
      });
    expect(res.status).toBe(400);
  });

  it('PENDING 상태에서는 재고 변동 없음', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    ]);
    const beforeQty = await getStock(fixtures.store.partner_code);
    const res = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 3);
    expect(res.status).toBe(201);
    const afterQty = await getStock(fixtures.store.partner_code);
    expect(afterQty).toBe(beforeQty);
  });
});

// ═══════════════════════════════════════════
// 2. 전체 플로우: PENDING → SHIPPED → RECEIVED
// ═══════════════════════════════════════════
describe('수평이동 — 전체 플로우', () => {
  let transferId: number;

  it('생성 → PENDING', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    const res = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 5);
    expect(res.status).toBe(201);
    transferId = res.body.data.request_id;
  });

  it('출고확인(ship-confirm) → SHIPPED, 출발매장 재고 -5', async () => {
    const beforeQty = await getStock(fixtures.store.partner_code);

    const res = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 5 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SHIPPED');

    const afterQty = await getStock(fixtures.store.partner_code);
    expect(afterQty).toBe(beforeQty - 5);

    // TRANSFER 트랜잭션 확인
    const txs = await getTxRecords(transferId, 'TRANSFER', fixtures.store.partner_code);
    expect(txs.length).toBe(1);
    expect(Number(txs[0].qty_change)).toBe(-5);
  });

  it('수령확인(receive) → RECEIVED, 도착매장 재고 +5', async () => {
    const beforeQty = await getStock(storeB.partner_code);

    const res = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 5 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');

    // autoFulfillPreorders 대기
    await new Promise(r => setTimeout(r, 300));

    const afterQty = await getStock(storeB.partner_code);
    expect(afterQty).toBe(beforeQty + 5);

    // TRANSFER 트랜잭션 확인
    const txs = await getTxRecords(transferId, 'TRANSFER', storeB.partner_code);
    expect(txs.length).toBe(1);
    expect(Number(txs[0].qty_change)).toBe(5);
  });
});

// ═══════════════════════════════════════════
// 3. 수량불일치 (DISCREPANCY) + 관리자 강제 완료
// ═══════════════════════════════════════════
describe('수평이동 — 수량불일치(DISCREPANCY)', () => {
  let transferId: number;

  it('출고 5개, 수령 3개 → DISCREPANCY', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    // 생성
    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 5);
    expect(createRes.status).toBe(201);
    transferId = createRes.body.data.request_id;

    // 출고확인 (5개)
    await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 5 }] });

    // 수령확인 (3개 — 불일치)
    const recvRes = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 3 }] });

    expect(recvRes.status).toBe(200);
    expect(recvRes.body.data.status).toBe('DISCREPANCY');

    await new Promise(r => setTimeout(r, 300));

    // 도착매장 재고는 +3만 반영
    const txs = await getTxRecords(transferId, 'TRANSFER', storeB.partner_code);
    expect(txs.length).toBe(1);
    expect(Number(txs[0].qty_change)).toBe(3);
  });

  it('관리자가 DISCREPANCY → RECEIVED 강제 완료 → LOSS 트랜잭션 기록', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');

    // LOSS 트랜잭션 확인 (유실 2개 = 5출고 - 3수령)
    const pool = getPool();
    const lossResult = await pool.query(
      `SELECT qty_change, memo, loss_type FROM inventory_transactions
       WHERE ref_id = $1 AND tx_type = 'LOSS' AND partner_code = $2`,
      [transferId, fixtures.store.partner_code],
    );
    expect(lossResult.rows.length).toBe(1);
    expect(Number(lossResult.rows[0].qty_change)).toBe(-2);
    expect(lossResult.rows[0].loss_type).toBe('LOST');
  });
});

// ═══════════════════════════════════════════
// 4. 취소 및 재고 롤백
// ═══════════════════════════════════════════
describe('수평이동 — 취소 및 재고 롤백', () => {
  it('PENDING 상태 취소 → 재고 변동 없이 CANCELLED', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 3);
    const transferId = createRes.body.data.request_id;

    const beforeQty = await getStock(fixtures.store.partner_code);

    const cancelRes = await request(app)
      .put(`/api/shipments/${transferId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    const afterQty = await getStock(fixtures.store.partner_code);
    expect(afterQty).toBe(beforeQty); // 재고 변동 없음
  });

  it('SHIPPED 상태 취소 → 출발매장 재고 복구', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    // 생성 + 출고확인
    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 4);
    const transferId = createRes.body.data.request_id;

    await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 4 }] });

    // 출발매장 재고: 30 - 4 = 26
    expect(await getStock(fixtures.store.partner_code)).toBe(26);

    // 취소
    const cancelRes = await request(app)
      .put(`/api/shipments/${transferId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });

    expect(cancelRes.status).toBe(200);

    // 출발매장 재고 복구: 26 + 4 = 30
    expect(await getStock(fixtures.store.partner_code)).toBe(30);

    // 롤백 TRANSFER 트랜잭션 확인
    const txs = await getTxRecords(transferId, 'TRANSFER', fixtures.store.partner_code);
    expect(txs.length).toBe(2); // -4 (출고) + +4 (롤백)
    expect(Number(txs[0].qty_change)).toBe(-4);
    expect(Number(txs[1].qty_change)).toBe(4);
  });

  it('RECEIVED 상태 취소 → 양쪽 매장 재고 모두 롤백', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    // 생성 + 출고확인 + 수령확인
    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 3);
    const transferId = createRes.body.data.request_id;

    await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 3 }] });

    await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 3 }] });

    await new Promise(r => setTimeout(r, 300));

    // 출발매장: 30-3=27, 도착매장: 10+3=13
    expect(await getStock(fixtures.store.partner_code)).toBe(27);
    expect(await getStock(storeB.partner_code)).toBe(13);

    // 취소
    const cancelRes = await request(app)
      .put(`/api/shipments/${transferId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });

    expect(cancelRes.status).toBe(200);

    // 양쪽 재고 복구
    expect(await getStock(fixtures.store.partner_code)).toBe(30);
    expect(await getStock(storeB.partner_code)).toBe(10);
  });
});

// ═══════════════════════════════════════════
// 5. 권한 검증: 출고확인/수령확인 접근 제어
// ═══════════════════════════════════════════
describe('수평이동 — 권한 검증', () => {
  let transferId: number;

  beforeAll(async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 2);
    transferId = createRes.body.data.request_id;
  });

  it('도착매장(StoreB)이 출고확인 시도 → 403', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 2 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('출발 거래처');
  });

  it('제3매장(StoreC)이 출고확인 시도 → 403', async () => {
    if (!storeC) return; // 매장 3개 미만이면 스킵
    const res = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeCToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 2 }] });

    expect(res.status).toBe(403);
  });

  it('출발매장(StoreA)이 출고확인 → 성공', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SHIPPED');
  });

  it('출발매장(StoreA)이 수령확인 시도 → 403', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 2 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('도착 거래처');
  });

  it('ADMIN이 수평이동 수령확인 시도 → 403 (반품만 가능)', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 2 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('도착 거래처');
  });

  it('도착매장(StoreB)이 수령확인 → 성공', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');
    await new Promise(r => setTimeout(r, 300));
  });
});

// ═══════════════════════════════════════════
// 6. 수량 초과 차단
// ═══════════════════════════════════════════
describe('수평이동 — 수량 초과 차단', () => {
  let transferId: number;

  beforeAll(async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 3);
    transferId = createRes.body.data.request_id;
  });

  it('shipped_qty > request_qty → 에러', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 10 }] }); // 10 > 3

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('초과');
  });

  it('shipped_qty 음수 → 에러', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: -1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('0 이상');
  });

  it('정상 shipped_qty → 성공 후 received_qty 초과 차단', async () => {
    // 정상 출고확인
    const shipRes = await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 3 }] });
    expect(shipRes.status).toBe(200);

    // received_qty > shipped_qty (5 > 3)
    const recvRes = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 5 }] });

    expect(recvRes.status).toBe(400);
    expect(recvRes.body.error).toContain('초과');
  });

  it('received_qty 음수 → 에러', async () => {
    const res = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: -1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('0 이상');
  });
});

// ═══════════════════════════════════════════
// 7. 상태 전환 제약
// ═══════════════════════════════════════════
describe('수평이동 — 상태 전환 제약', () => {
  it('PENDING에서 직접 RECEIVED 전환 불가', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 1);
    const id = createRes.body.data.request_id;

    const res = await request(app)
      .put(`/api/shipments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' });

    // 403 또는 400 (ADMIN이라도 수평이동 상태 직접 전환 차단)
    expect([400, 403]).toContain(res.status);
  });

  it('SHIPPED에서 직접 RECEIVED 전환 불가 (receive API 사용 필수)', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 1);
    const id = createRes.body.data.request_id;

    // 출고확인
    await request(app)
      .put(`/api/shipments/${id}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 1 }] });

    // 직접 상태 변경 시도
    const res = await request(app)
      .put(`/api/shipments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'RECEIVED' });

    // 403 또는 400 (직접 상태 변경 차단)
    expect([400, 403]).toContain(res.status);
  });

  it('CANCELLED에서는 어떤 상태로도 전환 불가', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 1);
    const id = createRes.body.data.request_id;

    // 취소
    await request(app)
      .put(`/api/shipments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });

    // CANCELLED → PENDING 시도
    const res = await request(app)
      .put(`/api/shipments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING' });

    expect(res.status).toBe(400);
  });

  it('이미 SHIPPED인 출고에 다시 ship-confirm → 에러', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
    ]);

    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 1);
    const id = createRes.body.data.request_id;

    // 첫 번째 출고확인
    await request(app)
      .put(`/api/shipments/${id}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 1 }] });

    // 두 번째 출고확인 시도
    const res = await request(app)
      .put(`/api/shipments/${id}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PENDING 또는 APPROVED');
  });
});

// ═══════════════════════════════════════════
// 8. DISCREPANCY 재수령 (수량 정정)
// ═══════════════════════════════════════════
describe('수평이동 — DISCREPANCY 재수령', () => {
  it('DISCREPANCY 상태에서 수령수량 정정 → 재고 delta만 반영', async () => {
    await settleAndResetInventory([
      { partnerCode: fixtures.store.partner_code, variantId: fixtures.variant.variant_id, qty: 30 },
      { partnerCode: storeB.partner_code, variantId: fixtures.variant.variant_id, qty: 10 },
    ]);

    // 생성 + 출고확인 (5개)
    const createRes = await createTransfer(storeAToken, fixtures.store.partner_code, storeB.partner_code, 5);
    const transferId = createRes.body.data.request_id;

    await request(app)
      .put(`/api/shipments/${transferId}/ship-confirm`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, shipped_qty: 5 }] });

    // 1차 수령 (3개 → DISCREPANCY)
    await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 3 }] });

    await new Promise(r => setTimeout(r, 300));
    const afterFirst = await getStock(storeB.partner_code);
    expect(afterFirst).toBe(13); // 10 + 3

    // 2차 수령 (5개로 정정 → RECEIVED)
    const reRecvRes = await request(app)
      .put(`/api/shipments/${transferId}/receive`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ variant_id: fixtures.variant.variant_id, received_qty: 5 }] });

    expect(reRecvRes.status).toBe(200);
    expect(reRecvRes.body.data.status).toBe('RECEIVED');

    await new Promise(r => setTimeout(r, 300));

    // 도착매장 재고: 13 + (5-3) = 15 (delta +2만 반영)
    const afterSecond = await getStock(storeB.partner_code);
    expect(afterSecond).toBe(15);
  });
});
