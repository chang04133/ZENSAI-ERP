import { Migration } from './runner';

const migration: Migration = {
  version: 117,
  name: 'preorder_indexes_fk',
  up: async (client) => {
    // preorders 테이블 인덱스 추가
    await client.query(`CREATE INDEX IF NOT EXISTS idx_preorders_customer_id ON preorders (customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_preorders_fulfilled_sale ON preorders (fulfilled_sale_id) WHERE fulfilled_sale_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_preorders_partner_status ON preorders (partner_code, status, created_at)`);

    // fulfilled_sale_id FK cascade: sale 삭제 시 NULL로 설정
    // 먼저 기존 FK 확인 후 없으면 추가
    const fk = await client.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_preorders_fulfilled_sale' AND table_name = 'preorders'
    `);
    if (fk.rows.length === 0) {
      // fulfilled_sale_id 컬럼이 있는지 확인
      const col = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'preorders' AND column_name = 'fulfilled_sale_id'
      `);
      if (col.rows.length > 0) {
        await client.query(`
          ALTER TABLE preorders
          ADD CONSTRAINT fk_preorders_fulfilled_sale
          FOREIGN KEY (fulfilled_sale_id) REFERENCES sales(sale_id) ON DELETE SET NULL
        `);
      }
    }

    // 자주 사용하는 복합 인덱스: inventory, shipment, sales
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_partner_variant ON inventory (partner_code, variant_id) WHERE qty > 0`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shipments_status_date ON shipments (status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_partner_date ON sales (partner_code, sale_date DESC)`);
  },
};

export default migration;
