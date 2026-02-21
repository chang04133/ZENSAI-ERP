export const ROLES = {
  ADMIN: 'ADMIN',
  SYS_ADMIN: 'SYS_ADMIN',
  HQ_MANAGER: 'HQ_MANAGER',
  STORE_MANAGER: 'STORE_MANAGER',
  STORE_STAFF: 'STORE_STAFF',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: '마스터계정',
  SYS_ADMIN: '부마스터 계정',
  HQ_MANAGER: '본사 매니저',
  STORE_MANAGER: '매장 매니저',
  STORE_STAFF: '매장 직원',
};

/** 직급 계층 (숫자가 낮을수록 상위) — 자기보다 낮은 직급만 생성 가능 */
export const ROLE_LEVEL: Record<string, number> = {
  ADMIN: 1,
  SYS_ADMIN: 2,
  HQ_MANAGER: 3,
  STORE_MANAGER: 4,
  STORE_STAFF: 5,
};
