import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 73,
  name: '073_loss_tx_type',
  async up(db: QueryExecutor) {
    // inventory_transactions tx_type CHECK 제약조건에 LOSS 추가
    const constraints = await db.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'inventory_transactions'
        AND nsp.nspname = current_schema()
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%tx_type%'
    `);
    for (const row of constraints.rows) {
      await db.query(`ALTER TABLE inventory_transactions DROP CONSTRAINT "${row.conname}"`);
    }
    await db.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT inventory_transactions_tx_type_check
      CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE','SALE_EDIT','SALE_DELETE','RESTOCK','PRODUCTION','INBOUND','LOSS'))
    `);
  },
};

export default migration;
