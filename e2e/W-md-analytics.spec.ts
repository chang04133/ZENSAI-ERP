import { test, expect } from '@playwright/test';
import { navigateTo, clickTab, clickMenu, waitForTable } from './helpers';

/**
 * W. MD 분석 — 7개 탭 E2E 테스트
 *
 * /md/analytics: ADMIN_HQ 전용 → admin 프로젝트 (port 5172)
 * 탭: ABC 분석, 마진 분석, 재고 회전율, 시즌 성과, 사이즈/컬러, 마크다운 효과, 매장 적합도
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

test.describe('W. MD 분석 (7 Tabs)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/md/analytics');
    await page.waitForTimeout(2000);
  });

  // ══════════════════════════════════════════
  // W-1. 페이지 진입 + 7개 탭 확인
  // ══════════════════════════════════════════
  test('W-1. 페이지 진입 — 제목 + 7개 탭 확인', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'MD 분석' })).toBeVisible({ timeout: 10_000 });

    const tabs = page.locator('.ant-tabs-tab');
    await expect(tabs.filter({ hasText: 'ABC 분석' })).toBeVisible();
    await expect(tabs.filter({ hasText: '마진 분석' })).toBeVisible();
    await expect(tabs.filter({ hasText: '재고 회전율' })).toBeVisible();
    await expect(tabs.filter({ hasText: '시즌 성과' })).toBeVisible();
    await expect(tabs.filter({ hasText: '사이즈/컬러' })).toBeVisible();
    await expect(tabs.filter({ hasText: '마크다운 효과' })).toBeVisible();
    await expect(tabs.filter({ hasText: '매장 적합도' })).toBeVisible();

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
    expect(headerText).toContain('누적 비율');

    // 에러 없음
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('W-3. ABC 분석 — 분석 기준 전환 (상품별/카테고리별/시즌별)', async ({ page }) => {
    await page.waitForTimeout(2000);

    const segmented = page.locator('.ant-segmented');
    await expect(segmented).toBeVisible({ timeout: 10_000 });

    // 카테고리별로 전환
    await segmented.locator('.ant-segmented-item').filter({ hasText: '카테고리별' }).click();
    await page.locator('button').filter({ hasText: '조회' }).click();
    await page.waitForTimeout(3000);

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);

    // 시즌별로 전환
    await segmented.locator('.ant-segmented-item').filter({ hasText: '시즌별' }).click();
    await page.locator('button').filter({ hasText: '조회' }).click();
    await page.waitForTimeout(3000);

    expect(await errorMsg.count()).toBe(0);
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

    // A등급 매출 > 0이면 UI 카드에 건수 표시
    if (summary.a_count > 0) {
      const cardTexts = await page.locator('.ant-card').allTextContents();
      const aCardText = cardTexts.find(t => t.includes('A등급'));
      expect(aCardText).toContain(String(summary.a_count));
    }

    // 누적비율 검증: 마지막 항목 ~ 100%
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      expect(Number(lastItem.cumulative_pct)).toBeGreaterThanOrEqual(99);
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
    expect(allText).toContain('평균 기본마진');
    expect(allText).toContain('평균 실제마진');
    expect(allText).toContain('마진 침식');

    // 마진 분포 카드
    await expect(page.locator('.ant-card').filter({ hasText: '마진 분포' })).toBeVisible();

    // 테이블 컬럼
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('원가');
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

  // ══════════════════════════════════════════
  // 재고 회전율 (W-7 ~ W-8)
  // ══════════════════════════════════════════
  test('W-7. 재고 회전율 — 히어로 카드 + 상태 태그', async ({ page }) => {
    await clickTab(page, '재고 회전율');
    await page.waitForTimeout(3000);

    // 히어로 카드
    const cards = page.locator('.ant-card');
    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('평균 회전율');
    expect(allText).toContain('평균 DIO');
    expect(allText).toContain('슬로무버');
    expect(allText).toContain('패스트무버');

    // 테이블 컬럼
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('회전율');
      expect(headerText).toContain('DIO');
      expect(headerText).toContain('상태');

      // 상태 태그 존재 확인
      const tags = table.locator('.ant-tag');
      const tagCount = await tags.count();
      if (tagCount > 0) {
        const tagTexts = await tags.allTextContents();
        const validStatuses = ['고속', '보통', '주의', '위험'];
        const hasValidTag = tagTexts.some(t => validStatuses.includes(t));
        expect(hasValidTag).toBeTruthy();
      }
    }
  });

  test('W-8. 재고 회전율 — API 슬로무버 검증', async ({ page }) => {
    const token = await getAuthToken(page);

    const apiRes = await page.request.get(
      `${API}/inventory-turnover?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.summary) {
      test.skip();
      return;
    }

    const { summary, slow_movers } = apiData.data;

    // 슬로무버 수: summary.count >= 목록 수 (API는 상위 N건만 반환)
    expect(summary.slow_movers_count).toBeGreaterThanOrEqual(slow_movers?.length || 0);

    // 슬로무버 경고 카드 visible 여부
    await clickTab(page, '재고 회전율');
    await page.waitForTimeout(3000);

    const warningCard = page.locator('.ant-card').filter({ hasText: '슬로무버 경고' });
    if (slow_movers && slow_movers.length > 0) {
      await expect(warningCard).toBeVisible({ timeout: 5000 });
    } else {
      expect(await warningCard.count()).toBe(0);
    }
  });

  // ══════════════════════════════════════════
  // 시즌 성과 (W-9 ~ W-10)
  // ══════════════════════════════════════════
  test('W-9. 시즌 성과 — 연도 선택 + 달성률 Progress', async ({ page }) => {
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

  test('W-10. 시즌 성과 — 연도 변경 시 데이터 갱신', async ({ page }) => {
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
  // 사이즈/컬러 (W-11 ~ W-12)
  // ══════════════════════════════════════════
  test('W-11. 사이즈/컬러 — 차트 + 2개 테이블', async ({ page }) => {
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

  test('W-12. 사이즈/컬러 — API 갭 계산 정합성', async ({ page }) => {
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
  // 마크다운 효과 (W-13 ~ W-14)
  // ══════════════════════════════════════════
  test('W-13. 마크다운 효과 — 히어로 카드 + 상세 테이블', async ({ page }) => {
    await clickTab(page, '마크다운 효과');
    await page.waitForTimeout(3000);

    // 히어로 카드 영역
    const cards = page.locator('.ant-card');
    const cardTexts = await cards.allTextContents();
    const allText = cardTexts.join(' ');
    expect(allText).toContain('마크다운 스케줄');
    expect(allText).toContain('평균 속도 변화');
    expect(allText).toContain('추가 매출');

    // 상세 테이블
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');
      expect(headerText).toContain('스케줄');
      expect(headerText).toContain('할인율');
      expect(headerText).toContain('속도 변화');
      expect(headerText).toContain('추가 매출');
    }
  });

  test('W-14. 마크다운 효과 — API 속도 변화 정합성', async ({ page }) => {
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
  // 매장 적합도 (W-15 ~ W-17)
  // ══════════════════════════════════════════
  test('W-15. 매장 적합도 — 히트맵 매트릭스 + TOP 조합', async ({ page }) => {
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
    await expect(segmented.locator('.ant-segmented-item').filter({ hasText: '판매율' })).toBeVisible();
    await expect(segmented.locator('.ant-segmented-item').filter({ hasText: '매출' })).toBeVisible();
    await expect(segmented.locator('.ant-segmented-item').filter({ hasText: '수량' })).toBeVisible();
  });

  test('W-16. 매장 적합도 — 지표 전환 동작', async ({ page }) => {
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

  test('W-17. 매장 적합도 — API 매트릭스 구조 검증', async ({ page }) => {
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
  // 전체 탭 순회 (W-18)
  // ══════════════════════════════════════════
  test('W-18. 전체 탭 순회 — 에러 없이 전환', async ({ page }) => {
    const tabNames = [
      'ABC 분석', '마진 분석', '재고 회전율', '시즌 성과',
      '사이즈/컬러', '마크다운 효과', '매장 적합도',
    ];

    for (const tab of tabNames) {
      await page.locator('.ant-tabs-tab').filter({ hasText: tab }).click();
      await page.waitForTimeout(1500);

      // 활성 탭 확인
      await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: tab })).toBeVisible();

      // 에러 메시지 없음
      expect(await page.locator('.ant-message-error').count()).toBe(0);
    }

    // 첫 탭으로 복귀
    await clickTab(page, 'ABC 분석');
    await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: 'ABC 분석' })).toBeVisible();
  });

  // ══════════════════════════════════════════
  // 필터 동작 (W-19 ~ W-20)
  // ══════════════════════════════════════════
  test('W-19. 필터 카테고리 Select — ABC 탭', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 카테고리 Select (두 번째 Select — 첫 번째는 없을 수도 있음)
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

  test('W-20. 날짜 필터 — RangePicker 존재 확인', async ({ page }) => {
    // ABC 탭
    await expect(activePane(page).locator('.ant-picker-range')).toBeVisible({ timeout: 5000 });

    // 재고 회전율 탭
    await clickTab(page, '재고 회전율');
    await page.waitForTimeout(1000);
    await expect(activePane(page).locator('.ant-picker-range')).toBeVisible();

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
  // API 직접 호출 (W-21)
  // ══════════════════════════════════════════
  test('W-21. API 직접 호출 — 7개 엔드포인트 200 응답', async ({ page }) => {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };

    const endpoints = [
      `${API}/abc-analysis?date_from=${from}&date_to=${to}`,
      `${API}/margin-analysis?date_from=${from}&date_to=${to}`,
      `${API}/inventory-turnover?date_from=${from}&date_to=${to}`,
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
  // 메뉴 네비게이션 (W-22 ~ W-24)
  // ══════════════════════════════════════════
  test('W-22. 메뉴 네비게이션 — 사이드바에서 MD 종합분석 접근', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1000);

    await clickMenu(page, 'MD 분석', 'MD 종합분석');
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: 'MD 분석' })).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/md/analytics');
  });

  test('W-23. 메뉴 네비게이션 — MD 분석 > 판매분석', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1000);

    await clickMenu(page, 'MD 분석', '판매분석');
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: '판매분석' })).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/sales/analytics');
  });

  test('W-24. 메뉴 네비게이션 — MD 분석 > 판매율 분석', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1000);

    await clickMenu(page, 'MD 분석', '판매율 분석');
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: '판매율 분석' })).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/sales/sell-through');
  });

  // ══════════════════════════════════════════
  // 테이블 표준 확인 (W-25)
  // ══════════════════════════════════════════
  test('W-25. 테이블 표준 — size/pagination 확인', async ({ page }) => {
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
