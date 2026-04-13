import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('S. 입고관리 재확인', () => {
  test('S-1. 입고조회 페이지 접속', async ({ page }) => {
    await navigateTo(page, '/inbound/view');

    // 페이지 제목 "입고조회" 표시
    await expect(page.locator('text=입고조회').first()).toBeVisible({ timeout: 10_000 });

    // 검색 입력 필드 존재
    const searchInput = page.locator('input[placeholder*="입고번호"]').or(page.locator('input[placeholder*="검색"]'));
    await expect(searchInput.first()).toBeVisible();

    // 상태 필터 존재
    const statusFilter = page.locator('.ant-select');
    await expect(statusFilter.first()).toBeVisible();

    // 페이지가 에러 없이 로드되어야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);
  });

  test('S-2. 입고 목록 테이블 표시', async ({ page }) => {
    await navigateTo(page, '/inbound/view');
    await waitForTable(page);

    // 테이블이 존재해야 함
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더 컬럼 확인
    const headers = page.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    // 입고 관련 필수 컬럼이 있어야 함
    const expectedColumns = ['입고번호', '입고일', '상태'];
    for (const col of expectedColumns) {
      expect(
        headerTexts.some(t => t.includes(col)),
        `"${col}" 컬럼이 테이블에 있어야 합니다`
      ).toBeTruthy();
    }

    // 추가 컬럼도 확인 (출처, 품목수, 총수량 등)
    const additionalColumns = ['출처', '품목수', '총수량'];
    let foundAdditional = false;
    for (const col of additionalColumns) {
      if (headerTexts.some(t => t.includes(col))) {
        foundAdditional = true;
        break;
      }
    }
    expect(foundAdditional).toBeTruthy();

    // 테이블 행이 있으면 상태 태그가 렌더링되어야 함
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      const tags = page.locator('.ant-table-tbody .ant-tag');
      await expect(tags.first()).toBeVisible();
    }

    // 페이지네이션에 "총 N건" 표시
    const pagination = page.locator('.ant-pagination');
    if (await pagination.isVisible()) {
      const paginationText = await pagination.textContent();
      expect(paginationText).toContain('총');
    }
  });

  test('S-3. 종합입고관리 대시보드 — 상태별 카운트 표시', async ({ page }) => {
    await navigateTo(page, '/inbound/dashboard');

    // "종합입고관리" 제목 표시
    await expect(page.locator('text=종합입고관리').first()).toBeVisible({ timeout: 10_000 });

    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 상태별 카운트 카드가 있어야 함 (요청중, 출고완료, 수량불일치, 수령완료 등)
    const statusTexts = ['요청중', '출고완료', '수량불일치', '수령완료', '거절', '취소'];
    let foundStatus = false;
    for (const status of statusTexts) {
      const el = page.locator(`text=${status}`);
      if (await el.count() > 0) {
        foundStatus = true;
        break;
      }
    }
    expect(foundStatus).toBeTruthy();
  });
});
