import { config } from './config/env';
import { getPool, initDB } from './db/connection';
import { initSchema } from './db/schema';
import { seedDefaults } from './db/seed';
import app from './app';

async function start() {
  try {
    // Initialize database
    await initDB();
    await initSchema(getPool());
    await seedDefaults(getPool());

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
