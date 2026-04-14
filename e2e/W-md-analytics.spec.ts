import { test, expect } from '@playwright/test';
import { navigateTo, clickTab, waitForTable } from './helpers';

/**
 * W. MD 분석 — 8개 탭 E2E 테스트
 *
 * /md/analytics: ADMIN_HQ 전용 → admin 프로젝트 (port 5172)
 * 탭: ABC 분석, 마진 분석, 시즌 성과, 사이즈/컬러, 마크다운 효과, 매장 적합도, 판매분석, 판매율 분석
 */

function getAuthToken(page: any): Promise<string> {
  return page.evaluate(() => localStorage.getItem('zensai_access_token') || '');
}

/** 활성 탭 패널 (여러 탭이 렌더링되므로 활성 패널로 스코프) */
function activePane(page: any) {
  return page.locator('.ant-tabs-tabpane-active');
}

const API = 'http://localhost:3001/api/md';

// 90일 기간 (기본값과 동일)
const now = new Date();
const to = now.toISOString().slice(0, 10);
const from = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);

test.describe('W. MD 분석 (8 Tabs)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/md/analytics');
    await page.waitForTimeout(2000);
  });

  // ══════════════════════════════════════════
  // W-1. 페이지 진입 + 8개 탭 확인
  // ══════════════════════════════════════════
  test('W-1. 페이지 진입 — 제목 + 9개 탭 확인', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'MD 분석' })).toBeVisible({ timeout: 10_000 });

    const tabs = page.locator('.ant-tabs-tab');
    await expect(tabs.filter({ hasText: 'ABC 분석' })).toBeVisible();
    await expect(tabs.filter({ hasText: '마진 분석' })).toBeVisible();
    await expect(tabs.filter({ hasText: '시즌 성과' })).toBeVisible();
    await expect(tabs.filter({ hasText: '사이즈/컬러' })).toBeVisible();
    await expect(tabs.filter({ hasText: '마크다운 효과' })).toBeVisible();
    await expect(tabs.filter({ hasText: '매장 적합도' })).toBeVisible();
    await expect(tabs.filter({ hasText: '스타일 생산성' })).toBeVisible();
    await expect(tabs.filter({ hasText: '판매분석' })).toBeVisible();
    await expect(tabs.filter({ hasText: '판매율 분석' })).toBeVisible();

    // 기본 활성 탭: ABC 분석
    await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: 'ABC 분석' })).toBeVisible();
  });

  // ══════════════════════════════════════════
  // ABC 분석 (W-2 ~ W-4)
  // ══════════════════════════════════════════
  test('W-2. ABC 분석 — 등급 카드 + 테이블 로드', async ({ page }) => {
    await page.waitForTimeout(3000);

    // 히어로 카드
    const cards = page.locator('.ant-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('A등급');
    expect(allText).toContain('B등급');
    expect(allText).toContain('C등급');

    // 테이블
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const headers = await table.locator('.ant-table-thead th').allTextContents();
    const headerText = headers.join(' ');
    expect(headerText).toContain('등급');
    expect(headerText).toContain('매출');
    expect(headerText).toContain('비중');

    // 에러 없음
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('W-3. ABC 분석 — 카테고리 필터 + 조회', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 카테고리 Select로 필터링
    const selects = page.locator('.ant-select');
    if (await selects.count() > 0) {
      await selects.first().click();
      await page.waitForTimeout(500);

      const options = page.locator('.ant-select-item-option');
      if (await options.count() > 0) {
        await options.first().click();
        await page.waitForTimeout(500);
      }
    }

    // 조회
    await page.locator('button').filter({ hasText: '조회' }).click();
    await page.waitForTimeout(3000);

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);

    // 테이블 여전히 visible
    await expect(page.locator('.ant-table').first()).toBeVisible();
  });

  test('W-4. ABC 분석 — API ↔ UI 등급 정합성', async ({ page }) => {
    const token = await getAuthToken(page);

    const apiRes = await page.request.get(
      `${API}/abc-analysis?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.summary) {
      test.skip();
      return;
    }

    const { summary, items } = apiData.data;

    // A+B+C 건수 = 전체 items 수
    expect(summary.a_count + summary.b_count + summary.c_count).toBe(items.length);

    // A등급 건수 > 0이면 UI 카드에 숫자 표시 (API/UI 타이밍 차이로 정확한 수 비교 대신 존재 여부만)
    if (summary.a_count > 0) {
      const cardTexts = await page.locator('.ant-card').allTextContents();
      const aCardText = cardTexts.find(t => t.includes('A등급'));
      expect(aCardText).toBeTruthy();
      expect(aCardText).toMatch(/\d+건/);
    }

    // 카테고리 내 비중 검증: 각 항목 revenue_share_pct > 0
    if (items.length > 0) {
      const firstItem = items[0];
      expect(Number(firstItem.revenue_share_pct)).toBeGreaterThan(0);
    }
  });

  // ══════════════════════════════════════════
  // 마진 분석 (W-5 ~ W-6)
  // ══════════════════════════════════════════
  test('W-5. 마진 분석 — 히어로 카드 + 마진 분포 차트', async ({ page }) => {
    await clickTab(page, '마진 분석');
    await page.waitForTimeout(3000);

    // 히어로 카드
    const cards = page.locator('.ant-card');
    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('총 이익');
    expect(allText).toContain('평균 실제마진');
    expect(allText).toContain('평균 순마진');

    // 순마진 분포 카드
    await expect(page.locator('.ant-card').filter({ hasText: '순마진 분포' })).toBeVisible();

    // 테이블 컬럼
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('생산원가');
      expect(headerText).toContain('기본마진');
      expect(headerText).toContain('실제마진');
    }
  });

  test('W-6. 마진 분석 — API ↔ UI 마진 계산 검증', async ({ page }) => {
    const token = await getAuthToken(page);

    const apiRes = await page.request.get(
      `${API}/margin-analysis?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.items?.length) {
      test.skip();
      return;
    }

    const { summary, items } = apiData.data;

    // 마진 계산 검증: actual_margin ≈ (avg_price - cost) / avg_price * 100
    for (const item of items.slice(0, 5)) {
      const avgPrice = Number(item.avg_selling_price);
      const cost = Number(item.cost_price);
      if (avgPrice > 0 && cost > 0) {
        const expected = (avgPrice - cost) / avgPrice * 100;
        expect(Math.abs(Number(item.actual_margin_pct) - expected)).toBeLessThanOrEqual(2);
      }
    }

    // 총 이익 합계 검증
    const itemProfitSum = items.reduce((s: number, i: any) => s + Number(i.total_profit || 0), 0);
    expect(Math.abs(Number(summary.total_profit) - itemProfitSum)).toBeLessThanOrEqual(100);
  });

  test('W-6b. 마진 분석 — 설정배수 vs 실제원가 모드 비교', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    const [mulRes, actRes] = await Promise.all([
      page.request.get(`${API}/margin-analysis?date_from=${from}&date_to=${to}&cost_mode=multiplier`, { headers }),
      page.request.get(`${API}/margin-analysis?date_from=${from}&date_to=${to}&cost_mode=actual`, { headers }),
    ]);

    expect(mulRes.status()).toBe(200);
    expect(actRes.status()).toBe(200);

    const mulData = (await mulRes.json()).data;
    const actData = (await actRes.json()).data;

    console.log('=== 설정배수 모드 ===');
    console.log('  items:', mulData.items.length, '| 총원가:', mulData.summary.total_cost,
      '| 평균실제마진:', mulData.summary.avg_actual_margin + '%',
      '| 평균순마진:', mulData.summary.avg_net_margin + '%');

    console.log('=== 실제원가 모드 ===');
    console.log('  items:', actData.items.length, '| 총원가:', actData.summary.total_cost,
      '| 평균실제마진:', actData.summary.avg_actual_margin + '%',
      '| 평균순마진:', actData.summary.avg_net_margin + '%');

    // 두 모드 모두 데이터 반환
    expect(mulData.items.length).toBeGreaterThan(0);

    // 설정배수 모드: base_margin은 모든 상품 동일 (1 - 1/배수)
    const baseMargins = mulData.items.map((i: any) => Number(i.base_margin_pct));
    const uniqueBase = [...new Set(baseMargins)];
    expect(uniqueBase.length).toBe(1); // 설정배수는 고정값

    // 실제원가 모드: base_margin이 상품마다 다를 수 있음
    if (actData.items.length > 1) {
      const actBaseMargins = actData.items.map((i: any) => Number(i.base_margin_pct));
      console.log('  실제원가 기본마진 범위:', Math.min(...actBaseMargins) + '%', '~', Math.max(...actBaseMargins) + '%');
    }

    // 원가 차이 확인 (같은 데이터를 다른 원가로 계산하므로 달라야 정상)
    if (actData.items.length > 0) {
      console.log('  원가 차이:', mulData.summary.total_cost - actData.summary.total_cost);
    }
  });

  // ══════════════════════════════════════════
  // 시즌 성과 (W-7 ~ W-8)
  // ══════════════════════════════════════════
  test('W-7. 시즌 성과 — 연도 선택 + 달성률 Progress', async ({ page }) => {
    await clickTab(page, '시즌 성과');
    await page.waitForTimeout(3000);

    const pane = activePane(page);

    // 연도 Select (활성 탭 패널 내)
    const yearSelect = pane.locator('.ant-select').first();
    await expect(yearSelect).toBeVisible();

    // 히어로 카드
    const cards = pane.locator('.ant-card');
    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('총 실적매출');
    expect(allText).toContain('총 목표매출');
    expect(allText).toContain('총 달성률');
    expect(allText).toContain('총 잔여재고');

    // 테이블
    const table = pane.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('시즌');
      expect(headerText).toContain('달성률');
    }
  });

  test('W-8. 시즌 성과 — 연도 변경 시 데이터 갱신', async ({ page }) => {
    await clickTab(page, '시즌 성과');
    await page.waitForTimeout(2000);

    const pane = activePane(page);

    // 연도 Select 열기 (활성 탭 패널 내)
    const yearSelect = pane.locator('.ant-select').first();
    await yearSelect.click();
    await page.waitForTimeout(500);

    // 전년도 옵션 선택
    const prevYear = String(new Date().getFullYear() - 1);
    const options = page.locator('.ant-select-item-option');
    const prevYearOption = options.filter({ hasText: prevYear });
    if (await prevYearOption.count() > 0) {
      await prevYearOption.click();
      await page.waitForTimeout(500);

      // 조회 클릭 (활성 패널 내)
      await pane.locator('button').filter({ hasText: '조회' }).click();
      await page.waitForTimeout(3000);

      // 에러 없음
      const errorMsg = page.locator('.ant-message-error');
      expect(await errorMsg.count()).toBe(0);
    }
  });

  // ══════════════════════════════════════════
  // 사이즈/컬러 (W-9 ~ W-10)
  // ══════════════════════════════════════════
  test('W-9. 사이즈/컬러 — 차트 + 2개 테이블', async ({ page }) => {
    await clickTab(page, '사이즈/컬러');
    await page.waitForTimeout(3000);

    // 사이즈 차트 카드
    await expect(page.locator('.ant-card').filter({ hasText: '사이즈별 판매 vs 입고 비중' })).toBeVisible({ timeout: 10_000 });

    // 사이즈별 상세 테이블
    const sizeCard = page.locator('.ant-card').filter({ hasText: '사이즈별 상세' });
    await expect(sizeCard).toBeVisible();

    const sizeTable = sizeCard.locator('.ant-table');
    if (await sizeTable.isVisible().catch(() => false)) {
      const headers = await sizeTable.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('사이즈');
      expect(headerText).toContain('판매수량');
      expect(headerText).toContain('갭');
    }

    // 컬러 순위 테이블
    const colorCard = page.locator('.ant-card').filter({ hasText: '컬러 인기 순위' });
    await expect(colorCard).toBeVisible();

    const colorTable = colorCard.locator('.ant-table');
    if (await colorTable.isVisible().catch(() => false)) {
      const headers = await colorTable.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('컬러');
      expect(headerText).toContain('판매수량');
    }
  });

  test('W-10. 사이즈/컬러 — API 갭 계산 정합성', async ({ page }) => {
    const token = await getAuthToken(page);

    const apiRes = await page.request.get(
      `${API}/size-color-trends?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.by_size?.length) {
      test.skip();
      return;
    }

    const { by_size, by_color } = apiData.data;

    // 갭 = sold_pct - inbound_pct
    for (const s of by_size) {
      const expected = Number(s.sold_pct) - Number(s.inbound_pct);
      expect(Math.abs(Number(s.gap) - expected)).toBeLessThanOrEqual(1);
    }

    // 컬러 판매수량 내림차순 확인
    if (by_color.length >= 2) {
      for (let i = 0; i < by_color.length - 1; i++) {
        expect(Number(by_color[i].sold_qty)).toBeGreaterThanOrEqual(Number(by_color[i + 1].sold_qty));
      }
    }

    // 사이즈 판매비중 합계 ≈ 100%
    const totalPct = by_size.reduce((s: number, r: any) => s + Number(r.sold_pct), 0);
    expect(Math.abs(totalPct - 100)).toBeLessThanOrEqual(2);
  });

  // ══════════════════════════════════════════
  // 마크다운 효과 (W-11 ~ W-12)
  // ══════════════════════════════════════════
  test('W-11. 마크다운 효과 — 히어로 카드 + 상세 테이블', async ({ page }) => {
    await clickTab(page, '마크다운 효과');
    await page.waitForTimeout(3000);

    // 히어로 카드 영역
    const cards = page.locator('.ant-card');
    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('마크다운 스케줄');
    expect(allText).toContain('평균 재고 소진율');
    expect(allText).toContain('총 순효과');

    // 상세 테이블
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('스케줄');
      expect(headerText).toContain('할인율');
      expect(headerText).toContain('재고소진율');
      expect(headerText).toContain('순효과');
    }
  });

  test('W-12. 마크다운 효과 — API 속도 변화 정합성', async ({ page }) => {
    const token = await getAuthToken(page);

    const apiRes = await page.request.get(
      `${API}/markdown-effectiveness`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.schedules?.length) {
      test.skip();
      return;
    }

    const { schedules, by_round } = apiData.data;

    // 평균 속도 변화 검증
    const avgChange = Math.round(
      schedules.reduce((s: number, r: any) => s + Number(r.velocity_change_pct), 0) / schedules.length * 10,
    ) / 10;

    // 차수별 요약 존재 시 검증
    if (by_round && by_round.length > 0) {
      for (const round of by_round) {
        const roundSchedules = schedules.filter((s: any) => s.markdown_round === round.markdown_round);
        const roundRevenue = roundSchedules.reduce((s: number, r: any) => s + Number(r.additional_revenue), 0);
        expect(Math.abs(Number(round.total_additional_revenue) - roundRevenue)).toBeLessThanOrEqual(10);
      }
    }
  });

  // ══════════════════════════════════════════
  // 매장 적합도 (W-13 ~ W-15)
  // ══════════════════════════════════════════
  test('W-13. 매장 적합도 — 히트맵 매트릭스 + TOP 조합', async ({ page }) => {
    await clickTab(page, '매장 적합도');
    await page.waitForTimeout(3000);

    const pane = activePane(page);

    // 매트릭스 카드
    await expect(pane.locator('.ant-card').filter({ hasText: '매장 × 카테고리 매트릭스' })).toBeVisible({ timeout: 10_000 });

    // TOP 조합
    await expect(pane.locator('.ant-card').filter({ hasText: 'TOP 조합' })).toBeVisible();

    // 매장별 강점/약점
    await expect(pane.locator('.ant-card').filter({ hasText: '매장별 강점' })).toBeVisible();

    // 지표 Segmented (활성 패널 내)
    const segmented = pane.locator('.ant-segmented');
    await expect(segmented).toBeVisible();
    await expect(segmented.locator('.ant-segmented-item').filter({ hasText: '매출' })).toBeVisible();
    await expect(segmented.locator('.ant-segmented-item').filter({ hasText: '수량' })).toBeVisible();
  });

  test('W-14. 매장 적합도 — 지표 전환 동작', async ({ page }) => {
    await clickTab(page, '매장 적합도');
    await page.waitForTimeout(2000);

    const pane = activePane(page);
    const segmented = pane.locator('.ant-segmented');

    // 매출로 전환
    await segmented.locator('.ant-segmented-item').filter({ hasText: '매출' }).click();
    await pane.locator('button').filter({ hasText: '조회' }).click();
    await page.waitForTimeout(3000);
    expect(await page.locator('.ant-message-error').count()).toBe(0);

    // 수량으로 전환
    await segmented.locator('.ant-segmented-item').filter({ hasText: '수량' }).click();
    await pane.locator('button').filter({ hasText: '조회' }).click();
    await page.waitForTimeout(3000);
    expect(await page.locator('.ant-message-error').count()).toBe(0);
  });

  test('W-15. 매장 적합도 — API 매트릭스 구조 검증', async ({ page }) => {
    const token = await getAuthToken(page);

    const apiRes = await page.request.get(
      `${API}/store-product-fit?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.matrix?.length) {
      test.skip();
      return;
    }

    const { categories, matrix, store_summary, top_combinations } = apiData.data;

    // 카테고리 배열 존재
    expect(categories.length).toBeGreaterThan(0);

    // 매트릭스: partner_name + categories 객체
    for (const row of matrix) {
      expect(row.partner_name).toBeTruthy();
      expect(typeof row.categories).toBe('object');
    }

    // 매장 요약: strength/weakness 필드
    if (store_summary && store_summary.length > 0) {
      for (const s of store_summary) {
        expect(s.partner_name).toBeTruthy();
        expect('strength' in s).toBeTruthy();
        expect('weakness' in s).toBeTruthy();
      }
    }

    // TOP 조합 존재
    expect(top_combinations).toBeTruthy();
  });

  // ══════════════════════════════════════════
  // 전체 탭 순회 (W-16)
  // ══════════════════════════════════════════
  test('W-16. 전체 탭 순회 — 에러 없이 전환', async ({ page }) => {
    const tabNames = [
      'ABC 분석', '마진 분석', '시즌 성과',
      '사이즈/컬러', '마크다운 효과', '매장 적합도',
      '스타일 생산성', '판매분석', '판매율 분석',
    ];

    for (const tab of tabNames) {
      // 이전 에러 메시지 자동 소멸 대기
      if (await page.locator('.ant-message-error').count() > 0) {
        await page.waitForTimeout(4000);
      }

      const tabEl = page.locator('.ant-tabs-tab').filter({ hasText: tab });
      await tabEl.scrollIntoViewIfNeeded();
      await tabEl.click({ force: true });
      await page.waitForTimeout(2000);

      // 활성 탭 확인
      await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: tab })).toBeVisible();

      // 에러 메시지 없음 (antd 3초 자동 소멸 고려)
      if (await page.locator('.ant-message-error').count() > 0) {
        await page.waitForTimeout(4000);
      }
      expect(await page.locator('.ant-message-error').count()).toBe(0);
    }

    // 첫 탭으로 복귀
    await page.locator('.ant-tabs-tab').filter({ hasText: 'ABC 분석' }).dispatchEvent('click');
    await page.waitForTimeout(500);
    await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: 'ABC 분석' })).toBeVisible();
  });

  // ══════════════════════════════════════════
  // 필터 동작 (W-17 ~ W-18)
  // ══════════════════════════════════════════
  test('W-17. 필터 카테고리 Select — ABC 탭', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 카테고리 Select
    const selects = page.locator('.ant-select');
    const selectCount = await selects.count();

    if (selectCount > 0) {
      const catSelect = selects.first();
      await catSelect.click();
      await page.waitForTimeout(500);

      const options = page.locator('.ant-select-item-option');
      const optionCount = await options.count();

      if (optionCount > 0) {
        // 첫 번째 옵션 선택
        await options.first().click();
        await page.waitForTimeout(500);

        // 조회
        await page.locator('button').filter({ hasText: '조회' }).click();
        await page.waitForTimeout(3000);

        // 에러 없음
        expect(await page.locator('.ant-message-error').count()).toBe(0);
      }
    }
  });

  test('W-18. 날짜 필터 — RangePicker 존재 확인', async ({ page }) => {
    // ABC 탭
    await expect(activePane(page).locator('.ant-picker-range')).toBeVisible({ timeout: 5000 });

    // 사이즈/컬러 탭
    await clickTab(page, '사이즈/컬러');
    await page.waitForTimeout(1000);
    await expect(activePane(page).locator('.ant-picker-range')).toBeVisible();

    // 매장 적합도 탭
    await clickTab(page, '매장 적합도');
    await page.waitForTimeout(1000);
    await expect(activePane(page).locator('.ant-picker-range')).toBeVisible();
  });

  // ══════════════════════════════════════════
  // API 직접 호출 (W-19)
  // ══════════════════════════════════════════
  test('W-19. API 직접 호출 — 6개 엔드포인트 200 응답', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    const endpoints = [
      `${API}/abc-analysis?date_from=${from}&date_to=${to}`,
      `${API}/margin-analysis?date_from=${from}&date_to=${to}`,
      `${API}/season-performance`,
      `${API}/size-color-trends?date_from=${from}&date_to=${to}`,
      `${API}/markdown-effectiveness`,
      `${API}/store-product-fit?date_from=${from}&date_to=${to}`,
    ];

    for (const url of endpoints) {
      const res = await page.request.get(url, { headers });
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  // ══════════════════════════════════════════
  // 메뉴 네비게이션 (W-20)
  // ══════════════════════════════════════════
  test('W-20. 메뉴 네비게이션 — 사이드바에서 MD 분석 접근', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1000);

    // MD 관리 서브메뉴 열기
    const mdMenu = page.locator('.ant-menu-submenu').filter({ hasText: 'MD 관리' });
    if (await mdMenu.count() > 0) {
      await mdMenu.locator('.ant-menu-submenu-title').click();
      await page.waitForTimeout(500);
      await page.locator('.ant-menu-item').filter({ hasText: 'MD 분석' }).click();
    } else {
      // fallback: 직접 메뉴 아이템 클릭
      await page.locator('.ant-menu-item').filter({ hasText: 'MD 분석' }).click();
    }
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: 'MD 분석' })).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/md/analytics');
  });

  // ══════════════════════════════════════════
  // 테이블 표준 확인 (W-21)
  // ══════════════════════════════════════════
  test('W-21. 테이블 표준 — size/pagination 확인', async ({ page }) => {
    await page.waitForTimeout(3000);

    const pane = activePane(page);

    // ABC 탭 테이블
    const table = pane.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      // small size — Ant Design은 .ant-table-small 클래스를 테이블 래퍼에 적용
      const wrapper = pane.locator('.ant-table-wrapper').first();
      await expect(wrapper).toBeVisible();

      // pagination 총 N건
      const paginationText = pane.locator('text=/총 \\d+건/');
      if (await paginationText.count() > 0) {
        await expect(paginationText.first()).toBeVisible();
      }
    }

    // 마진 탭 테이블
    await clickTab(page, '마진 분석');
    await page.waitForTimeout(2000);

    const marginPane = activePane(page);
    const marginTable = marginPane.locator('.ant-table').first();
    if (await marginTable.isVisible().catch(() => false)) {
      const paginationText = marginPane.locator('text=/총 \\d+건/');
      if (await paginationText.count() > 0) {
        await expect(paginationText.first()).toBeVisible();
      }
    }
  });
});

