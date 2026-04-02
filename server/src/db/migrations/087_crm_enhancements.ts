import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 87,
  name: '087_crm_enhancements',
  up: async (pool: QueryExecutor) => {
    // 1) 고객 피드백/만족도
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_feedback (
        feedback_id    SERIAL PRIMARY KEY,
        customer_id    INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        service_id     INTEGER REFERENCES after_sales_services(service_id) ON DELETE SET NULL,
        feedback_type  VARCHAR(30) NOT NULL DEFAULT '일반',
        rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        content        TEXT,
        partner_code   VARCHAR(50) REFERENCES partners(partner_code),
        created_by     VARCHAR(50),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_feedback_customer ON customer_feedback(customer_id)`);

    // 2) 등급별 혜택 매트릭스
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tier_benefits (
        benefit_id    SERIAL PRIMARY KEY,
        tier_name     VARCHAR(20) NOT NULL,
        benefit_type  VARCHAR(30) NOT NULL,
        benefit_name  VARCHAR(100) NOT NULL,
        benefit_value VARCHAR(50),
        description   TEXT,
        is_active     BOOLEAN DEFAULT TRUE,
        sort_order    INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO tier_benefits (tier_name, benefit_type, benefit_name, benefit_value, sort_order) VALUES
        ('VVIP', 'DISCOUNT', 'VIP 할인', '15%', 1),
        ('VVIP', 'FREE_SHIPPING', '무료 배송', '무료', 2),
        ('VVIP', 'POINT_BONUS', '포인트 2배 적립', '2배', 3),
        ('VVIP', 'PRIORITY', '신상품 우선 안내', '우선', 4),
        ('VIP', 'DISCOUNT', 'VIP 할인', '10%', 1),
        ('VIP', 'FREE_SHIPPING', '무료 배송', '무료', 2),
        ('VIP', 'POINT_BONUS', '포인트 1.5배 적립', '1.5배', 3),
        ('일반', 'DISCOUNT', '일반 할인', '5%', 1),
        ('신규', 'GIFT', '웰컴 쿠폰', '10%', 1)
      ON CONFLICT DO NOTHING
    `);

    // 3) 고객 플래그
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_flags (
        flag_id     SERIAL PRIMARY KEY,
        flag_name   VARCHAR(50) NOT NULL UNIQUE,
        color       VARCHAR(20) DEFAULT '#1890ff',
        description TEXT,
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_flag_map (
        customer_id  INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        flag_id      INTEGER NOT NULL REFERENCES customer_flags(flag_id) ON DELETE CASCADE,
        flagged_by   VARCHAR(50),
        flagged_at   TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (customer_id, flag_id)
      )
    `);
    await pool.query(`
      INSERT INTO customer_flags (flag_name, color, description, sort_order) VALUES
        ('문제고객', '#ff4d4f', '클레임이 잦거나 주의가 필요한 고객', 1),
        ('우호고객', '#52c41a', '만족도가 높고 협조적인 고객', 2),
        ('이탈위험', '#faad14', '구매 주기 대비 장기 미구매', 3),
        ('도매거래', '#722ed1', '대량 구매 또는 도매 거래 고객', 4),
        ('VIP후보', '#eb2f96', '승격 기준 근접, 추적 필요', 5),
        ('수신거부', '#8c8c8c', '마케팅 메시지 발송 불가', 6)
      ON CONFLICT (flag_name) DO NOTHING
    `);
  },
};

export default migration;
