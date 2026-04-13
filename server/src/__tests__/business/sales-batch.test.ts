/**
 * 매출 일괄등록 (POST /api/sales/batch) 통합 테스트
 *
 * 테스트 카테고리:
 * 1. 기본 일괄등록 — 다건 items 등록 + 재고 차감
 * 2. 중복 등록 방지 (5초 룰) — 동일 거래처+날짜 5초 이내 → 409
 * 3. 면세 금액 (tax_free_amount) — 10% 이내 OK, 초과 시 자동 캡
 * 4. CRM 연동 — customer_id 포함 시 customer_purchases 자동 생성
 * 5. 재고 부족 — allowNegative로 마이너스 재고 허용 + warnings 반환
 * 6. 입력값 검증 — variant_id 누락, qty<=0, items 비어있음 등
 *
 * NOTE: 각 테스트는 서로 다른 sale_date를 사용하여 5초 중복 방지 규칙에
 * 걸리지 않도록 한다. 중복 테스트만 동일 날짜를 의도적으로 사용한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, storeToken, getTestFixtures, getSecondStore } from '../helpers';

const cleanup: { saleIds: number[]; preorderIds: number[] } = { saleIds: [], preorderIds: [] };
let token: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// Known inventory level set in beforeAll — never read from dirty DB state
const KNOWN_QTY = 50;

/** inventory_transactions 레코드 조회 헬퍼 */
async function getTxRecord(refId: number, txType: string, partnerCode: string, variantId: number) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty_change, qty_after FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2 AND partner_code = $3 AND variant_id = $4 ORDER BY tx_id DESC LIMIT 1',
    [refId, txType, partnerCode, variantId],
  );
  return r.rows[0] || null;
}

/**
 * 테스트별 고유 sale_date 생성 — 과거 날짜를 사용하여 5초 중복 방지 규칙 회피.
 * 각 테스트가 서로 다른 날짜를 사용하므로 동일 거래처+날짜 중복이 발생하지 않는다.
 */
let dateCounter = 1;
function uniqueSaleDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - dateCounter);
  dateCounter++;
  return d.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);

async function getInventoryQty(partnerCode: string, variantId: number): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
    [partnerCode, variantId],
  );
  return r.rows[0] ? Number(r.rows[0].qty) : 0;
}

