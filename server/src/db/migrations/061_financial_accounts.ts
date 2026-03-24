import { Migration } from './runner';

const migration: Migration = {
  version: 61,
  name: 'financial_accounts',
  up: async (client) => {
    // 1) 미수금 (Accounts Receivable)
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts_receivable (
        ar_id SERIAL PRIMARY KEY,
        partner_code VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        ar_date DATE NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        due_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE')),
        paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        memo TEXT,
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ar_partner ON accounts_receivable(partner_code);
      CREATE INDEX IF NOT EXISTS idx_ar_date ON accounts_receivable(ar_date);
      CREATE INDEX IF NOT EXISTS idx_ar_status ON accounts_receivable(status);
    `);

    // 2) 미지급금 (Accounts Payable)
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts_payable (
        ap_id SERIAL PRIMARY KEY,
        partner_code VARCHAR(20) REFERENCES partners(partner_code),
        ap_date DATE NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        due_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE')),
        paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        category VARCHAR(50),
        memo TEXT,
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ap_partner ON accounts_payable(partner_code);
      CREATE INDEX IF NOT EXISTS idx_ap_date ON accounts_payable(ap_date);
      CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status);
    `);

    // 3) 매출 카테고리에 auto_source 설정
    await client.query(`
      UPDATE fund_categories SET auto_source = 'SALES'
      WHERE category_name = '매출' AND plan_type = 'INCOME'
        AND auto_source IS NULL
    `);
  },
};

export default migration;
