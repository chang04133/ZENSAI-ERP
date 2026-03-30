export interface CrmMenuItem {
  key: string;
  label: string;
  icon: string;
}

export const crmMenuItems: CrmMenuItem[] = [
  { key: '/crm', label: 'CRM 대시보드', icon: 'DashboardOutlined' },
  { key: '/crm/list', label: '고객 목록', icon: 'ContactsOutlined' },
  { key: '/crm/segments', label: '고객 세그먼트', icon: 'ApartmentOutlined' },
  { key: '/crm/dormant', label: '휴면 고객', icon: 'UserSwitchOutlined' },
  { key: '/crm/after-sales', label: 'A/S 관리', icon: 'ToolOutlined' },
  { key: '/crm/campaigns', label: '마케팅 캠페인', icon: 'SendOutlined' },
  { key: '/crm/templates', label: '메시지 템플릿', icon: 'FileTextOutlined' },
  { key: '/crm/sender-settings', label: '발송 설정', icon: 'SettingOutlined' },
  { key: '/crm/auto-campaigns', label: '자동 캠페인', icon: 'ClockCircleOutlined' },
  { key: '/crm/rfm', label: 'RFM 분석', icon: 'FundOutlined' },
];