beforeAll(async () => {
  token = adminToken();
  fixtures = await getTestFixtures();

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
    for (const id of cleanup.saleIds) {
      await client.query('DELETE FROM customer_purchases WHERE sale_id = $1', [id]);
      await client.query(
        'DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type IN ($2,$3,$4,$5)',
        [id, 'SALE', 'RETURN', 'SALE_DELETE', 'SALE_EDIT'],
      );
      await client.query('DELETE FROM sales WHERE sale_id = $1', [id]);
    }
    for (const id of cleanup.preorderIds) {
      await client.query('DELETE FROM inventory_transactions WHERE ref_id = $1 AND tx_type = $2', [id, 'PREORDER']);
      await client.query('DELETE FROM preorders WHERE preorder_id = $1', [id]);
    }
    // 재고 원복 (known clean state for subsequent test files)
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

// ═══════════════════════════════════════════════════════════
// 1. 기본 일괄등록
// ═══════════════════════════════════════════════════════════
describe('기본 일괄등록', () => {
  it('다건 items 등록 시 각각 sale 레코드가 생성되고 재고가 차감된다', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
          { variant_id: fixtures.variant.variant_id, qty: 2, unit_price: unitPrice },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    // 각 레코드에 sale_id가 존재
    for (const sale of res.body.data) {
      expect(sale.sale_id).toBeDefined();
      expect(sale.partner_code).toBe(fixtures.store.partner_code);
      expect(sale.variant_id).toBe(fixtures.variant.variant_id);
      cleanup.saleIds.push(sale.sale_id);
    }

    // 각 매출의 SALE TX 레코드로 재고 차감 확인 (공유 DB 영향 면역)
    const tx1 = await getTxRecord(res.body.data[0].sale_id, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx1).not.toBeNull();
    expect(Number(tx1.qty_change)).toBe(-1);

    const tx2 = await getTxRecord(res.body.data[1].sale_id, 'SALE', fixtures.store.partner_code, fixtures.variant.variant_id);
    expect(tx2).not.toBeNull();
    expect(Number(tx2.qty_change)).toBe(-2);
  });

  it('응답에 sale_date, qty, total_price 등 핵심 필드가 포함된다', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
        ],
      });

    expect(res.status).toBe(201);
    const sale = res.body.data[0];
    cleanup.saleIds.push(sale.sale_id);

    expect(sale.sale_date).toBeDefined();
    expect(Number(sale.qty)).toBe(1);
    expect(Number(sale.total_price)).toBeGreaterThan(0);
    expect(sale.partner_code).toBe(fixtures.store.partner_code);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 중복 등록 방지 (5초 룰)
// ═══════════════════════════════════════════════════════════
describe('중복 등록 방지 (5초 룰)', () => {
  it('동일 거래처+날짜로 5초 이내 재등록 시 409 반환', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    // 이 테스트 전용 고유 날짜 — 다른 테스트와 겹치지 않음
    const dupTestDate = uniqueSaleDate();

    // 첫 번째 등록 — 성공
    const res1 = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: dupTestDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
        ],
      });

    expect(res1.status).toBe(201);
    for (const sale of res1.body.data) {
      cleanup.saleIds.push(sale.sale_id);
    }

    // 두 번째 등록 — 5초 이내 동일 조건 → 409
    const res2 = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: dupTestDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
        ],
      });

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error).toContain('중복');
  });

  it('다른 거래처에서 같은 날짜로 등록하면 중복 아님 (성공)', async () => {
    const secondStore = await getSecondStore();
    if (!secondStore) {
      // 두 번째 매장이 없으면 skip
      console.warn('두 번째 매장이 없어 다른 거래처 테스트를 건너뜁니다.');
      return;
    }

    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    // 두 번째 매장에 재고 세팅
    const pool = getPool();
    await pool.query(
      `INSERT INTO inventory (partner_code, variant_id, qty)
       VALUES ($1, $2, 10)
       ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = GREATEST(inventory.qty, 10), updated_at = NOW()`,
      [secondStore.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: secondStore.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    for (const sale of res.body.data) {
      cleanup.saleIds.push(sale.sale_id);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 면세 금액 (tax_free_amount)
// ═══════════════════════════════════════════════════════════
describe('면세 금액 (tax_free_amount)', () => {
  it('total_price의 10% 이내 tax_free_amount는 그대로 반영된다', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const qty = 1;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty, unit_price: unitPrice, tax_free_amount: 100 },
        ],
      });

    expect(res.status).toBe(201);
    const sale = res.body.data[0];
    cleanup.saleIds.push(sale.sale_id);

    // 서버가 effectivePrice로 total_price를 재계산하므로 실제 total_price 기반으로 검증
    const actualTotal = Number(sale.total_price);
    const maxTaxFree = Math.round(actualTotal * 0.1);
    // 100원은 대부분 상품의 10% 이내이므로 그대로 반영
    if (100 <= maxTaxFree) {
      expect(sale.tax_free).toBe(true);
      expect(Number(sale.tax_free_amount)).toBe(100);
    } else {
      // 만약 total_price가 매우 작아서 100원이 10% 초과라면 캡됨
      expect(sale.tax_free).toBe(true);
      expect(Number(sale.tax_free_amount)).toBe(maxTaxFree);
    }
  });

  it('total_price의 10% 초과 tax_free_amount는 자동으로 캡된다', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const qty = 1;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          // 999999999원은 어떤 total_price의 10%보다도 클 것
          { variant_id: fixtures.variant.variant_id, qty, unit_price: unitPrice, tax_free_amount: 999999999 },
        ],
      });

    expect(res.status).toBe(201);
    const sale = res.body.data[0];
    cleanup.saleIds.push(sale.sale_id);

    // 서버가 effectivePrice로 total_price를 재계산하므로 실제 total_price 기반으로 캡 검증
    const actualTotal = Number(sale.total_price);
    const maxAllowed = Math.round(actualTotal * 0.1);

    // 자동 캡: total_price * 10%
    expect(Number(sale.tax_free_amount)).toBe(maxAllowed);
    expect(Number(sale.tax_free_amount)).toBeLessThanOrEqual(maxAllowed);
    expect(sale.tax_free).toBe(true);
  });

  it('tax_free_amount가 0이면 tax_free는 false', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice, tax_free_amount: 0 },
        ],
      });

    expect(res.status).toBe(201);
    const sale = res.body.data[0];
    cleanup.saleIds.push(sale.sale_id);

    expect(sale.tax_free).toBe(false);
    expect(Number(sale.tax_free_amount)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. CRM 연동
// ═══════════════════════════════════════════════════════════
describe('CRM 연동 (customer_id)', () => {
  let testCustomerId: number | null = null;

  it('customer_id 포함 시 customer_purchases 레코드가 자동 생성된다', async () => {
    const pool = getPool();

    // 기존 활성 고객 조회 (없으면 생성)
    const custRes = await pool.query(
      `SELECT customer_id FROM customers WHERE is_active = TRUE ORDER BY customer_id LIMIT 1`,
    );
    if (custRes.rows.length === 0) {
      const insertRes = await pool.query(
        `INSERT INTO customers (customer_name, phone, partner_code)
         VALUES ('테스트고객_배치', '010-9999-0001', $1)
         RETURNING customer_id`,
        [fixtures.store.partner_code],
      );
      testCustomerId = insertRes.rows[0].customer_id;
    } else {
      testCustomerId = custRes.rows[0].customer_id;
    }

    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        customer_id: testCustomerId,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const sale = res.body.data[0];
    cleanup.saleIds.push(sale.sale_id);

    // sale 레코드에 customer_id가 연결됨
    expect(Number(sale.customer_id)).toBe(testCustomerId);

    // customer_purchases에 자동 생성된 레코드 확인
    const cpRes = await pool.query(
      `SELECT * FROM customer_purchases WHERE sale_id = $1`,
      [sale.sale_id],
    );
    expect(cpRes.rows.length).toBe(1);
    expect(Number(cpRes.rows[0].customer_id)).toBe(testCustomerId);
    expect(cpRes.rows[0].auto_created).toBe(true);
    expect(Number(cpRes.rows[0].qty)).toBe(1);
  });

  it('customer_id 없으면 customer_purchases가 생성되지 않는다', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },
        ],
      });

    expect(res.status).toBe(201);
    const sale = res.body.data[0];
    cleanup.saleIds.push(sale.sale_id);

    const pool = getPool();
    const cpRes = await pool.query(
      `SELECT * FROM customer_purchases WHERE sale_id = $1`,
      [sale.sale_id],
    );
    expect(cpRes.rows.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 재고 부족 (allowNegative)
// ═══════════════════════════════════════════════════════════
describe('재고 부족 시 마이너스 허용 + warnings', () => {
  it('재고보다 많은 수량도 등록되며 warnings 반환', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    // 재고를 1로 설정 → qty=2 → afterStock=-1 → 예약판매 전환
    const pool = getPool();
    await pool.query(
      'UPDATE inventory SET qty = 1, updated_at = NOW() WHERE partner_code = $1 AND variant_id = $2',
      [fixtures.store.partner_code, fixtures.variant.variant_id],
    );

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 2, unit_price: unitPrice },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // 재고 부족 warnings 반환
    expect(res.body.warnings).toBeDefined();
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(res.body.warnings[0]).toContain('재고 부족');

    // Restore inventory
    await pool.query(
      'UPDATE inventory SET qty = $1, updated_at = NOW() WHERE partner_code = $2 AND variant_id = $3',
      [KNOWN_QTY, fixtures.store.partner_code, fixtures.variant.variant_id],
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 입력값 검증
// ═══════════════════════════════════════════════════════════
describe('입력값 검증', () => {
  it('items가 빈 배열이면 400', async () => {
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: uniqueSaleDate(),
        partner_code: fixtures.store.partner_code,
        items: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('sale_date 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: 50000 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('partner_code 누락 시 (본사 역할) 400', async () => {
    // admin 역할은 partner_code가 필수
    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: uniqueSaleDate(),
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: 50000 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('partner_code');
  });

  it('variant_id 누락된 항목은 skipped 처리', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { qty: 1, unit_price: unitPrice },  // variant_id 누락
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },  // 정상
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1); // 유효한 항목 1건만 등록
    expect(res.body.skipped).toBeDefined();
    expect(res.body.skipped.length).toBeGreaterThan(0);
    expect(res.body.skipped[0]).toContain('필수값 누락');

    for (const sale of res.body.data) {
      cleanup.saleIds.push(sale.sale_id);
    }
  });

  it('qty <= 0인 항목은 skipped 처리', async () => {
    const unitPrice = Number(fixtures.variant.base_price) || 50000;
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 0, unit_price: unitPrice },    // qty 0
          { variant_id: fixtures.variant.variant_id, qty: -1, unit_price: unitPrice },   // qty 음수
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: unitPrice },    // 정상
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1); // 유효한 항목 1건만 등록
    expect(res.body.skipped).toBeDefined();
    expect(res.body.skipped.length).toBe(2); // qty 0, qty -1 두 건
    expect(res.body.skipped[0]).toContain('양수');

    for (const sale of res.body.data) {
      cleanup.saleIds.push(sale.sale_id);
    }
  });

  it('모든 항목이 유효하지 않으면 400 + skipped 반환', async () => {
    const saleDate = uniqueSaleDate();

    const res = await request(app)
      .post('/api/sales/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sale_date: saleDate,
        partner_code: fixtures.store.partner_code,
        items: [
          { qty: 1, unit_price: 50000 },  // variant_id 누락
          { variant_id: fixtures.variant.variant_id, qty: 0, unit_price: 50000 },  // qty 0
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // 모든 항목이 skipped되면 에러 메시지에 skip 사유가 포함됨
    expect(res.body.error).toBeTruthy();
    expect(res.body.skipped).toBeDefined();
    expect(res.body.skipped.length).toBe(2);
  });

  it('토큰 없이 배치 등록 시 401', async () => {
    const res = await request(app)
      .post('/api/sales/batch')
      .send({
        sale_date: uniqueSaleDate(),
        partner_code: fixtures.store.partner_code,
        items: [
          { variant_id: fixtures.variant.variant_id, qty: 1, unit_price: 50000 },
        ],
      });

    expect(res.status).toBe(401);
  });
});
