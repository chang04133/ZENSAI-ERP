import { Migration } from './runner';

const migration: Migration = {
  version: 113,
  name: 'outsource_workorders',
  up: async (client) => {
    await client.query(`
      -- 작업지시서 (디자인 승인 시 자동 생성)
      CREATE TABLE IF NOT EXISTS os_work_orders (
        wo_id           SERIAL PRIMARY KEY,
        wo_no           VARCHAR(20) UNIQUE NOT NULL,
        brief_id        INTEGER NOT NULL REFERENCES os_briefs(brief_id),
        submission_id   INTEGER NOT NULL REFERENCES os_design_submissions(submission_id),
        current_version INTEGER NOT NULL DEFAULT 1,
        status          VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
                        CHECK (status IN ('CONFIRMED','IN_PRODUCTION','QC_1ST','QC_FINAL','COMPLETED','CANCELLED')),
        partner_code    VARCHAR(20) REFERENCES partners(partner_code),
        target_qty      INTEGER,
        unit_cost       NUMERIC(12,2) DEFAULT 0,
        total_amount    NUMERIC(12,2) DEFAULT 0,
        confirmed_at    TIMESTAMPTZ DEFAULT NOW(),
        confirmed_by    VARCHAR(50),
        completed_at    TIMESTAMPTZ,
        memo            TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- 작업지시서 버전 스냅샷
      CREATE TABLE IF NOT EXISTS os_work_order_versions (
        version_id      SERIAL PRIMARY KEY,
        wo_id           INTEGER NOT NULL REFERENCES os_work_orders(wo_id) ON DELETE CASCADE,
        version_no      INTEGER NOT NULL,
        spec_data       JSONB NOT NULL,
        change_summary  TEXT,
        created_by      VARCHAR(50),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- 샘플 관리
      CREATE TABLE IF NOT EXISTS os_samples (
        sample_id       SERIAL PRIMARY KEY,
        wo_id           INTEGER NOT NULL REFERENCES os_work_orders(wo_id) ON DELETE CASCADE,
        sample_type     VARCHAR(20) NOT NULL CHECK (sample_type IN ('PROTO','FITTING','PP','PRODUCTION')),
        status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','IN_PROGRESS','APPROVED','REJECTED')),
        vendor_name     VARCHAR(100),
        vendor_contact  VARCHAR(100),
        send_date       DATE,
        receive_date    DATE,
        images          TEXT,
        memo            TEXT,
        created_by      VARCHAR(50),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- 업체 커뮤니케이션 로그
      CREATE TABLE IF NOT EXISTS os_vendor_logs (
        log_id          SERIAL PRIMARY KEY,
        wo_id           INTEGER NOT NULL REFERENCES os_work_orders(wo_id) ON DELETE CASCADE,
        vendor_name     VARCHAR(100),
        log_type        VARCHAR(20) DEFAULT 'NOTE'
                        CHECK (log_type IN ('NOTE','CALL','EMAIL','MEETING','ISSUE')),
        content         TEXT NOT NULL,
        attachments     TEXT,
        created_by      VARCHAR(50),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- 작업지시서 번호 생성 함수: OW + YYMMDD + 3자리
      CREATE OR REPLACE FUNCTION generate_os_wo_no()
      RETURNS VARCHAR AS $$
      DECLARE
        today_str VARCHAR;
        seq INT;
        new_no VARCHAR;
      BEGIN
        today_str := TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(
          CAST(RIGHT(wo_no, 3) AS INT)
        ), 0) + 1 INTO seq
        FROM os_work_orders
        WHERE wo_no LIKE 'OW' || today_str || '%';
        new_no := 'OW' || today_str || LPAD(seq::TEXT, 3, '0');
        RETURN new_no;
      END;
      $$ LANGUAGE plpgsql;

      -- 인덱스
      CREATE INDEX IF NOT EXISTS idx_os_wo_status ON os_work_orders(status);
      CREATE INDEX IF NOT EXISTS idx_os_wo_brief ON os_work_orders(brief_id);
      CREATE INDEX IF NOT EXISTS idx_os_wo_partner ON os_work_orders(partner_code);
      CREATE INDEX IF NOT EXISTS idx_os_wov_wo ON os_work_order_versions(wo_id);
      CREATE INDEX IF NOT EXISTS idx_os_samples_wo ON os_samples(wo_id);
      CREATE INDEX IF NOT EXISTS idx_os_vendor_logs_wo ON os_vendor_logs(wo_id);
    `);
  },
};

export default migration;
