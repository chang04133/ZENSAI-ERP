import { Migration } from './runner';

const migration: Migration = {
  version: 7,
  name: 'shipment_type_master_codes',
  up: async (db) => {
    // CHECK 제약 제거 → 마스터코드 기반으로 유형 관리
    await db.query(`
      ALTER TABLE shipment_requests DROP CONSTRAINT IF EXISTS shipment_requests_request_type_check;
    `);

    // 기본 의뢰유형 마스터코드 추가
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SHIPMENT_TYPE', '출고', '출고', 1),
        ('SHIPMENT_TYPE', '반품', '반품', 2),
        ('SHIPMENT_TYPE', '재고이동', '재고이동', 3),
        ('SHIPMENT_TYPE', '수평이동', '수평이동', 4),
        ('SHIPMENT_TYPE', '기타', '기타', 5)
      ON CONFLICT (code_type, code_value) DO NOTHING;
    `);
  },
};

export default migration;
