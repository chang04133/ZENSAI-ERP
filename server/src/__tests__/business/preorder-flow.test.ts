/**
 * 예약판매(Preorder) 비즈니스 플로우 통합 테스트
 *
 * 예약판매는 재고 부족 시 preorders 테이블에 '대기' 상태로 등록되며,
 * 재고가 확보되면 수동(fulfill) 또는 자동(출고 수령 시 autoFulfillPreorders)으로
 * 실매출로 전환(해소)된다.
 *
 * 1. GET  /api/sales/preorders          - 미처리 예약판매 목록 조회
 * 2. POST /api/sales/preorders/:id/fulfill - 수동 해소 (재고 차감 + 실매출 생성)
 * 3. DELETE /api/sales/preorders/:id     - 대기 상태 예약판매 삭제
 * 4. 해소 시 재고 부족 거부
 * 5. 중복 해소 방지 (이미 해소된 건)
 * 6. 인증/권한 검증
 *
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, storeStaffToken, getTestFixtures } from '../helpers';

/** inventory_transactions 레코드 조회 헬퍼 */
async function getTxRecord(refId: number, txType: string, partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id DESC LIMIT 1',
    [refId, txType, partnerCode, variantId],
  );
  return r.rows[0] || null;
}

// -- Cleanup tracking --
const cleanup: {
  preorderIds: number[];
  saleIds: number[];
} = {
  preorderIds: [],
  saleIds: [],
};

let admin: string;
let storeMgr: string;
let storeStaff: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;
const KNOWN_QTY = 50;

const today = new Date().toISOString().slice(0, 10);

// -- Inventory helper --
async function getInventoryQty(partnerCode: string, variantId: number): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, variantId],
  );
  return r.rows[0] ? Number(r.rows[0].qty) : 0;
}

// -- Preorder creation helper (direct DB insert, bypasses API) --
async function createPreorder(
  overrides: Partial<{
    partner_code: string;
    variant_id: number;
    qty: number;
    unit_price: number;
    total_price: number;
    status: string;
    memo: string;
    customer_id: number | null;
    fulfilled_sale_id: number | null;
  }> = {},
): Promise<number> {
  const pool = getPool();
  const pc = overrides.partner_code || fixtures.store.partner_code;
  const vid = overrides.variant_id || fixtures.variant.variant_id;
  const qty = overrides.qty || 2;
  const unitPrice = overrides.unit_price || Number(fixtures.variant.base_price) || 50000;
  const totalPrice = overrides.total_price || qty * unitPrice;
  const status = overrides.status || '대기';
  const memo = overrides.memo || '테스트 예약판매';

  const result = await pool.query(
    `INSERT INTO preorders (preorder_date, partner_code, variant_id, qty, unit_price, total_price, status, memo, customer_id, fulfilled_sale_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING preorder_id`,
    [today, pc, vid, qty, unitPrice, totalPrice, status, memo, overrides.customer_id || null, overrides.fulfilled_sale_id || null],
  );
  const preorderId = result.rows[0].preorder_id;
  cleanup.preorderIds.push(preorderId);
  return preorderId;
}

// -- Setup / Teardown --

beforeAll(async () => {
  admin = adminToken();
  fixtures = await getTestFixtures();
  storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
  storeStaff = storeStaffToken(fixtures.store.partner_code, fixtures.store.partner_name);
  const pool = getPool();
  await pool.query(
    "DELETE FROM preorders WHERE partner_code = $1 AND variant_id = $2 AND status = '대기'",
    [fixtures.store.partner_code, fixtures.variant.variant_id],
  );
  await pool.query(
    `INSERT INTO inventory (partner_code, variant_id, qty) VALUES ($1, $2, $3)
     ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = $3, updated_at = NOW()`,
    [fixtures.store.partner_code, fixtures.variant.variant_id, KNOWN_QTY],
  );
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete preorder records FIRST (FK: preorders.fulfilled_sale_id -> sales.sale_id)
    for (const preorderId of cleanup.preorderIds) {
      await client.query('DELETE FROM preorders WHERE preorder_id = $1', [preorderId]);
    }

    // Delete sale records created by fulfillment (reverse order)
    for (const saleId of [...cleanup.saleIds].reverse()) {
      await client.query('DELETE FROM customer_purchases WHERE sale_id = $1', [saleId]);
      await client.query(
        `DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ('SALE', 'SALE_DELETE', 'SALE_EDIT')`,
        [saleId],
      );
      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
    }

    // Restore inventory to known value (self-contained)
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [KNOWN_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('테스트 데이터 정리 실패:', e);
  } finally {
    client.release();
  }
});

