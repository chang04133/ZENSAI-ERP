import { Migration } from './runner';

const migration: Migration = {
  version: 4,
  name: 'inventory_tables',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        inventory_id  SERIAL PRIMARY KEY,
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        qty           INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(partner_code, variant_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_transactions (
        tx_id         BIGSERIAL PRIMARY KEY,
        tx_type       VARCHAR(20) NOT NULL CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE')),
        ref_id        INTEGER,
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        qty_change    INTEGER NOT NULL,
        qty_after     INTEGER NOT NULL,
        created_by    VARCHAR(50),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_partner ON inventory(partner_code);
      CREATE INDEX IF NOT EXISTS idx_inventory_variant ON inventory(variant_id);
      CREATE INDEX IF NOT EXISTS idx_inv_tx_type ON inventory_transactions(tx_type);
      CREATE INDEX IF NOT EXISTS idx_inv_tx_partner ON inventory_transactions(partner_code);
      CREATE INDEX IF NOT EXISTS idx_inv_tx_date ON inventory_transactions(created_at);
    `);
  },
};

export default migration;
