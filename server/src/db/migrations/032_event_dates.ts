import { Migration } from './runner';

const migration: Migration = {
  version: 32,
  name: '032_event_dates',
  async up(pool) {
    await pool.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS event_start_date DATE,
        ADD COLUMN IF NOT EXISTS event_end_date DATE;
    `);
  },
};

export default migration;
