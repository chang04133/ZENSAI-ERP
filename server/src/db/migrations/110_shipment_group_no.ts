import { Migration } from './runner';

const migration: Migration = {
  version: 110,
  name: 'shipment_group_no',
  up: async (client) => {
    // 일괄 의뢰 시 공유되는 그룹 번호 (여러 매장에 동시 요청 시 동일 group_no)
    await client.query(`
      ALTER TABLE shipment_requests
      ADD COLUMN IF NOT EXISTS group_no VARCHAR(20);
    `);
  },
};

export default migration;
