import { test as setup } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/admin.json';

/**
 * Admin 인증 셋업: 포트 5172 → 자동 로그인(admin/admin1234!)이 작동하여
 * localStorage에 토큰 주입됨. 이후 storageState로 보존.
 */
setup('authenticate as admin', async ({ page }) => {
  // 포트 5172 접속 → DEV 자동 로그인이 admin 계정으로 처리
  await page.goto('http://localhost:5172', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // 사이드바 메뉴가 렌더링되면 로그인 완료
  await page.waitForSelector('.ant-menu', { timeout: 30_000 });

  // 브라우저 상태 저장
  await page.context().storageState({ path: STORAGE_STATE });
});
