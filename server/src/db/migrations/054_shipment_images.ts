import { Migration } from './runner';

const migration: Migration = {
  version: 54,
  name: 'shipment_images',
  up: async (db) => {
    await db.query(`ALTER TABLE shipment_requests ADD COLUMN IF NOT EXISTS images TEXT`);
  },
};

export default migration;
