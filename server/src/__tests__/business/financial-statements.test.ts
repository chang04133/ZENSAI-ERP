/**
 * 재무제표 비즈니스 로직 통합 테스트
 *
 * 1. GET /api/financial/income-statement — 손익계산서
 * 2. GET /api/financial/balance-sheet — 대차대조표
 * 3. GET /api/financial/cash-flow — 현금흐름표
 * 4. GET /api/financial/inventory-valuation — 재고자산 평가
 * 5. GET /api/financial/cogs-detail — 매출원가 상세
 * 6. GET /api/financial/sales-revenue — 매출 자동 연동
 * 7. CRUD /api/financial/ar — 미수금 (Accounts Receivable)
 * 8. CRUD /api/financial/ap — 미지급금 (Accounts Payable)
 *
 * 모든 엔드포인트는 ADMIN 전용.
 * 실제 DB + Express app 사용. 테스트 종료 후 데이터 정리.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { getPool } from '../../db/connection';
import { adminToken, hqManagerToken, storeToken, getTestFixtures } from '../helpers';

let admin: string;
let hqMgr: string;
let storeMgr: string;
let fixtures: Awaited<ReturnType<typeof getTestFixtures>>;

// 정리 대상 추적
const createdArIds: number[] = [];
const createdApIds: number[] = [];

beforeAll(async () => {
  admin = adminToken();
  fixtures = await getTestFixtures();
  hqMgr = hqManagerToken();
  storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
});

afterAll(async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of createdArIds) {
      await client.query('DELETE FROM accounts_receivable WHERE ar_id = $1', [id]);
    }
    for (const id of createdApIds) {
      await client.query('DELETE FROM accounts_payable WHERE ap_id = $1', [id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('재무 테스트 데이터 정리 실패:', e);
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// 1. 권한 검증 — ADMIN 전용
// ═══════════════════════════════════════════════════════════
describe('재무 모듈 권한 검증 (ADMIN only)', () => {
  const endpoints = [
    { method: 'GET', path: '/api/financial/income-statement?year=2026', label: '손익계산서' },
    { method: 'GET', path: '/api/financial/balance-sheet', label: '대차대조표' },
    { method: 'GET', path: '/api/financial/cash-flow?year=2026', label: '현금흐름표' },
    { method: 'GET', path: '/api/financial/inventory-valuation', label: '재고자산 평가' },
    { method: 'GET', path: '/api/financial/cogs-detail?year=2026', label: '매출원가 상세' },
    { method: 'GET', path: '/api/financial/sales-revenue?year=2026', label: '매출 자동 연동' },
    { method: 'GET', path: '/api/financial/ar', label: '미수금 목록' },
    { method: 'GET', path: '/api/financial/ap', label: '미지급금 목록' },
  ];

  endpoints.forEach(({ method, path, label }) => {
    it(`ADMIN: ${method} ${label} → 200`, async () => {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it(`HQ_MANAGER: ${method} ${label} → 403`, async () => {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${hqMgr}`);
      expect(res.status).toBe(403);
    });

    it(`STORE_MANAGER: ${method} ${label} → 403`, async () => {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${storeMgr}`);
      expect(res.status).toBe(403);
    });

    it(`미인증: ${method} ${label} → 401`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 손익계산서 (Income Statement)
// ═══════════════════════════════════════════════════════════
describe('GET /api/financial/income-statement', () => {
  it('연간 조회 — 올바른 구조 반환', async () => {
    const res = await request(app)
      .get('/api/financial/income-statement?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data).toHaveProperty('period');
    expect(data).toHaveProperty('revenue');
    expect(data).toHaveProperty('cogs');
    expect(data).toHaveProperty('grossProfit');
    expect(data).toHaveProperty('grossMargin');
    expect(data).toHaveProperty('sga');
    expect(data).toHaveProperty('operatingProfit');
    expect(data).toHaveProperty('operatingMargin');
    expect(data).toHaveProperty('prevYearRevenue');
    expect(data).toHaveProperty('monthlyTrend');

    // revenue 세부 구조
    expect(data.revenue).toHaveProperty('breakdown');
    expect(data.revenue).toHaveProperty('gross');
    expect(data.revenue).toHaveProperty('returns');
    expect(data.revenue).toHaveProperty('net');
    expect(Array.isArray(data.revenue.breakdown)).toBe(true);

    // sga 세부 구조
    expect(data.sga).toHaveProperty('breakdown');
    expect(data.sga).toHaveProperty('total');
    expect(Array.isArray(data.sga.breakdown)).toBe(true);

    // 월별 추이 (연간 조회 시)
    expect(Array.isArray(data.monthlyTrend)).toBe(true);
  });

  it('월간 조회 — monthlyTrend 비어있음', async () => {
    const res = await request(app)
      .get('/api/financial/income-statement?year=2026&month=3')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.period).toBe('2026-03');
    // 월간 조회 시 monthlyTrend는 빈 배열
    expect(data.monthlyTrend).toEqual([]);
  });

  it('수치 정합성 — grossProfit = net - cogs', async () => {
    const res = await request(app)
      .get('/api/financial/income-statement?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.grossProfit).toBe(data.revenue.net - data.cogs);
  });

  it('수치 정합성 — operatingProfit = grossProfit - sga.total', async () => {
    const res = await request(app)
      .get('/api/financial/income-statement?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.operatingProfit).toBe(data.grossProfit - data.sga.total);
  });

  it('수치 정합성 — net = gross - returns', async () => {
    const res = await request(app)
      .get('/api/financial/income-statement?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.revenue.net).toBe(data.revenue.gross - data.revenue.returns);
  });

  it('year 미지정 시 현재 연도 기본값', async () => {
    const res = await request(app)
      .get('/api/financial/income-statement')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const currentYear = new Date().getFullYear();
    expect(res.body.data.period).toBe(String(currentYear));
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 대차대조표 (Balance Sheet)
// ═══════════════════════════════════════════════════════════
describe('GET /api/financial/balance-sheet', () => {
  it('올바른 구조 반환', async () => {
    const res = await request(app)
      .get('/api/financial/balance-sheet')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    // 자산
    expect(data).toHaveProperty('assets');
    expect(data.assets).toHaveProperty('inventory');
    expect(data.assets).toHaveProperty('accountsReceivable');
    expect(data.assets).toHaveProperty('total');

    // 재고자산 세부
    expect(data.assets.inventory).toHaveProperty('costValue');
    expect(data.assets.inventory).toHaveProperty('retailValue');
    expect(data.assets.inventory).toHaveProperty('totalQty');
    expect(data.assets.inventory).toHaveProperty('byLocation');
    expect(Array.isArray(data.assets.inventory.byLocation)).toBe(true);

    // 매출채권
    expect(data.assets.accountsReceivable).toHaveProperty('balance');
    expect(data.assets.accountsReceivable).toHaveProperty('count');

    // 부채
    expect(data).toHaveProperty('liabilities');
    expect(data.liabilities).toHaveProperty('accountsPayable');
    expect(data.liabilities).toHaveProperty('total');
    expect(data.liabilities.accountsPayable).toHaveProperty('balance');
    expect(data.liabilities.accountsPayable).toHaveProperty('count');

    // 자본
    expect(data).toHaveProperty('equity');
  });

  it('수치 정합성 — equity = assets.total - liabilities.total', async () => {
    const res = await request(app)
      .get('/api/financial/balance-sheet')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.equity).toBe(data.assets.total - data.liabilities.total);
  });

  it('수치 정합성 — assets.total = inventory.costValue + ar.balance', async () => {
    const res = await request(app)
      .get('/api/financial/balance-sheet')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.assets.total).toBe(
      data.assets.inventory.costValue + data.assets.accountsReceivable.balance,
    );
  });

  it('수치가 0 이상', async () => {
    const res = await request(app)
      .get('/api/financial/balance-sheet')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.assets.inventory.costValue).toBeGreaterThanOrEqual(0);
    expect(data.assets.inventory.retailValue).toBeGreaterThanOrEqual(0);
    expect(data.assets.inventory.totalQty).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 현금흐름표 (Cash Flow)
// ═══════════════════════════════════════════════════════════
describe('GET /api/financial/cash-flow', () => {
  it('올바른 구조 반환', async () => {
    const res = await request(app)
      .get('/api/financial/cash-flow?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data).toHaveProperty('year');
    expect(data.year).toBe(2026);
    expect(data).toHaveProperty('monthly');
    expect(data).toHaveProperty('summary');
    expect(Array.isArray(data.monthly)).toBe(true);
    expect(data.monthly.length).toBe(12);
  });

  it('월별 데이터 구조 확인', async () => {
    const res = await request(app)
      .get('/api/financial/cash-flow?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const firstMonth = res.body.data.monthly[0];
    expect(firstMonth).toHaveProperty('month');
    expect(firstMonth).toHaveProperty('operatingInflow');
    expect(firstMonth).toHaveProperty('operatingOutflow');
    expect(firstMonth).toHaveProperty('operatingNet');
    expect(firstMonth).toHaveProperty('investingOutflow');
    expect(firstMonth).toHaveProperty('net');
    expect(firstMonth.month).toBe(1);
  });

  it('summary 구조 확인', async () => {
    const res = await request(app)
      .get('/api/financial/cash-flow?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    expect(summary).toHaveProperty('operatingInflow');
    expect(summary).toHaveProperty('operatingOutflow');
    expect(summary).toHaveProperty('operatingNet');
    expect(summary).toHaveProperty('investingOutflow');
    expect(summary).toHaveProperty('netCashFlow');
  });

  it('수치 정합성 — summary.operatingNet = inflow - outflow', async () => {
    const res = await request(app)
      .get('/api/financial/cash-flow?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    expect(summary.operatingNet).toBe(summary.operatingInflow - summary.operatingOutflow);
  });

  it('수치 정합성 — netCashFlow = operatingNet - investingOutflow', async () => {
    const res = await request(app)
      .get('/api/financial/cash-flow?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    expect(summary.netCashFlow).toBe(summary.operatingNet - summary.investingOutflow);
  });

  it('월별 net = operatingNet - investingOutflow', async () => {
    const res = await request(app)
      .get('/api/financial/cash-flow?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    for (const m of res.body.data.monthly) {
      expect(m.net).toBe(m.operatingNet - m.investingOutflow);
      expect(m.operatingNet).toBe(m.operatingInflow - m.operatingOutflow);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 재고자산 평가 (Inventory Valuation)
// ═══════════════════════════════════════════════════════════
describe('GET /api/financial/inventory-valuation', () => {
  it('올바른 구조 반환', async () => {
    const res = await request(app)
      .get('/api/financial/inventory-valuation')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const row = res.body.data[0];
      expect(row).toHaveProperty('partner_name');
      expect(row).toHaveProperty('category');
      expect(row).toHaveProperty('product_count');
      expect(row).toHaveProperty('variant_count');
      expect(row).toHaveProperty('total_qty');
      expect(row).toHaveProperty('retail_value');
      expect(row).toHaveProperty('cost_value');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 매출원가 상세 (COGS Detail)
// ═══════════════════════════════════════════════════════════
describe('GET /api/financial/cogs-detail', () => {
  it('연간 조회 — 카테고리별 반환', async () => {
    const res = await request(app)
      .get('/api/financial/cogs-detail?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const row = res.body.data[0];
      expect(row).toHaveProperty('category');
      expect(row).toHaveProperty('sold_qty');
      expect(row).toHaveProperty('revenue');
      expect(row).toHaveProperty('cogs');
      expect(row).toHaveProperty('gross_profit');
      expect(row).toHaveProperty('margin_pct');
    }
  });

  it('월간 조회', async () => {
    const res = await request(app)
      .get('/api/financial/cogs-detail?year=2026&month=3')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. 매출 자동 연동 (Sales Revenue)
// ═══════════════════════════════════════════════════════════
describe('GET /api/financial/sales-revenue', () => {
  it('월별 매출 데이터 반환', async () => {
    const res = await request(app)
      .get('/api/financial/sales-revenue?year=2026')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data).toBe('object');
    // 키는 1~12 월 (데이터가 있는 월만)
    for (const key of Object.keys(res.body.data)) {
      const month = Number(key);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 8. 미수금 CRUD (Accounts Receivable)
// ═══════════════════════════════════════════════════════════
describe('미수금 (Accounts Receivable) CRUD', () => {
  let testArId: number;

  it('POST /api/financial/ar — 미수금 생성', async () => {
    const res = await request(app)
      .post('/api/financial/ar')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        ar_date: '2026-04-01',
        amount: 500000,
        due_date: '2026-04-30',
        memo: '테스트 미수금',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    testArId = res.body.data.ar_id;
    createdArIds.push(testArId);
    expect(res.body.data.partner_code).toBe(fixtures.store.partner_code);
    expect(Number(res.body.data.amount)).toBe(500000);
  });

  it('POST /api/financial/ar — 필수 필드 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/financial/ar')
      .set('Authorization', `Bearer ${admin}`)
      .send({ partner_code: fixtures.store.partner_code });

    expect(res.status).toBe(400);
  });

  it('POST /api/financial/ar — amount가 0 이하면 400', async () => {
    const res = await request(app)
      .post('/api/financial/ar')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        ar_date: '2026-04-01',
        amount: -100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('0보다 큰');
  });

  it('GET /api/financial/ar — 목록 조회', async () => {
    const res = await request(app)
      .get('/api/financial/ar')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/financial/ar — 필터 조회 (status)', async () => {
    const res = await request(app)
      .get('/api/financial/ar?status=PENDING')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/financial/ar — 필터 조회 (partner_code)', async () => {
    const res = await request(app)
      .get(`/api/financial/ar?partner_code=${fixtures.store.partner_code}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('PUT /api/financial/ar/:id — 상태 + 지급액 수정', async () => {
    const res = await request(app)
      .put(`/api/financial/ar/${testArId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        status: 'PARTIAL',
        paid_amount: 200000,
        memo: '부분 입금',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PARTIAL');
    expect(Number(res.body.data.paid_amount)).toBe(200000);
  });

  it('PUT /api/financial/ar/:id — 지급액이 원금 초과 시 400', async () => {
    const res = await request(app)
      .put(`/api/financial/ar/${testArId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ paid_amount: 999999999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('원금을 초과');
  });

  it('PUT /api/financial/ar/:id — 음수 지급액 시 400', async () => {
    const res = await request(app)
      .put(`/api/financial/ar/${testArId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ paid_amount: -100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('0 이상');
  });

  it('PUT /api/financial/ar/:id — 존재하지 않는 ID 시 404', async () => {
    const res = await request(app)
      .put('/api/financial/ar/999999999')
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'COMPLETED' });

    // paid_amount 검증이 없으므로 ID만 체크 → 404 또는 200
    // paid_amount를 보내지 않으면 ID 체크 안 함 (UPDATE가 0 rows)
    // 실제로는 UPDATE ... RETURNING * 결과가 0이므로 404
    expect(res.status).toBe(404);
  });

  it('DELETE /api/financial/ar/:id — 삭제', async () => {
    // 삭제용 미수금 생성
    const createRes = await request(app)
      .post('/api/financial/ar')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        ar_date: '2026-04-01',
        amount: 100000,
      });
    const deleteId = createRes.body.data.ar_id;
    // cleanup에도 추가 (afterAll에서 이미 삭제 시도)
    createdArIds.push(deleteId);

    const res = await request(app)
      .delete(`/api/financial/ar/${deleteId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('HQ_MANAGER: POST /api/financial/ar → 403', async () => {
    const res = await request(app)
      .post('/api/financial/ar')
      .set('Authorization', `Bearer ${hqMgr}`)
      .send({
        partner_code: fixtures.store.partner_code,
        ar_date: '2026-04-01',
        amount: 100000,
      });

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════
// 9. 미지급금 CRUD (Accounts Payable)
// ═══════════════════════════════════════════════════════════
describe('미지급금 (Accounts Payable) CRUD', () => {
  let testApId: number;

  it('POST /api/financial/ap — 미지급금 생성', async () => {
    const res = await request(app)
      .post('/api/financial/ap')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        partner_code: fixtures.store.partner_code,
        ap_date: '2026-04-01',
        amount: 300000,
        due_date: '2026-05-01',
        category: '원부자재',
        memo: '테스트 미지급금',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    testApId = res.body.data.ap_id;
    createdApIds.push(testApId);
    expect(Number(res.body.data.amount)).toBe(300000);
  });

  it('POST /api/financial/ap — partner_code 없이도 생성 가능', async () => {
    const res = await request(app)
      .post('/api/financial/ap')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        ap_date: '2026-04-01',
        amount: 150000,
        category: '기타',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    createdApIds.push(res.body.data.ap_id);
  });

  it('POST /api/financial/ap — ap_date 누락 시 400', async () => {
    const res = await request(app)
      .post('/api/financial/ap')
      .set('Authorization', `Bearer ${admin}`)
      .send({ amount: 100000 });

    expect(res.status).toBe(400);
  });

  it('POST /api/financial/ap — amount가 0 이하면 400', async () => {
    const res = await request(app)
      .post('/api/financial/ap')
      .set('Authorization', `Bearer ${admin}`)
      .send({ ap_date: '2026-04-01', amount: 0 });

    expect(res.status).toBe(400);
    // amount=0 is falsy, so the first validation (!amount) catches it with '필수' message
    expect(res.body.error).toContain('필수');
  });

  it('GET /api/financial/ap — 목록 조회', async () => {
    const res = await request(app)
      .get('/api/financial/ap')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/financial/ap — 필터 조회 (category)', async () => {
    const res = await request(app)
      .get('/api/financial/ap?category=원부자재')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /api/financial/ap/:id — 지급 처리', async () => {
    const res = await request(app)
      .put(`/api/financial/ap/${testApId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        status: 'PARTIAL',
        paid_amount: 100000,
        memo: '1차 지급',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PARTIAL');
    expect(Number(res.body.data.paid_amount)).toBe(100000);
  });

  it('PUT /api/financial/ap/:id — 지급액이 원금 초과 시 400', async () => {
    const res = await request(app)
      .put(`/api/financial/ap/${testApId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ paid_amount: 999999999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('원금을 초과');
  });

  it('PUT /api/financial/ap/:id — 음수 지급액 시 400', async () => {
    const res = await request(app)
      .put(`/api/financial/ap/${testApId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ paid_amount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('0 이상');
  });

  it('PUT /api/financial/ap/:id — 존재하지 않는 ID 시 404', async () => {
    const res = await request(app)
      .put('/api/financial/ap/999999999')
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/financial/ap/:id — 삭제', async () => {
    const createRes = await request(app)
      .post('/api/financial/ap')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        ap_date: '2026-04-01',
        amount: 50000,
      });
    const deleteId = createRes.body.data.ap_id;
    createdApIds.push(deleteId);

    const res = await request(app)
      .delete(`/api/financial/ap/${deleteId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('HQ_MANAGER: POST /api/financial/ap → 403', async () => {
    const res = await request(app)
      .post('/api/financial/ap')
      .set('Authorization', `Bearer ${hqMgr}`)
      .send({ ap_date: '2026-04-01', amount: 100000 });

    expect(res.status).toBe(403);
  });

  it('STORE_MANAGER: DELETE /api/financial/ap/:id → 403', async () => {
    const res = await request(app)
      .delete(`/api/financial/ap/${testApId}`)
      .set('Authorization', `Bearer ${storeMgr}`);

    expect(res.status).toBe(403);
  });
});
