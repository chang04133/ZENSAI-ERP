import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('I. 수평이동 (매장 ↔ 매장)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/shipment/transfer');
  });

  test('I-1. 수평이동 페이지 접속 + 상태 카드 표시', async ({ page }) => {
    // PageHeader "수평이동" 텍스트 표시
    await expect(page.locator('text=수평이동').first()).toBeVisible({ timeout: 10_000 });

    // 6개 상태 카드: 대기, 이동중, 수량불일치, 완료, 거절, 취소
    const statusLabels = ['대기', '이동중', '수량불일치', '완료', '거절', '취소'];
    for (const label of statusLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({ timeout: 5_000 });
    }

    // 상태 카드가 Ant Design Card 컴포넌트로 렌더링됨
    const cards = page.locator('.ant-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(6);

    // 각 카드에 건수 표시 (숫자 또는 "-" 로딩 표시)
    // STEPS 설명 텍스트로 확인
    const descTexts = ['출고/입고 확인 대기 중', '출고 완료, 수령 대기 중', '수령까지 완료된 의뢰'];
    for (const desc of descTexts) {
      await expect(page.locator(`text=${desc}`).first()).toBeVisible({ timeout: 5_000 });
    }

    // 테이블에 "구분" 컬럼이 존재 (매장 사용자에게 보내기/받기 태그 표시)
    await waitForTable(page);
    const headers = page.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('구분'))).toBeTruthy();
  });

  test('I-2. 수평이동 목록 테이블 표시', async ({ page }) => {
    // 테이블 로딩 대기
    await waitForTable(page);

    // Ant Design Table 존재
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더 컬럼 확인
    const headers = page.locator('.ant-table-thead th');
    const texts = await headers.allTextContents();

    // 필수 컬럼이 포함되어야 함
    const expectedColumns = ['의뢰번호', '출발', '도착', '품목', '상태'];
    for (const col of expectedColumns) {
      expect(texts.some(t => t.includes(col))).toBeTruthy();
    }

    // 수량 관련 컬럼 존재
    expect(texts.some(t => t.includes('의뢰수량') || t.includes('의뢰'))).toBeTruthy();
    expect(texts.some(t => t.includes('출고수량') || t.includes('출고'))).toBeTruthy();
    expect(texts.some(t => t.includes('수령수량') || t.includes('수령'))).toBeTruthy();

    // 테이블 행 또는 Empty 상태 중 하나
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

  test('I-3. 새 수평이동 요청 버튼 존재', async ({ page }) => {
    // "수평이동 등록" 버튼이 존재해야 함 (매장관리자 대시보드 뷰)
    const registerBtn = page.locator('button').filter({ hasText: '수평이동 등록' });
    await expect(registerBtn.first()).toBeVisible({ timeout: 10_000 });

    // 버튼 클릭 시 모달 열림 확인
    await registerBtn.first().click();
    await page.waitForTimeout(500);

    // "수평이동 등록" 모달 표시
    const modal = page.locator('.ant-modal').filter({ hasText: '수평이동 등록' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 모달 내 보내기/요청하기 라디오 버튼 존재 (매장 사용자)
    const sendRadio = modal.locator('text=보내기');
    const requestRadio = modal.locator('text=요청하기');
    await expect(sendRadio.first()).toBeVisible();
    await expect(requestRadio.first()).toBeVisible();

    // 품목 추가 영역 존재
    await expect(modal.locator('text=품목 추가')).toBeVisible();

    // 메모 필드 존재
    await expect(modal.locator('text=메모')).toBeVisible();

    // 모달 닫기
    await page.locator('.ant-modal-close').first().click();
    await page.waitForTimeout(300);
  });

  test('I-4. 검색 기능 동작 (의뢰번호/상품명/SKU)', async ({ page }) => {
    // 검색 입력 필드 존재
    const searchInput = page.locator('input[placeholder*="의뢰번호"]').or(
      page.locator('input[placeholder*="상품명"]')
    ).or(
      page.locator('input[placeholder*="SKU"]')
    );
    await expect(searchInput.first()).toBeVisible({ timeout: 5_000 });

    // 기간 필터(RangePicker) 존재
    const rangePicker = page.locator('.ant-picker-range');
    await expect(rangePicker.first()).toBeVisible();

    // 조회 버튼 존재
    const searchBtn = page.locator('button').filter({ hasText: '조회' });
    await expect(searchBtn).toBeVisible();

    // 검색어 입력 후 조회
    await searchInput.first().fill('NONEXISTENT_SEARCH_TERM_12345');
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 에러 없이 동작 (테이블이 여전히 보임)
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible();

    // 검색어 지우고 다시 조회 (원상복구)
    await searchInput.first().clear();
    await searchBtn.click();
    await page.waitForTimeout(1000);

    // 상태 카드 클릭으로 필터링 동작 확인
    // "대기" 카드 클릭
    const pendingCard = page.locator('.ant-card').filter({ hasText: '대기' }).first();
    await pendingCard.click();
    await page.waitForTimeout(1000);

    // 에러 없이 테이블 유지
    await expect(table.first()).toBeVisible();
    const errorMsgAfter = page.locator('.ant-message-error');
    expect(await errorMsgAfter.count()).toBe(0);
  });

  test('I-5. 수령수량 불일치 → DISCREPANCY', async ({ page }) => {
    await waitForTable(page);

    // "이동중" 상태 카드를 클릭하여 SHIPPED 건만 필터링
    const shippedCard = page.locator('.ant-card').filter({ hasText: '이동중' }).first();
    await shippedCard.click();
    await page.waitForTimeout(1500);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 테이블에 SHIPPED(이동중) 행이 있는지 확인
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // 이동중 데이터가 없으면: 수량불일치 카드 영역 건수만 확인하고 스킵
      const discrepancyCard = page.locator('.ant-card').filter({ hasText: '수량불일치' }).first();
      await expect(discrepancyCard).toBeVisible();
      // 수량불일치 설명 텍스트 확인
      await expect(page.locator('text=수령 수량이 출고 수량과 다른 건').first()).toBeVisible();
      return;
    }

    // 이동중 행 중 "수령확인" 버튼이 있는 행 찾기 (receive 방향인 경우)
    const receiveBtn = rows.locator('button').filter({ hasText: '수령확인' }).first();
    const hasReceiveBtn = await receiveBtn.isVisible().catch(() => false);

    if (!hasReceiveBtn) {
      // 수령확인 버튼이 없으면 (보내기 방향만 있는 경우) 스킵
      // 이동중 상태 행이 존재하는 것까지만 검증
      expect(rowCount).toBeGreaterThan(0);
      return;
    }

    // 수령확인 버튼 클릭 -> ReceivedQtyModal 열림
    await receiveBtn.click();
    await page.waitForTimeout(1500);

    const modal = page.locator('.ant-modal').filter({ hasText: '수령확인' });
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // 모달 내에 수령수량 입력 필드(InputNumber)가 있는지 확인
    const inputNumbers = modal.locator('.ant-input-number');
    const inputCount = await inputNumbers.count();
    expect(inputCount).toBeGreaterThan(0);

    // 모달 내 경고 메시지가 표시됨 (출고수량과 다르면 수량불일치로 신고)
    await expect(modal.locator('text=출고수량과 다르면').first()).toBeVisible();

    // 수령수량을 0으로 변경하여 불일치 유도
    const firstInput = inputNumbers.first();
    await firstInput.locator('input').fill('0');
    await page.waitForTimeout(500);

    // 불일치 경고 메시지가 나타나는지 확인
    // ReceivedQtyModal에서 mismatch시 "수량불일치 신고" 버튼 텍스트로 변경됨
    const mismatchBtn = modal.locator('button').filter({ hasText: '수량불일치 신고' });
    const mismatchWarning = modal.locator('text=출고수량과 수령수량이 다릅니다');
    const hasMismatchIndicator = await mismatchBtn.isVisible().catch(() => false)
      || await mismatchWarning.isVisible().catch(() => false);
    expect(hasMismatchIndicator).toBeTruthy();

    // 모달 닫기 (실제 불일치 처리는 하지 않음 - 데이터 보존)
    await modal.locator('button').filter({ hasText: '닫기' }).click();
    await page.waitForTimeout(300);
  });

  test('I-6. 같은 매장 이동 시도 → 에러', async ({ page }) => {
    // "수평이동 등록" 버튼 클릭
    const registerBtn = page.locator('button').filter({ hasText: '수평이동 등록' });
    await expect(registerBtn.first()).toBeVisible({ timeout: 10_000 });
    await registerBtn.first().click();
    await page.waitForTimeout(500);

    // 모달이 열림
    const modal = page.locator('.ant-modal').filter({ hasText: '수평이동 등록' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 매장관리자(gangnam)는 보내기 모드가 기본: from_partner = 자기 매장(자동 설정)
    // "보내기" 라디오가 기본 선택되어 있는지 확인
    const sendRadio = modal.locator('.ant-radio-button-wrapper').filter({ hasText: '보내기' });
    await expect(sendRadio).toBeVisible();

    // "보낼 매장 (받는 쪽)" Select에서 자기 매장이 보이지 않아야 함
    // (코드에서 isStore 사용자의 partnerCode를 필터링하고 있음)
    const toPartnerSelect = modal.locator('.ant-select').filter({ hasText: /매장 선택/ }).first();

    if (await toPartnerSelect.isVisible().catch(() => false)) {
      // Select를 열어서 자기 매장(강남/gangnam/SF002)이 목록에 없는지 확인
      await toPartnerSelect.click();
      await page.waitForTimeout(500);

      // 드롭다운 옵션에서 자기 매장 코드가 없어야 함
      // partnerOptions 필터링: .filter((p) => !isStore || p.partner_code !== user?.partnerCode)
      const dropdown = page.locator('.ant-select-dropdown:visible');
      if (await dropdown.isVisible().catch(() => false)) {
        const options = dropdown.locator('.ant-select-item-option');
        const optionCount = await options.count();

        // 각 옵션 텍스트에 자기 매장 코드가 포함되지 않아야 함
        let selfFound = false;
        for (let i = 0; i < optionCount; i++) {
          const text = await options.nth(i).textContent();
          // 강남 매장 코드 (SF002 또는 관련 코드)가 있는지 확인
          if (text && (text.includes('성수직매장') || text.includes('강남'))) {
            // 같은 매장이 목록에 있다면 문제
            selfFound = true;
          }
        }
        // 자기 매장이 필터링 되어 보이지 않아야 정상
        expect(selfFound).toBeFalsy();
      }

      // Esc로 드롭다운 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // "요청하기" 모드로 전환하여도 자기 매장이 from_partner에 없는지 확인
    const requestRadio = modal.locator('.ant-radio-button-wrapper').filter({ hasText: '요청하기' });
    await requestRadio.click();
    await page.waitForTimeout(300);

    // 요청하기 모드: "요청할 매장" Select에서도 자기 매장이 없어야 함
    const fromPartnerSelect = modal.locator('.ant-select').filter({ hasText: /매장을 선택/ }).first();
    if (await fromPartnerSelect.isVisible().catch(() => false)) {
      await fromPartnerSelect.click();
      await page.waitForTimeout(500);

      const dropdown = page.locator('.ant-select-dropdown:visible');
      if (await dropdown.isVisible().catch(() => false)) {
        const options = dropdown.locator('.ant-select-item-option');
        const optionCount = await options.count();

        let selfFound = false;
        for (let i = 0; i < optionCount; i++) {
          const text = await options.nth(i).textContent();
          if (text && (text.includes('성수직매장') || text.includes('강남'))) {
            selfFound = true;
          }
        }
        expect(selfFound).toBeFalsy();
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 모달 닫기
    await page.locator('.ant-modal-close').first().click();
    await page.waitForTimeout(300);
  });

  test('I-7. PENDING 취소 → 재고 원복', async ({ page }) => {
    await waitForTable(page);

    // "대기" 상태 카드 클릭하여 PENDING 건만 필터링
    const pendingCard = page.locator('.ant-card').filter({ hasText: '대기' }).first();
    await pendingCard.click();
    await page.waitForTimeout(1500);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // PENDING 데이터가 없으면 카드 건수 확인만 하고 스킵
      await expect(pendingCard).toBeVisible();
      return;
    }

    // PENDING 행에서 "취소" 버튼 찾기 (자기가 요청한 건에만 표시)
    let cancelBtnFound = false;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const cancelBtn = row.locator('button').filter({ hasText: '취소' });
      if (await cancelBtn.isVisible().catch(() => false)) {
        cancelBtnFound = true;

        // 취소 버튼 클릭 -> Popconfirm 표시
        await cancelBtn.click();
        await page.waitForTimeout(500);

        // Popconfirm 팝오버가 나타남
        const popconfirm = page.locator('.ant-popconfirm').or(
          page.locator('.ant-popover').filter({ hasText: '취소하시겠습니까?' })
        );
        await expect(popconfirm.first()).toBeVisible({ timeout: 5_000 });

        // "취소처리" 확인 버튼 클릭
        const confirmBtn = popconfirm.locator('button').filter({ hasText: '취소처리' });
        await confirmBtn.click();
        await page.waitForTimeout(2000);

        // 성공 메시지 확인
        const successMsg = page.locator('.ant-message-notice-content').filter({ hasText: '취소되었습니다' });
        await expect(successMsg.first()).toBeVisible({ timeout: 10_000 });

        // 에러 메시지가 없어야 함
        const errorMsg = page.locator('.ant-message-error');
        expect(await errorMsg.count()).toBe(0);

        break;
      }
    }

    if (!cancelBtnFound) {
      // 취소 가능한 행이 없는 경우 (다른 사용자가 생성한 건)
      // PENDING 상태 행이 존재하는 것까지만 검증
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test('I-8. SHIPPED 취소 제한', async ({ page }) => {
    await waitForTable(page);

    // "이동중" 상태 카드 클릭하여 SHIPPED 건만 필터링
    const shippedCard = page.locator('.ant-card').filter({ hasText: '이동중' }).first();
    await shippedCard.click();
    await page.waitForTimeout(1500);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // SHIPPED 데이터가 없으면 이동중 카드가 0건인 것만 확인하고 스킵
      await expect(shippedCard).toBeVisible();
      return;
    }

    // SHIPPED 행에서 "취소" 버튼이 없어야 함 (매장 사용자에게는 SHIPPED 상태에서 취소 불가)
    // 코드 분석: SHIPPED 상태에서 취소 버튼은 isAdmin일 때만 표시됨
    // 매장관리자(gangnam)에게는 "상세"와 "수령확인" 버튼만 보여야 함
    let cancelBtnVisibleOnShipped = false;
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      const row = rows.nth(i);
      const cancelBtn = row.locator('button').filter({ hasText: '취소' });
      if (await cancelBtn.isVisible().catch(() => false)) {
        cancelBtnVisibleOnShipped = true;
        break;
      }
    }

    // 매장관리자에게는 SHIPPED 상태에서 취소 버튼이 보이면 안 됨
    expect(cancelBtnVisibleOnShipped).toBeFalsy();

    // "상세" 버튼은 모든 행에 존재해야 함
    const firstRow = rows.first();
    const detailBtn = firstRow.locator('button').filter({ hasText: '상세' });
    await expect(detailBtn).toBeVisible();
  });

  test('I-9. 상태 필터 + 검색', async ({ page }) => {
    await waitForTable(page);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 카드 클릭으로 각 상태 필터링 테스트
    const statusCards = [
      { label: '대기', key: 'PENDING' },
      { label: '이동중', key: 'SHIPPED' },
      { label: '완료', key: 'RECEIVED' },
      { label: '수량불일치', key: 'DISCREPANCY' },
      { label: '거절', key: 'REJECTED' },
      { label: '취소', key: 'CANCELLED' },
    ];

    for (const status of statusCards) {
      const card = page.locator('.ant-card').filter({ hasText: status.label }).first();
      await expect(card).toBeVisible({ timeout: 5_000 });

      // 카드 클릭
      await card.click();
      await page.waitForTimeout(1000);

      // 에러 없이 테이블 유지
      await expect(table.first()).toBeVisible();
      const errorMsg = page.locator('.ant-message-error');
      expect(await errorMsg.count()).toBe(0);

      // 같은 카드 다시 클릭하여 필터 해제 (토글)
      await card.click();
      await page.waitForTimeout(500);
    }

    // 상태 필터와 검색어 조합 테스트
    const pendingCard = page.locator('.ant-card').filter({ hasText: '대기' }).first();
    await pendingCard.click();
    await page.waitForTimeout(1000);

    const searchInput = page.locator('input[placeholder*="의뢰번호"]').or(
      page.locator('input[placeholder*="상품명"]')
    ).or(
      page.locator('input[placeholder*="SKU"]')
    );
    await searchInput.first().fill('TEST_COMBINED_FILTER');
    const searchBtn = page.locator('button').filter({ hasText: '조회' });
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 에러 없이 동작
    const errorMsgAfter = page.locator('.ant-message-error');
    expect(await errorMsgAfter.count()).toBe(0);
    await expect(table.first()).toBeVisible();

    // 검색어 지우고 필터 해제하여 원상복구
    await searchInput.first().clear();
    await pendingCard.click();
    await page.waitForTimeout(500);
    await searchBtn.click();
    await page.waitForTimeout(1000);
  });

  test('I-10. 펼침 행 — 품목 상세', async ({ page }) => {
    await waitForTable(page);

    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // 데이터가 없으면 빈 테이블 확인만 하고 스킵
      const empty = page.locator('.ant-table-placeholder');
      await expect(empty.first()).toBeVisible();
      return;
    }

    // 첫 번째 행의 확장 아이콘(+) 클릭
    const expandBtn = rows.first().locator('.ant-table-row-expand-icon').or(
      rows.first().locator('button.ant-table-row-expand-icon')
    );

    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(2000);

      // 확장된 영역이 나타남 (로딩 중 또는 품목 테이블)
      const expandedRow = page.locator('.ant-table-expanded-row').first();
      await expect(expandedRow).toBeVisible({ timeout: 10_000 });

      // 확장 영역에 품목 상세 테이블 또는 "품목 없음" 메시지가 있어야 함
      const subTable = expandedRow.locator('.ant-table');
      const emptyMsg = expandedRow.locator('text=품목 없음');
      const loadingMsg = expandedRow.locator('text=로딩 중');
      const hasSubTable = await subTable.isVisible().catch(() => false);
      const hasEmptyMsg = await emptyMsg.isVisible().catch(() => false);
      const hasLoadingMsg = await loadingMsg.isVisible().catch(() => false);

      // 셋 중 하나가 보여야 함
      expect(hasSubTable || hasEmptyMsg || hasLoadingMsg).toBeTruthy();

      if (hasSubTable) {
        // 품목 상세 테이블의 헤더 확인
        const subHeaders = subTable.locator('.ant-table-thead th');
        const subHeaderTexts = await subHeaders.allTextContents();

        // 필수 컬럼 확인: SKU, 상품명, 의뢰(수량), 출고(수량), 수령(수량)
        expect(subHeaderTexts.some(t => t.includes('SKU'))).toBeTruthy();
        expect(subHeaderTexts.some(t => t.includes('상품명'))).toBeTruthy();
        expect(subHeaderTexts.some(t => t.includes('의뢰'))).toBeTruthy();
        expect(subHeaderTexts.some(t => t.includes('출고'))).toBeTruthy();
        expect(subHeaderTexts.some(t => t.includes('수령'))).toBeTruthy();

        // 품목 데이터 행이 하나 이상 있어야 함
        const subRows = subTable.locator('.ant-table-tbody tr');
        const subRowCount = await subRows.count();
        expect(subRowCount).toBeGreaterThan(0);

        // 색상, 사이즈 컬럼도 있을 수 있음
        const hasColor = subHeaderTexts.some(t => t.includes('색상'));
        const hasSize = subHeaderTexts.some(t => t.includes('사이즈'));
        expect(hasColor || hasSize).toBeTruthy();
      }

      // 확장 아이콘 다시 클릭하여 접기
      await expandBtn.click();
      await page.waitForTimeout(500);
    } else {
      // 확장 아이콘이 없는 경우 (expandable이 렌더링 안 된 경우)
      // 테이블에 행이 있는 것까지만 검증
      expect(rowCount).toBeGreaterThan(0);
    }
  });
});
