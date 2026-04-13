import { Migration } from './runner';

const migration: Migration = {
  version: 114,
  name: 'outsource_qc_payments',
  up: async (client) => {
    await client.query(`
      -- QC 검수 (1차/최종)
      CREATE TABLE IF NOT EXISTS os_qc_inspections (
        qc_id           SERIAL PRIMARY KEY,
        wo_id           INTEGER NOT NULL REFERENCES os_work_orders(wo_id) ON DELETE CASCADE,
        qc_type         VARCHAR(10) NOT NULL CHECK (qc_type IN ('1ST','FINAL')),
        qc_no           VARCHAR(20) UNIQUE NOT NULL,
        wo_version_at_qc INTEGER NOT NULL,
        inspected_qty   INTEGER DEFAULT 0,
        passed_qty      INTEGER DEFAULT 0,
        defect_qty      INTEGER DEFAULT 0,
        result          VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                        CHECK (result IN ('PENDING','PASS','FAIL')),
        defect_details  TEXT,
        images          TEXT,
        blame_party     VARCHAR(10) CHECK (blame_party IN ('GAP','EUL')),
        blame_reason    VARCHAR(20) CHECK (blame_reason IN (
          'SPEC_ERROR','DIMENSION_ERROR','MATERIAL_MIS_ORDER',
          'BRIEF_CHANGE','WO_MODIFICATION'
        )),
        blame_memo      TEXT,
        rework_cost     NUMERIC(12,2) DEFAULT 0,
        rework_wo_id    INTEGER REFERENCES os_work_orders(wo_id),
        inspected_by    VARCHAR(50),
        inspected_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- 3단계 결제
      CREATE TABLE IF NOT EXISTS os_payments (
        payment_id      SERIAL PRIMARY KEY,
        wo_id           INTEGER NOT NULL REFERENCES os_work_orders(wo_id) ON DELETE CASCADE,
        payment_step    VARCHAR(10) NOT NULL CHECK (payment_step IN ('P1','P2','P3')),
        trigger_type    VARCHAR(20) NOT NULL,
        trigger_ref_id  INTEGER,
        amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
        status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','PAID','CANCELLED')),
        approved_by     VARCHAR(50),
        approved_at     TIMESTAMPTZ,
        paid_at         TIMESTAMPTZ,
        memo            TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- QC 번호 생성 함수: OQ + YYMMDD + 3자리
      CREATE OR REPLACE FUNCTION generate_os_qc_no()
      RETURNS VARCHAR AS $$
      DECLARE
        today_str VARCHAR;
        seq INT;
        new_no VARCHAR;
      BEGIN
        today_str := TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(
          CAST(RIGHT(qc_no, 3) AS INT)
        ), 0) + 1 INTO seq
        FROM os_qc_inspections
        WHERE qc_no LIKE 'OQ' || today_str || '%';
        new_no := 'OQ' || today_str || LPAD(seq::TEXT, 3, '0');
        RETURN new_no;
      END;
      $$ LANGUAGE plpgsql;

      -- 인덱스
      CREATE INDEX IF NOT EXISTS idx_os_qc_wo ON os_qc_inspections(wo_id);
      CREATE INDEX IF NOT EXISTS idx_os_qc_type ON os_qc_inspections(qc_type);
      CREATE INDEX IF NOT EXISTS idx_os_qc_result ON os_qc_inspections(result);
      CREATE INDEX IF NOT EXISTS idx_os_payments_wo ON os_payments(wo_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_os_payments_wo_step ON os_payments(wo_id, payment_step);
    `);
  },
};

export default migration;
