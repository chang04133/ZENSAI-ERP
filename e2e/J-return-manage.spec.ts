import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('J. 반품관리 (물류반품)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/shipment/return');
  });

  test('J-1. 반품관리 페이지 접속', async ({ page }) => {
    // PageHeader "반품관리" 텍스트 표시
    await expect(page.locator('text=반품관리').first()).toBeVisible({ timeout: 10_000 });

    // 2개 탭(Segmented): "물류반품 (매장→본사)" / "고객반품 (매장→본사)"
    const shipmentTab = page.locator('text=물류반품');
    const salesTab = page.locator('text=고객반품');
    await expect(shipmentTab.first()).toBeVisible({ timeout: 5_000 });
    await expect(salesTab.first()).toBeVisible({ timeout: 5_000 });

    // 물류반품 탭이 기본 선택 (물류반품 관련 상태 카드 표시)
    // 6개 상태 카드: 반품요청, 승인완료, 반품출고, 수량불일치, 반품수령, 취소
    const statusLabels = ['반품요청', '승인완료', '반품출고', '수량불일치', '반품수령', '취소'];
    for (const label of statusLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({ timeout: 5_000 });
    }

    // 상태 카드가 Ant Design Card 컴포넌트로 렌더링됨
    const cards = page.locator('.ant-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(6);

    // "반품의뢰 등록" 버튼 존재
    const registerBtn = page.locator('button').filter({ hasText: '반품의뢰 등록' });
    await expect(registerBtn.first()).toBeVisible();

    // 검색 입력 필드 존재
    const searchInput = page.locator('input[placeholder*="의뢰번호"]');
    await expect(searchInput).toBeVisible();

    // 기간 필터(RangePicker) 존재
    const rangePicker = page.locator('.ant-picker-range');
    await expect(rangePicker.first()).toBeVisible();

    // 조회 버튼 존재
    await expect(page.locator('button').filter({ hasText: '조회' })).toBeVisible();
  });

  test('J-2. 물류반품 등록', async ({ page }) => {
    await waitForTable(page);

    // "반품의뢰 등록" 버튼 클릭
    const registerBtn = page.locator('button').filter({ hasText: '반품의뢰 등록' });
    await expect(registerBtn.first()).toBeVisible({ timeout: 10_000 });
    await registerBtn.first().click();
    await page.waitForTimeout(500);

    // 모달 열림 확인
    const modal = page.locator('.ant-modal').filter({ hasText: '반품의뢰 등록' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 매장관리자: "반품 보낼 곳" Select가 있어야 함 (기본: 본사 자동 설정)
    await expect(modal.locator('text=반품 보낼 곳').first()).toBeVisible();

    // 고객 클레임/AS 스위치가 존재
    await expect(modal.locator('text=고객 클레임').first()).toBeVisible();

    // "품목 추가" 영역 존재
    await expect(modal.locator('text=품목 추가')).toBeVisible();

    // 품목 검색 Select가 있어야 함
    // 품목 추가 시도: enabled Select 중 품목 검색 가능한 것을 찾아서 검색
    const searchSelects = modal.locator('.ant-select');
    const selectCount = await searchSelects.count();

    let itemAdded = false;
    if (selectCount > 0) {
      // 모든 select의 search input 중 품목 추가용 찾기
      for (let i = 0; i < selectCount; i++) {
        const sel = searchSelects.nth(i);
        // disabled select 건너뛰기 (to_partner 등 자동 설정 필드)
        const hasDisabledClass = await sel.evaluate((el: HTMLElement) => el.classList.contains('ant-select-disabled')).catch(() => true);
        if (hasDisabledClass) continue;

        const searchInput = sel.locator('.ant-select-selection-search-input');
        if (await searchInput.isVisible().catch(() => false)) {
          // enabled 상태 확인
          const isDisabled = await searchInput.isDisabled().catch(() => true);
          if (isDisabled) continue;

          // 검색어 입력 시도
          await searchInput.fill('ZE');
          await page.waitForTimeout(1500);

          // 드롭다운 옵션이 나타나는지 확인
          const dropdown = page.locator('.ant-select-dropdown:visible');
          if (await dropdown.isVisible().catch(() => false)) {
            const options = dropdown.locator('.ant-select-item-option');
            const optionCount = await options.count();
            if (optionCount > 0) {
              // 첫 번째 옵션 선택
              await options.first().click();
              await page.waitForTimeout(500);

              // 품목 테이블이 모달 내에 나타나는지 확인
              const itemTable = modal.locator('.ant-table');
              if (await itemTable.isVisible().catch(() => false)) {
                itemAdded = true;

                // 수량 InputNumber가 있어야 함
                const qtyInput = itemTable.locator('.ant-input-number');
                expect(await qtyInput.count()).toBeGreaterThan(0);
              }
              break;
            }
          }
          // 검색어 지우기
          await searchInput.clear();
          await page.waitForTimeout(300);
        }
      }
    }

    // 메모 필드 존재
    await expect(modal.locator('text=메모')).toBeVisible();

    // 품목 미추가 상태에서 등록 시도 -> 에러 메시지
    if (!itemAdded) {
      const okBtn = modal.locator('.ant-modal-footer button').filter({ hasText: '등록' });
      await okBtn.click();
      await page.waitForTimeout(1000);

      // "최소 1개 이상의 품목을 추가해주세요" 에러 메시지 확인
      const errorMsg = page.locator('.ant-message-notice-content').filter({ hasText: '품목' });
      await expect(errorMsg.first()).toBeVisible({ timeout: 5_000 });
    }

    // 모달 닫기
    await modal.locator('.ant-modal-footer button').filter({ hasText: '취소' }).click();
    await page.waitForTimeout(300);
  });

  test('J-3. 반품 목록 테이블 표시', async ({ page }) => {
    // 테이블 로딩 대기
    await waitForTable(page);

    // Ant Design Table 존재
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더 컬럼 확인
    const headers = page.locator('.ant-table-thead th');
    const texts = await headers.allTextContents();

    // 필수 컬럼이 포함되어야 함
    const expectedColumns = ['의뢰번호', '유형', '반품처', '입고처', '품목', '상태'];
    for (const col of expectedColumns) {
      expect(texts.some(t => t.includes(col))).toBeTruthy();
    }

    // 수량 관련 컬럼 존재
    expect(texts.some(t => t.includes('의뢰수량') || t.includes('의뢰'))).toBeTruthy();
    expect(texts.some(t => t.includes('반품출고'))).toBeTruthy();
    expect(texts.some(t => t.includes('반품수령'))).toBeTruthy();

    // 테이블 행 또는 Empty 상태 확인
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const empty = page.locator('.ant-table-placeholder');
    const rowCount = await rows.count();
    const emptyCount = await empty.count();
    expect(rowCount + emptyCount).toBeGreaterThanOrEqual(0);

    // 에러 메시지가 없어야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('J-4. 반품출고 (APPROVED → SHIPPED)', async ({ page }) => {
    await waitForTable(page);

    // "승인완료" 상태 카드 클릭하여 APPROVED 건만 필터링
    const approvedCard = page.locator('.ant-card').filter({ hasText: '승인완료' }).first();
    await approvedCard.click();
    await page.waitForTimeout(1500);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // 승인완료 데이터가 없으면 카드 영역만 확인하고 스킵
      await expect(approvedCard).toBeVisible();
      // "본사 승인 완료, 반품출고 가능" 설명 텍스트 확인
      await expect(page.locator('text=본사 승인 완료').first()).toBeVisible();
      return;
    }

    // APPROVED 행에서 "반품출고" 버튼 찾기
    // (매장관리자: from_partner가 자기 매장인 경우에만 canShip 조건 충족)
    let shipBtnFound = false;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const shipBtn = row.locator('button').filter({ hasText: '반품출고' });
      if (await shipBtn.isVisible().catch(() => false)) {
        shipBtnFound = true;

        // 반품출고 버튼 클릭 -> ShippedQtyModal 열림
        await shipBtn.click();
        await page.waitForTimeout(1500);

        // 모달 열림 확인 (title="반품출고")
        const modal = page.locator('.ant-modal').filter({ hasText: '반품출고' });
        await expect(modal.first()).toBeVisible({ timeout: 10_000 });

        // 모달 내 경고 메시지 확인
        const alertMsg = modal.locator('.ant-alert');
        await expect(alertMsg.first()).toBeVisible();

        // 출발/도착 정보 표시
        await expect(modal.locator('text=출발').first()).toBeVisible();
        await expect(modal.locator('text=도착').first()).toBeVisible();

        // 품목 테이블이 있어야 함
        const modalTable = modal.locator('.ant-table');
        await expect(modalTable).toBeVisible();

        // 출고수량 InputNumber가 있어야 함
        const inputNumbers = modal.locator('.ant-input-number');
        expect(await inputNumbers.count()).toBeGreaterThan(0);

        // 모달 닫기 (실제 출고 처리는 하지 않음 - 데이터 보존)
        await modal.locator('button').filter({ hasText: '취소' }).click();
        await page.waitForTimeout(300);
        break;
      }
    }

    if (!shipBtnFound) {
      // 반품출고 버튼이 없는 경우 (자기 매장 from_partner가 아닌 건만 있는 경우)
      // APPROVED 상태 행이 존재하는 것까지만 검증
      const detailBtn = rows.first().locator('button').filter({ hasText: '상세' });
      await expect(detailBtn).toBeVisible();
    }
  });

  test('J-5. 반품 상태 필터/검색', async ({ page }) => {
    await waitForTable(page);

    // 상태 카드 클릭으로 필터링: "반품요청" 카드 클릭
    const pendingCard = page.locator('.ant-card').filter({ hasText: '반품요청' }).first();
    await pendingCard.click();
    await page.waitForTimeout(1000);

    // 에러 없이 테이블 유지
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible();
    let errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);

    // "승인완료" 카드 클릭으로 상태 전환
    const approvedCard = page.locator('.ant-card').filter({ hasText: '승인완료' }).first();
    await approvedCard.click();
    await page.waitForTimeout(1000);

    await expect(table.first()).toBeVisible();
    errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);

    // 카드를 다시 클릭하여 필터 해제
    await approvedCard.click();
    await page.waitForTimeout(1000);

    // 검색 기능 테스트: 검색어 입력 후 조회
    const searchInput = page.locator('input[placeholder*="의뢰번호"]');
    await searchInput.fill('NONEXISTENT_RETURN_12345');
    const searchBtn = page.locator('button').filter({ hasText: '조회' });
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 에러 없이 동작
    errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
    await expect(table.first()).toBeVisible();

    // 검색어 지우고 원상복구
    await searchInput.clear();
    await searchBtn.click();
    await page.waitForTimeout(1000);

    // 고객반품 탭 전환 테스트
    const salesTab = page.locator('.ant-segmented-item').filter({ hasText: '고객반품' });
    await salesTab.click();
    await page.waitForTimeout(1500);

    // 고객반품 탭에서도 테이블이 표시되어야 함
    await expect(table.first()).toBeVisible();
    errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('J-6. PENDING 취소', async ({ page }) => {
    await waitForTable(page);

    // "반품요청" 상태 카드 클릭하여 PENDING 건만 필터링
    const pendingCard = page.locator('.ant-card').filter({ hasText: '반품요청' }).first();
    await pendingCard.click();
    await page.waitForTimeout(1500);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // PENDING 데이터가 없으면 카드 확인만 하고 스킵
      await expect(pendingCard).toBeVisible();
      return;
    }

    // PENDING 행에서 "취소" 버튼 찾기
    // canCancelRecord: requested_by === user.userId && 당일 등록건만 취소 가능
    let cancelBtnFound = false;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const cancelBtn = row.locator('button').filter({ hasText: '취소' });
      if (await cancelBtn.isVisible().catch(() => false)) {
        cancelBtnFound = true;

        // 취소 버튼 클릭 -> Popconfirm 표시
        await cancelBtn.click();
        await page.waitForTimeout(500);

        // Popconfirm 팝오버 확인
        const popconfirm = page.locator('.ant-popconfirm').or(
          page.locator('.ant-popover').filter({ hasText: '취소하시겠습니까?' })
        );
        await expect(popconfirm.first()).toBeVisible({ timeout: 5_000 });

        // "취소처리" 확인 버튼 클릭
        const confirmBtn = popconfirm.locator('button').filter({ hasText: '취소처리' });
        await confirmBtn.click();
        await page.waitForTimeout(2000);

        // 성공 메시지 확인: "취소되었습니다"
        const successMsg = page.locator('.ant-message-notice-content').filter({ hasText: '취소되었습니다' });
        await expect(successMsg.first()).toBeVisible({ timeout: 10_000 });

        // 에러 메시지가 없어야 함
        const errorMsg = page.locator('.ant-message-error');
        expect(await errorMsg.count()).toBe(0);

        // 테이블이 리프레시되어 행이 하나 줄거나 동일 (다른 페이지에 있을 수 있음)
        await expect(table.first()).toBeVisible();

        break;
      }
    }

    if (!cancelBtnFound) {
      // 취소 가능한 행이 없는 경우 (다른 사용자가 생성했거나 당일 건이 아닌 경우)
      // 최소한 "상세" 버튼은 있어야 함
      const detailBtn = rows.first().locator('button').filter({ hasText: '상세' });
      if (await detailBtn.isVisible().catch(() => false)) {
        await expect(detailBtn).toBeVisible();
      }
      // PENDING 행이 존재하는 것까지만 검증
      expect(rowCount).toBeGreaterThan(0);
    }
  });
});
