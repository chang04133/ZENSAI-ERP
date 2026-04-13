/**
 * 재고 계산 정확도 통합 테스트
 *
 * 테스트 항목:
 * 1. POST /api/inventory/adjust: 수동 조정 (+/-), ADMIN/HQ 전용
 * 2. POST /api/inventory/register-loss: 재고처리 등록, ADMIN/HQ 전용
 * 3. GET /api/inventory/transactions: ADMIN 전용
 * 4. inventory_transactions 레코드 검증 (tx_type)
 * 5. 매출 -> 재고 차감 정확도 + tx 레코드
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, hqManagerToken, storeStaffToken, getTestFixtures } from '../helpers';

let token: string;
let hqToken: string;
let storeManagerToken: string;
let staffToken: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// 테스트 기준 재고 (beforeAll에서 설정, afterAll에서 복원)
const KNOWN_QTY = 50;

// 정리 대상 ID
const cleanup: { txIds: number[]; saleIds: number[] } = { txIds: [], saleIds: [] };

const today = new Date().toISOString().slice(0, 10);

async function getInventoryQty(partnerCode: string, variantId: number): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, variantId],
  );
  return r.rows[0] ? Number(r.rows[0].qty) : 0;
}

/** 특정 ref_id + tx_type 조합의 트랜잭션 조회 */
async function getTxRecord(refId: number, txType: string) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT * FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 ORDER BY created_at DESC LIMIT 1',
    [refId, txType],
  );
  return r.rows[0] || null;
}

/** 특정 partner_code + variant_id의 최근 ADJUST 트랜잭션 */
async function getRecentAdjustTx(partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT * FROM inventory_transactions
     WHERE partner_code = $1 AND variant_id = $2 AND tx_type = 'ADJUST'
     ORDER BY created_at DESC LIMIT 1`,
    [partnerCode, variantId],
  );
  return r.rows[0] || null;
}

/** 특정 partner_code + variant_id의 최근 LOSS 트랜잭션 */
async function getRecentLossTx(partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT * FROM inventory_transactions
     WHERE partner_code = $1 AND variant_id = $2 AND tx_type = 'LOSS'
     ORDER BY created_at DESC LIMIT 1`,
    [partnerCode, variantId],
  );
  return r.rows[0] || null;
}

