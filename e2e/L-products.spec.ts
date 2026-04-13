import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('L. 상품관리', () => {
  test('L-1. 상품목록 페이지 접속 + 테이블', async ({ page }) => {
    await navigateTo(page, '/products');

    // 페이지 제목 "상품 관리" 표시
    await expect(page.locator('text=상품 관리').first()).toBeVisible({ timeout: 10_000 });

    // 테이블 로드 대기
    await waitForTable(page);
    const table = page.locator('.ant-table').first();
    await expect(table).toBeVisible();

    // 테이블 헤더에 필수 컬럼 존재
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('상품코드'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('상품명'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('카테고리'))).toBeTruthy();

    // 페이지네이션 — "총 N건" 표시
    await expect(page.locator('text=/총 \\d+건/').first()).toBeVisible();
  });

  test('L-2. 상품 검색 기능', async ({ page }) => {
    await navigateTo(page, '/products');
    await waitForTable(page);

    // 검색 입력창 존재
    const searchInput = page.locator('input[placeholder*="검색"]').first();
    await expect(searchInput).toBeVisible();

    // 검색어 입력
    await searchInput.fill('test');
    await page.waitForTimeout(500);

    // 조회 버튼 클릭
    const searchBtn = page.locator('button').filter({ hasText: '조회' });
    await searchBtn.click();
    await page.waitForTimeout(1500);

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    expect(errorCount).toBe(0);

    // 테이블이 정상 표시됨 (빈 결과 포함 가능)
    await expect(page.locator('.ant-table').first()).toBeVisible();
  });

  test('L-3. 상품 상세 컬럼 확인 (상품명, SKU, 컬러, 사이즈, 가격)', async ({ page }) => {
    await navigateTo(page, '/products');
    await waitForTable(page);

    const table = page.locator('.ant-table').first();
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    // 필수 컬럼 확인
    expect(headerTexts.some(t => t.includes('상품명'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('카테고리'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('시즌'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('기본가'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('할인가'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('상태'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('재고'))).toBeTruthy();

    // 매장 사용자에게는 원가(매입가) 컬럼이 없어야 함
    expect(headerTexts.some(t => t.includes('매입가'))).toBeFalsy();
  });

  test('L-4. 행사가 표시 (있으면 Tag)', async ({ page }) => {
    await navigateTo(page, '/products');
    await waitForTable(page);

    const table = page.locator('.ant-table').first();
    const headers = table.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    // "행사가" 컬럼 존재
    expect(headerTexts.some(t => t.includes('행사가'))).toBeTruthy();

    // "행사" 컬럼 존재 (ON/OFF 스위치 또는 태그)
    expect(headerTexts.some(t => t.includes('행사'))).toBeTruthy();

    // 행사 컬럼의 값 — 매장 사용자에게는 Switch가 아닌 Tag (ON/OFF)로 표시
    const eventTags = table.locator('.ant-tag').filter({ hasText: /^(ON|OFF)$/ });
    const rows = table.locator('.ant-table-tbody tr.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 행사 관련 Tag가 존재해야 함 (매장 사용자는 Switch 대신 Tag)
      const tagCount = await eventTags.count();
      expect(tagCount).toBeGreaterThan(0);
    }
  });

  test('L-5. 매장은 상품 등록 버튼 없음', async ({ page }) => {
    await navigateTo(page, '/products');
    await waitForTable(page);

    // "상품 등록" 버튼이 없어야 함 (ADMIN/SYS_ADMIN만)
    const addBtn = page.locator('button').filter({ hasText: '상품 등록' });
    await expect(addBtn).toHaveCount(0);

    // "엑셀 업로드" 버튼도 없어야 함 (ADMIN만)
    const uploadBtn = page.locator('button').filter({ hasText: '엑셀 업로드' });
    await expect(uploadBtn).toHaveCount(0);

    // "엑셀 다운로드" 버튼도 없어야 함 (canWrite = ADMIN/SYS_ADMIN/HQ_MANAGER만)
    const downloadBtn = page.locator('button').filter({ hasText: '엑셀 다운로드' });
    await expect(downloadBtn).toHaveCount(0);

    // 테이블에 "관리" (수정) 컬럼이 없어야 함
    const headers = page.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('관리'))).toBeFalsy();
  });
});
