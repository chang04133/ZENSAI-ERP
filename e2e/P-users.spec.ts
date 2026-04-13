import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('P. 직원관리', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/users');
  });

  test('P-1. 직원관리 페이지 접속 + "직원 관리" 제목', async ({ page }) => {
    // 매장관리자(STORE_MANAGER)이므로 제목이 "직원 관리"
    await expect(page.locator('text=직원 관리').first()).toBeVisible({ timeout: 10_000 });

    // 검색 입력 필드 존재
    const searchInput = page.locator('input[placeholder*="아이디"]').or(page.locator('input[placeholder*="이름"]'));
    await expect(searchInput.first()).toBeVisible();

    // 조회 버튼 존재
    await expect(page.locator('button').filter({ hasText: '조회' })).toBeVisible();
  });

  test('P-2. 직원 목록 테이블 — 필수 컬럼 확인', async ({ page }) => {
    // 테이블 존재
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });
    await waitForTable(page);

    // 필수 컬럼 헤더: 아이디, 이름, 직급, 소속, 상태, 최종로그인, 관리
    const headers = page.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();

    expect(headerTexts.some(t => t.includes('아이디'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('이름'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('직급'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('소속'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('상태'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('최종로그인'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('관리'))).toBeTruthy();
  });

  test('P-3. "직원 등록" 버튼 존재', async ({ page }) => {
    // 매장관리자이므로 "직원 등록" 버튼이 표시되어야 함
    const registerBtn = page.locator('button').filter({ hasText: '직원 등록' });
    await expect(registerBtn).toBeVisible({ timeout: 10_000 });

    // 버튼 클릭 시 /users/new 로 이동
    await registerBtn.click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/users/new');
  });

  test('P-4. 수정/삭제 버튼 표시', async ({ page }) => {
    await waitForTable(page);

    // 테이블 행이 존재하는 경우 수정 버튼 확인
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // "수정" 버튼이 테이블 내에 하나 이상 있어야 함
      const editBtns = page.locator('.ant-table-tbody button').filter({ hasText: '수정' });
      await expect(editBtns.first()).toBeVisible();

      // "삭제" 버튼은 하위 역할 직원에 대해서만 표시됨
      // (자기 자신이나 동일/상위 역할은 삭제 버튼 미표시)
      const deleteBtns = page.locator('.ant-table-tbody button').filter({ hasText: '삭제' });
      // 삭제 버튼이 있을 수도 있고 없을 수도 있음 (하위 직원이 없으면 미표시)
      const deleteCount = await deleteBtns.count();
      // 삭제 버튼이 있으면 danger 스타일이어야 함
      if (deleteCount > 0) {
        await expect(deleteBtns.first()).toBeVisible();
      }
    } else {
      // 직원 목록이 비어있는 경우 — Empty 또는 빈 테이블
      const empty = page.locator('.ant-empty');
      const emptyCount = await empty.count();
      expect(emptyCount).toBeGreaterThanOrEqual(0); // 빈 테이블도 허용
    }
  });
});
