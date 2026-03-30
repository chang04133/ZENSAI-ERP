import { config } from './config/env';
import { getPool, initDB } from './db/connection';
import { runMigrations } from './db/migrations/runner';
import { allMigrations } from './db/migrations/index';
import { seedDefaults } from './db/seed';
import app from './app';

async function start() {
  try {
    // Initialize database connection
    await initDB();

    // Run migrations (replaces old initSchema)
    await runMigrations(getPool(), allMigrations);

    // Seed default data
    await seedDefaults(getPool());

    // Start CRM scheduler (auto-campaigns, point expiry)
    if (config.nodeEnv === 'production' || process.env.ENABLE_SCHEDULER === 'true') {
      try {
        const { initCrmScheduler } = await import('./scheduler/crm-scheduler');
        initCrmScheduler();
        console.log('CRM 스케줄러 초기화 완료');
      } catch (e) {
        console.warn('CRM 스케줄러 초기화 실패 (node-cron 미설치 가능):', e);
      }
    }

    // Start server
    app.listen(config.port, () => {
      console.log(`ZENSAI ERP 서버 시작: http://localhost:${config.port}`);
      console.log(`환경: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('서버 시작 실패:', error);
    process.exit(1);
  }
}

start();
