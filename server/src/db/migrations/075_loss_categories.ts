import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 75,
  name: '075_loss_categories',
  async up(db: QueryExecutor) {
    // loss_type 컬럼 추가 (유실/폐기/증정/직원할인 분류용)
    await db.query(`
      ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS loss_type VARCHAR(20)
    `);
    // 기존 LOSS 레코드에 'LOST' 태깅
    await db.query(`
      UPDATE inventory_transactions SET loss_type = 'LOST' WHERE tx_type = 'LOSS' AND loss_type IS NULL
    `);
  },
};

export default migration;
