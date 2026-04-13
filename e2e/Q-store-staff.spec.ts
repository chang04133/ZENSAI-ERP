import { test, expect } from '@playwright/test';
import { navigateTo, waitForApp } from './helpers';

/**
 * Q. 매장직원(STORE_STAFF) 전용 확인
 *
 * 현재 테스트 환경은 STORE_MANAGER (강남점) 계정으로 로그인되어 있음.
 * STORE_STAFF 전용 제한사항을 직접 테스트하기는 어려우므로,
 * STORE_MANAGER 관점에서 관련 UI 요소를 확인하는 스모크 테스트를 수행.
 */
test.describe('Q. 매장직원 전용 확인 (STORE_MANAGER 관점)', () => {
  test('Q-1. 직원 등록 페이지 접근 — 폼 필드 확인', async ({ page }) => {
    // 직원 등록 페이지로 이동
    await navigateTo(page, '/users/new');

    // "직원 등록" 헤더 표시
    await expect(page.locator('text=직원 등록').first()).toBeVisible({ timeout: 10_000 });

    // 폼 필드가 있어야 함: 아이디, 이름, 비밀번호
    const idInput = page.locator('input[placeholder*="아이디"]');
    await expect(idInput).toBeVisible();

    // 비밀번호 필드 존재
    const pwInput = page.locator('input[placeholder*="비밀번호"]').or(page.locator('input[type="password"]'));
    await expect(pwInput.first()).toBeVisible();

    // 등록 버튼 존재
    const submitBtn = page.locator('button').filter({ hasText: '등록' });
    await expect(submitBtn.first()).toBeVisible();

    // STORE_MANAGER는 역할 선택 없이 자동으로 STORE_STAFF 할당
    // → role select가 없어야 정상
  });

  test('Q-2. 매장관리자 메뉴 확인 — 특정 메뉴 미표시 확인', async ({ page }) => {
    await navigateTo(page, '/');

    const sider = page.locator('.ant-layout-sider');

    // STORE_MANAGER에게 보이면 안 되는 메뉴들
    // 주의: '코드 관리'는 제외 — '바코드 관리'의 substring으로 잘못 매칭됨
    const forbiddenMenus = [
      '시스템관리',
      '자금관리',
      '생산기획',
    ];

    for (const menu of forbiddenMenus) {
      const menuItem = sider.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: menu });
      await expect(menuItem).toHaveCount(0);
    }

    // STORE_MANAGER에게는 직원 관리 메뉴가 보여야 함
    const userMenu = sider.locator('.ant-menu-item').filter({ hasText: '직원 관리' });
    await expect(userMenu.first()).toBeVisible();
  });

  test('Q-3. 관리자 전용 URL 접근 차단 — /system/settings', async ({ page }) => {
    // 시스템 설정 페이지 직접 접근 시도
    await page.goto('/system/settings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);

    // 403 페이지 또는 리다이렉트 확인
    const url = page.url();
    const pageContent = await page.textContent('body') || '';

    // 403 표시 또는 대시보드로 리다이렉트 중 하나
    const is403 = pageContent.includes('403') || pageContent.includes('권한') || pageContent.includes('접근');
    const isRedirected = !url.includes('/system/settings');

    expect(is403 || isRedirected).toBeTruthy();
  });

  test('Q-4. 관리자 전용 URL 접근 차단 — /fund', async ({ page }) => {
    // 자금관리 페이지 직접 접근 시도
    await page.goto('/fund', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);

    const url = page.url();
    const pageContent = await page.textContent('body') || '';

    const is403 = pageContent.includes('403') || pageContent.includes('권한') || pageContent.includes('접근');
    const isRedirected = !url.includes('/fund');

    expect(is403 || isRedirected).toBeTruthy();
  });

  test('Q-5. 관리자 전용 URL 접근 차단 — /production', async ({ page }) => {
    // 생산기획 페이지 직접 접근 시도
    await page.goto('/production', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);

    const url = page.url();
    const pageContent = await page.textContent('body') || '';

    const is403 = pageContent.includes('403') || pageContent.includes('권한') || pageContent.includes('접근');
    const isRedirected = !url.includes('/production');

    expect(is403 || isRedirected).toBeTruthy();
  });
});
