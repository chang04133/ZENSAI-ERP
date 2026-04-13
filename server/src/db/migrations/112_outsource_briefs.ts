import { Migration } from './runner';

const migration: Migration = {
  version: 112,
  name: 'outsource_briefs',
  up: async (client) => {
    await client.query(`
      -- 시즌 브리프 (갑이 등록)
      CREATE TABLE IF NOT EXISTS os_briefs (
        brief_id      SERIAL PRIMARY KEY,
        brief_no      VARCHAR(20) UNIQUE NOT NULL,
        brief_title   VARCHAR(200) NOT NULL,
        season        VARCHAR(20),
        category      VARCHAR(50),
        target_qty    INTEGER,
        budget_amount NUMERIC(12,2) DEFAULT 0,
        deadline      DATE,
        description   TEXT,
        attachments   TEXT,
        status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','DISTRIBUTED','IN_PROGRESS','COMPLETED','CANCELLED')),
        assigned_to   VARCHAR(50) REFERENCES users(user_id),
        created_by    VARCHAR(50) REFERENCES users(user_id),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      -- 디자인 시안 (을이 업로드, 갑이 심사)
      CREATE TABLE IF NOT EXISTS os_design_submissions (
        submission_id   SERIAL PRIMARY KEY,
        brief_id        INTEGER NOT NULL REFERENCES os_briefs(brief_id) ON DELETE CASCADE,
        submission_no   VARCHAR(20) UNIQUE NOT NULL,
        version         INTEGER NOT NULL DEFAULT 1,
        material_research TEXT,
        design_mockup   TEXT,
        work_order_draft TEXT,
        attachments     TEXT,
        memo            TEXT,
        status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','REJECTED')),
        submitted_by    VARCHAR(50) REFERENCES users(user_id),
        submitted_at    TIMESTAMPTZ DEFAULT NOW(),
        reviewed_by     VARCHAR(50) REFERENCES users(user_id),
        reviewed_at     TIMESTAMPTZ,
        review_deadline TIMESTAMPTZ,
        reject_reason   TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- 브리프 번호 생성 함수: OB + YYMMDD + 3자리
      CREATE OR REPLACE FUNCTION generate_os_brief_no()
      RETURNS VARCHAR AS $$
      DECLARE
        today_str VARCHAR;
        seq INT;
        new_no VARCHAR;
      BEGIN
        today_str := TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(
          CAST(RIGHT(brief_no, 3) AS INT)
        ), 0) + 1 INTO seq
        FROM os_briefs
        WHERE brief_no LIKE 'OB' || today_str || '%';
        new_no := 'OB' || today_str || LPAD(seq::TEXT, 3, '0');
        RETURN new_no;
      END;
      $$ LANGUAGE plpgsql;

      -- 디자인 시안 번호 생성 함수: OD + YYMMDD + 3자리
      CREATE OR REPLACE FUNCTION generate_os_submission_no()
      RETURNS VARCHAR AS $$
      DECLARE
        today_str VARCHAR;
        seq INT;
        new_no VARCHAR;
      BEGIN
        today_str := TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(
          CAST(RIGHT(submission_no, 3) AS INT)
        ), 0) + 1 INTO seq
        FROM os_design_submissions
        WHERE submission_no LIKE 'OD' || today_str || '%';
        new_no := 'OD' || today_str || LPAD(seq::TEXT, 3, '0');
        RETURN new_no;
      END;
      $$ LANGUAGE plpgsql;

      -- 인덱스
      CREATE INDEX IF NOT EXISTS idx_os_briefs_status ON os_briefs(status);
      CREATE INDEX IF NOT EXISTS idx_os_briefs_season ON os_briefs(season);
      CREATE INDEX IF NOT EXISTS idx_os_briefs_assigned ON os_briefs(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_os_submissions_brief ON os_design_submissions(brief_id);
      CREATE INDEX IF NOT EXISTS idx_os_submissions_status ON os_design_submissions(status);
      CREATE INDEX IF NOT EXISTS idx_os_submissions_deadline ON os_design_submissions(review_deadline);
    `);
  },
};

export default migration;
