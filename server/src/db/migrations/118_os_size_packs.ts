import { Migration } from './runner';

const migration: Migration = {
  version: 118,
  name: 'os_size_packs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS os_size_packs (
        pack_id       SERIAL PRIMARY KEY,
        product_code  VARCHAR(20) NOT NULL,
        season        VARCHAR(20),
        category      VARCHAR(50),
        qty_xs        INTEGER DEFAULT 0,
        qty_s         INTEGER DEFAULT 0,
        qty_m         INTEGER DEFAULT 0,
        qty_l         INTEGER DEFAULT 0,
        qty_xl        INTEGER DEFAULT 0,
        qty_xxl       INTEGER DEFAULT 0,
        qty_free      INTEGER DEFAULT 0,
        total_qty     INTEGER NOT NULL DEFAULT 0,
        unit_cost     NUMERIC(12,2) DEFAULT 0,
        memo          TEXT,
        status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        brief_id      INTEGER,
        created_by    VARCHAR(50),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_os_size_packs_product ON os_size_packs(product_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_os_size_packs_status ON os_size_packs(status)`);
  },
};

export default migration;
