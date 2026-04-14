import { test, expect } from '@playwright/test';
import { navigateTo, waitForApp } from './helpers';

/**
 * Y. 크로스스토어 격리 테스트 (daegu — STORE_MANAGER, 대구점)
 *
 * daegu 계정 (port 5175, STORE_MANAGER, partner_code: SS002 서울숲직매장)
 * 기존 store-manager(gangnam, SF002)와 다른 매장으로 데이터 격리 검증.
 */

const API = 'http://localhost:3001';
const DAEGU_PARTNER = 'SS002'; // daegu의 partner_code
const GANGNAM_PARTNER = 'SF002'; // gangnam의 partner_code (접근 불가해야 함)

async function getAuthToken(page: any): Promise<string> {
  return page.evaluate(() => localStorage.getItem('zensai_access_token') || '');
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

test.describe('Y. 크로스스토어 격리 (daegu)', () => {
  test('Y-1. 대시보드 접근 — 정상 로드', async ({ page }) => {
    await navigateTo(page, '/');

    await expect(page.locator('.ant-card').first()).toBeVisible({ timeout: 10_000 });
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('Y-2. 매출 데이터 격리 — daegu 매장 매출만', async ({ page }) => {
    await navigateTo(page, '/');
    const token = await getAuthToken(page);
    const res = await apiGet(token, '/api/sales?limit=50&page=1');

    expect(res.success).toBeTruthy();
    const sales = res.data?.data || res.data || [];

    if (sales.length > 0) {
      for (const sale of sales) {
        expect(
          sale.partner_code,
          `매출 ID ${sale.sale_id || sale.id}의 partner_code가 ${DAEGU_PARTNER}이어야 함 (실제: ${sale.partner_code})`,
        ).toBe(DAEGU_PARTNER);
      }
    }
  });

  test('Y-3. 재고 API 정상 응답 — 재고현황 접근 가능', async ({ page }) => {
    await navigateTo(page, '/');
    const token = await getAuthToken(page);
    // 재고 목록 API (전체 창고/매장 재고 조회 — 재입고 계획용)
    const res = await apiGet(token, '/api/inventory?limit=10');
    expect(res.success).toBeTruthy();
    expect(res.data?.total).toBeGreaterThan(0);

    // 매장별 재고 API (자기 매장 필터 적용)
    const byPartner = await apiGet(token, '/api/inventory/by-partner');
    expect(byPartner.success).toBeTruthy();
  });

  test('Y-4. gangnam(SF002) 매출 미포함 확인', async ({ page }) => {
    await navigateTo(page, '/');
    const token = await getAuthToken(page);
    const res = await apiGet(token, '/api/sales?limit=100&page=1');

    expect(res.success).toBeTruthy();
    const sales = res.data?.data || res.data || [];

    for (const sale of sales) {
      expect(
        sale.partner_code,
        `gangnam(${GANGNAM_PARTNER}) 매출이 포함되면 안 됨`,
      ).not.toBe(GANGNAM_PARTNER);
    }
  });

  test('Y-5. ADMIN_ONLY URL 차단 — /production, /fund', async ({ page }) => {
    const restrictedUrls = ['/production', '/fund'];

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

  test('Y-6. ADMIN_HQ URL 차단 — /md/analytics, /inbound/register', async ({ page }) => {
    const restrictedUrls = [
      '/md/analytics',
      '/inbound/register',
    ];

    for (const path of restrictedUrls) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      const body = await page.textContent('body') || '';
      const is403 = body.includes('403') || body.includes('권한') || body.includes('접근');
      const isRedirected = !url.includes(path);

      expect(is403 || isRedirected, `${path}는 STORE_MANAGER 접근 불가`).toBeTruthy();
    }
  });

  test('Y-7. 매출등록 페이지 접근 — 정상 렌더링', async ({ page }) => {
    await navigateTo(page, '/sales/entry');

    await page.waitForTimeout(2000);
    // 매출등록 폼이 있어야 함
    const hasCard = await page.locator('.ant-card').count() > 0;
    const hasTable = await page.locator('.ant-table').count() > 0;
    const hasForm = await page.locator('.ant-select').count() > 0;
    expect(hasCard || hasTable || hasForm, '매출등록 페이지가 렌더링되어야 함').toBeTruthy();

    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('Y-8. 메뉴 구성 확인 — 생산기획/자금관리/시스템관리 없음', async ({ page }) => {
    await navigateTo(page, '/');
    const sider = page.locator('.ant-layout-sider');

    const forbiddenMenus = ['생산기획', '자금관리', '시스템관리'];
    for (const menu of forbiddenMenus) {
      const item = sider.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: menu });
      await expect(item).toHaveCount(0);
    }

    // STORE_MANAGER가 볼 수 있는 메뉴 확인
    await expect(sider.locator('.ant-menu-item').filter({ hasText: '대시보드' })).toBeVisible();
    const salesMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '판매관리' });
    await expect(salesMenu).toBeVisible();
  });
});
