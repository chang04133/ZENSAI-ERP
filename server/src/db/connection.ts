import { Pool } from 'pg';
import { config } from '../config/env';

const SCHEMA = 'zensai';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const isLocal = config.databaseUrl.includes('localhost') || config.databaseUrl.includes('127.0.0.1');

    // 안전장치: development 모드에서 외부 DB 연결 차단
    if (config.nodeEnv !== 'production' && !isLocal) {
      console.error('\x1b[41m\x1b[37m ✖ 위험: development 모드에서 외부 DB 연결 시도 차단! \x1b[0m');
      console.error(`  DB URL: ${new URL(config.databaseUrl).hostname}`);
      console.error('  .env.development 파일에 로컬 DATABASE_URL이 설정되어 있는지 확인하세요.');
      process.exit(1);
    }

    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
    });

    // Set search_path and timezone for every new connection
    pool.on('connect', (client) => {
      client.query(`SET search_path TO ${SCHEMA}, public; SET timezone TO 'Asia/Seoul'`);
    });
  }
  return pool;
}

export async function initDB(): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  try {
    // Create zensai schema if not exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await client.query(`SET search_path TO ${SCHEMA}, public; SET timezone TO 'Asia/Seoul'`);
    const res = await client.query('SELECT NOW()');
    const dbHost = new URL(config.databaseUrl).hostname;
    const dbName = new URL(config.databaseUrl).pathname.slice(1);
    const env = config.nodeEnv;
    console.log(`DB 연결 성공 [${env}] ${dbName}@${dbHost} (스키마: ${SCHEMA}):`, res.rows[0].now);
  } finally {
    client.release();
  }
}
