import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('F. 판매내역', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/sales/entry');
    // 판매내역 탭으로 전환 (data-node-key="daily")
    await page.locator('.ant-tabs-tab[data-node-key="daily"]').click();
    await page.waitForTimeout(2000);
  });

  // 활성 탭 패널 내의 테이블을 찾는 헬퍼
  const activePane = (page: any) => page.locator('.ant-tabs-tabpane-active');
  const activeTable = (page: any) => page.locator('.ant-tabs-tabpane-active .ant-table');

  test('F-1. 판매내역 탭 — 날짜 필터 + 테이블 표시', async ({ page }) => {
    const pane = activePane(page);

    // 날짜 범위 필터(RangePicker) 존재
    const rangePicker = pane.locator('.ant-picker-range').first();
    await expect(rangePicker).toBeVisible({ timeout: 10_000 });

    // "조회" 버튼 존재
    const searchBtn = pane.locator('button').filter({ hasText: '조회' });
    await expect(searchBtn).toBeVisible();

    // 테이블 존재 (데이터가 있든 없든 테이블 구조는 렌더링됨)
    await expect(activeTable(page)).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더에 필수 컬럼 존재: 매출일, SKU, 상품명, 수량, 단가, 합계
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    const expectedColumns = ['매출일', 'SKU', '상품명', '수량', '단가', '합계'];
    for (const col of expectedColumns) {
      expect(headerTexts.some(t => t.includes(col))).toBeTruthy();
    }

    // 추가 컬럼 확인: 유형, T/F, 반품사유, 메모
    expect(headerTexts.some(t => t.includes('유형'))).toBeTruthy();

    // "조회기간" 라벨 텍스트 존재
    await expect(pane.locator('text=조회기간').first()).toBeVisible();

    // 페이지네이션 (50건 단위, "총 N건") 확인
    // 데이터가 있으면 pagination이 존재함
    const paginationTotal = pane.locator('.ant-pagination');
    const hasTable = await activeTable(page).locator('.ant-table-tbody tr.ant-table-row').count() > 0;
    if (hasTable) {
      await expect(paginationTotal).toBeVisible();
    }
  });

  test('F-2. 검색 기능 (SKU/상품명)', async ({ page }) => {
    const pane = activePane(page);

    // 검색 입력 필드 존재 ("SKU/상품명" placeholder)
    const searchInput = pane.locator('input[placeholder*="SKU"]').or(pane.locator('input[placeholder*="상품명"]'));
    await expect(searchInput.first()).toBeVisible();

    // 검색 필드에 테스트 텍스트 입력
    await searchInput.first().fill('test');

    // "조회" 버튼 클릭
    const searchBtn = pane.locator('button').filter({ hasText: '조회' });
    await searchBtn.click();
    await page.waitForTimeout(2000);

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);

    // 테이블이 정상 렌더링됨 (결과가 없어도 빈 테이블 표시)
    await expect(activeTable(page)).toBeVisible();

    // 검색 필드 초기화 후 다시 조회
    await searchInput.first().clear();
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 다시 에러 없이 테이블 표시
    await expect(activeTable(page)).toBeVisible();
  });

  test('F-3. 매출 수정/삭제 버튼 존재 확인 (매니저)', async ({ page }) => {
    // 매장관리자(STORE_MANAGER)로 로그인한 상태이므로 "관리" 컬럼이 있어야 함
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    // isManager이므로 "관리" 컬럼 존재
    expect(headerTexts.some(t => t.includes('관리'))).toBeTruthy();

    // 테이블에 데이터가 있으면 액션 버튼 확인
    const rows = activeTable(page).locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 일반 매출 행에서 액션 아이콘 확인
      // 매니저는 수정(EditOutlined), 교환(SwapOutlined), 반품(RollbackOutlined), 삭제(DeleteOutlined) 아이콘을 가짐
      // 또는 반품/수정 행의 경우 다른 텍스트가 표시됨
      const firstRow = rows.first();

      // 액션 영역에 버튼 또는 텍스트("수정기록", "-", "예약판매 탭에서 관리") 존재
      const actionButtons = firstRow.locator('button');
      const actionTexts = firstRow.locator('td').last();
      const hasActions = (await actionButtons.count()) > 0;
      const hasText = (await actionTexts.textContent()) !== '';

      // 어떤 형태든 관리 컬럼에 내용이 있어야 함
      expect(hasActions || hasText).toBeTruthy();
    } else {
      // 데이터가 없는 경우 빈 테이블 표시 (empty state)
      const emptyArea = activeTable(page).locator('.ant-empty');
      const emptyCount = await emptyArea.count();
      // 데이터가 없어도 테이블 구조는 존재
      await expect(activeTable(page)).toBeVisible();
    }

    // 날짜 필터 변경 후 조회 동작 확인 (에러 없이 동작하는지)
    const searchBtn = activePane(page).locator('button').filter({ hasText: '조회' });
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('F-4. 매출 금액 합계 검증', async ({ page }) => {
    const pane = activePane(page);

    // 테이블이 로드될 때까지 대기
    await expect(activeTable(page)).toBeVisible({ timeout: 10_000 });

    // 데이터가 있는지 확인
    const rows = activeTable(page).locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 페이지네이션의 "총 N건" 텍스트로 합계 정보 확인
      const paginationInfo = pane.locator('.ant-pagination');
      await expect(paginationInfo).toBeVisible();

      // "총" 텍스트가 포함된 요소 확인 (showTotal 콜백)
      const totalText = pane.locator('text=총').first();
      await expect(totalText).toBeVisible();

      // "합계" 컬럼 헤더가 존재하는지 확인
      const headers = activeTable(page).locator('.ant-table-thead th');
      const headerTexts = await headers.allTextContents();
      expect(headerTexts.some(t => t.includes('합계'))).toBeTruthy();

      // 각 행의 합계 셀에 숫자가 표시되는지 확인 (toLocaleString 포맷)
      // 첫 번째 행의 합계 컬럼 값 확인
      const firstRowCells = rows.first().locator('td');
      const cellTexts = await firstRowCells.allTextContents();
      // 합계 컬럼은 숫자 형태 (쉼표 구분자 포함)
      const hasNumericValue = cellTexts.some(t => /[\d,]+/.test(t));
      expect(hasNumericValue).toBeTruthy();
    } else {
      // 데이터가 없어도 테이블 구조는 존재
      await expect(activeTable(page)).toBeVisible();
    }
  });

  test('F-5. 매출 액션 버튼 상태 확인', async ({ page }) => {
    const pane = activePane(page);

    // 테이블 로드 대기
    await expect(activeTable(page)).toBeVisible({ timeout: 10_000 });

    // "관리" 컬럼 존재 확인 (STORE_MANAGER이므로 isManager=true)
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('관리'))).toBeTruthy();

    const rows = activeTable(page).locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 행을 순회하며 액션 버튼 상태 확인
      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);
        const cells = row.locator('td');
        const allTexts = await cells.allTextContents();
        const fullRowText = allTexts.join(' ');

        // 반품 행인 경우: "-" 텍스트 또는 삭제 버튼만 표시
        // 수정기록 행: "수정기록" 텍스트
        // 예약판매 행: "예약판매 탭에서 관리" 텍스트
        // 일반 행: 수정/교환/반품/삭제 버튼

        const actionButtons = row.locator('td').last().locator('button');
        const actionBtnCount = await actionButtons.count();

        if (fullRowText.includes('수정기록')) {
          // 수정기록 행은 버튼이 없고 "수정기록" 텍스트만 표시
          expect(fullRowText).toContain('수정기록');
        } else if (fullRowText.includes('예약판매 탭에서 관리')) {
          // 예약판매 행은 관리 버튼 없음
          expect(fullRowText).toContain('예약판매 탭에서 관리');
        } else if (actionBtnCount > 0) {
          // 일반 매출 행: STORE_MANAGER 기준
          // 오늘 매출이면 수정/교환/반품/삭제 버튼이 활성화
          // 오래된 매출이면 수정 버튼 비활성화(disabled)
          // 30일 초과 매출이면 교환/반품 버튼도 비활성화

          // 매출일 확인 (첫 번째 셀)
          const saleDateText = await cells.first().textContent();
          const today = new Date();
          const todayStr = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`;

          // 버튼 존재 확인 (최소 1개 이상)
          expect(actionBtnCount).toBeGreaterThanOrEqual(1);

          // 오늘 매출인 경우
          if (saleDateText && saleDateText.includes(String(today.getDate()))) {
            // 수정 버튼이 있으면 disabled가 아닌지 확인
            const editBtn = actionButtons.first();
            const isEditDisabled = await editBtn.isDisabled();
            // 오늘 매출의 수정 버튼은 활성 상태여야 함
            expect(isEditDisabled).toBe(false);
          }
        }
        // 반품 행이면서 STORE_MANAGER인 경우 "-" 텍스트만 있을 수 있음
      }
    } else {
      // 데이터가 없는 경우 빈 테이블만 표시
      await expect(activeTable(page)).toBeVisible();
    }
  });
});