// =============================================================
// 1. GET /api/sales/preorders - 미처리 예약판매 목록 조회
// =============================================================
describe('예약판매 목록 조회 (GET /api/sales/preorders)', () => {
  let testPreorderId: number;

  beforeAll(async () => {
    testPreorderId = await createPreorder({ qty: 3, memo: '목록조회 테스트' });
  });

  it('ADMIN: 전체 대기 예약판매 목록 조회 성공', async () => {
    const res = await request(app)
      .get('/api/sales/preorders')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Our test preorder should be in the list
    const found = res.body.data.find((po: any) => Number(po.preorder_id) === Number(testPreorderId));
    expect(found).toBeTruthy();
    expect(found.status).toBe('대기');
    expect(Number(found.qty)).toBe(3);
    // Should include joined product info
    expect(found).toHaveProperty('sku');
    expect(found).toHaveProperty('product_name');
    expect(found).toHaveProperty('partner_name');
    expect(found).toHaveProperty('current_stock');
  });

  it('STORE_MANAGER: 자기 매장 예약판매만 조회', async () => {
    const res = await request(app)
      .get('/api/sales/preorders')
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // All returned preorders should belong to the store
    for (const po of res.body.data) {
      expect(po.partner_code).toBe(fixtures.store.partner_code);
    }
  });

  it('STORE_STAFF: 자기 매장 예약판매만 조회', async () => {
    const res = await request(app)
      .get('/api/sales/preorders')
      .set('Authorization', `Bearer ${storeStaff}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    for (const po of res.body.data) {
      expect(po.partner_code).toBe(fixtures.store.partner_code);
    }
  });

  it('해소 완료된 예약판매는 목록에 미포함', async () => {
    const fulfilledId = await createPreorder({ qty: 1, status: '해소', memo: '해소완료 테스트' });

    const res = await request(app)
      .get('/api/sales/preorders')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((po: any) => Number(po.preorder_id) === Number(fulfilledId));
    expect(found).toBeFalsy();
  });

  it('토큰 없이 조회 시 401', async () => {
    const res = await request(app).get('/api/sales/preorders');
    expect(res.status).toBe(401);
  });
});

// =============================================================
// 2. POST /api/sales/preorders/:id/fulfill - 수동 해소
// =============================================================
describe('예약판매 수동 해소 (POST /api/sales/preorders/:id/fulfill)', () => {
  it('ADMIN: 대기 상태 예약판매 해소 성공 (재고 차감 + 실매출 생성)', async () => {
    const pool = getPool();
    const preorderId = await createPreorder({ qty: 2 });

    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.sale_id).toBeTruthy();

    const saleId = res.body.data.sale_id;
    cleanup.saleIds.push(saleId);

    // Verify sale record created
    expect(res.body.data.partner_code).toBe(fixtures.store.partner_code);
    expect(Number(res.body.data.qty)).toBe(2);
    // sale_type should be determined by price logic (not '예약판매')
    expect(res.body.data.sale_type).not.toBe('예약판매');

    // 재고는 예약판매 생성 시 이미 차감됨 → fulfill에서는 TX 생성 안 함

    // Verify preorder status changed to '해소'
    const poCheck = await pool.query('SELECT status, fulfilled_sale_id FROM preorders WHERE preorder_id = $1', [preorderId]);
    expect(poCheck.rows[0].status).toBe('해소');
    expect(Number(poCheck.rows[0].fulfilled_sale_id)).toBe(Number(saleId));
  });

  it('STORE_MANAGER: 해소 가능 (매니저 권한)', async () => {
    const preorderId = await createPreorder({ qty: 1 });

    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    cleanup.saleIds.push(res.body.data.sale_id);
  });

  it('STORE_STAFF: 해소 불가 (403)', async () => {
    const preorderId = await createPreorder({ qty: 1 });

    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${storeStaff}`);

    expect(res.status).toBe(403);
  });

  it('재고는 생성 시 이미 차감 → fulfill은 재고 체크 없이 성공', async () => {
    // 재고 부족이어도 fulfill은 성공 (재고 차감은 생성 시 이미 처리됨)
    const preorderId = await createPreorder({ qty: 5, unit_price: 1, total_price: 5 });

    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    cleanup.saleIds.push(res.body.data.sale_id);
  });

  it('이미 해소된 예약판매 재해소 시 거부', async () => {
    // Ensure sufficient inventory for the initial fulfill
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [KNOWN_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    // Create and fulfill a preorder
    const preorderId = await createPreorder({ qty: 1 });

    const fulfillRes = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);
    expect(fulfillRes.status).toBe(200);
    cleanup.saleIds.push(fulfillRes.body.data.sale_id);

    // Try to fulfill again
    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('대기 상태가 아닙니다');
  });

  it('존재하지 않는 예약판매 ID 시 404', async () => {
    const res = await request(app)
      .post('/api/sales/preorders/999999999/fulfill')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('예약판매를 찾을 수 없습니다');
  });

  it('토큰 없이 해소 시 401', async () => {
    const res = await request(app)
      .post('/api/sales/preorders/1/fulfill')
      .send({});

    expect(res.status).toBe(401);
  });

  it('해소 시 fulfilled_sale_id가 있는 경우 기존 sales 레코드 UPDATE', async () => {
    const pool = getPool();

    // First insert a placeholder sale record with '예약판매' type
    const saleResult = await pool.query(
      `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo)
       VALUES ($1, $2, $3, 1, $4, $5, '예약판매', '예약판매 플레이스홀더')
       RETURNING sale_id`,
      [today, fixtures.store.partner_code, fixtures.variant.variant_id,
       Number(fixtures.variant.base_price) || 50000,
       Number(fixtures.variant.base_price) || 50000],
    );
    const placeholderSaleId = saleResult.rows[0].sale_id;
    cleanup.saleIds.push(placeholderSaleId);

    // Create preorder linked to this sale
    const preorderId = await createPreorder({
      qty: 1,
      fulfilled_sale_id: placeholderSaleId,
    });

    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should update existing sale, not create a new one
    expect(Number(res.body.data.sale_id)).toBe(Number(placeholderSaleId));
    // sale_type should be updated from '예약판매' to actual type
    expect(res.body.data.sale_type).not.toBe('예약판매');
    // memo should contain fulfillment marker
    expect(res.body.data.memo).toContain('예약판매 해소');
  });
});

