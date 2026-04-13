import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    sequence: { concurrent: false },
    fileParallelism: false,  // 파일 간 병렬 실행 비활성화 (DB 상태 공유)
    globalSetup: ['src/__tests__/global-setup.ts'],
    env: { NODE_ENV: 'test' },
  },
});
