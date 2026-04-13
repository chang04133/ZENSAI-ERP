/**
 * 매출 수정/삭제 제한 테스트
 *
 * 1. 당일 수정 제한 (STORE_MANAGER): 당일 매출만 수정 가능, 과거 매출 → 403, ADMIN은 제한 없음
 * 2. 당일 삭제 제한: 동일 패턴
 * 3. 단가 변경 불가: PUT 시 unit_price가 원래 값으로 강제 유지
 * 4. 매출 삭제 부수효과: 삭제 시 재고 복원
 * 5. STORE_STAFF 제한: 등록 가능, 수정/삭제 불가 (역할 제한)
 *
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, storeStaffToken, getTestFixtures } from '../helpers';

// 정리 대상 sale IDs
const saleIds: number[] = [];

let admin: string;
let storeMgr: string;
let staff: string;
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

/** 매출 1건 등록 헬퍼 (admin 토큰 사용) */
async function createSale(overrides: Record<string, any> = {}): Promise<number> {
  const res = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${admin}`)
    .send({
      sale_date: today,
      partner_code: fixtures.store.partner_code,
      variant_id: fixtures.variant.variant_id,
      qty: 1,
      unit_price: Number(fixtures.variant.base_price) || 50000,
      sale_type: '정상',
      ...overrides,
    });
  expect(res.status).toBe(201);
  const saleId = res.body.data.sale_id;
  saleIds.push(saleId);
  return saleId;
}

/** sale_date를 과거로 변경 (직접 SQL) */
async function backdateSale(saleId: number, pastDate: string): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE sales SET sale_date = $1 WHERE sale_id = $2', [pastDate, saleId]);
}

beforeAll(async () => {
  admin = adminToken();
  fixtures = await getTestFixtures();
  storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
  staff = storeStaffToken(fixtures.store.partner_code, fixtures.store.partner_name);

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
    for (const saleId of saleIds) {
      await client.query('DELETE FROM customer_purchases WHERE sale_id = $1', [saleId]);
      await client.query(
        'DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2, $3, $4, $5)',
        [saleId, 'SALE', 'SALE_DELETE', 'SALE_EDIT', 'RETURN'],
      );
      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
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
// 1. 당일 수정 제한 (STORE_MANAGER)
// ═══════════════════════════════════════════════════════════
describe('당일 수정 제한 (STORE_MANAGER)', () => {
  let todaySaleId: number;
  let pastSaleId: number;

  beforeAll(async () => {
    // 당일 매출 생성
    todaySaleId = await createSale();
    // 과거 매출 생성 후 날짜를 어제로 변경
    pastSaleId = await createSale();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await backdateSale(pastSaleId, yesterday.toISOString().slice(0, 10));
  });

  it('STORE_MANAGER: 당일 매출 수정 → 200 성공', async () => {
    const res = await request(app)
      .put(`/api/sales/${todaySaleId}`)
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({
        qty: 2,
        unit_price: Number(fixtures.variant.base_price) || 50000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.qty)).toBe(2);
  });

  it('STORE_MANAGER: 과거 매출 수정 → 403 거부', async () => {
    const res = await request(app)
      .put(`/api/sales/${pastSaleId}`)
      .set('Authorization', `Bearer ${storeMgr}`)
      .send({
        qty: 5,
        unit_price: Number(fixtures.variant.base_price) || 50000,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('당일');
  });

  it('ADMIN: 과거 매출 수정 → 200 성공 (제한 없음)', async () => {
    const res = await request(app)
      .put(`/api/sales/${pastSaleId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        qty: 3,
        unit_price: Number(fixtures.variant.base_price) || 50000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.qty)).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 당일 삭제 제한 (STORE_MANAGER)
