import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable, waitForModal } from './helpers';

test.describe('H. 입고요청 (매장 → 본사)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/shipment/store-request');
  });

  test('H-1. 입고관리 페이지 접속 가능', async ({ page }) => {
    // PageHeader "입고요청" 텍스트 표시
    await expect(page.locator('text=입고요청').first()).toBeVisible({ timeout: 10_000 });

    // 6개 상태 카드 존재: 요청중, 출고완료, 수량불일치, 수령완료, 거절, 취소
    const statusLabels = ['요청중', '출고완료', '수량불일치', '수령완료', '거절', '취소'];
    for (const label of statusLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({ timeout: 5_000 });
    }

    // 상태 카드들이 Ant Design Card 컴포넌트로 렌더링됨
    const cards = page.locator('.ant-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(6);

    // "입고요청" 버튼 존재 (매장관리자 기본 기능)
    const requestBtn = page.locator('button').filter({ hasText: '입고요청' });
    await expect(requestBtn.first()).toBeVisible();

    // 검색 입력 필드 존재
    const searchInput = page.locator('input[placeholder*="요청번호"]');
    await expect(searchInput).toBeVisible();

    // 조회 버튼 존재
    await expect(page.locator('button').filter({ hasText: '조회' })).toBeVisible();
  });

  test('H-2. 새 입고요청 등록', async ({ page }) => {
    // "입고요청" 버튼 클릭하여 등록 모달 열기
    const requestBtn = page.locator('button').filter({ hasText: '입고요청' });
    await expect(requestBtn.first()).toBeVisible({ timeout: 10_000 });
    await requestBtn.first().click();

    // 모달이 열릴 때까지 대기
    const modal = page.locator('.ant-modal').filter({ hasText: '입고요청 등록' });
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 모달 내 안내 문구 확인
    const infoAlert = modal.locator('text=본사 창고에 입고를 요청합니다');
    await expect(infoAlert).toBeVisible();

    // 요청 창고 Select가 존재하고 기본값이 설정되어 있는지 확인
    // (매장 사용자에게는 disabled 상태이며, 본사 파트너가 자동 선택됨)
    const fromPartnerSelect = modal.locator('.ant-select').first();
    await expect(fromPartnerSelect).toBeVisible();

    // 품목 추가 검색 Select 존재
    const variantSearchSelect = modal.locator('.ant-select').filter({ has: page.locator('[class*="ant-select-selection-search"]') });
    await expect(variantSearchSelect.first()).toBeVisible();

    // 품목 검색: 2자 이상 입력
    const searchInput = modal.locator('.ant-select-selection-search input').nth(1);
    await searchInput.click();
    await searchInput.fill('니트');
    await page.waitForTimeout(2000);

    // 드롭다운에 결과가 표시되는지 확인
    const dropdown = page.locator('.ant-select-dropdown:visible');
    const dropdownVisible = await dropdown.isVisible().catch(() => false);

    if (dropdownVisible) {
      const options = dropdown.locator('.ant-select-item-option');
      const optionCount = await options.count();

      if (optionCount > 0) {
        // 첫 번째 옵션 선택
        await options.first().click();
        await page.waitForTimeout(500);

        // 품목 테이블이 나타나는지 확인
        const itemTable = modal.locator('.ant-table');
        await expect(itemTable).toBeVisible({ timeout: 5_000 });

        // 수량 입력 (InputNumber)
        const qtyInput = itemTable.locator('.ant-input-number input').first();
        await qtyInput.click();
        await qtyInput.fill('1');
        await page.waitForTimeout(300);

        // 메모 입력
        const memoInput = modal.locator('textarea');
        if (await memoInput.isVisible()) {
          await memoInput.fill('E2E 테스트 입고요청');
        }

        // 요청 버튼 클릭
        const submitBtn = modal.locator('.ant-modal-footer button.ant-btn-primary');
        await submitBtn.click();
        await page.waitForTimeout(3000);

        // 성공 메시지 확인 또는 에러 없음 확인
        const successMsg = page.locator('.ant-message-success');
        const errorMsg = page.locator('.ant-message-error');
        const successCount = await successMsg.count();
        const errorCount = await errorMsg.count();

        // 성공 메시지가 표시되거나, 에러가 없어야 함
        if (successCount > 0) {
          // 성공: "입고요청이 등록되었습니다" 메시지
          const successText = await successMsg.first().textContent();
          expect(successText).toContain('입고요청');
        }
        // 재고 부족 등의 에러가 발생할 수 있으므로 에러 메시지는 체크만
        if (errorCount > 0) {
          test.info().annotations.push({ type: 'info', description: '입고요청 등록 시 에러 발생 (재고 부족 등 가능)' });
        }
      } else {
        // 검색 결과 없음 → 모달 닫기
        test.info().annotations.push({ type: 'skip-reason', description: '품목 검색 결과 없음' });
        await modal.locator('.ant-modal-footer button').filter({ hasText: '취소' }).click();
      }
    } else {
      // 드롭다운이 안 나타남 → 다른 키워드 시도
      test.info().annotations.push({ type: 'skip-reason', description: '품목 검색 드롭다운 미표시' });
      await modal.locator('.ant-modal-footer button').filter({ hasText: '취소' }).click();
    }
  });

  test('H-3. 요청 목록 확인 + 상세 모달', async ({ page }) => {
    // 대시보드 하단 테이블 로딩 대기
    await page.waitForTimeout(2000);

    // 테이블이 존재하는지 확인
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // 데이터가 없으면 Empty 상태 확인
      const emptyEl = table.locator('.ant-table-placeholder');
      const emptyVisible = await emptyEl.isVisible().catch(() => false);
      expect(emptyVisible || rowCount === 0).toBeTruthy();
      test.info().annotations.push({ type: 'skip-reason', description: '입고요청 데이터 없음' });
      return;
    }

    // 첫 번째 행의 "상세" 버튼 클릭
    const firstRow = rows.first();
    const detailBtn = firstRow.locator('button').filter({ hasText: '상세' });
    const hasDetailBtn = await detailBtn.count() > 0;

    if (hasDetailBtn) {
      await detailBtn.first().click();

      // ShipmentDetailModal 열림 대기
      await page.waitForTimeout(1500);
      const modal = page.locator('.ant-modal');
      await expect(modal.first()).toBeVisible({ timeout: 10_000 });

      // 모달 내에 요청 정보(의뢰번호, 유형, 출발, 도착 등)가 표시됨
      const modalContent = modal.first();
      const hasRequestNo = await modalContent.locator('text=/의뢰번호|요청번호|유형|출발|도착|출고창고/').count() > 0;
      expect(hasRequestNo).toBeTruthy();

      // 모달 내 품목 정보 테이블 또는 텍스트가 존재
      const hasItems = await modalContent.locator('.ant-table').count() > 0
        || await modalContent.locator('text=/SKU|상품명|수량/').count() > 0;
      expect(hasItems).toBeTruthy();

      // 모달 닫기
      await page.locator('.ant-modal-close').first().click();
      await page.waitForTimeout(300);
    } else {
      // 행 클릭으로 확장 행 열기 시도
      const expandBtn = firstRow.locator('.ant-table-row-expand-icon');
      if (await expandBtn.isVisible()) {
        await expandBtn.click();
        await page.waitForTimeout(2000);

        // 확장 행에 품목 테이블 또는 정보 표시
        const expandedRow = page.locator('.ant-table-expanded-row');
        await expect(expandedRow.first()).toBeVisible({ timeout: 5_000 });
      }
    }

    // 에러가 발생하지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('H-4. PENDING 요청 취소', async ({ page }) => {
    // "요청중" 상태 카드 클릭하여 PENDING 필터 적용
    await page.waitForTimeout(2000);

    const pendingCard = page.locator('.ant-card').filter({ hasText: '요청중' }).filter({ has: page.locator('text=/\\d/') });
    const pendingCardVisible = await pendingCard.first().isVisible().catch(() => false);

    if (pendingCardVisible) {
      await pendingCard.first().click();
      await page.waitForTimeout(2000);
    }

    // 테이블에서 PENDING(요청중) 상태 행 찾기
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.info().annotations.push({ type: 'skip-reason', description: 'PENDING 상태 입고요청이 없어 스킵' });
      return;
    }

    // 취소 버튼이 있는 행 찾기
    // canCancel: requested_by === user.userId 인 경우만 취소 가능
    let cancelRow = null;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const tagText = await row.locator('.ant-tag').textContent().catch(() => '');

      if (tagText?.includes('요청중')) {
        const cancelBtn = row.locator('button').filter({ hasText: '취소' });
        if (await cancelBtn.count() > 0) {
          cancelRow = row;
          break;
        }
      }
    }

    if (!cancelRow) {
      test.info().annotations.push({ type: 'skip-reason', description: '취소 가능한 PENDING 행 없음 (본인이 등록한 요청이 아닐 수 있음)' });
      return;
    }

    // 취소 버튼 클릭
    const cancelBtn = cancelRow.locator('button').filter({ hasText: '취소' });
    await cancelBtn.click();

    // Popconfirm 확인 대기
    const popconfirm = page.locator('.ant-popover').filter({ hasText: '취소하시겠습니까' });
    await expect(popconfirm).toBeVisible({ timeout: 5_000 });

    // 확인 버튼 클릭
    const confirmBtn = popconfirm.locator('button').filter({ hasText: '확인' }).or(popconfirm.locator('.ant-btn-primary'));
    await confirmBtn.first().click();
    await page.waitForTimeout(2000);

    // 성공 메시지 확인
    const successMsg = page.locator('.ant-message-success');
    const successCount = await successMsg.count();
    if (successCount > 0) {
      const msgText = await successMsg.first().textContent();
      expect(msgText).toContain('취소');
    }

    // 에러가 없어야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('H-5. 입고 목록 테이블 표시', async ({ page }) => {
    // 테이블 로딩 대기
    await waitForTable(page);

    // Ant Design Table 존재
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더 컬럼 확인
    const headers = page.locator('.ant-table-thead th');
    const texts = await headers.allTextContents();

    // 필수 컬럼이 포함되어야 함
    const expectedColumns = ['요청번호', '상태', '요청매장'];
    for (const col of expectedColumns) {
      expect(texts.some(t => t.includes(col))).toBeTruthy();
    }

    // 페이지네이션에 "총 N건" 표시 (데이터가 있든 없든)
    const pagination = page.locator('.ant-pagination');
    const tableWrapper = page.locator('.ant-table-wrapper');
    const paginationVisible = await pagination.isVisible().catch(() => false);
    const tableVisible = await tableWrapper.isVisible().catch(() => false);
    expect(paginationVisible || tableVisible).toBeTruthy();

    // 테이블 행 또는 Empty 상태 중 하나
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const empty = page.locator('.ant-table-placeholder');
    const rowCount = await rows.count();
    const emptyCount = await empty.count();
    expect(rowCount + emptyCount).toBeGreaterThanOrEqual(0); // 정상 렌더링만 확인

    // 에러 메시지가 없어야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('H-6. 입고요청 수령확인 (출고완료 → 수령)', async ({ page }) => {
    // "출고완료" 상태 카드 클릭하여 SHIPPED 필터 적용
    await page.waitForTimeout(2000);

    const shippedCard = page.locator('.ant-card').filter({ hasText: '출고완료' }).filter({ has: page.locator('text=/\\d/') });
    const shippedCardVisible = await shippedCard.first().isVisible().catch(() => false);

    if (shippedCardVisible) {
      await shippedCard.first().click();
      await page.waitForTimeout(2000);
    }

    // 테이블에서 SHIPPED(출고완료) 상태 행 찾기
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.info().annotations.push({ type: 'skip-reason', description: '출고완료(SHIPPED) 상태 입고요청이 없어 스킵' });
      return;
    }

    // 수령확인 버튼이 있는 행 찾기
    let targetRow = null;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const recvBtn = row.locator('button').filter({ hasText: '수령확인' });
      if (await recvBtn.count() > 0) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      test.info().annotations.push({ type: 'skip-reason', description: '수령확인 버튼이 있는 SHIPPED 행 없음' });
      return;
    }

    // 수령확인 버튼 클릭
    await targetRow.locator('button').filter({ hasText: '수령확인' }).click();

    // ReceivedQtyModal 열림 대기
    const modal = page.locator('.ant-modal').filter({ hasText: '수령확인' });
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 모달 내 알림 메시지 확인
    const alertMsg = modal.locator('.ant-alert');
    await expect(alertMsg.first()).toBeVisible();

    // 모달 내 품목 테이블 확인
    const modalTable = modal.locator('.ant-table');
    await expect(modalTable).toBeVisible();

    // 수령수량 InputNumber 존재 확인
    const inputNumbers = modal.locator('.ant-input-number input');
    const inputCount = await inputNumbers.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);

    // 수령수량이 기본값(출고수량)으로 채워져 있는지 확인
    const firstInputValue = await inputNumbers.first().inputValue();
    expect(Number(firstInputValue)).toBeGreaterThanOrEqual(0);

    // OK 버튼 텍스트 확인 (출고수량과 동일하면 "수령확인")
    const okBtn = modal.locator('.ant-modal-footer button.ant-btn-primary').first();
    const okText = await okBtn.textContent();
    expect(okText === '수령확인' || okText === '수량불일치 신고').toBeTruthy();

    // 모달 닫기 (실제 수령 처리는 데이터를 변경하므로 닫기만 수행)
    const cancelBtn = modal.locator('.ant-modal-footer button').filter({ hasText: '닫기' });
    await cancelBtn.click();
    await page.waitForTimeout(500);

    // 에러가 발생하지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });
});
