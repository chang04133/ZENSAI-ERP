import { Migration, QueryExecutor } from './runner';

const segments = [
  {
    name: '충성 고객',
    desc: '구매 5회 이상 + 최근 90일 이내 구매',
    conditions: { min_purchase_count: 5, days_since_purchase_max: 90 },
  },
  {
    name: '이탈 위험',
    desc: '구매 2회 이상 + 최근 구매 90~180일 전',
    conditions: { min_purchase_count: 2, days_since_purchase_min: 90, days_since_purchase_max: 180 },
  },
  {
    name: '휴면 고객',
    desc: '최근 구매 180일 이상 경과',
    conditions: { days_since_purchase_min: 180 },
  },
  {
    name: '첫 구매 고객',
    desc: '구매 1회 + 최근 30일 이내',
    conditions: { min_purchase_count: 1, max_purchase_count: 1, days_since_purchase_max: 30 },
  },
  {
    name: '하이엔드 고객',
    desc: '누적 구매 300만원 이상',
    conditions: { min_amount: 3000000 },
  },
  {
    name: 'VIP 후보',
    desc: '누적 구매 30만~50만원 (VIP 승급 직전)',
    conditions: { min_amount: 300000, max_amount: 500000 },
  },
  {
    name: '소액 다빈도',
    desc: '구매 5회 이상 + 누적 50만원 미만',
    conditions: { min_purchase_count: 5, max_amount: 500000 },
  },
  {
    name: '2030 세대',
    desc: '만 20~39세 고객',
    conditions: { age_min: 20, age_max: 39 },
  },
  {
    name: '4050 세대',
    desc: '만 40~59세 고객',
    conditions: { age_min: 40, age_max: 59 },
  },
];

const migration: Migration = {
  version: 83,
  name: '083_default_segments',
  up: async (pool: QueryExecutor) => {
    for (const seg of segments) {
      await pool.query(
        `INSERT INTO customer_segments (segment_name, description, conditions, auto_refresh, created_by)
         SELECT $1::varchar, $2, $3::jsonb, TRUE, 'SYSTEM'
         WHERE NOT EXISTS (SELECT 1 FROM customer_segments WHERE segment_name = $1::varchar)`,
        [seg.name, seg.desc, JSON.stringify(seg.conditions)]
      );
    }
  },
};

export default migration;