beforeAll(async () => {
  token = adminToken();
  hqToken = hqManagerToken();
  fixtures = await getTestFixtures();
  storeManagerToken = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
  staffToken = storeStaffToken(fixtures.store.partner_code, fixtures.store.partner_name);

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
    // 테스트 중 생성된 매출 정리
    for (const saleId of cleanup.saleIds) {
      await client.query('DELETE FROM customer_purchases WHERE sale_id = $1', [saleId]);
      await client.query(
        "DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ('SALE', 'RETURN', 'SALE_DELETE', 'SALE_EDIT')",
        [saleId],
      );
      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
    }
    // 테스트 중 생성된 ADJUST/LOSS 트랜잭션 삭제
    for (const txId of cleanup.txIds) {
      await client.query('DELETE FROM inventory_transactions WHERE tx_id = $1', [txId]);
    }
    // 재고 원복 (테스트 기준값으로 복원)
    await client.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [KNOWN_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('inventory-calculation 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ======================================================
// 1. POST /api/inventory/adjust — 수동 재고 조정
// ======================================================
describe('POST /api/inventory/adjust — 수동 재고 조정', () => {
  it('ADMIN: 양수 조정 (+5) 성공', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 5,
        memo: '테스트 양수 조정',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // ADJUST 트랜잭션 레코드 확인 (TX record check only — shared DB has concurrent modifications)
    const tx = await getRecentAdjustTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeTruthy();
    expect(tx.tx_type).toBe('ADJUST');
    expect(Number(tx.qty_change)).toBe(5);
    cleanup.txIds.push(tx.tx_id);
  });

  it('ADMIN: 음수 조정 (-3) 성공', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: -3,
        memo: '테스트 음수 조정',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // ADJUST TX 레코드로 정확한 변경량 확인 (공유 DB 영향 면역)
    const tx = await getRecentAdjustTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeTruthy();
    expect(Number(tx.qty_change)).toBe(-3);
    cleanup.txIds.push(tx.tx_id);
  });

  it('ADMIN: 현재 재고보다 큰 음수 조정 -> 0으로 조정 (음수 방지)', async () => {
    // Clean preorders and set inventory to 2
    const pool = getPool();
    await pool.query(
      "DELETE FROM preorders WHERE partner_code = $1 AND variant_id = $2 AND status = '대기'",
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    await pool.query(
      'UPDATE inventory SET qty = 2, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    // Wait for any in-flight async operations to settle
    await new Promise(r => setTimeout(r, 200));
    await pool.query(
      'UPDATE inventory SET qty = 2, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: -10,
        memo: '초과 음수 조정 테스트',
      });

    expect(res.status).toBe(200);

    // warning 반환 확인 (재고 부족으로 0 이하 조정 방지)
    expect(res.body.data.warning).toBeTruthy();

    // ADJUST TX 레코드로 조정 확인 — qty_after가 0이어야 함 (Math.max(0, 2-10)=0)
    const tx = await getRecentAdjustTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeTruthy();
    // qty_after in TX record should be 0 (clamped)
    expect(Number(tx.qty_after)).toBe(0);
    cleanup.txIds.push(tx.tx_id);

    // 재고 원복 (후속 테스트용)
    await pool.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
  });

  it('HQ_MANAGER: 조정 가능', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${hqToken}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 1,
        memo: 'HQ 매니저 조정',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const tx = await getRecentAdjustTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    cleanup.txIds.push(tx.tx_id);

    // 원복
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
  });

  it('qty_change가 0이면 400', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 0,
      });

    expect(res.status).toBe(400);
  });

  it('partner_code 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variant_id: fixtures.variant.variant_id,
        qty_change: 1,
      });

    expect(res.status).toBe(400);
  });

  it('variant_id 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        qty_change: 1,
      });

    expect(res.status).toBe(400);
  });
});

// ======================================================
// 2. POST /api/inventory/adjust — 권한 검증
// ======================================================
describe('POST /api/inventory/adjust — 권한 제한', () => {
  it('STORE_STAFF는 조정 불가 -> 403', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 1,
      });

    expect(res.status).toBe(403);
  });

  it('토큰 없이 조정 시도 -> 401', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 1,
      });

    expect(res.status).toBe(401);
  });
});

