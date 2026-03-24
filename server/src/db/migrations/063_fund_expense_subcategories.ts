import { Migration } from './runner';

/**
 * 자금계획 지출 카테고리에 세부항목 추가
 * 루트 카테고리(인건비, 임대료 등)는 합산 표시, 세부항목에서만 입력
 */

interface SubCategoryDef {
  parent: string;               // 부모 카테고리명
  children: string[];           // 세부 카테고리명
  migrateTo: string;            // 기존 데이터 이전 대상 카테고리명
}

const SUBCATEGORIES: SubCategoryDef[] = [
  {
    parent: '인건비',
    children: ['정규직 급여', '비정규직 급여', '상여금', '퇴직급여', '4대보험료', '복리후생비', '기타 인건비'],
    migrateTo: '기타 인건비',
  },
  {
    parent: '임대료',
    children: ['매장 임대료', '사무실 임대료', '창고 임대료', '기타 임대료'],
    migrateTo: '기타 임대료',
  },
  {
    parent: '물류/배송비',
    children: ['택배/배송비', '포장비', '운반비', '기타 물류비'],
    migrateTo: '기타 물류비',
  },
  {
    parent: '마케팅/광고',
    children: ['온라인 광고', '오프라인 광고', '판촉비', '기타 마케팅'],
    migrateTo: '기타 마케팅',
  },
  {
    parent: '관리비/공과금',
    children: ['수도광열비', '통신비', '소모품비', '세금과공과', '보험료', '기타 관리비'],
    migrateTo: '기타 관리비',
  },
  {
    parent: '기타비용',
    children: ['접대비', '여비교통비', '수선비', '기타'],
    migrateTo: '기타',
  },
];

const migration: Migration = {
  version: 63,
  name: 'fund_expense_subcategories',
  up: async (client) => {
    for (const def of SUBCATEGORIES) {
      // 부모 카테고리 찾기
      const parentResult = await client.query(
        `SELECT category_id FROM fund_categories
         WHERE category_name = $1 AND parent_id IS NULL AND plan_type = 'EXPENSE'`,
        [def.parent],
      );
      if (parentResult.rows.length === 0) continue;
      const parentId = parentResult.rows[0].category_id;

      // 이미 하위 항목이 있으면 스킵 (멱등성)
      const existingChildren = await client.query(
        `SELECT COUNT(*) as cnt FROM fund_categories WHERE parent_id = $1`,
        [parentId],
      );
      if (Number(existingChildren.rows[0].cnt) > 0) continue;

      // 기존 fund_plans 데이터 존재 여부
      const existingPlans = await client.query(
        `SELECT COUNT(*) as cnt FROM fund_plans WHERE category_id = $1`,
        [parentId],
      );
      const hasData = Number(existingPlans.rows[0].cnt) > 0;

      // 세부 카테고리 삽입
      let sortOrder = 1;
      let migrateTargetId: number | null = null;

      for (const childName of def.children) {
        const result = await client.query(
          `INSERT INTO fund_categories (category_name, plan_type, sort_order, parent_id)
           VALUES ($1, 'EXPENSE', $2, $3) RETURNING category_id`,
          [childName, sortOrder, parentId],
        );
        // migrateTo에 해당하는 항목을 데이터 이전 대상으로 지정
        if (childName === def.migrateTo) {
          migrateTargetId = result.rows[0].category_id;
        }
        sortOrder++;
      }

      // 기존 데이터 이전: 부모의 fund_plans → "기타" 하위항목으로
      if (hasData && migrateTargetId) {
        await client.query(
          `UPDATE fund_plans SET category_id = $1 WHERE category_id = $2`,
          [migrateTargetId, parentId],
        );
      }
    }
  },
};

export default migration;
