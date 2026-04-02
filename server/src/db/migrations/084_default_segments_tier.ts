import { Migration, QueryExecutor } from './runner';

// 등급별 세그먼트는 캠페인 필터에 이미 등급 옵션이 있어 불필요하여 삭제됨
const segments: { name: string; desc: string; conditions: Record<string, any> }[] = [];

const migration: Migration = {
  version: 84,
  name: '084_default_segments_tier',
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
