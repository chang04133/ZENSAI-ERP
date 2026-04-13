import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('O. 공지사항', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/notices');
  });

  test('O-1. 공지사항 페이지 접속 + 목록 표시', async ({ page }) => {
    // 페이지 제목 "공지사항" 표시
    await expect(page.locator('text=공지사항').first()).toBeVisible();

    // 테이블이 존재해야 함 (공지 목록)
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더에 필수 컬럼이 있어야 함 (구분, 제목, 작성자, 작성일)
    const headers = page.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(t => t.includes('구분'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('제목'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('작성자'))).toBeTruthy();
    expect(headerTexts.some(t => t.includes('작성일'))).toBeTruthy();

    // 검색 입력 필드 존재
    const searchInput = page.locator('input[placeholder*="검색"]');
    await expect(searchInput.first()).toBeVisible();

    // 유형 필터 셀렉트 존재
    await expect(page.locator('text=유형').first()).toBeVisible();
  });

  test('O-2. 공지 카드/리스트 렌더링 — 목록 행 클릭 시 상세 모달', async ({ page }) => {
    // 테이블 행이 하나 이상 존재 (mock 데이터)
    const rows = page.locator('.ant-table-tbody .ant-table-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // 구분 태그(Tag)가 렌더링되어야 함 (공지, 긴급, 행사, 시스템, 인사 중 하나)
    const tags = page.locator('.ant-table-tbody .ant-tag');
    await expect(tags.first()).toBeVisible();

    // 첫 번째 행의 제목 클릭 → 상세 모달 열림
    const firstTitle = rows.first().locator('a');
    if (await firstTitle.count() > 0) {
      await firstTitle.click();
      await page.waitForTimeout(500);

      // 모달이 열려야 함
      const modal = page.locator('.ant-modal-content');
      await expect(modal.first()).toBeVisible({ timeout: 5_000 });

      // 모달 닫기
      await page.locator('.ant-modal-close').first().click();
      await page.waitForTimeout(300);
    }

    // 고정(pinned) 공지가 상단에 표시 — 핀 아이콘 존재
    const pinIcon = page.locator('.anticon-pushpin');
    await expect(pinIcon.first()).toBeVisible();
  });
});
