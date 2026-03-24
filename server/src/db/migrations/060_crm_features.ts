import { Migration } from './runner';

const migration: Migration = {
  version: 60,
  name: 'crm_features',
  up: async (db) => {
    // ═══ Feature 8: Customer Tags ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_tags (
        tag_id    SERIAL PRIMARY KEY,
        tag_name  VARCHAR(50) NOT NULL UNIQUE,
        tag_type  VARCHAR(20) NOT NULL DEFAULT 'CUSTOM',
        color     VARCHAR(20) DEFAULT '#1890ff',
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_tag_map (
        customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        tag_id      INTEGER NOT NULL REFERENCES customer_tags(tag_id) ON DELETE CASCADE,
        created_by  VARCHAR(50),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (customer_id, tag_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ctm_customer ON customer_tag_map(customer_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ctm_tag ON customer_tag_map(tag_id)`);
    await db.query(`
      INSERT INTO customer_tags (tag_name, tag_type, color) VALUES
        ('단골', 'PREDEFINED', '#52c41a'),
        ('교환잦음', 'PREDEFINED', '#fa8c16'),
        ('사이즈민감', 'PREDEFINED', '#eb2f96'),
        ('VIP후보', 'PREDEFINED', '#722ed1'),
        ('이벤트관심', 'PREDEFINED', '#1890ff')
      ON CONFLICT (tag_name) DO NOTHING
    `);

    // ═══ Feature 4: Customer Segments ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_segments (
        segment_id   SERIAL PRIMARY KEY,
        segment_name VARCHAR(100) NOT NULL,
        description  TEXT,
        conditions   JSONB NOT NULL,
        auto_refresh BOOLEAN DEFAULT TRUE,
        member_count INTEGER DEFAULT 0,
        created_by   VARCHAR(50),
        partner_code VARCHAR(50) REFERENCES partners(partner_code),
        is_active    BOOLEAN DEFAULT TRUE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_segment_members (
        segment_id  INTEGER NOT NULL REFERENCES customer_segments(segment_id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        added_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (segment_id, customer_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_csm_segment ON customer_segment_members(segment_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_csm_customer ON customer_segment_members(customer_id)`);

    // ═══ Feature 10: A/S Management ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS after_sales_services (
        service_id     SERIAL PRIMARY KEY,
        customer_id    INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        partner_code   VARCHAR(50) NOT NULL REFERENCES partners(partner_code),
        service_type   VARCHAR(20) NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT '접수',
        product_name   VARCHAR(200),
        variant_info   VARCHAR(100),
        description    TEXT,
        resolution     TEXT,
        received_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        completed_date DATE,
        created_by     VARCHAR(50),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ass_customer ON after_sales_services(customer_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ass_partner ON after_sales_services(partner_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ass_status ON after_sales_services(status)`);

    // ═══ Feature 11: Visit History ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_visits (
        visit_id     SERIAL PRIMARY KEY,
        customer_id  INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        partner_code VARCHAR(50) NOT NULL REFERENCES partners(partner_code),
        visit_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        visit_time   TIME,
        purpose      VARCHAR(50),
        is_purchase  BOOLEAN DEFAULT FALSE,
        memo         TEXT,
        created_by   VARCHAR(50),
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cv_customer ON customer_visits(customer_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cv_date ON customer_visits(visit_date)`);

    // ═══ Feature 15: Consultation History ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_consultations (
        consultation_id  SERIAL PRIMARY KEY,
        customer_id      INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        consultation_type VARCHAR(20) NOT NULL,
        content          TEXT NOT NULL,
        created_by       VARCHAR(50),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cc_customer ON customer_consultations(customer_id)`);

    // ═══ Feature 5: Dormant Customer ═══
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_dormant BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS dormant_since DATE`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_dormant ON customers(is_dormant) WHERE is_dormant = TRUE`);
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES ('SETTING', 'DORMANT_MONTHS', '6', 30)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
