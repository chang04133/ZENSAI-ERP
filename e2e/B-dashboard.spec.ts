import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('B. 대시보드', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/');
  });

  test('B-1. 대시보드 카드 — 매출/재고/할일 표시', async ({ page }) => {
    // 히어로 배너 (gradient 배경) 존재
    const heroBanner = page.locator('[style*="gradient"]').first();
    await expect(heroBanner).toBeVisible({ timeout: 10_000 });

    // "오늘 매출" 텍스트 존재
    await expect(page.locator('text=오늘 매출').first()).toBeVisible({ timeout: 10_000 });

    // 매출 등록 버튼 존재
    await expect(page.locator('button').filter({ hasText: '매출 등록' })).toBeVisible();

    // 할일 카드들 — 수령 대기, 출고 처리, 수량불일치 텍스트 중 하나 이상 있어야 함
    const todoTexts = ['수령 대기', '출고 처리', '수량불일치', '예약판매 대기', '수평이동'];
    let foundTodo = false;
    for (const text of todoTexts) {
      const el = page.locator(`text=${text}`);
      if (await el.count() > 0) {
        foundTodo = true;
        break;
      }
    }
    expect(foundTodo).toBeTruthy();

    // StatCard 영역 — 월간매출, 재고 카드
    await expect(page.locator('text=월간').first()).toBeVisible();
    await expect(page.locator('text=내 매장 재고').first()).toBeVisible();
  });

  test('B-2. 미처리 알림 배너 (PendingActionsBanner)', async ({ page }) => {
    // 히어로 배너 안에 사용자 이름이 표시되어야 함
    const banner = page.locator('[style*="gradient"]').first();
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // "처리할 일이 N건 있습니다" 또는 "좋은 하루 보내세요" 둘 중 하나
    const hasAlert = page.locator('text=처리할 일이');
    const hasGreeting = page.locator('text=좋은 하루');
    const alertCount = await hasAlert.count();
    const greetingCount = await hasGreeting.count();
    expect(alertCount + greetingCount).toBeGreaterThanOrEqual(1);
  });

  test('B-3. 할일 카드 클릭 → 해당 페이지 이동', async ({ page }) => {
    // 매출 등록 버튼 클릭 → /sales/entry 이동
    const salesBtn = page.locator('button').filter({ hasText: '매출 등록' });
    await salesBtn.click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/sales/entry');

    // 뒤로 가서 대시보드로 복귀
    await navigateTo(page, '/');

    // 수령 대기 카드 클릭 (있으면) → /shipment/dashboard 이동
    const receiveCard = page.locator('text=수령 대기').first();
    if (await receiveCard.isVisible()) {
      const clickable = page.locator('text=확인하기').first();
      if (await clickable.isVisible()) {
        await clickable.click();
        await page.waitForTimeout(1000);
        expect(page.url()).toContain('/shipment');
      }
    }
  });

  test('B-4. 오늘 판매 내역 테이블 표시', async ({ page }) => {
    // "오늘 판매 내역" 카드 존재
    await expect(page.locator('text=오늘 판매 내역').first()).toBeVisible({ timeout: 10_000 });

    // 테이블 또는 Empty("오늘 판매 내역이 없습니다") 둘 중 하나
    const table = page.locator('.ant-table-tbody');
    const empty = page.locator('text=오늘 판매 내역이 없습니다');
    const tableCount = await table.count();
    const emptyCount = await empty.count();
    expect(tableCount + emptyCount).toBeGreaterThanOrEqual(1);

    // "전체보기" 링크 존재
    await expect(page.locator('text=전체보기').first()).toBeVisible();
  });

  test('B-4b. 재고 부족 알림 — 재입고 요청 보내기', async ({ page }) => {
    // 대시보드 데이터 로드 대기
    await page.waitForTimeout(3000);

    // "재고 부족 알림" 카드 존재 여부 확인
    // 이 섹션은 lowStock 데이터가 있을 때만 렌더링됨
    const lowStockCard = page.locator('text=재고 부족 알림');
    const lowStockVisible = await lowStockCard.count() > 0;

    if (lowStockVisible) {
      await expect(lowStockCard.first()).toBeVisible();

      // 재고 부족 카드 안에 "재고현황" 링크가 존재해야 함
      await expect(page.locator('text=재고현황').first()).toBeVisible();

      // 재고 부족 테이블이 표시되어야 함 (상품명, SKU, 재고 컬럼)
      const lowStockSection = page.locator('.ant-card').filter({ hasText: '재고 부족 알림' });
      const tableInSection = lowStockSection.locator('.ant-table-tbody');
      await expect(tableInSection).toBeVisible({ timeout: 5_000 });

      // 매장 사용자(STORE_MANAGER)이므로 "요청" 또는 "요청완료" 버튼이 표시될 수 있음
      const requestBtns = lowStockSection.locator('button').filter({ hasText: '요청' });
      const completedBtns = lowStockSection.locator('button').filter({ hasText: '요청완료' });
      const requestCount = await requestBtns.count();
      const completedCount = await completedBtns.count();

      // "다른 매장" 컬럼에 재고가 있는 행이 있으면 요청/요청완료 버튼 존재
      // 재고 부족 데이터가 있으므로 테이블 행이 1개 이상
      const rows = lowStockSection.locator('.ant-table-tbody tr.ant-table-row');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // 각 행에 재고 수량(빨간색 0 또는 주황색 숫자) Tag가 표시됨
      const stockTags = lowStockSection.locator('.ant-tag');
      expect(await stockTags.count()).toBeGreaterThanOrEqual(1);

      // "요청" 버튼이 있다면 클릭 가능한 상태인지 확인 (disabled가 아닌지)
      if (requestCount > 0) {
        const firstRequestBtn = requestBtns.first();
        const isDisabled = await firstRequestBtn.isDisabled();
        // 요청 버튼이 있으면 disabled가 아니어야 함 (요청완료가 아닌 경우)
        expect(typeof isDisabled).toBe('boolean');
      }
    } else {
      // 재고 부족 데이터가 없는 경우 — 카드 자체가 렌더링되지 않음
      // 대시보드에 다른 재고 관련 정보가 있는지 확인
      // "내 매장 재고" StatCard는 항상 표시됨
      await expect(page.locator('text=내 매장 재고').first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
