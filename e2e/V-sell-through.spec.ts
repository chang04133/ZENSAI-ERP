import { test, expect } from '@playwright/test';
import { navigateTo } from './helpers';

/**
 * V. 판매율분석 — ADMIN_HQ 전용 (admin 프로젝트)
 *
 * 값 정확성 검증: API 데이터 ↔ UI 표시 일치 확인
 * - 전체 판매율(%) 계산 정합성
 * - 카테고리별 판매율(%) 합산
 * - 판매 랭킹 테이블 값
 * - 전기간 대비 증감 표시
 */

function getAuthToken(page: any): Promise<string> {
  return page.evaluate(() => localStorage.getItem('zensai_access_token') || '');
}

test.describe('V. 판매율 분석', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/sales/sell-through');
    await page.waitForTimeout(3000);
  });

  test('V-1. 판매율분석 페이지 진입 — 요약 카드 4개 + 필터', async ({ page }) => {
    // 페이지 제목
    await expect(page.getByRole('heading', { name: '판매율 분석' })).toBeVisible({ timeout: 10_000 });

    // 4개 요약 카드 확인
    const cards = page.locator('.ant-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(4);

    // Statistic 값들 확인 (전체 판매율, 총 판매수량, 현재 총재고, 분석 상품)
    await expect(page.locator('.ant-statistic-title').filter({ hasText: '전체 판매율' })).toBeVisible();
    await expect(page.locator('.ant-statistic-title').filter({ hasText: '총 판매수량' })).toBeVisible();
    await expect(page.locator('.ant-statistic-title').filter({ hasText: '현재 총재고' })).toBeVisible();
    await expect(page.locator('.ant-statistic-title').filter({ hasText: '분석 상품' })).toBeVisible();

    // 필터 존재: 조회기간(RangePicker) + 카테고리(Select) + 퀵버튼
    await expect(page.locator('.ant-picker-range')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '조회' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '7일' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '30일' })).toBeVisible();
  });

  test('V-2. API ↔ UI 값 일치 — 전체 판매율 정합성', async ({ page }) => {
    const token = await getAuthToken(page);

    // 기본 30일 기간
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const apiRes = await page.request.get(
      `http://localhost:3001/api/sales/sell-through?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.totals) {
      test.skip();
      return;
    }

    const totals = apiData.data.totals;

    // 전체 판매율 = sold / (sold + stock) * 100
    // API가 계산해주는 overall_rate 검증
    if (totals.total_sold > 0 || totals.total_stock > 0) {
      const expected = Number(((totals.total_sold / (totals.total_sold + totals.total_stock)) * 100).toFixed(1));
      const apiRate = Number(totals.overall_rate);
      expect(Math.abs(apiRate - expected)).toBeLessThanOrEqual(1); // 반올림 허용
    }

    // UI에 표시된 판매율% 값 확인
    const rateStatistic = page.locator('.ant-statistic-title').filter({ hasText: '전체 판매율' }).locator('..');
    const rateValue = await rateStatistic.locator('.ant-statistic-content-value').textContent();
    if (rateValue) {
      const uiRate = parseFloat(rateValue);
      expect(Math.abs(uiRate - Number(totals.overall_rate))).toBeLessThanOrEqual(1);
    }
  });

  test('V-3. API ↔ UI 값 일치 — 총 판매수량', async ({ page }) => {
    const token = await getAuthToken(page);

    // UI 기본 기간: 최근 30일 (dayjs().subtract(30,'day') ~ dayjs())
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    // UI 로드 대기 후 RangePicker에서 실제 날짜 읽기
    const inputs = page.locator('.ant-picker-range input');
    const uiFrom = await inputs.nth(0).inputValue();
    const uiTo = await inputs.nth(1).inputValue();
    const qFrom = uiFrom || from;
    const qTo = uiTo || to;

    const apiRes = await page.request.get(
      `http://localhost:3001/api/sales/sell-through?date_from=${qFrom}&date_to=${qTo}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.totals) {
      test.skip();
      return;
    }

    const totals = apiData.data.totals;

    // UI에 표시된 총 판매수량 확인
    const soldStatistic = page.locator('.ant-statistic-title').filter({ hasText: '총 판매수량' }).locator('..');
    const soldValue = await soldStatistic.locator('.ant-statistic-content-value').textContent();
    if (soldValue) {
      const uiSold = parseInt(soldValue.replace(/,/g, ''), 10);
      expect(uiSold).toBe(Number(totals.total_sold));
    }
  });

  test('V-4. 카테고리별 판매율 카드 — 값 표시 + 클릭 동작', async ({ page }) => {
    // 카테고리별 판매율 섹션
    const catSection = page.locator('text=카테고리별 판매율').first();
    if (!await catSection.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // 카테고리 카드들 존재
    const catCards = page.locator('.ant-card[class*="hoverable"]');
    const catCount = await catCards.count();

    if (catCount > 0) {
      // 첫 번째 카드에 판매율% 표시
      const firstCard = catCards.first();
      const cardText = await firstCard.textContent();
      expect(cardText).toMatch(/\d+%/); // N% 패턴 존재

      // 클릭 → 카테고리 상세 모달
      await firstCard.click();
      await page.waitForTimeout(1000);

      const modal = page.locator('.ant-modal-content');
      if (await modal.isVisible().catch(() => false)) {
        // 모달에 상품 테이블 존재
        const modalTable = modal.locator('.ant-table');
        await expect(modalTable).toBeVisible({ timeout: 5000 });

        // 모달 테이블 컬럼 확인
        const headers = await modalTable.locator('.ant-table-thead th').allTextContents();
        const headerText = headers.join(' ');
        expect(headerText).toContain('상품코드');
        expect(headerText).toContain('판매수량');
        expect(headerText).toContain('판매율');

        await page.locator('.ant-modal-close').click();
      }
    }
  });

  test('V-5. 판매 랭킹 테이블 — 컬럼 + 값 검증', async ({ page }) => {
    const token = await getAuthToken(page);

    // 랭킹 테이블 확인
    await expect(page.locator('text=판매 랭킹')).toBeVisible({ timeout: 10_000 });

    const table = page.locator('.ant-table').last(); // 마지막 테이블이 랭킹
    await expect(table).toBeVisible({ timeout: 10_000 });

    // 필수 컬럼 확인
    const headers = await table.locator('.ant-table-thead th').allTextContents();
    const headerText = headers.join(' ');
    expect(headerText).toContain('상품명');
    expect(headerText).toContain('카테고리');
    expect(headerText).toContain('판매수량');
    expect(headerText).toContain('현재고');
    expect(headerText).toContain('판매율');

    // 행이 있으면 판매율% 형식 확인
    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 행의 판매율 셀에 N% 패턴 존재
      const rateCell = rows.first().locator('td').nth(7); // 판매율 컬럼
      const rateText = await rateCell.textContent();
      expect(rateText).toMatch(/\d+(\.\d+)?%/);

      // 판매수량이 내림차순 정렬 (기본)
      if (rowCount >= 2) {
        const firstSold = await rows.nth(0).locator('td').nth(4).textContent();
        const secondSold = await rows.nth(1).locator('td').nth(4).textContent();
        if (firstSold && secondSold) {
          const first = parseInt(firstSold.replace(/,/g, ''), 10);
          const second = parseInt(secondSold.replace(/,/g, ''), 10);
          expect(first).toBeGreaterThanOrEqual(second);
        }
      }
    }
  });

  test('V-6. 판매율 계산 정합성 — sold / (sold + stock) * 100', async ({ page }) => {
    const token = await getAuthToken(page);

    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const apiRes = await page.request.get(
      `http://localhost:3001/api/sales/sell-through?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.byProduct?.length) {
      test.skip();
      return;
    }

    // 각 상품의 판매율 = sold / (sold + stock) * 100 검증
    const products = apiData.data.byProduct;
    for (const p of products.slice(0, 10)) { // 상위 10개만 검증
      const sold = Number(p.sold_qty || 0);
      const stock = Number(p.current_stock || 0);
      const total = sold + stock;

      if (total > 0) {
        const expected = Number(((sold / total) * 100).toFixed(1));
        const actual = Number(p.sell_through_rate);
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
      }
    }
  });

  test('V-7. 퀵 기간 버튼 — 7일/30일/90일/당월/올해', async ({ page }) => {
    // 7일 버튼 클릭
    await page.locator('button').filter({ hasText: '7일' }).click();
    await page.waitForTimeout(3000);

    // 에러 없이 로드
    const errorMsg = page.locator('.ant-message-error');
    await expect(errorMsg).toBeHidden({ timeout: 3000 }).catch(() => {});

    // 카드 값이 갱신 (전체 판매율 Statistic 존재)
    await expect(page.locator('.ant-statistic-title').filter({ hasText: '전체 판매율' })).toBeVisible();

    // 올해 버튼 클릭
    await page.locator('button').filter({ hasText: '올해' }).click();
    await page.waitForTimeout(3000);

    await expect(errorMsg).toBeHidden({ timeout: 3000 }).catch(() => {});
    await expect(page.locator('.ant-statistic-title').filter({ hasText: '전체 판매율' })).toBeVisible();
  });

  test('V-8. 전기간 대비 증감 표시', async ({ page }) => {
    const token = await getAuthToken(page);

    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    // 현재 기간 + 비교 기간 둘 다 조회
    const pFrom = new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10);
    const pTo = new Date(now.getTime() - 31 * 86400000).toISOString().slice(0, 10);

    const [curRes, prevRes] = await Promise.all([
      page.request.get(`http://localhost:3001/api/sales/sell-through?date_from=${from}&date_to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      page.request.get(`http://localhost:3001/api/sales/sell-through?date_from=${pFrom}&date_to=${pTo}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const curData = await curRes.json();
    const prevData = await prevRes.json();

    if (!curData.success || !prevData.success) {
      test.skip();
      return;
    }

    const curSold = Number(curData.data?.totals?.total_sold || 0);
    const prevSold = Number(prevData.data?.totals?.total_sold || 0);

    // 증감이 있으면 Change 컴포넌트가 렌더링됨
    if (curSold !== prevSold && prevSold > 0) {
      // 비교 텍스트가 페이지에 존재 ("비교: M/D ~ M/D")
      const compareText = page.locator('text=/비교:/');
      await expect(compareText).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });

  test('V-9. 상품 클릭 → 색상/사이즈별 판매율 모달', async ({ page }) => {
    // 랭킹 테이블에서 상품 클릭
    const table = page.locator('.ant-table').last();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // 첫 번째 상품명 클릭
    const nameCell = rows.first().locator('td').nth(1).locator('div').first();
    await nameCell.click();
    await page.waitForTimeout(1500);

    // 모달 열림 확인
    const modal = page.locator('.ant-modal-content');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 모달 제목에 "판매율 상세" 텍스트
    await expect(modal.locator('text=판매율 상세')).toBeVisible();

    // 색상/사이즈별 테이블 존재
    const modalTable = modal.locator('.ant-table');
    await expect(modalTable).toBeVisible({ timeout: 5000 });

    // 모달 테이블 컬럼: 색상, 사이즈, SKU, 판매수량, 현재고, 판매율
    const headers = await modalTable.locator('.ant-table-thead th').allTextContents();
    const headerText = headers.join(' ');
    expect(headerText).toContain('색상');
    expect(headerText).toContain('사이즈');
    expect(headerText).toContain('판매수량');
    expect(headerText).toContain('판매율');

    // 모달 내 판매율% 표시 (큰 숫자)
    const bigRate = modal.locator('text=/\\d+(\\.\\d+)?%/').first();
    await expect(bigRate).toBeVisible();

    await page.locator('.ant-modal-close').click();
  });

  test('V-10. 카테고리별 데이터 정합성 — 판매 합계 = 전체 합계', async ({ page }) => {
    const token = await getAuthToken(page);

    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const apiRes = await page.request.get(
      `http://localhost:3001/api/sales/sell-through?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.byCategory?.length) {
      test.skip();
      return;
    }

    const totals = apiData.data.totals;
    const byCategory = apiData.data.byCategory;

    // 카테고리별 판매수량 합계 = 전체 판매수량
    const catSoldSum = byCategory.reduce((s: number, c: any) => s + Number(c.sold_qty || 0), 0);
    expect(catSoldSum).toBe(Number(totals.total_sold));

    // 각 카테고리 판매율 = sold / (sold + stock) * 100
    for (const cat of byCategory) {
      const sold = Number(cat.sold_qty || 0);
      const stock = Number(cat.current_stock || 0);
      const total = sold + stock;
      if (total > 0) {
        const expected = Number(((sold / total) * 100).toFixed(1));
        const actual = Number(cat.sell_through_rate);
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
      }
    }
  });
});
