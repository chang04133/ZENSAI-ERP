import { Migration } from './runner';

const migration: Migration = {
  version: 15,
  name: 'stock_notifications',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS stock_notifications (
        notification_id SERIAL PRIMARY KEY,
        from_partner_code VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        to_partner_code   VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        variant_id        INTEGER NOT NULL REFERENCES product_variants(variant_id),
        from_qty          INTEGER NOT NULL DEFAULT 0,
        to_qty            INTEGER NOT NULL DEFAULT 0,
        status            VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READ','RESOLVED')),
        created_by        VARCHAR(50) NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at           TIMESTAMPTZ
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_stock_notif_to ON stock_notifications(to_partner_code, status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_stock_notif_from ON stock_notifications(from_partner_code)`);
  },
};

export default migration;
