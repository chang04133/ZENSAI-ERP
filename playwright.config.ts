import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // 순차 실행 (동일 DB 사용)
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'docs/e2e-results.json' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    screenshot: 'on',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    // ── 매장관리자 (gangnam) ──
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'store-manager',
      dependencies: ['setup'],
      testIgnore: /(T-outsource|U-permissions|V-event-price|V-sell-through)\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:5174',
        storageState: 'e2e/.auth/store-manager.json',
      },
    },

    // ── 관리자 (admin) ──
    {
      name: 'admin-setup',
      testMatch: /auth-admin\.setup\.ts/,
    },
    {
      name: 'admin',
      dependencies: ['admin-setup'],
      testMatch: /(T-outsource|U-permissions|V-event-price|V-sell-through)\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:5172',
        storageState: 'e2e/.auth/admin.json',
      },
    },
  ],

  webServer: [
    {
      command: 'npm run dev:server',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:store',
      port: 5174,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:master',
      port: 5172,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
