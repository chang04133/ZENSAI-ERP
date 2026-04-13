import { initDB, getPool } from '../db/connection';
import { runMigrations } from '../db/migrations/runner';
import { allMigrations } from '../db/migrations/index';

export async function setup() {
  await initDB();
  await runMigrations(getPool(), allMigrations);
}
