export interface CrmMenuItem {
  key: string;
  label: string;
  icon: string;
  roles?: string[];  // undefined = 모든 CRM 접근 역할에 표시
}

export const crmMenuItems: CrmMenuItem[] = [
  { key: '/crm', label: 'CRM 대시보드', icon: 'DashboardOutlined' },
  { key: '/crm/list', label: '고객 목록', icon: 'ContactsOutlined' },
  { key: '/crm/dormant', label: '휴면 고객', icon: 'UserSwitchOutlined' },
  { key: '/crm/after-sales', label: 'A/S 관리', icon: 'ToolOutlined' },
  { key: '/crm/campaigns', label: '마케팅 캠페인', icon: 'SendOutlined' },
  { key: '/crm/templates', label: '메시지 템플릿', icon: 'FileTextOutlined' },
  { key: '/crm/sender-settings', label: '발송 설정', icon: 'SettingOutlined' },
  { key: '/crm/coupons', label: '쿠폰 관리', icon: 'GiftOutlined' },
  { key: '/crm/tier-benefits', label: '등급 혜택', icon: 'CrownOutlined' },
  { key: '/crm/auto-campaigns', label: '자동 캠페인', icon: 'ClockCircleOutlined' },
  { key: '/crm/consent-logs', label: '동의 로그', icon: 'AuditOutlined', roles: ['ADMIN', 'SYS_ADMIN'] },
];
