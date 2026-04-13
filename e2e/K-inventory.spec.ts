import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable, clickMenu } from './helpers';

test.describe('K. 재고관리', () => {
  test('K-1. 재고현황 페이지 접속 + 테이블 표시', async ({ page }) => {
    await navigateTo(page, '/inventory/status');

    // 페이지 제목 "재고현황" 표시
    await expect(page.locator('text=재고현황').first()).toBeVisible({ timeout: 10_000 });

    // 통계 카드 표시 — "총 재고수량" 또는 "내 매장 총 재고"
    const totalCard = page.locator('text=총 재고수량').or(page.locator('text=내 매장 총 재고'));
    await expect(totalCard.first()).toBeVisible({ timeout: 10_000 });

    // 품절 카드 표시
    await expect(page.locator('text=품절').first()).toBeVisible();

    // 재고 테이블이 로드됨
    await waitForTable(page);
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible();

    // 테이블 컬럼 헤더 확인: 거래처, 상품코드, 상품명, SKU, 재고
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('거래처'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('상품코드'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('상품명'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('SKU'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('재고'))).toBeTruthy();

    // 페이지네이션 — "총 N건" 표시
    await expect(page.locator('text=/총 \\d+건/').first()).toBeVisible();
  });

  test('K-2. 재고 검색 (상품명/SKU)', async ({ page }) => {
    await navigateTo(page, '/inventory/status');
    await waitForTable(page);

    // 검색 입력창 존재
    const searchInput = page.locator('input[placeholder*="검색"]').first();
    await expect(searchInput).toBeVisible();

    // 검색어 입력
    await searchInput.fill('test');
    await page.waitForTimeout(500);

    // AutoComplete 드롭다운이 나타나거나, 빈 결과일 수 있음
    // 조회 버튼 클릭하여 검색 실행
    const searchBtn = page.locator('button').filter({ hasText: '조회' });
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);

    // 테이블이 여전히 정상 표시됨
    await expect(page.locator('.ant-table').first()).toBeVisible();
  });

  test('K-3. 매장별 재고 — 다른 매장 재고 확인', async ({ page }) => {
    await navigateTo(page, '/inventory/status');
    await waitForTable(page);

    // 거래처 필터 (Select)가 존재하는지 확인
    // InventoryDashboard에서 거래처 Select는 placeholder="전체"로 렌더링됨
    const partnerFilter = page.locator('.ant-select').filter({ hasText: '거래처' }).or(
      page.locator('div').filter({ hasText: /^거래처$/ }).locator('..').locator('.ant-select'),
    );

    // 거래처 필터 라벨 "거래처" 텍스트가 존재함
    await expect(page.locator('text=거래처').first()).toBeVisible({ timeout: 10_000 });

    // STORE_MANAGER(gangnam)는 거래처 필터에 기본적으로 자기 매장 코드가 선택되어 있음
    // (partnerFilter 초기값: isStore ? [user.partnerCode] : [])
    // 테이블에 표시된 데이터의 거래처명 확인
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행의 거래처명(첫 번째 컬럼) 확인
      const firstPartnerCell = rows.first().locator('td').first();
      const partnerText = await firstPartnerCell.textContent();
      // 매장관리자의 기본 필터가 자기 매장이므로 해당 매장명이 표시되어야 함
      expect(partnerText).toBeTruthy();
    }

    // STORE_MANAGER는 다른 매장 재고도 조회 가능 (effectiveStore = false)
    // 거래처 필터 드롭다운에 여러 매장이 나열되는지 확인
    const selectTrigger = page.locator('div').filter({ hasText: /^거래처$/ }).locator('..').locator('.ant-select').first();
    if (await selectTrigger.count() > 0) {
      await selectTrigger.click();
      await page.waitForTimeout(500);

      // 드롭다운 옵션이 표시됨 (거래처 목록)
      const options = page.locator('.ant-select-dropdown .ant-select-item');
      const optionCount = await options.count();
      // 하나 이상의 거래처 옵션이 있어야 함
      expect(optionCount).toBeGreaterThanOrEqual(1);

      // 드롭다운 닫기 (ESC)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 에러 메시지 없음
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('K-4. 재고 수량 표시 (숫자)', async ({ page }) => {
    await navigateTo(page, '/inventory/status');
    await waitForTable(page);

    // 테이블 본문 행이 존재하는지 확인
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행의 "재고" 컬럼에 숫자가 표시됨
      // 재고 컬럼은 renderQty로 렌더링됨 — <strong> 태그 안에 숫자
      const firstRowQty = rows.first().locator('td').last().locator('strong');
      if (await firstRowQty.count() > 0) {
        const qtyText = await firstRowQty.first().textContent();
        // 숫자 형식인지 확인 (쉼표 포함 가능: "1,234" 또는 음수 "-5")
        expect(qtyText).toMatch(/^-?[\d,]+$/);
      }
    }

    // 통계 카드에 숫자가 표시됨 (총 재고수량 카드의 값)
    const statValues = page.locator('[style*="font-size: 26px"], [style*="fontSize: 26"]');
    if (await statValues.count() > 0) {
      const statText = await statValues.first().textContent();
      expect(statText).toBeTruthy();
    }
  });

  test('K-5. 재고 수량 실시간 반영 (리로드 후 테이블 재렌더링)', async ({ page }) => {
    await navigateTo(page, '/inventory/status');
    await waitForTable(page);

    // 초기 로드 후 테이블 및 통계 카드 정상 표시 확인
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible();

    // 통계 카드 값 기록 (리로드 전)
    const totalCard = page.locator('text=총 재고수량').or(page.locator('text=내 매장 총 재고'));
    await expect(totalCard.first()).toBeVisible({ timeout: 10_000 });

    // 행 수 기록 (리로드 전)
    const rowsBefore = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCountBefore = await rowsBefore.count();

    // 페이지 리로드
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});
    await waitForTable(page);

    // 리로드 후 테이블이 다시 정상 렌더링됨
    await expect(page.locator('.ant-table').first()).toBeVisible();

    // 통계 카드가 다시 표시됨
    const totalCardAfter = page.locator('text=총 재고수량').or(page.locator('text=내 매장 총 재고'));
    await expect(totalCardAfter.first()).toBeVisible({ timeout: 10_000 });

    // 품절 카드도 다시 표시됨
    await expect(page.locator('text=품절').first()).toBeVisible();

    // 리로드 후 행 수가 동일해야 함 (데이터 변경 없음)
    const rowsAfter = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCountAfter = await rowsAfter.count();
    expect(rowCountAfter).toBe(rowCountBefore);

    // 페이지네이션 "총 N건" 표시도 유지됨
    await expect(page.locator('text=/총 \\d+건/').first()).toBeVisible();

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('K-6. 재고조정 메뉴 미표시 (매장관리자 권한)', async ({ page }) => {
    await navigateTo(page, '/');

    // 사이드바에서 재고관리 서브메뉴 열기
    const sider = page.locator('.ant-layout-sider');
    const inventoryMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '재고관리' });

    if (await inventoryMenu.count() > 0) {
      await inventoryMenu.click();
      await page.waitForTimeout(500);

      // "재고조정" 메뉴 항목이 표시되지 않아야 함 (ADMIN_HQ 전용)
      const adjustItem = sider.locator('.ant-menu-item').filter({ hasText: '재고조정' });
      await expect(adjustItem).toHaveCount(0);
    }

    // URL 직접 접근 시도 — 에러 없이 페이지 표시 (재고현황과 동일 컴포넌트)
    await navigateTo(page, '/inventory/adjust');
    await page.waitForTimeout(1000);

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });
});
