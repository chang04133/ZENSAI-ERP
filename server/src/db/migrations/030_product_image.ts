import { Migration } from './runner';

const m030: Migration = {
  version: 30,
  name: '030_product_image',
  async up(pool) {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(255)`);
  },
};

export default m030;
