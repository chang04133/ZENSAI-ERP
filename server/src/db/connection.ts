import { Pool } from 'pg';
import { config } from '../config/env';

const SCHEMA = 'zensai';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });

    // Set search_path to zensai schema for every new connection
    pool.on('connect', (client) => {
      client.query(`SET search_path TO ${SCHEMA}, public`);
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
    await client.query(`SET search_path TO ${SCHEMA}, public`);
    const res = await client.query('SELECT NOW()');
    console.log(`DB 연결 성공 (스키마: ${SCHEMA}):`, res.rows[0].now);
  } finally {
    client.release();
  }
}
