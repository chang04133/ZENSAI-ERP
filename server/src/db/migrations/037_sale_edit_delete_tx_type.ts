import { Migration } from './runner';

const migration: Migration = {
  version: 37,
  name: 'sale_edit_delete_tx_type',
  up: async (db) => {
    // inventory_transactions tx_type에 SALE_EDIT, SALE_DELETE 추가
    await db.query(`ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_tx_type_check`);
    await db.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT inventory_transactions_tx_type_check
      CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE','SALE_EDIT','SALE_DELETE','RESTOCK','PRODUCTION'))
    `);
  },
};

export default migration;
