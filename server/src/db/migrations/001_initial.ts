import { Migration } from './runner';

const migration: Migration = {
  version: 1,
  name: 'initial_schema',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS role_groups (
        group_id    SERIAL PRIMARY KEY,
        group_name  VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS partners (
        partner_code    VARCHAR(20) PRIMARY KEY,
        partner_name    VARCHAR(100) NOT NULL,
        business_number VARCHAR(20),
        representative  VARCHAR(50),
        address         VARCHAR(200),
        contact         VARCHAR(20),
        partner_type    VARCHAR(20) NOT NULL CHECK (partner_type IN ('직영','가맹','온라인')),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        user_id       VARCHAR(50) PRIMARY KEY,
        user_name     VARCHAR(50) NOT NULL,
        partner_code  VARCHAR(20) REFERENCES partners(partner_code),
        role_group    INTEGER NOT NULL REFERENCES role_groups(group_id),
        password_hash VARCHAR(255) NOT NULL,
        last_login    TIMESTAMPTZ,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          TEXT PRIMARY KEY,
        user_id     VARCHAR(50) NOT NULL REFERENCES users(user_id),
        token_hash  TEXT UNIQUE NOT NULL,
        expires_at  BIGINT NOT NULL,
        created_at  BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        product_code  VARCHAR(20) PRIMARY KEY,
        product_name  VARCHAR(100) NOT NULL,
        category      VARCHAR(50),
        brand         VARCHAR(50),
        season        VARCHAR(20),
        base_price    DECIMAL(12,2) NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS master_codes (
        code_id     SERIAL PRIMARY KEY,
        code_type   VARCHAR(20) NOT NULL,
        code_value  VARCHAR(50) NOT NULL,
        code_label  VARCHAR(100) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(code_type, code_value)
      );

      CREATE TABLE IF NOT EXISTS product_variants (
        variant_id    SERIAL PRIMARY KEY,
        product_code  VARCHAR(20) NOT NULL REFERENCES products(product_code) ON DELETE CASCADE,
        color         VARCHAR(50) NOT NULL,
        size          VARCHAR(20) NOT NULL CHECK (size IN ('XS','S','M','L','XL','XXL','FREE')),
        sku           VARCHAR(50) UNIQUE NOT NULL,
        price         DECIMAL(12,2),
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_partner_type ON partners(partner_type);
      CREATE INDEX IF NOT EXISTS idx_partner_active ON partners(is_active);
      CREATE INDEX IF NOT EXISTS idx_user_partner ON users(partner_code);
      CREATE INDEX IF NOT EXISTS idx_user_role ON users(role_group);
      CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_product_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_product_brand ON products(brand);
      CREATE INDEX IF NOT EXISTS idx_product_season ON products(season);
      CREATE INDEX IF NOT EXISTS idx_variant_product ON product_variants(product_code);
      CREATE INDEX IF NOT EXISTS idx_variant_sku ON product_variants(sku);
      CREATE INDEX IF NOT EXISTS idx_master_code_type ON master_codes(code_type);
      CREATE INDEX IF NOT EXISTS idx_master_code_active ON master_codes(code_type, is_active);
    `);
  },
};

export default migration;
