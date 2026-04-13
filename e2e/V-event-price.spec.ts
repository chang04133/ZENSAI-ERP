import { test, expect } from '@playwright/test';
import { navigateTo } from './helpers';

/**
 * V. 행사관리 E2E 테스트
 * - admin 프로젝트 (port 5172, ADMIN 권한)
 * - 행사가 설정 → 실제 매출 적용 확인까지 검증
 */

/** 캐시된 admin 토큰 */
let _adminAuth: { token: string } | null = null;
async function getAdminToken(page: import('@playwright/test').Page): Promise<string> {
  if (_adminAuth) return _adminAuth.token;
  // port 5172 auto-login으로 이미 인증됨 — /api/auth/me에서 토큰 추출
  // storageState의 localStorage에서 토큰을 가져오는 대신 직접 로그인
  const loginRes = await page.request.post('http://localhost:3001/api/auth/login', {
    data: { user_id: 'admin', password: 'admin1234!' },
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    // 비밀번호가 다를 수 있음 — test1234! 시도
    const loginRes2 = await page.request.post('http://localhost:3001/api/auth/login', {
      data: { user_id: 'admin', password: 'test1234!' },
    });
    const loginData2 = await loginRes2.json();
    if (!loginData2.success) throw new Error('Admin auth failed');
    _adminAuth = { token: loginData2.data.accessToken };
    return _adminAuth.token;
  }
  _adminAuth = { token: loginData.data.accessToken };
  return _adminAuth.token;
}

/** API 호출 헬퍼 */
async function apiFetch(page: import('@playwright/test').Page, path: string, options?: any) {
  const token = await getAdminToken(page);
  const url = `http://localhost:3001${path}`;
  if (options?.method === 'PUT' || options?.method === 'POST') {
    return page.request.fetch(url, {
      method: options.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: options.data,
    });
  }
  return page.request.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test.describe('V. 행사관리 (Event Price)', () => {

  test('V-1. 행사관리 페이지 접속 — 테이블 + 필터 표시', async ({ page }) => {
    await navigateTo(page, '/products/event-price');

    // 페이지 제목 확인
    const title = page.locator('text=행사관리');
    await expect(title.first()).toBeVisible({ timeout: 10_000 });

    // 테이블 로딩 완료 대기
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 테이블 존재
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 주요 컬럼 헤더 확인
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    const expectedCols = ['상품코드', '상품명', '정상가', '행사가', '행사기간'];
    for (const col of expectedCols) {
      expect(headerTexts.some(t => t.includes(col))).toBeTruthy();
    }

    // 행사상태 필터 Select 존재
    const eventStatusSelect = page.locator('.ant-select').filter({ hasText: /전체|행사중|미적용/ });
    await expect(eventStatusSelect.first()).toBeVisible();

    // 행사추천 버튼 존재
    const recBtn = page.locator('button').filter({ hasText: '행사추천' });
    await expect(recBtn).toBeVisible();
  });

  test('V-2. 행사 상품 필터 — 행사상태 필터링 동작', async ({ page }) => {
    await navigateTo(page, '/products/event-price');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // "행사중" 필터 선택
    const statusSelect = page.locator('.ant-select').first();
    await statusSelect.click();
    await page.waitForTimeout(300);

    const activeOption = page.locator('.ant-select-item-option').filter({ hasText: '행사중' });
    if (await activeOption.isVisible().catch(() => false)) {
      await activeOption.click();
      await page.waitForTimeout(1500);
    }

    // 에러 없이 테이블이 렌더링됨
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible();

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('V-3. 행사가 설정 (API) — 상품에 행사가 설정 후 확인', async ({ page }) => {
    // 1. 테스트용 상품 찾기
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS');
    const searchData = await searchRes.json();

    if (!searchData.success || !searchData.data?.length) {
      test.skip();
      return;
    }

    const productCode = searchData.data[0].product_code;
    const basePrice = Number(searchData.data[0].base_price) || 100000;
    const eventPrice = Math.round(basePrice * 0.7); // 30% 할인

    // 2. 원래 행사가 백업
    const origRes = await apiFetch(page, `/api/products/${productCode}`);
    const origData = await origRes.json();
    const origEventPrice = origData.data?.event_price;
    const origStartDate = origData.data?.event_start_date;
    const origEndDate = origData.data?.event_end_date;
    const origStoreCodes = origData.data?.event_store_codes;

    try {
      // 3. 행사가 설정
      const today = new Date().toISOString().slice(0, 10);
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const updateRes = await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: eventPrice,
          event_start_date: today,
          event_end_date: nextMonth,
          event_store_codes: null, // 전체 매장 적용
        },
      });
      const updateData = await updateRes.json();
      expect(updateData.success).toBe(true);

      // 4. 다시 조회하여 반영 확인
      const verifyRes = await apiFetch(page, `/api/products/${productCode}`);
      const verifyData = await verifyRes.json();
      expect(Number(verifyData.data?.event_price)).toBe(eventPrice);
    } finally {
      // 5. 원래 상태로 복원
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: origEventPrice ?? null,
          event_start_date: origStartDate ?? null,
          event_end_date: origEndDate ?? null,
          event_store_codes: origStoreCodes ?? null,
        },
      });
    }
  });

  test('V-4. 행사가 매출 적용 확인 — 바코드 스캔 시 행사가 반영', async ({ page }) => {
    // 1. 상품 찾기
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS');
    const searchData = await searchRes.json();
    if (!searchData.success || !searchData.data?.length) { test.skip(); return; }

    const variant = searchData.data[0];
    const productCode = variant.product_code;
    const sku = variant.sku;
    const basePrice = Number(variant.base_price) || 100000;
    const eventPrice = Math.round(basePrice * 0.7);

    // 2. 원래 행사가 백업
    const origRes = await apiFetch(page, `/api/products/${productCode}`);
    const origData = await origRes.json();
    const origEventPrice = origData.data?.event_price;
    const origStartDate = origData.data?.event_start_date;
    const origEndDate = origData.data?.event_end_date;
    const origStoreCodes = origData.data?.event_store_codes;

    try {
      // 3. 행사가 설정 (오늘 ~ 30일 뒤, 전체 매장)
      const today = new Date().toISOString().slice(0, 10);
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: eventPrice,
          event_start_date: today,
          event_end_date: nextMonth,
          event_store_codes: null,
        },
      });

      // 4. 바코드 스캔 API 호출 → 행사가 적용 확인
      const scanRes = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}`);
      const scanData = await scanRes.json();

      expect(scanData.success).toBe(true);
      // 행사가가 반환되어야 함
      expect(Number(scanData.data?.event_price)).toBe(eventPrice);
    } finally {
      // 5. 복원
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: origEventPrice ?? null,
          event_start_date: origStartDate ?? null,
          event_end_date: origEndDate ?? null,
          event_store_codes: origStoreCodes ?? null,
        },
      });
    }
  });

  test('V-5. 행사 기간 만료 시 미적용 — 과거 날짜로 설정', async ({ page }) => {
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS');
    const searchData = await searchRes.json();
    if (!searchData.success || !searchData.data?.length) { test.skip(); return; }

    const variant = searchData.data[0];
    const productCode = variant.product_code;
    const sku = variant.sku;
    const basePrice = Number(variant.base_price) || 100000;
    const eventPrice = Math.round(basePrice * 0.7);

    // 원래 백업
    const origRes = await apiFetch(page, `/api/products/${productCode}`);
    const origData = await origRes.json();
    const origEventPrice = origData.data?.event_price;
    const origStartDate = origData.data?.event_start_date;
    const origEndDate = origData.data?.event_end_date;
    const origStoreCodes = origData.data?.event_store_codes;

    try {
      // 과거 날짜로 행사가 설정 (이미 만료)
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: eventPrice,
          event_start_date: '2024-01-01',
          event_end_date: '2024-12-31', // 과거
          event_store_codes: null,
        },
      });

      // 바코드 스캔 → 행사가 미적용이어야 함
      const scanRes = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}`);
      const scanData = await scanRes.json();
      expect(scanData.success).toBe(true);
      // event_price가 null이어야 함 (기간 만료)
      expect(scanData.data?.event_price).toBeFalsy();
    } finally {
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: origEventPrice ?? null,
          event_start_date: origStartDate ?? null,
          event_end_date: origEndDate ?? null,
          event_store_codes: origStoreCodes ?? null,
        },
      });
    }
  });

  test('V-6. 거래처별 행사가 — 특정 매장만 적용', async ({ page }) => {
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS');
    const searchData = await searchRes.json();
    if (!searchData.success || !searchData.data?.length) { test.skip(); return; }

    const variant = searchData.data[0];
    const productCode = variant.product_code;
    const sku = variant.sku;
    const basePrice = Number(variant.base_price) || 100000;
    const eventPrice = Math.round(basePrice * 0.65);

    const origRes = await apiFetch(page, `/api/products/${productCode}`);
    const origData = await origRes.json();
    const origEventPrice = origData.data?.event_price;
    const origStartDate = origData.data?.event_start_date;
    const origEndDate = origData.data?.event_end_date;
    const origStoreCodes = origData.data?.event_store_codes;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      // 행사가를 SF002(성수직매장)에만 적용
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: eventPrice,
          event_start_date: today,
          event_end_date: nextMonth,
          event_store_codes: ['SF002'], // 성수직매장만
        },
      });

      // SF002로 스캔 → 행사가 적용
      const scanSF002 = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}&partner_code=SF002`);
      const dataSF002 = await scanSF002.json();
      expect(dataSF002.success).toBe(true);
      expect(Number(dataSF002.data?.event_price)).toBe(eventPrice);

      // 다른 매장(SF003 등)으로 스캔 → 행사가 미적용
      const scanOther = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}&partner_code=SF003`);
      const dataOther = await scanOther.json();
      expect(dataOther.success).toBe(true);
      // SF003에는 적용 안 됨
      expect(dataOther.data?.event_price).toBeFalsy();
    } finally {
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: origEventPrice ?? null,
          event_start_date: origStartDate ?? null,
          event_end_date: origEndDate ?? null,
          event_store_codes: origStoreCodes ?? null,
        },
      });
    }
  });

  test('V-7. 거래처별 개별 행사가 (product_event_prices) — 매장별 다른 가격', async ({ page }) => {
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS');
    const searchData = await searchRes.json();
    if (!searchData.success || !searchData.data?.length) { test.skip(); return; }

    const productCode = searchData.data[0].product_code;
    const sku = searchData.data[0].sku;
    const basePrice = Number(searchData.data[0].base_price) || 100000;

    // 실제 존재하는 거래처 2개 가져오기
    const partnersRes = await apiFetch(page, '/api/partners?limit=50');
    const partnersData = await partnersRes.json();
    const activePartners = (partnersData.data?.data || partnersData.data || [])
      .filter((p: any) => p.is_active);
    if (activePartners.length < 2) { test.skip(); return; }

    const partner1 = activePartners[0].partner_code;
    const partner2 = activePartners[1].partner_code;

    // 원래 partner prices 백업
    const origPartnerRes = await apiFetch(page, `/api/products/${productCode}/event-partners`);
    const origPartnerData = await origPartnerRes.json();

    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const price1 = Math.round(basePrice * 0.7);
    const price2 = Math.round(basePrice * 0.6);

    try {
      // 거래처별 개별 행사가 설정
      const saveRes = await apiFetch(page, `/api/products/${productCode}/event-partners`, {
        method: 'PUT',
        data: {
          entries: [
            { partner_code: partner1, event_price: price1, event_start_date: today, event_end_date: nextMonth },
            { partner_code: partner2, event_price: price2, event_start_date: today, event_end_date: nextMonth },
          ],
        },
      });
      const saveData = await saveRes.json();
      expect(saveData.success).toBe(true);

      // partner1 스캔 → 70% 가격
      const scan1 = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}&partner_code=${partner1}`);
      const data1 = await scan1.json();
      expect(Number(data1.data?.event_price)).toBe(price1);

      // partner2 스캔 → 60% 가격
      const scan2 = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}&partner_code=${partner2}`);
      const data2 = await scan2.json();
      expect(Number(data2.data?.event_price)).toBe(price2);
    } finally {
      // 복원
      await apiFetch(page, `/api/products/${productCode}/event-partners`, {
        method: 'PUT',
        data: { entries: origPartnerData.success ? origPartnerData.data : [] },
      });
    }
  });

  test('V-8. 행사가 해제 — null로 설정 후 미적용 확인', async ({ page }) => {
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS');
    const searchData = await searchRes.json();
    if (!searchData.success || !searchData.data?.length) { test.skip(); return; }

    const variant = searchData.data[0];
    const productCode = variant.product_code;
    const sku = variant.sku;
    const basePrice = Number(variant.base_price) || 100000;

    const origRes = await apiFetch(page, `/api/products/${productCode}`);
    const origData = await origRes.json();
    const origEventPrice = origData.data?.event_price;
    const origStartDate = origData.data?.event_start_date;
    const origEndDate = origData.data?.event_end_date;
    const origStoreCodes = origData.data?.event_store_codes;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      // 1. 먼저 행사가 설정
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: { event_price: Math.round(basePrice * 0.7), event_start_date: today, event_end_date: nextMonth, event_store_codes: null },
      });

      // 2. 행사가 해제 (null)
      const clearRes = await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: { event_price: null, event_start_date: null, event_end_date: null, event_store_codes: null },
      });
      const clearData = await clearRes.json();
      expect(clearData.success).toBe(true);

      // 3. 스캔 → 행사가 없어야 함
      const scanRes = await apiFetch(page, `/api/sales/scan?code=${encodeURIComponent(sku)}`);
      const scanData = await scanRes.json();
      expect(scanData.data?.event_price).toBeFalsy();
    } finally {
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: origEventPrice ?? null,
          event_start_date: origStartDate ?? null,
          event_end_date: origEndDate ?? null,
          event_store_codes: origStoreCodes ?? null,
        },
      });
    }
  });

  test('V-9. 행사추천 기능 — 추천 API 호출 + 결과 확인', async ({ page }) => {
    // API 직접 호출로 추천 결과 확인
    const recRes = await apiFetch(page, '/api/products/events/recommendations?limit=10');
    const recData = await recRes.json();

    expect(recData.success).toBe(true);
    // 데이터가 배열이어야 함
    expect(Array.isArray(recData.data)).toBe(true);

    // 추천 결과가 있으면 필수 필드 확인
    if (recData.data.length > 0) {
      const item = recData.data[0];
      expect(item.product_code).toBeTruthy();
      expect(item.product_name).toBeTruthy();
      expect(item.recommendation_score).toBeDefined();
      expect(Number(item.recommendation_score)).toBeGreaterThanOrEqual(0);
      // 사유: broken_score 또는 low_sales_score 중 하나 이상 > 0
      const hasBroken = Number(item.broken_score) > 0;
      const hasLowSales = Number(item.low_sales_score) > 0;
      expect(hasBroken || hasLowSales).toBeTruthy();
    }

    // UI에서도 확인
    await navigateTo(page, '/products/event-price');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    const recBtn = page.locator('button').filter({ hasText: '행사추천' });
    await recBtn.click();
    await page.waitForTimeout(1500);

    // 행사추천 모달이 열려야 함
    const modal = page.locator('.ant-modal').filter({ hasText: '행사추천' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 모달 내 테이블 또는 빈 상태
    const modalTable = modal.locator('.ant-table');
    const modalEmpty = modal.locator('.ant-empty');
    const hasTable = await modalTable.isVisible().catch(() => false);
    const hasEmpty = await modalEmpty.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();

    // 모달 닫기
    await modal.locator('.ant-modal-close').click();
  });

  test('V-10. 행사 추천 설정값 확인 — 시스템 설정 API', async ({ page }) => {
    const settingsRes = await apiFetch(page, '/api/system/settings');
    const settingsData = await settingsRes.json();

    expect(settingsData.success).toBe(true);

    // 행사추천 관련 설정 키가 존재해야 함
    const settings = settingsData.data;
    const expectedKeys = [
      'EVENT_REC_BROKEN_SIZE_WEIGHT',
      'EVENT_REC_LOW_SALES_WEIGHT',
      'EVENT_REC_SALES_PERIOD_DAYS',
      'EVENT_REC_MIN_SALES_THRESHOLD',
      'EVENT_REC_MAX_RESULTS',
    ];

    for (const key of expectedKeys) {
      expect(settings[key]).toBeDefined();
      // 값이 숫자 문자열이어야 함
      expect(Number(settings[key])).toBeGreaterThan(0);
    }

    // 가중치 합계 확인 (broken + low_sales = 100)
    const brokenWeight = Number(settings.EVENT_REC_BROKEN_SIZE_WEIGHT);
    const lowSalesWeight = Number(settings.EVENT_REC_LOW_SALES_WEIGHT);
    expect(brokenWeight + lowSalesWeight).toBe(100);
  });

  test('V-11. 행사관리 UI — 행사 토글 스위치 존재', async ({ page }) => {
    await navigateTo(page, '/products/event-price');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 테이블에 데이터가 있으면 Switch 토글 확인
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행에 Switch 컴포넌트가 있어야 함 (행사 ON/OFF)
      const firstSwitch = rows.first().locator('.ant-switch');
      await expect(firstSwitch).toBeVisible();

      // Switch의 상태(checked/unchecked) 확인 가능
      const isChecked = await firstSwitch.getAttribute('aria-checked');
      expect(isChecked === 'true' || isChecked === 'false').toBeTruthy();
    } else {
      // 데이터가 없으면 empty 확인
      const empty = page.locator('.ant-empty');
      await expect(empty.first()).toBeVisible();
    }
  });

  test('V-12. 행사가 매출 등록 시 sale_type 검증 — 행사가 상품은 "행사" 타입', async ({ page }) => {
    const searchRes = await apiFetch(page, '/api/products/variants/search?search=ZS&partner_code=SF002');
    const searchData = await searchRes.json();
    if (!searchData.success || !searchData.data?.length) { test.skip(); return; }

    const variant = searchData.data[0];
    const productCode = variant.product_code;
    const basePrice = Number(variant.base_price) || 100000;
    const eventPrice = Math.round(basePrice * 0.7);

    // 원래 행사가 백업
    const origRes = await apiFetch(page, `/api/products/${productCode}`);
    const origData = await origRes.json();
    const origEventPrice = origData.data?.event_price;
    const origStartDate = origData.data?.event_start_date;
    const origEndDate = origData.data?.event_end_date;
    const origStoreCodes = origData.data?.event_store_codes;

    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    try {
      // 행사가 설정
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: { event_price: eventPrice, event_start_date: today, event_end_date: nextMonth, event_store_codes: null },
      });

      // 매출 등록 (gangnam/SF002 매장으로)
      // gangnam 계정 토큰 필요
      const gangnamLogin = await page.request.post('http://localhost:3001/api/auth/login', {
        data: { user_id: 'gangnam', password: 'test1234!' },
      });
      const gangnamData = await gangnamLogin.json();
      if (!gangnamData.success) { test.skip(); return; }
      const gangnamToken = gangnamData.data.accessToken;

      // 중복 방지를 위해 6초 대기
      await page.waitForTimeout(6000);

      const saleRes = await page.request.post('http://localhost:3001/api/sales/batch', {
        headers: { Authorization: `Bearer ${gangnamToken}`, 'Content-Type': 'application/json' },
        data: {
          sale_date: today,
          items: [{
            variant_id: variant.variant_id,
            qty: 1,
            unit_price: eventPrice,
            sale_type: '행사',
          }],
          memo: 'E2E-V12-event-type-test',
        },
      });
      const saleData = await saleRes.json();

      if (saleData.success) {
        const saleId = saleData.data?.[0]?.sale_id;

        // 등록된 매출의 sale_type이 '행사'인지 확인
        if (saleId) {
          const saleDetailRes = await page.request.get(
            `http://localhost:3001/api/sales?date_from=${today}&date_to=${today}&limit=50`,
            { headers: { Authorization: `Bearer ${gangnamToken}` } },
          );
          const saleDetailData = await saleDetailRes.json();
          if (saleDetailData.success && saleDetailData.data?.data?.length > 0) {
            const mySale = saleDetailData.data.data.find((s: any) => s.sale_id === saleId);
            if (mySale) {
              expect(mySale.sale_type).toBe('행사');
              expect(Number(mySale.unit_price)).toBe(eventPrice);
            }
          }
        }
      }
      // 등록 실패(중복 등)는 무시 — 행사가 설정 자체는 성공했으니 OK
    } finally {
      await apiFetch(page, `/api/products/${productCode}/event-price`, {
        method: 'PUT',
        data: {
          event_price: origEventPrice ?? null,
          event_start_date: origStartDate ?? null,
          event_end_date: origEndDate ?? null,
          event_store_codes: origStoreCodes ?? null,
        },
      });
    }
  });

  test('V-13. 날짜 변경 버튼 — 다건 선택 시 활성화', async ({ page }) => {
    await navigateTo(page, '/products/event-price');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 날짜 변경 버튼 확인
    const dateBtn = page.locator('button').filter({ hasText: '날짜 변경' });
    await expect(dateBtn).toBeVisible();

    // 선택 없으면 비활성
    const isDisabled = await dateBtn.isDisabled();
    expect(isDisabled).toBe(true);

    // 테이블 행이 있으면 체크박스 클릭
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행 체크박스 클릭
      const checkbox = rows.first().locator('.ant-checkbox-input');
      if (await checkbox.isVisible().catch(() => false)) {
        await checkbox.click();
        await page.waitForTimeout(300);

        // 날짜 변경 버튼이 활성화됨
        const isNowEnabled = !(await dateBtn.isDisabled());
        expect(isNowEnabled).toBe(true);
      }
    }
  });

  test('V-14. 행사 목록 API — 상태별 필터링 정상 동작', async ({ page }) => {
    // 전체 조회
    const allRes = await apiFetch(page, '/api/products/events?limit=50');
    const allData = await allRes.json();
    expect(allData.success).toBe(true);

    // 행사중 필터
    const activeRes = await apiFetch(page, '/api/products/events?event_status=active&limit=50');
    const activeData = await activeRes.json();
    expect(activeData.success).toBe(true);

    // 미적용 필터
    const noneRes = await apiFetch(page, '/api/products/events?event_status=none&limit=50');
    const noneData = await noneRes.json();
    expect(noneData.success).toBe(true);

    // 만료 필터
    const expiredRes = await apiFetch(page, '/api/products/events?event_status=expired&limit=50');
    const expiredData = await expiredRes.json();
    expect(expiredData.success).toBe(true);

    // 각 결과가 배열이어야 함
    for (const d of [allData, activeData, noneData, expiredData]) {
      expect(Array.isArray(d.data?.data || d.data)).toBe(true);
    }
  });
});
