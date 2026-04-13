import { Migration } from './runner';

const migration: Migration = {
  version: 111,
  name: 'shipment_target_partners',
  up: async (client) => {
    // 수평이동 의뢰 시 여러 매장에 동시 요청할 때 후보 매장 목록
    // from_partner = NULL, target_partners = '5175,5176,5177'
    // 한 매장이 출고확인하면 from_partner가 설정되고 나머진 자동으로 안 보임
    await client.query(`
      ALTER TABLE shipment_requests
      ADD COLUMN IF NOT EXISTS target_partners TEXT;
    `);
  },
};

export default migration;