// ═══════════════════════════════════════════════════════════
describe('당일 삭제 제한 (STORE_MANAGER)', () => {
  let todaySaleId: number;
  let pastSaleId: number;

  beforeAll(async () => {
    todaySaleId = await createSale();
    pastSaleId = await createSale();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await backdateSale(pastSaleId, yesterday.toISOString().slice(0, 10));
  });

  it('STORE_MANAGER: 과거 매출 삭제 → 403 거부', async () => {
    const res = await request(app)
      .delete(`/api/sales/${pastSaleId}`)
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('당일');
  });

  it('ADMIN: 과거 매출 삭제 → 200 성공 (제한 없음)', async () => {
    const res = await request(app)
      .delete(`/api/sales/${pastSaleId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 삭제 시 SALE_DELETE TX 레코드가 생성되어야 함 (양수 qty_change = 재고 복원)
    const tx = await getTxRecord(pastSaleId, 'SALE_DELETE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeTruthy();
    expect(Number(tx.qty_change)).toBeGreaterThan(0);
  });

  it('STORE_MANAGER: 당일 매출 삭제 → 200 성공', async () => {
    const res = await request(app)
      .delete(`/api/sales/${todaySaleId}`)
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 단가 변경 불가 (unit_price 강제 유지)
// ═══════════════════════════════════════════════════════════
describe('단가 변경 불가', () => {
  let saleId: number;
  let originalUnitPrice: number;

  beforeAll(async () => {
    saleId = await createSale();
    // 등록된 매출의 실제 unit_price를 조회 (서버가 상품 가격으로 덮어쓸 수 있으므로)
    const pool = getPool();
    const row = await pool.query('SELECT unit_price FROM sales WHERE sale_id = $1', [saleId]);
    originalUnitPrice = Number(row.rows[0].unit_price);
  });

  it('PUT 시 다른 unit_price를 보내도 원래 값이 유지된다', async () => {
    const newPrice = originalUnitPrice + 99999;
    const res = await request(app)
      .put(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        qty: 1,
        unit_price: newPrice,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 서버는 unit_price를 원래 값으로 강제 유지
    expect(Number(res.body.data.unit_price)).toBe(originalUnitPrice);
    // total_price도 원래 단가 기준으로 계산됨
    expect(Number(res.body.data.total_price)).toBe(Math.round(1 * originalUnitPrice));
  });

  it('수량 변경 시에도 단가는 원래 값 유지', async () => {
    const res = await request(app)
      .put(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        qty: 3,
        unit_price: 1, // 극단적으로 낮은 가격 시도
      });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.unit_price)).toBe(originalUnitPrice);
    expect(Number(res.body.data.total_price)).toBe(Math.round(3 * originalUnitPrice));
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 매출 삭제 부수효과 — 재고 복원
// ═══════════════════════════════════════════════════════════
describe('매출 삭제 시 재고 복원', () => {
  it('매출 삭제 → 판매 수량만큼 재고가 복원된다', async () => {
    // 매출 2개 등록
    const saleId = await createSale({ qty: 2 });

    // SALE TX 레코드 확인 (qty_change = -2)
    const saleTx = await getTxRecord(saleId, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(saleTx).toBeTruthy();
    expect(Number(saleTx.qty_change)).toBe(-2);

    // 삭제
    const res = await request(app)
      .delete(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // SALE_DELETE TX 레코드 확인 (qty_change = +2, 복원)
    const deleteTx = await getTxRecord(saleId, 'SALE_DELETE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(deleteTx).toBeTruthy();
    expect(Number(deleteTx.qty_change)).toBe(2);
  });

  it('수량 수정 시 차이만큼 재고 보정 (1->3: 재고 2개 추가 차감)', async () => {
    const saleId = await createSale({ qty: 1 });

    // SALE TX 레코드 확인 (qty_change = -1)
    const saleTx = await getTxRecord(saleId, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(saleTx).toBeTruthy();
    expect(Number(saleTx.qty_change)).toBe(-1);

    // 수량 1 -> 3으로 수정 (추가 2개 차감)
    const res = await request(app)
      .put(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 3, unit_price: 50000 });

    expect(res.status).toBe(200);

    // SALE_EDIT TX 레코드 확인 (qty_change = -2, 추가 차감)
    const editTx = await getTxRecord(saleId, 'SALE_EDIT', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(editTx).toBeTruthy();
    expect(Number(editTx.qty_change)).toBe(-2);
  });

  it('수량 줄이면 재고가 복원된다 (3->1: 재고 2개 복원)', async () => {
    const saleId = await createSale({ qty: 3 });

    // SALE TX 레코드 확인 (qty_change = -3)
    const saleTx = await getTxRecord(saleId, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(saleTx).toBeTruthy();
    expect(Number(saleTx.qty_change)).toBe(-3);

    // 수량 3 -> 1로 수정 (2개 복원)
    const res = await request(app)
      .put(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ qty: 1, unit_price: 50000 });

    expect(res.status).toBe(200);

    // SALE_EDIT TX 레코드 확인 (qty_change = +2, 복원)
    const editTx = await getTxRecord(saleId, 'SALE_EDIT', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(editTx).toBeTruthy();
    expect(Number(editTx.qty_change)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. STORE_STAFF 제한 — 등록은 가능, 수정/삭제는 불가
// ═══════════════════════════════════════════════════════════
describe('STORE_STAFF 제한', () => {
  let staffSaleId: number;

  it('STORE_STAFF: 매출 등록 → 201 성공', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${staff}`)
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
    staffSaleId = res.body.data.sale_id;
    saleIds.push(staffSaleId);
  });

  it('STORE_STAFF: 매출 수정 → 403 역할 제한', async () => {
    const res = await request(app)
      .put(`/api/sales/${staffSaleId}`)
      .set('Authorization', `Bearer ${staff}`)
      .send({
        qty: 2,
        unit_price: Number(fixtures.variant.base_price) || 50000,
      });

    expect(res.status).toBe(403);
  });

  it('STORE_STAFF: 매출 삭제 → 403 역할 제한', async () => {
    const res = await request(app)
      .delete(`/api/sales/${staffSaleId}`)
      .set('Authorization', `Bearer ${staff}`);

    expect(res.status).toBe(403);
  });

  it('STORE_STAFF: 매출 조회는 가능 → 200', async () => {
    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', `Bearer ${staff}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