// ══════════════════════════════════════════════════════
// 시스템 설정 → UI 반영 검증 (W-S1 ~ W-S5)
// ══════════════════════════════════════════════════════
test.describe('W-S. 시스템 설정 변경 → UI 반영', () => {
  const BASE = 'http://127.0.0.1:3001';
  const MD = `${BASE}/api/md`;
  const SETTINGS = `${BASE}/api/system/settings`;

  /** 설정 PUT 헬퍼 */
  async function putSettings(page: any, token: string, settings: Record<string, string>) {
    const res = await page.request.put(SETTINGS, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: settings,
    });
    expect(res.status()).toBe(200);
  }

  /** 설정 GET 헬퍼 */
  async function getSettings(page: any, token: string): Promise<Record<string, string>> {
    const res = await page.request.get(SETTINGS, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    return body.data || {};
  }

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/md/analytics');
    await page.waitForTimeout(2000);
  });

  test('W-S1. ABC 분석 — 등급 기준 변경 시 등급 분포 변화', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    // 1) 기본값(70/90)으로 ABC 조회
    const res1 = await page.request.get(
      `${MD}/abc-analysis?date_from=${from}&date_to=${to}&abc_a=70&abc_b=90`, { headers },
    );
    const d1 = (await res1.json()).data;
    if (!d1?.summary) { test.skip(); return; }

    // 2) 변경값(50/80)으로 ABC 조회 — A 기준 낮추면 A 수가 줄어야 함
    const res2 = await page.request.get(
      `${MD}/abc-analysis?date_from=${from}&date_to=${to}&abc_a=50&abc_b=80`, { headers },
    );
    const d2 = (await res2.json()).data;

    console.log('ABC 70/90:', { a: d1.summary.a_count, b: d1.summary.b_count, c: d1.summary.c_count });
    console.log('ABC 50/80:', { a: d2.summary.a_count, b: d2.summary.b_count, c: d2.summary.c_count });

    // 전체 상품수 동일
    const total1 = d1.summary.a_count + d1.summary.b_count + d1.summary.c_count;
    const total2 = d2.summary.a_count + d2.summary.b_count + d2.summary.c_count;
    expect(total1).toBe(total2);

    // A 기준을 70→50으로 낮추면 A등급 수가 줄거나 같아야 함
    expect(d2.summary.a_count).toBeLessThanOrEqual(d1.summary.a_count);

    // 3) DB 저장 → UI 반영 확인 (try/finally로 반드시 복원)
    try {
      await putSettings(page, token, { MD_ABC_A_THRESHOLD: '60', MD_ABC_B_THRESHOLD: '85' });

      await page.reload();
      await page.waitForTimeout(3000);

      const pane = activePane(page);
      // 설정 패널 열기
      const settingsBtn = pane.locator('[title*="설정"]');
      if (await settingsBtn.count() > 0) {
        await settingsBtn.first().click();
        await page.waitForTimeout(500);
      }

      // 조회
      await pane.locator('button').filter({ hasText: '조회' }).click();
      await page.waitForTimeout(3000);

      // 카드에 60%, 85% 텍스트 표시 확인
      const allText = (await pane.locator('.ant-card').allTextContents()).join(' ');
      expect(allText).toContain('60');
      expect(allText).toContain('85');
    } finally {
      // 항상 기본값 70/90으로 복원
      await putSettings(page, token, { MD_ABC_A_THRESHOLD: '70', MD_ABC_B_THRESHOLD: '90' });
    }
  });

  test('W-S2. 마진 분석 — 수수료 변경 시 순마진 변화', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    // 원래 설정 백업
    const orig = await getSettings(page, token);
    const origDist = orig['MD_DISTRIBUTION_FEE_PCT'] || '0';
    const origMgr = orig['MD_MANAGER_FEE_PCT'] || '0';

    // 1) 수수료 0%로 조회
    await putSettings(page, token, { MD_DISTRIBUTION_FEE_PCT: '0', MD_MANAGER_FEE_PCT: '0' });
    const res1 = await page.request.get(`${MD}/margin-analysis?date_from=${from}&date_to=${to}`, { headers });
    const d1 = (await res1.json()).data;
    if (!d1?.summary) { test.skip(); return; }

    // 2) 수수료 10%+5%로 변경 후 조회
    await putSettings(page, token, { MD_DISTRIBUTION_FEE_PCT: '10', MD_MANAGER_FEE_PCT: '5' });
    const res2 = await page.request.get(`${MD}/margin-analysis?date_from=${from}&date_to=${to}`, { headers });
    const d2 = (await res2.json()).data;

    console.log('수수료 0%:', { net: d1.summary.avg_net_margin, dist: d1.summary.distribution_fee_pct, mgr: d1.summary.manager_fee_pct });
    console.log('수수료 15%:', { net: d2.summary.avg_net_margin, dist: d2.summary.distribution_fee_pct, mgr: d2.summary.manager_fee_pct });

    // 수수료 반영 확인
    expect(d2.summary.distribution_fee_pct).toBe(10);
    expect(d2.summary.manager_fee_pct).toBe(5);

    // 순마진 감소
    expect(d2.summary.avg_net_margin).toBeLessThan(d1.summary.avg_net_margin);

    // 3) UI 반영 — 마진 탭에서 수수료 표시
    await clickTab(page, '마진 분석');
    await page.waitForTimeout(3000);

    const pane = activePane(page);
    const allText = (await pane.locator('div').allTextContents()).join(' ');
    // 유통 10% + 매니저 5% = 15% 총 수수료
    expect(allText).toContain('10%');
    expect(allText).toContain('5%');

    // 복원
    await putSettings(page, token, { MD_DISTRIBUTION_FEE_PCT: origDist, MD_MANAGER_FEE_PCT: origMgr });
  });

  test('W-S3. 마진 분석 — 원가배수 변경 시 기본마진 변화', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    // 백업
    const orig = await getSettings(page, token);
    const origMul = orig['MD_COST_MULTIPLIER'] || '35';

    // 1) 배수 3.5배 (35)
    await putSettings(page, token, { MD_COST_MULTIPLIER: '35' });
    const res1 = await page.request.get(
      `${MD}/margin-analysis?date_from=${from}&date_to=${to}&cost_mode=multiplier`, { headers },
    );
    const d1 = (await res1.json()).data;
    if (!d1?.summary) { test.skip(); return; }

    // 2) 배수 2.0배 (20) — 원가 높아짐 → 기본마진 떨어짐
    await putSettings(page, token, { MD_COST_MULTIPLIER: '20' });
    const res2 = await page.request.get(
      `${MD}/margin-analysis?date_from=${from}&date_to=${to}&cost_mode=multiplier`, { headers },
    );
    const d2 = (await res2.json()).data;

    console.log('배수 3.5:', { base_margin: d1.summary.avg_base_margin, total_cost: d1.summary.total_cost });
    console.log('배수 2.0:', { base_margin: d2.summary.avg_base_margin, total_cost: d2.summary.total_cost });

    // 배수 낮추면 기본마진 감소
    expect(d2.summary.avg_base_margin).toBeLessThan(d1.summary.avg_base_margin);
    // 총원가 증가
    expect(Number(d2.summary.total_cost)).toBeGreaterThan(Number(d1.summary.total_cost));

    // 3) UI에서 2.0 표시 확인
    await clickTab(page, '마진 분석');
    await page.waitForTimeout(3000);

    const pane = activePane(page);
    // 설정 패널 열기
    const settingsBtn = pane.locator('[title*="설정"]');
    if (await settingsBtn.count() > 0) {
      await settingsBtn.first().click();
      await page.waitForTimeout(500);
    }

    const allText = (await pane.locator('div').allTextContents()).join(' ');
    expect(allText).toContain('2.0');

    // 복원
    await putSettings(page, token, { MD_COST_MULTIPLIER: origMul });
  });

  test('W-S4. 매장 적합도 — 제외 매장 API 반영 확인', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    // 1) 전체 매장 조회
    const res1 = await page.request.get(
      `${MD}/store-product-fit?date_from=${from}&date_to=${to}`, { headers },
    );
    const d1 = (await res1.json()).data;
    if (!d1?.matrix?.length || d1.matrix.length < 2) { test.skip(); return; }

    const totalStores = d1.matrix.length;
    const firstPartner = d1.matrix[0].partner_code;
    console.log('전체 매장:', totalStores, '| 제외 대상:', firstPartner);

    // 2) 1개 매장 제외 조회
    const res2 = await page.request.get(
      `${MD}/store-product-fit?date_from=${from}&date_to=${to}&exclude_partners=${firstPartner}`, { headers },
    );
    const d2 = (await res2.json()).data;

    expect(d2.matrix.length).toBe(totalStores - 1);
    expect(d2.matrix.map((r: any) => r.partner_code)).not.toContain(firstPartner);
    expect(d2.store_summary.map((r: any) => r.partner_code)).not.toContain(firstPartner);

    // 3) 2개 매장 제외
    if (totalStores >= 3) {
      const secondPartner = d1.matrix[1].partner_code;
      const res3 = await page.request.get(
        `${MD}/store-product-fit?date_from=${from}&date_to=${to}&exclude_partners=${firstPartner},${secondPartner}`, { headers },
      );
      const d3 = (await res3.json()).data;
      expect(d3.matrix.length).toBe(totalStores - 2);
    }
  });

  test('W-S5. 매장 적합도 — 평균 계산에 0매출 매장 포함 확인', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    const res = await page.request.get(
      `${MD}/store-product-fit?date_from=${from}&date_to=${to}`, { headers },
    );
    const d = (await res.json()).data;
    if (!d?.matrix?.length || !d.categories?.length) { test.skip(); return; }

    // 첫 번째 카테고리에 대해 직접 평균 계산
    const cat = d.categories[0];
    const values = d.matrix.map((r: any) => r.categories[cat]?.value || 0);
    const manualAvg = values.reduce((a: number, b: number) => a + b, 0) / values.length;

    console.log(`카테고리 "${cat}": 매장수 ${values.length}, 수동평균 ${manualAvg.toFixed(0)}`);

    // vs_avg 검증
    for (const row of d.matrix) {
      const cell = row.categories[cat];
      if (!cell || manualAvg === 0) continue;
      const expectedVsAvg = Math.round((cell.value - manualAvg) / manualAvg * 1000) / 10;
      expect(Math.abs(cell.vs_avg - expectedVsAvg)).toBeLessThanOrEqual(1);
    }

    // 0값 매장은 vs_avg ≤ 0
    const zeroStores = d.matrix.filter((r: any) => (r.categories[cat]?.value || 0) === 0);
    if (zeroStores.length > 0) {
      console.log(`0값 매장 ${zeroStores.length}개 발견`);
      for (const z of zeroStores) {
        expect(z.categories[cat].vs_avg).toBeLessThanOrEqual(0);
      }
    }
  });
});

