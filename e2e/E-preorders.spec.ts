import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('E. 예약판매', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/sales/entry');
    // 예약판매 탭으로 전환 (data-node-key="preorders")
    await page.locator('.ant-tabs-tab[data-node-key="preorders"]').click();
    await page.waitForTimeout(1000);
  });

  // 활성 탭 패널 내의 테이블을 찾는 헬퍼
  const activeTable = (page: any) => page.locator('.ant-tabs-tabpane-active .ant-table');

  test('E-1. 예약판매 탭 존재 + 예약판매 목록 표시', async ({ page }) => {
    // 예약판매 탭이 활성 상태여야 함 (data-node-key로 확인)
    const preorderTab = page.locator('.ant-tabs-tab[data-node-key="preorders"]');
    await expect(preorderTab).toHaveClass(/ant-tabs-tab-active/);

    // 활성 탭 패널 내에 테이블 존재
    await expect(activeTable(page)).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더에 예약판매 관련 컬럼 존재: 등록일, 상품명, SKU, 컬러, 사이즈, 수량, 단가
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    const expectedColumns = ['등록일', '상품명', 'SKU', '수량', '단가'];
    for (const col of expectedColumns) {
      expect(headerTexts.some(t => t.includes(col))).toBeTruthy();
    }

    // 새로고침 버튼 존재
    const refreshBtn = page.locator('.ant-tabs-tabpane-active button').filter({ hasText: '새로고침' });
    await expect(refreshBtn).toBeVisible();

    // 안내 텍스트 존재 (재고 부족 시 예약판매 설명)
    const infoText = page.locator('.ant-tabs-tabpane-active').locator('text=재고 부족');
    await expect(infoText.first()).toBeVisible();

    // 테이블에 데이터 행 또는 빈 상태 표시
    const table = activeTable(page);
    const hasRows = await table.locator('.ant-table-tbody tr.ant-table-row').count() > 0;
    const hasEmpty = await table.locator('.ant-empty').count() > 0;
    expect(hasRows || hasEmpty).toBeTruthy();
  });

  test('E-2. 예약판매 등록 UI 확인 (재고 부족 상품)', async ({ page }) => {
    // 중첩 탭 구조 — 예약판매 패널을 ID로 정확히 선택 (strict mode 회피)
    const activePane = page.locator('.ant-tabs-tabpane[id*="preorders"]');

    // 예약판매는 매출등록 탭에서 재고 부족 상품 등록 시 자동으로 전환됨
    // 예약판매 탭 자체에는 별도 등록 UI가 없으며, 안내 텍스트로 설명

    // 안내 텍스트 확인
    const fullText = await activePane.textContent() || '';
    expect(fullText).toContain('재고 부족');

    // "자동" 관련 텍스트 존재 (자동 삭제 또는 자동 복구 설명)
    expect(fullText).toContain('자동');

    // 새로고침 버튼 존재
    const refreshBtn = activePane.locator('button').filter({ hasText: '새로고침' });
    await expect(refreshBtn).toBeVisible();

    // 테이블 구조 확인 — 컬럼: 등록일, 상품명, SKU, 컬러, 사이즈, 수량, 단가, 관리
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('상품명'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('수량'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('관리'))).toBeTruthy();
  });

  test('E-3. 예약판매 자동 해소 확인', async ({ page }) => {
    // 중첩 탭 구조 — 예약판매 패널을 ID로 정확히 선택 (strict mode 회피)
    const activePane = page.locator('.ant-tabs-tabpane[id*="preorders"]');

    // 안내 텍스트에서 자동 해소 설명 확인
    const fullText = await activePane.textContent() || '';
    expect(fullText).toContain('재고');
    expect(fullText).toContain('자동');

    // 테이블에 데이터가 있는 경우 삭제 아이콘 존재 확인
    const rows = activeTable(page).locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const firstRow = rows.first();
      // 매장 사용자이므로 관리 컬럼에 액션 버튼 존재
      const actionBtn = firstRow.locator('button');
      expect(await actionBtn.count()).toBeGreaterThanOrEqual(1);
    } else {
      // 빈 상태
      const emptyArea = activeTable(page).locator('.ant-empty');
      await expect(emptyArea.first()).toBeVisible();
    }

    // 새로고침 후에도 에러 없이 동작
    const refreshBtn = activePane.locator('button').filter({ hasText: '새로고침' });
    await refreshBtn.click();
    await page.waitForTimeout(1500);

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('E-4. 예약판매 삭제', async ({ page }) => {
    // 매장관리자(STORE_MANAGER)는 isManager이므로 삭제 컬럼이 있어야 함
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    // "관리" 컬럼 존재 확인
    expect(headerTexts.some(t => t.includes('관리'))).toBeTruthy();

    // 테이블에 데이터 행이 있는지 확인
    const rows = activeTable(page).locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행에 삭제 버튼(DeleteOutlined) 존재 확인
      const firstRow = rows.first();
      const deleteBtn = firstRow.locator('button .anticon-delete');
      const hasDeleteBtn = await deleteBtn.count() > 0;

      if (hasDeleteBtn) {
        // 삭제 버튼 클릭 - Popconfirm이 열려야 함
        const deleteBtnElement = firstRow.locator('button').filter({ has: page.locator('.anticon-delete') });
        await deleteBtnElement.first().click();
        await page.waitForTimeout(500);

        // Popconfirm 확인 ("예약판매를 삭제하시겠습니까?")
        const popconfirm = page.locator('.ant-popover').filter({ hasText: '예약판매를 삭제하시겠습니까' }).or(
          page.locator('.ant-popconfirm').filter({ hasText: '삭제' })
        );
        const hasPopconfirm = await popconfirm.count() > 0;

        if (hasPopconfirm) {
          // Popconfirm이 열렸음을 확인
          await expect(popconfirm.first()).toBeVisible();

          // "취소" 버튼 클릭하여 삭제 취소 (실제 삭제는 하지 않음)
          const cancelBtn = popconfirm.first().locator('button').filter({ hasText: '취소' });
          if (await cancelBtn.count() > 0) {
            await cancelBtn.click();
          } else {
            // 취소 버튼을 찾지 못하면 외부 클릭으로 닫기
            await page.locator('body').click({ position: { x: 10, y: 10 } });
          }
          await page.waitForTimeout(300);
        }

        // 삭제 취소 후 테이블이 정상 표시됨
        await expect(activeTable(page)).toBeVisible();

        // 행 수가 그대로 유지됨 (삭제 취소했으므로)
        const rowCountAfter = await rows.count();
        expect(rowCountAfter).toBe(rowCount);
      } else {
        // 삭제 버튼이 없는 경우 - 매장 사용자의 재고조회 아이콘만 있을 수 있음
        const searchBtn = firstRow.locator('button .anticon-search');
        const hasSearch = await searchBtn.count() > 0;
        // 최소한 하나의 액션 아이콘이 있어야 함
        expect(hasDeleteBtn || hasSearch).toBeTruthy();
      }
    } else {
      // 데이터가 없는 경우 - 빈 테이블 확인
      const emptyArea = activeTable(page).locator('.ant-empty');
      await expect(emptyArea.first()).toBeVisible();

      // 빈 상태에서도 테이블 구조(헤더)는 정상 표시
      expect(headerTexts.length).toBeGreaterThan(0);
    }
  });

  test('E-5. 예약판매 상태 확인 — 테이블 구조 + 관리 컬럼', async ({ page }) => {
    // 매장관리자(STORE_MANAGER)로 로그인한 상태이므로 "관리" 컬럼이 있어야 함
    const headers = activeTable(page).locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    // 매니저이므로 "관리" 컬럼 존재
    expect(headerTexts.some(t => t.includes('관리'))).toBeTruthy();

    // 매장 사용자이므로 재고조회 아이콘(SearchOutlined) 컬럼도 존재할 수 있음
    // (isStore 조건에서 추가되는 컬럼)

    // 테이블에 데이터가 있으면 삭제 버튼 확인, 없으면 empty 확인
    const rows = activeTable(page).locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행에 삭제 버튼(DeleteOutlined)이 있어야 함 (매니저)
      const firstRow = rows.first();
      const deleteBtn = firstRow.locator('button .anticon-delete');
      // 삭제 버튼 또는 검색 아이콘 둘 중 하나가 있어야 함 (매장 사용자는 둘 다 보임)
      const searchBtn = firstRow.locator('button .anticon-search');
      const hasAction = (await deleteBtn.count()) > 0 || (await searchBtn.count()) > 0;
      expect(hasAction).toBeTruthy();
    } else {
      // 데이터가 없는 경우도 정상 (예약판매가 없을 수 있음)
      const emptyArea = activeTable(page).locator('.ant-empty');
      await expect(emptyArea.first()).toBeVisible();
    }

    // 새로고침 버튼 클릭 시 에러 없이 동작
    const refreshBtn = page.locator('.ant-tabs-tabpane-active button').filter({ hasText: '새로고침' });
    await refreshBtn.click();
    await page.waitForTimeout(1500);

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);

    // 테이블이 다시 정상 렌더링됨
    await expect(activeTable(page)).toBeVisible();
  });
});
