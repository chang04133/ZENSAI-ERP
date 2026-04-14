import { test as setup } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/second-store.json';

/**
 * Second Store (daegu) 인증 셋업: API 로그인 (daegu/1234)
 * → port 5175에 접속하여 localStorage에 토큰 주입 → storageState 저장.
 */
setup('authenticate as second store (daegu)', async ({ page }) => {
  const loginRes = await page.request.post('http://localhost:3001/api/auth/login', {
    data: { user_id: 'daegu', password: '1234' },
  });
  const loginData = await loginRes.json();

  if (!loginData.success) {
    throw new Error(`Daegu login failed: ${loginData.error || JSON.stringify(loginData)}`);
  }

  const { accessToken, refreshToken } = loginData.data;

  await page.goto('http://localhost:5175', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ access, refresh }) => {
    localStorage.setItem('zensai_access_token', access);
    localStorage.setItem('zensai_refresh_token', refresh);
  }, { access: accessToken, refresh: refreshToken });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ant-menu', { timeout: 15_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
