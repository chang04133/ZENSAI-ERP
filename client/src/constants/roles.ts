export const ROLES = {
  ADMIN: 'ADMIN',
  HQ_MANAGER: 'HQ_MANAGER',
  STORE_MANAGER: 'STORE_MANAGER',
  STORE_STAFF: 'STORE_STAFF',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: '시스템 관리자',
  HQ_MANAGER: '본사 관리자',
  STORE_MANAGER: '매장 관리자',
  STORE_STAFF: '매장 직원',
};
