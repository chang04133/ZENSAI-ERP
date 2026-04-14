import { test as setup } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/hq-manager.json';

/**
 * HQ Manager 인증 셋업: API 로그인 (hq_mgr/test1234!)
 * → port 5173에 접속하여 localStorage에 토큰 주입 → storageState 저장.
 */
setup('authenticate as hq manager', async ({ page }) => {
  const loginRes = await page.request.post('http://localhost:3001/api/auth/login', {
    data: { user_id: 'hq_mgr', password: 'test1234!' },
  });
  const loginData = await loginRes.json();

  if (!loginData.success) {
    throw new Error(`HQ Manager login failed: ${loginData.error || JSON.stringify(loginData)}`);
  }

  const { accessToken, refreshToken } = loginData.data;

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ access, refresh }) => {
    localStorage.setItem('zensai_access_token', access);
    localStorage.setItem('zensai_refresh_token', refresh);
  }, { access: accessToken, refresh: refreshToken });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ant-menu', { timeout: 15_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
