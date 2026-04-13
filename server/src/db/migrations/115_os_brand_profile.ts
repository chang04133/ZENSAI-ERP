import { Migration } from './runner';

const migration: Migration = {
  version: 115,
  name: 'os_brand_profile',
  async up(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS os_brand_profile (
        profile_id SERIAL PRIMARY KEY,
        brand_name VARCHAR(100),
        target_age VARCHAR(50),
        target_gender VARCHAR(20),
        price_range VARCHAR(50),
        brand_concept TEXT,
        main_fabrics TEXT,
        preferred_colors TEXT,
        size_range VARCHAR(100),
        season_focus VARCHAR(100),
        additional_notes TEXT,
        updated_by VARCHAR(50) REFERENCES users(user_id),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // 기본 행 삽입
    await pool.query(`
      INSERT INTO os_brand_profile (brand_name) VALUES ('ZENSAI') ON CONFLICT DO NOTHING;
    `);
  },
};

export default migration;
