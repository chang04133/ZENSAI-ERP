import { Pool, PoolClient } from 'pg';

/** QueryExecutor: Pool 또는 PoolClient 모두 사용 가능한 인터페이스 */
export type QueryExecutor = Pick<Pool, 'query'>;

export interface Migration {
  version: number;
  name: string;
  up: (db: QueryExecutor) => Promise<void>;
}

export async function runMigrations(pool: Pool, migrations: Migration[]): Promise<void> {
  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version   INTEGER PRIMARY KEY,
      name      VARCHAR(100) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get applied versions
  const applied = await pool.query('SELECT version FROM _migrations ORDER BY version');
  const appliedSet = new Set(applied.rows.map((r: any) => r.version));

  // Run pending migrations in order
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    if (appliedSet.has(migration.version)) continue;

    console.log(`마이그레이션 실행: [${migration.version}] ${migration.name}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await migration.up(client);  // client를 전달하여 트랜잭션 내에서 실행
      await client.query(
        'INSERT INTO _migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );
      await client.query('COMMIT');
      console.log(`  ✓ 완료: [${migration.version}] ${migration.name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ 실패: [${migration.version}] ${migration.name}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('마이그레이션 완료');
}
