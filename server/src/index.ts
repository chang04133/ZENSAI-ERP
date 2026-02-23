import { config } from './config/env';
import { getPool, initDB } from './db/connection';
import { runMigrations } from './db/migrations/runner';
import { allMigrations } from './db/migrations/index';
import { seedDefaults } from './db/seed';
import { seedDummyData } from './db/seed-dummy';
import app from './app';

async function start() {
  try {
    // Initialize database connection
    await initDB();

    // Run migrations (replaces old initSchema)
    await runMigrations(getPool(), allMigrations);

    // Seed default data
    await seedDefaults(getPool());

    // Seed dummy data for development
    if (config.nodeEnv === 'development') {
      try {
        await seedDummyData(getPool());
      } catch (e) {
        console.warn('더미 데이터 삽입 중 오류 (무시):', (e as any).message || e);
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