// =============================================================
// 3. DELETE /api/sales/preorders/:id - 예약판매 삭제
// =============================================================
describe('예약판매 삭제 (DELETE /api/sales/preorders/:id)', () => {
  it('ADMIN: 대기 상태 예약판매 삭제 성공', async () => {
    const preorderId = await createPreorder({ qty: 1, memo: '삭제 테스트' });

    const res = await request(app)
      .delete(`/api/sales/preorders/${preorderId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.preorder_id)).toBe(Number(preorderId));

    // Verify actually deleted
    const pool = getPool();
    const check = await pool.query('SELECT * FROM preorders WHERE preorder_id = $1', [preorderId]);
    expect(check.rows.length).toBe(0);

    // Remove from cleanup since already deleted
    cleanup.preorderIds = cleanup.preorderIds.filter(id => id !== preorderId);
  });

  it('STORE_MANAGER: 삭제 가능 (매니저 권한)', async () => {
    const preorderId = await createPreorder({ qty: 1 });

    const res = await request(app)
      .delete(`/api/sales/preorders/${preorderId}`)
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    cleanup.preorderIds = cleanup.preorderIds.filter(id => id !== preorderId);
  });

  it('STORE_STAFF: 삭제 불가 (403)', async () => {
    const preorderId = await createPreorder({ qty: 1 });

    const res = await request(app)
      .delete(`/api/sales/preorders/${preorderId}`)
      .set('Authorization', `Bearer ${storeStaff}`);

    expect(res.status).toBe(403);
  });

  it('해소 완료된 예약판매 삭제 시 404 (대기 상태만 삭제 가능)', async () => {
    const preorderId = await createPreorder({ qty: 1, status: '해소' });

    const res = await request(app)
      .delete(`/api/sales/preorders/${preorderId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('삭제할 예약판매를 찾을 수 없습니다');
  });

  it('존재하지 않는 예약판매 ID 시 404', async () => {
    const res = await request(app)
      .delete('/api/sales/preorders/999999999')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('삭제할 예약판매를 찾을 수 없습니다');
  });

  it('토큰 없이 삭제 시 401', async () => {
    const res = await request(app).delete('/api/sales/preorders/1');
    expect(res.status).toBe(401);
  });
});

// =============================================================
// 4. 매출 등록 시 재고 부족 동작 (allowNegative)
// =============================================================
describe('매출 등록 시 재고 부족 동작', () => {
  it('재고 부족 시 예약판매로 전환 (afterStock >= -2)', async () => {
    // 재고를 1로 설정 → qty=2 → afterStock=-1 → 예약판매 전환
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 1, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${admin}`)
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
    expect(res.body.preorder).toBe(true);
    cleanup.preorderIds.push(res.body.data.preorder_id);

    // Restore inventory for subsequent tests
    await pool.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [KNOWN_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
  });

  it('배치 등록 시 재고 부족 → 예약판매 전환 + warnings', async () => {
    // 재고를 1로 설정 → qty=2 → afterStock=-1 → 예약판매 전환
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 1, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const batchDate = new Date(Date.now() - 86400000 * 10).toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        sale_date: batchDate,
        partner_code: fixtures.store.partner_code,
        items: [
          {
            variant_id: fixtures.variant.variant_id,
            qty: 2,
            unit_price: Number(fixtures.variant.base_price) || 50000,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // warnings에 재고 부족 포함
    expect(res.body.warnings).toBeDefined();
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(res.body.warnings[0]).toContain('재고 부족');

    // Restore inventory
    await pool.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [KNOWN_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
  });
});

// =============================================================
// 5. 해소 후 재고 정합성
// =============================================================
describe('해소 후 재고 정합성', () => {
  it('해소 시 매출 레코드 정확히 생성 (재고 차감은 생성 시 이미 완료)', async () => {
    const preorderId = await createPreorder({ qty: 3 });

    const res = await request(app)
      .post(`/api/sales/preorders/${preorderId}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    cleanup.saleIds.push(res.body.data.sale_id);

    // 매출 레코드의 수량이 예약판매와 일치하는지 확인
    expect(Number(res.body.data.qty)).toBe(3);
    // 재고 TX는 생성 시 이미 차감됨 → fulfill에서는 추가 TX 없음
  });

  it('다건 예약판매 순차 해소 시 각각 매출 레코드 생성', async () => {
    const po1 = await createPreorder({ qty: 2, memo: '순차 해소 1' });
    const po2 = await createPreorder({ qty: 3, memo: '순차 해소 2' });

    // Fulfill first
    const res1 = await request(app)
      .post(`/api/sales/preorders/${po1}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);
    expect(res1.status).toBe(200);
    cleanup.saleIds.push(res1.body.data.sale_id);
    expect(Number(res1.body.data.qty)).toBe(2);

    // Fulfill second
    const res2 = await request(app)
      .post(`/api/sales/preorders/${po2}/fulfill`)
      .set('Authorization', `Bearer ${admin}`);
    expect(res2.status).toBe(200);
    cleanup.saleIds.push(res2.body.data.sale_id);
    expect(Number(res2.body.data.qty)).toBe(3);
  });
});
