/** 숫자 로케일 포맷 (1234 -> "1,234") */
export const fmt = (v: number) => Number(v).toLocaleString();

/** fmt 의 별칭 */
export const fmtNum = fmt;

/** 원 단위 포맷 ("1,234원") */
export const fmtW = (v: number) => `${fmt(v)}원`;

/** 축약 원화 포맷 (억/만원/원) — 소수점 반올림 없이 표시 */
export const fmtWon = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 100000000) {
    const n = (abs / 100000000).toFixed(1);
    return sign + (n.endsWith('.0') ? `${n.slice(0, -2)}억` : `${n}억`);
  }
  if (abs >= 10000) {
    const n = (abs / 10000).toFixed(1);
    return sign + (n.endsWith('.0') ? `${n.slice(0, -2)}만원` : `${n}만원`);
  }
  return `${v.toLocaleString()}원`;
};
