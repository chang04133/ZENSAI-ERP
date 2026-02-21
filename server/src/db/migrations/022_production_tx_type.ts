import { Migration } from './runner';

const migration: Migration = {
  version: 22,
  name: 'production_tx_type',
  up: async (db) => {
    // inventory_transactions tx_type에 PRODUCTION 추가
    await db.query(`ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_tx_type_check`);
    await db.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT inventory_transactions_tx_type_check
      CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE','RESTOCK','PRODUCTION'))
    `);
  },
};

export default migration;
