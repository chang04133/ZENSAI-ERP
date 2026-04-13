import { test as setup } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/store-manager.json';

/**
 * 글로벌 셋업: API로 직접 로그인하여 토큰을 얻고
 * localStorage에 저장한 상태를 storageState로 보존.
 * 자동 로그인(SPA) 대신 API 직접 호출 → rate limiter 1회만 소모.
 */
setup('authenticate as store manager', async ({ page }) => {
  // 1. API로 직접 로그인
  const loginRes = await page.request.post('http://localhost:3001/api/auth/login', {
    data: { user_id: 'gangnam', password: '1234' },
  });
  const loginData = await loginRes.json();

  if (!loginData.success) {
    throw new Error(`Login failed: ${loginData.error || JSON.stringify(loginData)}`);
  }

  const { accessToken, refreshToken } = loginData.data;

  // 2. 페이지에 접속하여 localStorage에 토큰 주입
  await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ access, refresh }) => {
    localStorage.setItem('zensai_access_token', access);
    localStorage.setItem('zensai_refresh_token', refresh);
  }, { access: accessToken, refresh: refreshToken });

  // 3. 새로고침하여 토큰으로 앱 로드
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ant-menu', { timeout: 15_000 });

  // 4. 브라우저 상태 저장
  await page.context().storageState({ path: STORAGE_STATE });
});
