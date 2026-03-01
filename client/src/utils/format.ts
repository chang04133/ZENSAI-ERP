/** 숫자 로케일 포맷 (1234 -> "1,234") */
export const fmt = (v: number) => Number(v).toLocaleString();

/** fmt 의 별칭 */
export const fmtNum = fmt;

/** 원 단위 포맷 ("1,234원") */
export const fmtW = (v: number) => `${fmt(v)}원`;

/** 축약 원화 포맷 (억/만원/원) */
export const fmtWon = (v: number) => {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만원`;
  return `${v.toLocaleString()}원`;
};
