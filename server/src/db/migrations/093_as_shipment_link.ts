import { Migration } from './runner';

const migration: Migration = {
  version: 93,
  name: '093_as_shipment_link',
  up: async (client) => {
    await client.query(`
      ALTER TABLE after_sales_services
        ADD COLUMN IF NOT EXISTS shipment_request_id INTEGER REFERENCES shipment_requests(request_id) ON DELETE SET NULL;
    `);
  },
};

export default migration;
