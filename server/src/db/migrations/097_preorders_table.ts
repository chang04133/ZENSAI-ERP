import { Migration } from './runner';

const m097: Migration = {
  version: 97,
  name: '097_preorders_table',
  async up(pool) {
    // 예약판매 전용 테이블 생성
    await pool.query(`
      CREATE TABLE IF NOT EXISTS preorders (
        preorder_id       BIGSERIAL PRIMARY KEY,
        preorder_date     DATE NOT NULL,
        partner_code      VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        variant_id        INTEGER NOT NULL REFERENCES product_variants(variant_id),
        qty               INTEGER NOT NULL CHECK (qty > 0),
        unit_price        DECIMAL(12,2) NOT NULL,
        total_price       DECIMAL(12,2) NOT NULL,
        status            VARCHAR(10) NOT NULL DEFAULT '대기',
        memo              TEXT,
        customer_id       INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
        fulfilled_at      TIMESTAMPTZ,
        fulfilled_sale_id BIGINT REFERENCES sales(sale_id),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_preorders_status ON preorders(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_preorders_partner ON preorders(partner_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_preorders_variant ON preorders(variant_id)`);

    // 기존 sales 테이블의 예약판매 데이터를 preorders로 이관
    await pool.query(`
      INSERT INTO preorders (preorder_date, partner_code, variant_id, qty, unit_price, total_price, status, memo, customer_id, created_at, updated_at)
      SELECT sale_date, partner_code, variant_id, qty, unit_price, total_price, '대기', memo, customer_id, created_at, updated_at
      FROM sales WHERE sale_type = '예약판매'
    `);

    // 이관 완료 후 sales에서 예약판매 레코드 삭제
    await pool.query(`DELETE FROM sales WHERE sale_type = '예약판매'`);
  },
};

export default m097;
