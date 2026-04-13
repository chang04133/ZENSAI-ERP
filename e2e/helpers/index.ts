import { Page, expect } from '@playwright/test';

/**
 * 앱 로드 대기 (storageState로 이미 인증된 상태)
 */
export async function waitForApp(page: Page) {
  // Ant Design Spin이 사라질 때까지 대기
  await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});
  // 사이드바 메뉴가 렌더링될 때까지 대기
  await page.waitForSelector('.ant-menu', { timeout: 15_000 });
}

/**
 * 페이지 이동 + 로드 대기
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForApp(page);
}

/**
 * Ant Design Table이 로드될 때까지 대기 (로딩 스피너 해제)
 */
export async function waitForTable(page: Page) {
  await page.waitForSelector('.ant-table-wrapper .ant-spin', { state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.waitForSelector('.ant-table-tbody', { timeout: 10_000 }).catch(() => {});
}

/**
 * Ant Design message(토스트)에 특정 텍스트가 포함되는지 확인
 */
export async function expectMessage(page: Page, text: string, timeout = 10_000) {
  const msg = page.locator('.ant-message-notice-content').filter({ hasText: text });
  await expect(msg.first()).toBeVisible({ timeout });
}

/**
 * 사이드바 메뉴 클릭 (부모 → 자식 순서)
 */
export async function clickMenu(page: Page, menuName: string, subMenuName?: string) {
  const sider = page.locator('.ant-layout-sider');
  if (subMenuName) {
    const parent = sider.locator('.ant-menu-submenu-title').filter({ hasText: menuName });
    await parent.click();
    await page.waitForTimeout(300);
    const child = sider.locator('.ant-menu-item').filter({ hasText: subMenuName });
    await child.click();
  } else {
    const item = sider.locator('.ant-menu-item').filter({ hasText: menuName });
    await item.click();
  }
  await page.waitForTimeout(500);
}

/**
 * Ant Design Modal이 열릴 때까지 대기
 */
export async function waitForModal(page: Page, titleText?: string) {
  if (titleText) {
    await page.locator('.ant-modal').filter({ hasText: titleText }).waitFor({ state: 'visible', timeout: 5_000 });
  } else {
    await page.waitForSelector('.ant-modal-content', { state: 'visible', timeout: 5_000 });
  }
}

/**
 * Ant Design Tabs에서 특정 탭 클릭
 */
export async function clickTab(page: Page, tabName: string) {
  await page.locator('.ant-tabs-tab').filter({ hasText: tabName }).click();
  await page.waitForTimeout(300);
}
