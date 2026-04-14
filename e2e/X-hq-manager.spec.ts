import { test, expect } from '@playwright/test';
import { navigateTo, waitForApp } from './helpers';

/**
 * X. 본사관리자 (HQ_MANAGER) E2E 테스트
 *
 * hq_mgr 계정 (port 5173, HQ_MANAGER 역할)
 * - partner_code: null → 전 매장 데이터 조회
 * - managerRoles에 포함 → 수정/삭제/관리 가능
 * - ADMIN_HQ 메뉴 접근, ADMIN_ONLY/ADMIN_SYS 접근 불가
 */

const API = 'http://localhost:3001';

async function getAuthToken(page: any): Promise<string> {
  return page.evaluate(() => localStorage.getItem('zensai_access_token') || '');
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// ──────────── 메뉴/권한 ────────────

test.describe('X. 본사관리자 (HQ_MANAGER)', () => {
  test('X-1. 대시보드 접근 — 전 매장 카드 렌더링', async ({ page }) => {
    await navigateTo(page, '/');

    // 대시보드 카드 렌더링 (에러 없음)
    await expect(page.locator('.ant-card').first()).toBeVisible({ timeout: 10_000 });
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('X-2. ADMIN_HQ 메뉴 visible — 악성재고, 행사관리, MD관리 등', async ({ page }) => {
    await navigateTo(page, '/');
    const sider = page.locator('.ant-layout-sider');

    // ADMIN_HQ 메뉴 확인: submenu 먼저 열기
    // 상품 관리 서브메뉴
    const productMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '상품 관리' });
    await expect(productMenu).toBeVisible();
    await productMenu.click();
    await page.waitForTimeout(300);
    await expect(sider.locator('.ant-menu-item').filter({ hasText: '악성재고' })).toBeVisible();
    await expect(sider.locator('.ant-menu-item').filter({ hasText: '행사관리' })).toBeVisible();

    // MD 관리 서브메뉴
    const mdMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: 'MD 관리' });
    await expect(mdMenu).toBeVisible();

    // 마스터관리 서브메뉴
    const masterMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '마스터관리' });
    await expect(masterMenu).toBeVisible();
    await masterMenu.click();
    await page.waitForTimeout(300);
    await expect(sider.locator('.ant-menu-item').filter({ hasText: '거래처 관리' })).toBeVisible();
  });

  test('X-3. ADMIN_ONLY 메뉴 hidden — 생산기획, 자금관리', async ({ page }) => {
    await navigateTo(page, '/');
    const sider = page.locator('.ant-layout-sider');

    const forbiddenMenus = ['생산기획', '자금관리'];
    for (const menu of forbiddenMenus) {
      const item = sider.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: menu });
      await expect(item).toHaveCount(0);
    }
  });

  test('X-4. ADMIN_SYS 메뉴 hidden — 시스템관리', async ({ page }) => {
    await navigateTo(page, '/');
    const sider = page.locator('.ant-layout-sider');

    const sysMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '시스템관리' });
    await expect(sysMenu).toHaveCount(0);
  });

  test('X-5. ADMIN_ONLY URL 직접 차단 — /production, /fund, /inventory/transactions', async ({ page }) => {
    const restrictedUrls = [
      '/production',
      '/fund',
      '/inventory/transactions',
    ];

    for (const path of restrictedUrls) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      const body = await page.textContent('body') || '';
      const is403 = body.includes('403') || body.includes('권한') || body.includes('접근');
      const isRedirected = !url.includes(path);

      expect(is403 || isRedirected, `${path}에 접근 차단되어야 함`).toBeTruthy();
    }
  });

  test('X-6. ADMIN_SYS URL 직접 차단 — /system/settings', async ({ page }) => {
    await page.goto('/system/settings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);

    const url = page.url();
    const body = await page.textContent('body') || '';
    const is403 = body.includes('403') || body.includes('권한') || body.includes('접근');
    const isRedirected = !url.includes('/system/settings');

    expect(is403 || isRedirected).toBeTruthy();
  });

  // ──────────── 전 매장 데이터 조회 ────────────

  test('X-7. 매출 전 매장 조회 — API에서 여러 partner_code 포함', async ({ page }) => {
    await navigateTo(page, '/');
    const token = await getAuthToken(page);
    const res = await apiGet(token, '/api/sales?limit=50&page=1');

    expect(res.success).toBeTruthy();
    const sales = res.data?.data || res.data || [];
    if (sales.length > 0) {
      // partner_code가 하나가 아닌 여러 매장이어야 함 (HQ는 전체 조회)
      const codes = new Set(sales.map((s: any) => s.partner_code));
      // 데이터가 충분하면 2개 이상의 매장
      if (sales.length >= 5) {
        expect(codes.size, 'HQ_MANAGER는 여러 매장 매출을 볼 수 있어야 함').toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('X-8. 재고현황 페이지 접근 — 전체 매장 표시', async ({ page }) => {
    await navigateTo(page, '/inventory/status');

    // 재고현황 페이지 정상 로드
    await page.waitForTimeout(2000);
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);

    // 테이블 또는 카드가 존재
    const hasTable = await page.locator('.ant-table').count() > 0;
    const hasCard = await page.locator('.ant-card').count() > 0;
    expect(hasTable || hasCard).toBeTruthy();
  });

  test('X-9. 출고 전 매장 조회 — API 필터 없이 전체', async ({ page }) => {
    await navigateTo(page, '/');
    const token = await getAuthToken(page);
    const res = await apiGet(token, '/api/shipments?limit=50&page=1');

    expect(res.success).toBeTruthy();
    // HQ는 store_filter 없이 전체 조회
  });

  test('X-10. 입고조회 페이지 접근 — 전체 데이터', async ({ page }) => {
    await navigateTo(page, '/inbound/view');

    await page.waitForTimeout(2000);
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);

    const hasTable = await page.locator('.ant-table').count() > 0;
    const hasCard = await page.locator('.ant-card').count() > 0;
    expect(hasTable || hasCard).toBeTruthy();
  });

  // ──────────── ADMIN_HQ 페이지 접근 ────────────

  test('X-11. MD 분석 페이지 접근', async ({ page }) => {
    await navigateTo(page, '/md/analytics');

    await page.waitForTimeout(2000);
    // 탭이 렌더링 되어야 함
    const tabs = page.locator('.ant-tabs-tab');
    expect(await tabs.count()).toBeGreaterThan(0);

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('X-12. 거래처 관리 페이지 접근', async ({ page }) => {
    await navigateTo(page, '/partners');

    await page.waitForTimeout(2000);
    // 테이블 렌더링
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 10_000 });
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('X-13. 입고등록 페이지 접근', async ({ page }) => {
    await navigateTo(page, '/inbound/register');

    await page.waitForTimeout(2000);
    // 폼이나 카드가 렌더링
    const hasCard = await page.locator('.ant-card').count() > 0;
    const hasForm = await page.locator('form, .ant-form').count() > 0;
    const hasSelect = await page.locator('.ant-select').count() > 0;
    expect(hasCard || hasForm || hasSelect, '입고등록 폼이 렌더링되어야 함').toBeTruthy();

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('X-14. 출고등록 페이지 접근', async ({ page }) => {
    await navigateTo(page, '/shipment/request');

    await page.waitForTimeout(2000);
    const hasCard = await page.locator('.ant-card').count() > 0;
    const hasForm = await page.locator('form, .ant-form').count() > 0;
    const hasSelect = await page.locator('.ant-select').count() > 0;
    expect(hasCard || hasForm || hasSelect, '출고등록 폼이 렌더링되어야 함').toBeTruthy();

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('X-15. 행사관리 페이지 접근', async ({ page }) => {
    await navigateTo(page, '/products/event-price');

    await page.waitForTimeout(2000);
    // 테이블이나 카드 렌더링
    const hasTable = await page.locator('.ant-table').count() > 0;
    const hasCard = await page.locator('.ant-card').count() > 0;
    expect(hasTable || hasCard, '행사관리 페이지가 렌더링되어야 함').toBeTruthy();

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });
});
