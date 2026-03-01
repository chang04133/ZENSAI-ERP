/** 차트/그래프 공통 8색 팔레트 */
export const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

/** 카테고리별 대표 색상 (hex) */
export const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4', '미분류': '#94a3b8',
};

/** 카테고리별 Ant Design Tag 색상 */
export const CAT_TAG_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};

/** 상품 판매상태 Tag 색상 */
export const SALE_STATUS_COLORS: Record<string, string> = {
  '판매중': 'green',
  '일시품절': 'orange',
  '단종': 'red',
  '승인대기': 'blue',
};

/** 카테고리 필터 옵션 */
export const CATEGORY_OPTIONS = ['TOP', 'BOTTOM', 'OUTER', 'DRESS', 'ACC', 'SET'].map(c => ({ label: c, value: c }));

/** 사이즈 필터 옵션 */
export const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'].map(s => ({ label: s, value: s }));