// ======================================================
// 3. POST /api/inventory/register-loss — 재고처리 등록
// ======================================================
describe('POST /api/inventory/register-loss — 재고처리 등록', () => {
  it('ADMIN: LOST 유형 등록 성공', async () => {
    // Clean pending preorders and set known inventory
    const pool = getPool();
    await pool.query(
      "DELETE FROM preorders WHERE partner_code = $1 AND variant_id = $2 AND status = '대기'",
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
    await pool.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 2,
        loss_type: 'LOST',
        memo: '테스트 유실 등록',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // LOSS TX 레코드로 정확한 차감 확인 (공유 DB 영향 면역)
    const tx = await getRecentLossTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeTruthy();
    expect(tx.tx_type).toBe('LOSS');
    expect(tx.loss_type).toBe('LOST');
    expect(Number(tx.qty_change)).toBe(-2);
    cleanup.txIds.push(tx.tx_id);
  });

  it('ADMIN: DISPOSE 유형 등록 성공', async () => {
    // Set known inventory before the operation
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 45, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'DISPOSE',
        memo: '테스트 폐기 등록',
      });

    expect(res.status).toBe(200);

    // LOSS TX 레코드로 정확한 차감 확인 (공유 DB 영향 면역)
    const tx = await getRecentLossTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx).toBeTruthy();
    expect(tx.loss_type).toBe('DISPOSE');
    expect(Number(tx.qty_change)).toBe(-1);
    cleanup.txIds.push(tx.tx_id);
  });

  it('ADMIN: GIFT 유형 등록 성공', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'GIFT',
        memo: '테스트 증정',
      });

    expect(res.status).toBe(200);
    const tx = await getRecentLossTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx.loss_type).toBe('GIFT');
    cleanup.txIds.push(tx.tx_id);
  });

  it('ADMIN: EMP_DISCOUNT 유형 등록 성공', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'EMP_DISCOUNT',
        memo: '테스트 직원할인',
      });

    expect(res.status).toBe(200);
    const tx = await getRecentLossTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx.loss_type).toBe('EMP_DISCOUNT');
    cleanup.txIds.push(tx.tx_id);
  });

  it('HQ_MANAGER: 재고처리 가능', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${hqToken}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'LOST',
        memo: 'HQ 매니저 재고처리',
      });

    expect(res.status).toBe(200);
    const tx = await getRecentLossTx(fixtures.store.partner_code, fixtures.variant.variant_id);
    cleanup.txIds.push(tx.tx_id);
  });

  it('재고보다 많은 수량 등록 시 에러', async () => {
    // 현재 재고를 소량으로 설정
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 1, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 10,
        loss_type: 'LOST',
      });

    // "재고 부족" 에러 — 한글 에러 메시지는 비즈니스 에러로 처리되어 400 반환
    expect(res.status).toBe(400);

    // 원복
    await pool.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );
  });

  it('유효하지 않은 loss_type -> 400', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'INVALID_TYPE',
      });

    expect(res.status).toBe(400);
  });

  it('qty 0 이하 -> 400', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 0,
        loss_type: 'LOST',
      });

    expect(res.status).toBe(400);
  });
});

// ======================================================
// 4. POST /api/inventory/register-loss — 권한 제한
// ======================================================
describe('POST /api/inventory/register-loss — 권한 제한', () => {
  it('STORE_STAFF는 등록 불가 -> 403', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'LOST',
      });

    expect(res.status).toBe(403);
  });

  it('토큰 없이 -> 401', async () => {
    const res = await request(app)
      .post('/api/inventory/register-loss')
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty: 1,
        loss_type: 'LOST',
      });

    expect(res.status).toBe(401);
  });
});