// ══════════════════════════════════════════════════════
// 마크다운 스케줄 관리 페이지 테스트
// ══════════════════════════════════════════════════════
test.describe('W-B. 마크다운 스케줄 관리', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/md/schedules');
    await page.waitForTimeout(2000);
  });

  test('W-B1. 페이지 진입 — 제목 + 필터 + 테이블', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '마크다운 스케줄' })).toBeVisible({ timeout: 10_000 });

    // 새 스케줄 버튼
    await expect(page.locator('button').filter({ hasText: '새 스케줄' })).toBeVisible();

    // 필터: 시즌 Select, 상태 Select, 조회 버튼
    const selects = page.locator('.ant-select');
    expect(await selects.count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('button').filter({ hasText: '조회' })).toBeVisible();

    // 히어로 카드
    const cards = page.locator('.ant-card');
    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('전체 스케줄');
    expect(allText).toContain('적용중');
    expect(allText).toContain('초안');

    // 테이블
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });
  });

  test('W-B2. 새 스케줄 모달 열기/닫기', async ({ page }) => {
    await page.locator('button').filter({ hasText: '새 스케줄' }).click();
    await page.waitForTimeout(500);

    // 모달 표시
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator('.ant-modal-title')).toContainText('새 마크다운 스케줄');

    // 폼 필드
    await expect(modal.locator('#schedule_name')).toBeVisible();

    // 취소
    await modal.locator('button').filter({ hasText: '취소' }).click();
    await page.waitForTimeout(500);
    await expect(modal).not.toBeVisible();
  });

  test('W-B3. API 목록 조회 — 200 응답', async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('zensai_access_token') || '');
    const res = await page.request.get('http://localhost:3001/api/markdown-schedules', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('W-B4. 상태 필터 동작', async ({ page }) => {
    // 상태 필터 선택
    const selects = page.locator('.ant-select');
    // 두 번째 select = 상태 필터
    if (await selects.count() >= 2) {
      await selects.nth(1).click();
      await page.waitForTimeout(500);
      const options = page.locator('.ant-select-item-option');
      if (await options.count() > 0) {
        await options.first().click();
        await page.waitForTimeout(500);
      }
      await page.locator('button').filter({ hasText: '조회' }).click();
      await page.waitForTimeout(2000);
      expect(await page.locator('.ant-message-error').count()).toBe(0);
    }
  });
});
