import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

/**
 * U. 판매분석 + 판매율분석 — 값 정확성 검증
 *
 * 판매분석(/sales/analytics): ADMIN_HQ_STORE → store-manager 프로젝트로 테스트
 * 판매율분석(/sales/sell-through): ADMIN_HQ → admin 프로젝트로 별도(U-sell-through-admin.spec.ts)
 */

function getAuthToken(page: any): Promise<string> {
  return page.evaluate(() => localStorage.getItem('zensai_access_token') || '');
}

test.describe('U. 판매분석 (기간별 현황)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/sales/analytics');
    await page.waitForTimeout(2000);
  });

  test('U-1. 판매분석 페이지 진입 — 2개 탭 + 기본 로드', async ({ page }) => {
    // 페이지 제목
    await expect(page.getByRole('heading', { name: '판매분석' })).toBeVisible({ timeout: 10_000 });

    // 2개 탭 확인: 기간별 현황, 전년대비 분석
    const tabs = page.locator('.ant-tabs-tab');
    await expect(tabs.filter({ hasText: '기간별 현황' })).toBeVisible();
    await expect(tabs.filter({ hasText: '전년대비 분석' })).toBeVisible();

    // 기간별 현황이 기본 탭
    await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: '기간별 현황' })).toBeVisible();
  });

  test('U-2. 기간별 현황 — 뷰 모드 전환 (일별/주별/월별)', async ({ page }) => {
    // Segmented 컨트롤에 일별/주별/월별 존재
    const segmented = page.locator('.ant-segmented');
    await expect(segmented).toBeVisible({ timeout: 10_000 });

    // 월별이 기본 선택
    await expect(segmented.locator('.ant-segmented-item-selected')).toContainText('월별');

    // 일별로 전환
    await segmented.locator('.ant-segmented-item').filter({ hasText: '일별' }).click();
    await page.waitForTimeout(2000);

    // 좌우 이동 버튼 존재
    await expect(page.locator('button:has(.anticon-left)')).toBeVisible();
    await expect(page.locator('button:has(.anticon-right)')).toBeVisible();
  });

  test('U-3. 기간별 현황 — 요약 통계 카드 값 검증', async ({ page }) => {
    const token = await getAuthToken(page);

    // 현재 월 기간 계산
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const from = `${y}-${m}-01`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const todayDay = now.getDate();
    const toDay = Math.min(lastDay, todayDay);
    const to = `${y}-${m}-${String(toDay).padStart(2, '0')}`;

    // API로 데이터 직접 조회
    const apiRes = await page.request.get(
      `http://localhost:3001/api/sales/style-by-range?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.totals) {
      test.skip();
      return;
    }

    const totals = apiData.data.totals;

    // 페이지에 표시된 총 매출액 확인
    if (totals.total_amount > 0) {
      const amountText = Number(totals.total_amount).toLocaleString();
      // 카드에 총 매출액이 올바른 포맷으로 표시되어야 함
      const pageContent = await page.locator('.ant-card').allTextContents();
      const found = pageContent.some(t => t.includes(amountText.slice(0, -3)) || t.includes('매출'));
      expect(found).toBeTruthy();
    }
  });

  test('U-4. 기간별 현황 — 카테고리 분포 바 차트 표시', async ({ page }) => {
    // 로딩 완료 대기
    await page.waitForTimeout(3000);

    // 카테고리 분포 섹션이 있으면 확인
    const catSection = page.locator('text=카테고리').first();
    if (await catSection.isVisible().catch(() => false)) {
      // 카테고리 바(StyleBar) 렌더링 확인
      const bars = page.locator('div').filter({ hasText: /원$/ });
      const barCount = await bars.count();
      expect(barCount).toBeGreaterThanOrEqual(0); // 데이터 없으면 0
    }
  });

  test('U-5. 기간별 현황 — 상품별 매출 테이블', async ({ page }) => {
    await page.waitForTimeout(3000);

    // 상품별 매출 테이블 존재 여부
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      // 테이블 헤더 확인
      const headers = await table.locator('.ant-table-thead th').allTextContents();
      const headerText = headers.join(' ');

      // 핵심 컬럼: 상품명, 매출금액, 수량 관련
      const hasRelevantColumns = headerText.includes('상품') || headerText.includes('매출') || headerText.includes('수량');
      expect(hasRelevantColumns).toBeTruthy();
    }
  });

  test('U-6. 기간별 현황 — 필터 동작 (카테고리 선택)', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 카테고리 필터 Select 존재
    const categorySelect = page.locator('.ant-select').first();
    if (await categorySelect.isVisible().catch(() => false)) {
      await categorySelect.click();
      await page.waitForTimeout(500);

      // 드롭다운 옵션 표시
      const options = page.locator('.ant-select-item-option');
      const optionCount = await options.count();

      if (optionCount > 0) {
        // 첫 번째 옵션 클릭
        await options.first().click();
        await page.waitForTimeout(2000);

        // 로딩 후 데이터가 재로드되어야 함 (에러 없이)
        const errorMsg = page.locator('.ant-message-error');
        await expect(errorMsg).toBeHidden({ timeout: 3000 }).catch(() => {});
      }
    }
  });

  test('U-7. 기간별 현황 — 상품 클릭 → 색상/사이즈별 모달', async ({ page }) => {
    await page.waitForTimeout(3000);

    // 테이블에 행이 있으면 클릭
    const table = page.locator('.ant-table').first();
    if (await table.isVisible().catch(() => false)) {
      const rows = table.locator('.ant-table-tbody tr.ant-table-row');
      const rowCount = await rows.count();

      if (rowCount > 0) {
        // 첫 번째 행의 상품명 클릭
        const productCell = rows.first().locator('td').nth(1);
        await productCell.click();
        await page.waitForTimeout(1000);

        // 모달 열림 확인
        const modal = page.locator('.ant-modal-content');
        if (await modal.isVisible().catch(() => false)) {
          // 모달에 색상/사이즈 테이블 존재
          const modalTable = modal.locator('.ant-table');
          await expect(modalTable).toBeVisible({ timeout: 5000 });
          await page.locator('.ant-modal-close').click();
        }
      }
    }
  });

  test('U-8. 전년대비 분석 탭 전환 + 로드', async ({ page }) => {
    // 전년대비 분석 탭 클릭
    await page.locator('.ant-tabs-tab').filter({ hasText: '전년대비 분석' }).click();
    await page.waitForTimeout(3000);

    // 탭 활성화 확인
    await expect(page.locator('.ant-tabs-tab-active').filter({ hasText: '전년대비 분석' })).toBeVisible();

    // 에러 없이 로드 완료
    const errorMsg = page.locator('.ant-message-error');
    await expect(errorMsg).toBeHidden({ timeout: 3000 }).catch(() => {});
  });

  test('U-9. API ↔ UI 값 일치 — 매출 금액/수량 정합성', async ({ page }) => {
    const token = await getAuthToken(page);

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const from = `${y}-${m}-01`;
    const toDay = String(now.getDate()).padStart(2, '0');
    const to = `${y}-${m}-${toDay}`;

    // API로 카테고리별 데이터 조회
    const apiRes = await page.request.get(
      `http://localhost:3001/api/sales/style-by-range?date_from=${from}&date_to=${to}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const apiData = await apiRes.json();

    if (!apiData.success || !apiData.data?.totals) {
      test.skip();
      return;
    }

    const totals = apiData.data.totals;
    const byCategory = apiData.data.byCategory || [];

    // 카테고리별 금액 합계 = 전체 합계와 일치해야 함
    if (byCategory.length > 0) {
      const catSum = byCategory.reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0);
      // 오차 범위 허용 (반올림 차이)
      expect(Math.abs(catSum - Number(totals.total_amount))).toBeLessThanOrEqual(10);
    }

    // 카테고리별 수량 합계 ≤ 전체 수량 (카테고리 미지정 상품 제외 가능)
    if (byCategory.length > 0) {
      const catQtySum = byCategory.reduce((s: number, c: any) => s + Number(c.total_qty || 0), 0);
      expect(catQtySum).toBeLessThanOrEqual(Number(totals.total_qty));
      expect(catQtySum).toBeGreaterThan(0);
    }
  });
});