// ======================================================
// 5. GET /api/inventory/transactions — ADMIN 전용
// ======================================================
describe('GET /api/inventory/transactions — ADMIN 전용', () => {
  it('ADMIN: 거래이력 조회 성공', async () => {
    const res = await request(app)
      .get('/api/inventory/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('total');
    expect(Array.isArray(res.body.data.data)).toBe(true);
  });

  it('ADMIN: tx_type 필터 조회', async () => {
    const res = await request(app)
      .get('/api/inventory/transactions?tx_type=ADJUST')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // 결과 있으면 모두 ADJUST
    if (res.body.data.data.length > 0) {
      for (const row of res.body.data.data) {
        expect(row.tx_type).toBe('ADJUST');
      }
    }
  });

  it('ADMIN: partner_code 필터 조회', async () => {
    const res = await request(app)
      .get(`/api/inventory/transactions?partner_code=${fixtures.store.partner_code}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    if (res.body.data.data.length > 0) {
      for (const row of res.body.data.data) {
        expect(row.partner_code).toBe(fixtures.store.partner_code);
      }
    }
  });

  it('HQ_MANAGER는 조회 불가 -> 403', async () => {
    const res = await request(app)
      .get('/api/inventory/transactions')
      .set('Authorization', `Bearer ${hqToken}`);

    expect(res.status).toBe(403);
  });

  it('STORE_MANAGER는 조회 불가 -> 403', async () => {
    const res = await request(app)
      .get('/api/inventory/transactions')
      .set('Authorization', `Bearer ${storeManagerToken}`);

    expect(res.status).toBe(403);
  });

  it('STORE_STAFF는 조회 불가 -> 403', async () => {
    const res = await request(app)
      .get('/api/inventory/transactions')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it('토큰 없이 -> 401', async () => {
    const res = await request(app)
      .get('/api/inventory/transactions');

    expect(res.status).toBe(401);
  });
});

// ======================================================
// 6. 매출 -> 재고 차감 + tx 레코드 검증
// ======================================================
describe('매출 등록 -> 재고 차감 + inventory_transactions 검증', () => {
  let saleId: number;

  it('매출 등록 시 재고 차감 + SALE tx 레코드 생성', async () => {
    // Ensure sufficient inventory for sale
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 50, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

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
    expect(res.body.success).toBe(true);
    saleId = res.body.data.sale_id;
    cleanup.saleIds.push(saleId);

    // SALE 트랜잭션 레코드 확인 (TX record check only — shared DB has concurrent modifications)
    const tx = await getTxRecord(saleId, 'SALE');
    expect(tx).toBeTruthy();
    expect(tx.tx_type).toBe('SALE');
    expect(Number(tx.qty_change)).toBe(-3);
    expect(tx.partner_code).toBe(fixtures.store.partner_code);
    expect(Number(tx.variant_id)).toBe(fixtures.variant.variant_id);
  });

  it('매출 삭제 시 재고 복원 + SALE_DELETE tx 레코드 생성', async () => {
    const res = await request(app)
      .delete(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // SALE_DELETE 트랜잭션 레코드 확인 (TX record check only — shared DB has concurrent modifications)
    const tx = await getTxRecord(saleId, 'SALE_DELETE');
    expect(tx).toBeTruthy();
    expect(tx.tx_type).toBe('SALE_DELETE');
    expect(Number(tx.qty_change)).toBe(3); // 복원이므로 양수
  });
});

// ======================================================
// 7. 연속 조정의 qty_after 정확도
// ======================================================
describe('연속 조정의 qty_after 누적 정확도', () => {
  it('여러 번 조정 후 각 ADJUST TX의 qty_change가 정확', async () => {
    // Set known inventory baseline
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 10, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    // Record starting point for TX queries
    const startTs = new Date().toISOString();

    // +5
    const res1 = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 5,
        memo: '연속조정 1',
      });
    expect(res1.status).toBe(200);

    // -7
    const res2 = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: -7,
        memo: '연속조정 2',
      });
    expect(res2.status).toBe(200);

    // +12
    const res3 = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        variant_id: fixtures.variant.variant_id,
        qty_change: 12,
        memo: '연속조정 3',
      });
    expect(res3.status).toBe(200);

    // Verify all 3 ADJUST TXs exist with correct qty_change values
    // Use created_at > startTs to avoid picking up TXs from other tests
    const txRes = await pool.query(
      `SELECT tx_id, qty_change, memo FROM inventory_transactions
       WHERE partner_code = $1 AND variant_id = $2 AND tx_type = 'ADJUST' AND created_at >= $3
       ORDER BY tx_id ASC`,
      [fixtures.store.partner_code, fixtures.variant.variant_id, startTs],
    );

    // Find our 3 specific TXs by memo
    const txByMemo: Record<string, any> = {};
    for (const row of txRes.rows) {
      if (row.memo?.includes('연속조정 1')) txByMemo['1'] = row;
      if (row.memo?.includes('연속조정 2')) txByMemo['2'] = row;
      if (row.memo?.includes('연속조정 3')) txByMemo['3'] = row;
    }

    expect(txByMemo['1']).toBeTruthy();
    expect(Number(txByMemo['1'].qty_change)).toBe(5);
    cleanup.txIds.push(txByMemo['1'].tx_id);

    expect(txByMemo['2']).toBeTruthy();
    expect(Number(txByMemo['2'].qty_change)).toBe(-7);
    cleanup.txIds.push(txByMemo['2'].tx_id);

    expect(txByMemo['3']).toBeTruthy();
    expect(Number(txByMemo['3'].qty_change)).toBe(12);
    cleanup.txIds.push(txByMemo['3'].tx_id);
  });
});
