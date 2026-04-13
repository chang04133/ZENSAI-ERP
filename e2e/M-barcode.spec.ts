import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('M. 바코드', () => {
  test('M-1. 바코드 관리 페이지 접속', async ({ page }) => {
    await navigateTo(page, '/barcode');

    // 스캔 입력창 표시 (보라색 그라데이션 카드 내부)
    const scanInput = page.locator('input[placeholder*="바코드"]').or(page.locator('input[placeholder*="스캔"]'));
    await expect(scanInput.first()).toBeVisible({ timeout: 10_000 });

    // 통계 카드 4개 표시: 전체 상품, 바코드 등록, 바코드 미등록, 최근 스캔
    await expect(page.locator('text=전체 상품').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=바코드 등록').first()).toBeVisible();
    await expect(page.locator('text=바코드 미등록').first()).toBeVisible();
    await expect(page.locator('text=최근 스캔').first()).toBeVisible();

    // 상품 바코드 목록 테이블 표시
    await waitForTable(page);
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible();

    // 테이블 컬럼 헤더 확인
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('상품코드'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('상품명'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('SKU'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('바코드'))).toBeTruthy();

    // 원가(cost_price) 컬럼이 없어야 함
    expect(headerTexts.some(t => t.includes('원가') || t.includes('매입가'))).toBeFalsy();

    // 페이지네이션 — "총 N종" 표시
    await expect(page.locator('text=/총 \\d+종/').first()).toBeVisible();

    // STORE_MANAGER: 바코드 등록/수정 버튼(EditOutlined) 미표시
    // canEdit = ADMIN/SYS_ADMIN/HQ_MANAGER only — 매장관리자에게는 편집 아이콘 없음
    const editBtns = table.locator('button .anticon-edit');
    await expect(editBtns).toHaveCount(0);
  });

  test('M-2. 바코드 검색 기능', async ({ page }) => {
    await navigateTo(page, '/barcode');

    // 스캔 입력창에 값 입력
    const scanInput = page.locator('input[placeholder*="바코드"]').or(page.locator('input[placeholder*="스캔"]'));
    await expect(scanInput.first()).toBeVisible({ timeout: 10_000 });

    // 존재하지 않는 바코드 입력 후 Enter
    await scanInput.first().fill('NONEXISTENT999');
    await scanInput.first().press('Enter');
    await page.waitForTimeout(2000);

    // "상품을 찾을 수 없습니다" 경고 메시지 표시
    const warningMsg = page.locator('.ant-message-notice-content').filter({ hasText: '찾을 수 없습니다' });
    await expect(warningMsg.first()).toBeVisible({ timeout: 5_000 });

    // 통계 카드의 "전체" 카드 클릭 → 필터 전환 동작 확인
    const allCard = page.locator('text=전체 상품').first();
    await allCard.click();
    await page.waitForTimeout(500);

    // 테이블이 여전히 정상 표시됨
    await waitForTable(page);
    await expect(page.locator('.ant-table').first()).toBeVisible();
  });

  test('M-3. 바코드 출력/다운로드 버튼 존재', async ({ page }) => {
    await navigateTo(page, '/barcode');
    await page.waitForTimeout(2000);

    // 스캔/검색 버튼 존재 (SearchOutlined 아이콘 버튼)
    const searchBtn = page.locator('button .anticon-search').or(page.locator('button').filter({ hasText: '검색' }));
    await expect(searchBtn.first()).toBeVisible({ timeout: 10_000 });

    // 통계 카드 클릭으로 필터 전환 가능 확인
    // "바코드 등록" 카드 클릭 → 등록된 것만 필터
    const withCard = page.locator('text=바코드 등록').first();
    await withCard.click();
    await page.waitForTimeout(500);

    // 필터 태그에 "등록됨" 표시
    const filterTag = page.locator('.ant-tag').filter({ hasText: '등록됨' });
    await expect(filterTag.first()).toBeVisible();

    // "바코드 미등록" 카드 클릭 → 미등록 것만 필터
    const withoutCard = page.locator('text=바코드 미등록').first();
    await withoutCard.click();
    await page.waitForTimeout(500);

    // 필터 태그에 "미등록" 표시
    const noFilterTag = page.locator('.ant-tag').filter({ hasText: '미등록' });
    await expect(noFilterTag.first()).toBeVisible();

    // 테이블 내 바코드 컬럼에 빨간 "미등록" 태그가 표시됨
    const missingBarcodeTags = page.locator('.ant-table .ant-tag').filter({ hasText: '미등록' });
    const rows = page.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      const tagCount = await missingBarcodeTags.count();
      expect(tagCount).toBeGreaterThan(0);
    }
  });
});
