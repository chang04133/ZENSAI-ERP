import { QueryExecutor } from './runner';

export default {
  version: 16,
  name: '016_production',
  async up(pool: QueryExecutor) {
    await pool.query(`
      -- 자재 테이블
      CREATE TABLE IF NOT EXISTS materials (
        material_id   SERIAL PRIMARY KEY,
        material_code VARCHAR(20) UNIQUE NOT NULL,
        material_name VARCHAR(100) NOT NULL,
        material_type VARCHAR(20) NOT NULL CHECK (material_type IN ('FABRIC', 'ACCESSORY', 'PACKAGING')),
        unit          VARCHAR(10) NOT NULL DEFAULT 'ea',
        unit_price    NUMERIC(12,2) DEFAULT 0,
        stock_qty     NUMERIC(12,2) DEFAULT 0,
        min_stock_qty NUMERIC(12,2) DEFAULT 0,
        supplier      VARCHAR(100),
        memo          TEXT,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      -- 생산계획 헤더
      CREATE TABLE IF NOT EXISTS production_plans (
        plan_id       SERIAL PRIMARY KEY,
        plan_no       VARCHAR(20) UNIQUE NOT NULL,
        plan_name     VARCHAR(100) NOT NULL,
        season        VARCHAR(20),
        target_date   DATE,
        start_date    DATE,
        end_date      DATE,
        status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','CONFIRMED','IN_PRODUCTION','COMPLETED','CANCELLED')),
        partner_code  VARCHAR(20) REFERENCES partners(partner_code),
        memo          TEXT,
        created_by    VARCHAR(50) REFERENCES users(user_id),
        approved_by   VARCHAR(50) REFERENCES users(user_id),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      -- 생산계획 품목
      CREATE TABLE IF NOT EXISTS production_plan_items (
        item_id       SERIAL PRIMARY KEY,
        plan_id       INTEGER NOT NULL REFERENCES production_plans(plan_id) ON DELETE CASCADE,
        product_code  VARCHAR(20) NOT NULL REFERENCES products(product_code),
        variant_id    INTEGER REFERENCES product_variants(variant_id),
        plan_qty      INTEGER NOT NULL CHECK (plan_qty > 0),
        produced_qty  INTEGER DEFAULT 0,
        unit_cost     NUMERIC(12,2),
        memo          TEXT
      );

      -- 자재 소요량
      CREATE TABLE IF NOT EXISTS production_material_usage (
        usage_id      SERIAL PRIMARY KEY,
        plan_id       INTEGER NOT NULL REFERENCES production_plans(plan_id) ON DELETE CASCADE,
        material_id   INTEGER NOT NULL REFERENCES materials(material_id),
        required_qty  NUMERIC(12,2) NOT NULL DEFAULT 0,
        used_qty      NUMERIC(12,2) DEFAULT 0,
        memo          TEXT
      );

      -- 생산계획 번호 자동생성 함수
      CREATE OR REPLACE FUNCTION generate_plan_no()
      RETURNS VARCHAR AS $$
      DECLARE
        today_str VARCHAR;
        seq INT;
        new_no VARCHAR;
      BEGIN
        today_str := TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(
          CAST(RIGHT(plan_no, 3) AS INT)
        ), 0) + 1 INTO seq
        FROM production_plans
        WHERE plan_no LIKE 'PP' || today_str || '%';
        new_no := 'PP' || today_str || LPAD(seq::TEXT, 3, '0');
        RETURN new_no;
      END;
      $$ LANGUAGE plpgsql;

      -- 자재코드 자동생성 함수
      CREATE OR REPLACE FUNCTION generate_material_code()
      RETURNS VARCHAR AS $$
      DECLARE
        seq INT;
        new_code VARCHAR;
      BEGIN
        SELECT COALESCE(MAX(
          CAST(RIGHT(material_code, 4) AS INT)
        ), 0) + 1 INTO seq
        FROM materials;
        new_code := 'MAT' || LPAD(seq::TEXT, 4, '0');
        RETURN new_code;
      END;
      $$ LANGUAGE plpgsql;

      -- CHECK constraint 수정 (한글 → 영문)
      ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_material_type_check;
      ALTER TABLE materials ADD CONSTRAINT materials_material_type_check
        CHECK (material_type IN ('FABRIC', 'ACCESSORY', 'PACKAGING'));

      -- 인덱스
      CREATE INDEX IF NOT EXISTS idx_pp_status ON production_plans(status);
      CREATE INDEX IF NOT EXISTS idx_pp_season ON production_plans(season);
      CREATE INDEX IF NOT EXISTS idx_pp_partner ON production_plans(partner_code);
      CREATE INDEX IF NOT EXISTS idx_pp_target ON production_plans(target_date);
      CREATE INDEX IF NOT EXISTS idx_ppi_plan ON production_plan_items(plan_id);
      CREATE INDEX IF NOT EXISTS idx_pmu_plan ON production_material_usage(plan_id);
      CREATE INDEX IF NOT EXISTS idx_mat_type ON materials(material_type);
    `);
  },
};
