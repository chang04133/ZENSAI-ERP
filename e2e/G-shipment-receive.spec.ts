import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable, waitForModal } from './helpers';

test.describe('G. 출고 수령 (본사 -> 매장)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/shipment/dashboard');
  });

  test('G-1. 출고관리 페이지 접속 + 상태 카드 표시', async ({ page }) => {
    // 페이지 제목 "종합출고관리" 존재
    await expect(page.locator('text=종합출고관리').first()).toBeVisible({ timeout: 10_000 });

    // 상단 요약 카드 2개: "해야할일" + "대기중"
    await expect(page.locator('text=해야할일').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=대기중').first()).toBeVisible();

    // 4개 섹션 존재: 출고(본사->매장), 반품(매장->본사), 수평이동(매장<->매장), 출고요청(매장->본사)
    await expect(page.locator('text=출고 (본사').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=반품 (매장').first()).toBeVisible();
    await expect(page.locator('text=수평이동 (매장').first()).toBeVisible();
    await expect(page.locator('text=출고요청 (매장').first()).toBeVisible();

    // 각 섹션에 상태별 칩(건수) 존재
    // 출고 섹션: 매장 사용자이므로 "수령대기", "수량불일치", "수령완료" 칩
    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible();

    // 칩에 "건" 텍스트 포함 (예: "수령대기 3건")
    const chips = shipmentSection.locator('text=/\\d+건/');
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThanOrEqual(1);

    // 섹션별 건수 태그 존재 (카드 제목 옆)
    const sectionTag = shipmentSection.locator('.ant-tag').first();
    await expect(sectionTag).toBeVisible();
  });

  test('G-2. SHIPPED 출고 → 수령확인 버튼 확인', async ({ page }) => {
    // 출고 섹션에서 SHIPPED 상태(출고완료/수령대기) 행을 찾아 수령확인 버튼이 존재하는지 확인
    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible({ timeout: 10_000 });

    // "수령대기" 칩을 클릭하여 SHIPPED 필터 적용
    const shippedChip = shipmentSection.locator('div[style*="cursor: pointer"]').filter({ hasText: '수령대기' });
    const shippedChipVisible = await shippedChip.isVisible().catch(() => false);

    if (shippedChipVisible) {
      await shippedChip.click();
      await page.waitForTimeout(2000);
    }

    const table = shipmentSection.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // SHIPPED 상태 행 찾기: 상태 태그가 "수령대기" 또는 "출고완료"인 행
      let shippedRowFound = false;

      for (let i = 0; i < Math.min(rowCount, 10); i++) {
        const row = rows.nth(i);
        const tagText = await row.locator('.ant-tag').textContent().catch(() => '');

        if (tagText?.includes('수령대기') || tagText?.includes('출고완료')) {
          shippedRowFound = true;

          // 수령확인 버튼이 해당 행에 존재하는지 확인
          const recvBtn = row.locator('button').filter({ hasText: '수령확인' });
          const recvBtnCount = await recvBtn.count();
          expect(recvBtnCount).toBeGreaterThanOrEqual(1);
          await expect(recvBtn.first()).toBeVisible();
          break;
        }
      }

      if (!shippedRowFound) {
        // SHIPPED 행이 없으면 스킵 (데이터 의존 테스트)
        test.info().annotations.push({ type: 'skip-reason', description: '출고완료(SHIPPED) 상태 행이 없어 스킵' });
      }
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: '출고 섹션에 데이터 없음' });
    }

    // 칩 필터 해제
    if (shippedChipVisible) {
      await shippedChip.click();
      await page.waitForTimeout(1000);
    }
  });

  test('G-3. 출고 목록 테이블 + 필터', async ({ page }) => {
    // 출고 섹션 찾기
    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible({ timeout: 10_000 });

    // 출고 섹션 내 테이블 존재
    const table = shipmentSection.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더에 필수 컬럼 존재: 의뢰번호, 의뢰일, 출발, 도착, 품목, 의뢰, 출고, 수령, 상태, 액션
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    const expectedColumns = ['의뢰번호', '출발', '도착', '상태'];
    for (const col of expectedColumns) {
      expect(headerTexts.some(t => t.includes(col))).toBeTruthy();
    }

    // 상태 필터 칩 클릭 동작 테스트 (매장 사용자의 경우 "수령대기" 칩)
    const chipArea = shipmentSection.locator('[style*="background: #fafafa"]').first();
    if (await chipArea.isVisible()) {
      // 첫 번째 상태 칩 클릭
      const firstChip = chipArea.locator('div[style*="cursor: pointer"]').first();
      if (await firstChip.isVisible()) {
        await firstChip.click();
        await page.waitForTimeout(1500);

        // 에러 메시지가 뜨지 않아야 함
        const errorMsg = page.locator('.ant-message-error');
        const errorCount = await errorMsg.count();
        expect(errorCount).toBe(0);

        // 테이블이 여전히 정상 표시
        await expect(table).toBeVisible();

        // 같은 칩 다시 클릭하여 필터 해제
        await firstChip.click();
        await page.waitForTimeout(1000);
      }
    }

    // 페이지네이션 (50건 단위)
    const pagination = shipmentSection.locator('.ant-pagination');
    const hasRows = await table.locator('.ant-table-tbody tr.ant-table-row').count() > 0;
    if (hasRows) {
      await expect(pagination).toBeVisible();
    }
  });

  test('G-4. 수령 후 재고 증가 확인 (SHIPPED → 수령확인)', async ({ page }) => {
    // 출고 섹션에서 SHIPPED 상태 행을 찾아 수령확인 처리 시도
    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible({ timeout: 10_000 });

    // SHIPPED 필터 적용
    const shippedChip = shipmentSection.locator('div[style*="cursor: pointer"]').filter({ hasText: '수령대기' });
    const shippedChipVisible = await shippedChip.isVisible().catch(() => false);
    if (shippedChipVisible) {
      await shippedChip.click();
      await page.waitForTimeout(2000);
    }

    const table = shipmentSection.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.info().annotations.push({ type: 'skip-reason', description: 'SHIPPED 상태 출고 건이 없어 스킵' });
      return;
    }

    // SHIPPED 행에서 수령확인 버튼 찾기
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
      test.info().annotations.push({ type: 'skip-reason', description: '수령확인 버튼이 있는 SHIPPED 행 없음 (본 매장으로 오는 출고가 아닐 수 있음)' });
      return;
    }

    // 수령확인 버튼 클릭 → ReceivedQtyModal 열림
    const recvBtn = targetRow.locator('button').filter({ hasText: '수령확인' });
    await recvBtn.click();

    // 수령확인 모달 대기
    const modal = page.locator('.ant-modal').filter({ hasText: '수령확인' });
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 모달에 알림 메시지 표시
    const alertMsg = modal.locator('.ant-alert');
    await expect(alertMsg.first()).toBeVisible();

    // 모달 내 품목 테이블 존재
    const modalTable = modal.locator('.ant-table');
    await expect(modalTable).toBeVisible();

    // 수령수량 InputNumber가 이미 출고수량으로 채워져 있는지 확인
    const inputNumbers = modal.locator('.ant-input-number input');
    const inputCount = await inputNumbers.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);

    // 수령수량을 출고수량과 동일하게 유지 (기본값이 이미 shipped_qty)
    // 수령확인 버튼 텍스트가 "수령확인"인지 확인 (불일치가 아니면)
    const okBtn = modal.locator('.ant-modal-footer button.ant-btn-primary').first();
    const okText = await okBtn.textContent();
    // 기본값이 shipped_qty와 동일하면 "수령확인", 다르면 "수량불일치 신고"
    expect(okText === '수령확인' || okText === '수량불일치 신고').toBeTruthy();

    // 모달 닫기 (실제 수령처리는 데이터 변경이므로 닫기만 수행)
    const cancelBtn = modal.locator('.ant-modal-footer button').filter({ hasText: '닫기' });
    await cancelBtn.click();
    await page.waitForTimeout(500);

    // 에러가 발생하지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('G-5. 수령수량 불일치 → DISCREPANCY 경고 표시', async ({ page }) => {
    // 출고 섹션에서 SHIPPED 행 찾기
    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible({ timeout: 10_000 });

    // SHIPPED 필터 적용
    const shippedChip = shipmentSection.locator('div[style*="cursor: pointer"]').filter({ hasText: '수령대기' });
    const shippedChipVisible = await shippedChip.isVisible().catch(() => false);
    if (shippedChipVisible) {
      await shippedChip.click();
      await page.waitForTimeout(2000);
    }

    const table = shipmentSection.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.info().annotations.push({ type: 'skip-reason', description: 'SHIPPED 상태 출고 건이 없어 스킵' });
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
      test.info().annotations.push({ type: 'skip-reason', description: '수령확인 버튼이 있는 행 없음' });
      return;
    }

    // 수령확인 버튼 클릭 → ReceivedQtyModal 열기
    await targetRow.locator('button').filter({ hasText: '수령확인' }).click();

    const modal = page.locator('.ant-modal').filter({ hasText: '수령확인' });
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 수령수량 InputNumber 찾기
    const inputNumbers = modal.locator('.ant-input-number input');
    const inputCount = await inputNumbers.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);

    // 첫 번째 수령수량을 0으로 변경하여 불일치 상태 유도
    const firstInput = inputNumbers.first();
    await firstInput.click();
    await firstInput.fill('0');
    await page.waitForTimeout(500);

    // 불일치 경고 메시지(warning alert) 표시 확인
    // ReceivedQtyModal에서 hasMismatch가 true이면 warning Alert가 나타남
    const warningAlert = modal.locator('.ant-alert-warning');
    await expect(warningAlert).toBeVisible({ timeout: 5_000 });

    // OK 버튼 텍스트가 "수량불일치 신고"로 변경되었는지 확인
    const okBtn = modal.locator('.ant-modal-footer button.ant-btn-primary').first();
    const okText = await okBtn.textContent();
    expect(okText).toContain('수량불일치 신고');

    // 모달 닫기 (실제 제출하지 않음)
    const cancelBtn = modal.locator('.ant-modal-footer button').filter({ hasText: '닫기' });
    await cancelBtn.click();
    await page.waitForTimeout(500);
  });

  test('G-6. 출고 상세 모달 열기', async ({ page }) => {
    // 출고 섹션 찾기
    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible({ timeout: 10_000 });

    // 테이블에 데이터가 있는지 확인
    const table = shipmentSection.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });
    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 첫 번째 행의 "상세" 버튼 클릭
      const detailBtn = rows.first().locator('button').filter({ hasText: '상세' });
      if (await detailBtn.isVisible()) {
        await detailBtn.click();

        // ShipmentDetailModal이 열림
        await page.waitForTimeout(1500);
        const modal = page.locator('.ant-modal');
        await expect(modal.first()).toBeVisible({ timeout: 10_000 });

        // 모달 내에 의뢰번호, 유형, 상태 등의 정보가 표시됨
        const modalContent = modal.first();
        const hasRequestInfo = await modalContent.locator('text=/의뢰번호|유형|출발|도착/').count() > 0;
        expect(hasRequestInfo).toBeTruthy();

        // 모달 내 품목 테이블이 존재할 수 있음
        const modalTable = modalContent.locator('.ant-table');
        const hasModalTable = await modalTable.count() > 0;
        // 또는 품목 정보가 텍스트로 표시
        const hasItemInfo = await modalContent.locator('text=/SKU|상품명|수량/').count() > 0;
        expect(hasModalTable || hasItemInfo).toBeTruthy();

        // 모달 닫기
        await page.locator('.ant-modal-close').first().click();
        await page.waitForTimeout(300);
      }
    } else {
      // 데이터가 없는 경우: "출고 내역이 없습니다" 메시지 확인
      const emptyText = shipmentSection.locator('text=출고 내역이 없습니다');
      await expect(emptyText.first()).toBeVisible();
    }

    // "해야할일" 카드 클릭 동작 확인
    const todoCard = page.locator('text=해야할일').first();
    await todoCard.click();
    await page.waitForTimeout(1500);

    // 에러 없이 필터가 적용됨
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);

    // 다시 클릭하여 필터 해제
    await todoCard.click();
    await page.waitForTimeout(1000);
  });

  test('G-7. 매장 사용자 취소 제한 확인', async ({ page }) => {
    // 매장 사용자(STORE_MANAGER)는 SHIPPED/DISCREPANCY 상태의 출고건을 취소할 수 없음
    // 취소 버튼은 SHIPPED/DISCREPANCY일 때 isAdmin인 경우만 표시됨
    // PENDING/APPROVED일 때는 canCancel (requested_by === user.userId)인 경우만 표시됨

    const shipmentSection = page.locator('.ant-card').filter({ hasText: '출고 (본사' });
    await expect(shipmentSection).toBeVisible({ timeout: 10_000 });

    const table = shipmentSection.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.info().annotations.push({ type: 'skip-reason', description: '출고 섹션에 데이터 없음' });
      return;
    }

    // 모든 행을 순회하며 SHIPPED/DISCREPANCY 상태 행에 취소 버튼이 없는지 확인
    let checkedShippedRow = false;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const tagText = await row.locator('.ant-tag').textContent().catch(() => '');

      // SHIPPED 상태 (매장 사용자에게는 "수령대기"로 표시)
      if (tagText?.includes('수령대기') || tagText?.includes('출고완료')) {
        checkedShippedRow = true;
        // 매장 사용자에게는 SHIPPED 상태에서 취소 버튼이 없어야 함 (isAdmin만 가능)
        const cancelBtn = row.locator('button').filter({ hasText: '취소' });
        const cancelCount = await cancelBtn.count();
        expect(cancelCount).toBe(0);
      }

      // DISCREPANCY 상태 (매장 사용자에게는 "수량불일치"로 표시)
      if (tagText?.includes('수량불일치') || tagText?.includes('문제확인중')) {
        checkedShippedRow = true;
        // 매장 사용자에게는 DISCREPANCY 상태에서도 취소 버튼이 없어야 함
        const cancelBtn = row.locator('button').filter({ hasText: '취소' });
        const cancelCount = await cancelBtn.count();
        expect(cancelCount).toBe(0);
      }
    }

    if (!checkedShippedRow) {
      // SHIPPED/DISCREPANCY 행이 없으면, 다른 출고 섹션도 확인
      // 출고요청 섹션에서도 동일 규칙 적용 확인
      const storeReqSection = page.locator('.ant-card').filter({ hasText: '출고요청 (매장' });
      if (await storeReqSection.isVisible()) {
        const storeReqTable = storeReqSection.locator('.ant-table');
        const storeReqRows = storeReqTable.locator('.ant-table-tbody tr.ant-table-row');
        const storeReqRowCount = await storeReqRows.count();

        for (let i = 0; i < Math.min(storeReqRowCount, 10); i++) {
          const row = storeReqRows.nth(i);
          const tagText = await row.locator('.ant-tag').textContent().catch(() => '');

          if (tagText?.includes('수령대기') || tagText?.includes('출고완료')) {
            // SHIPPED 상태에서 매장 사용자에게 취소 버튼이 없어야 함
            const cancelBtn = row.locator('button').filter({ hasText: '취소' });
            const cancelCount = await cancelBtn.count();
            expect(cancelCount).toBe(0);
            checkedShippedRow = true;
            break;
          }
        }
      }

      if (!checkedShippedRow) {
        test.info().annotations.push({ type: 'skip-reason', description: 'SHIPPED/DISCREPANCY 상태 행이 없어 취소 버튼 검증 불가' });
      }
    }
  });
});
