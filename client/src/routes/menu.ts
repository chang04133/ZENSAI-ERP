import { ROLES } from '../../../shared/constants/roles';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  roles: string[];
  children?: MenuItem[];
}

const ALL = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER, ROLES.STORE_STAFF];
const ALL_WITH_OS = [...ALL, ROLES.OUTSOURCE_DESIGNER];
const ADMIN_ONLY = [ROLES.ADMIN];
const ADMIN_SYS = [ROLES.ADMIN, ROLES.SYS_ADMIN];
const ADMIN_HQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER];
const ADMIN_HQ_STORE = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER];
const OUTSOURCE_ROLES = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.OUTSOURCE_DESIGNER];

export const menuItems: MenuItem[] = [
  { key: '/', label: '대시보드', icon: 'DashboardOutlined', roles: ALL_WITH_OS },
  { key: '/notices', label: '공지사항', icon: 'NotificationOutlined', roles: ALL },
  { key: '/barcode', label: '바코드 관리', icon: 'BarcodeOutlined', roles: ALL },
  {
    key: 'sub-products', label: '상품 관리', icon: 'TagsOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/products', label: '상품 목록', icon: 'UnorderedListOutlined', roles: ADMIN_HQ_STORE },
      { key: '/products/dead-stock', label: '악성재고', icon: 'WarningOutlined', roles: ADMIN_HQ },
      { key: '/products/event-price', label: '행사관리', icon: 'TagOutlined', roles: ADMIN_HQ },
    ],
  },
  {
    key: '/inventory', label: '재고관리', icon: 'InboxOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/inventory/status', label: '재고현황', icon: 'BarChartOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/store', label: '매장별 재고', icon: 'ShopOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/adjust', label: '재고조정', icon: 'EditOutlined', roles: ADMIN_HQ },
      { key: '/inventory/restock', label: '매장 재입고 추천', icon: 'ReloadOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/loss', label: '재고처리', icon: 'StopOutlined', roles: ADMIN_HQ },
      { key: '/inventory/transactions', label: '재고변동 내역', icon: 'FileSearchOutlined', roles: ADMIN_ONLY },
    ],
  },
  {
    key: 'sub-production', label: '생산기획', icon: 'ExperimentOutlined', roles: ADMIN_ONLY,
    children: [
      { key: '/production', label: '생산기획 대시보드', icon: 'DashboardOutlined', roles: ADMIN_ONLY },
      { key: '/production/plans', label: '생산계획 관리', icon: 'ScheduleOutlined', roles: ADMIN_ONLY },
      { key: '/production/materials', label: '생산라벨', icon: 'GoldOutlined', roles: ADMIN_ONLY },
      { key: '/production/payments', label: '생산정산', icon: 'DollarOutlined', roles: ADMIN_ONLY },
    ],
  },
  {
    key: 'sub-outsource', label: '외주관리', icon: 'ClusterOutlined', roles: OUTSOURCE_ROLES,
    children: [
      { key: '/outsource', label: '외주 대시보드', icon: 'DashboardOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/briefs', label: '브리프 관리', icon: 'FileTextOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/design-review', label: '디자인 심사', icon: 'PictureOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/work-orders', label: '작업지시서', icon: 'ToolOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/samples', label: '샘플/업체관리', icon: 'ExperimentOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/qc', label: '1차 QC 검수', icon: 'SafetyCertificateOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/final-select', label: '최종 셀렉', icon: 'CheckSquareOutlined', roles: OUTSOURCE_ROLES },
      { key: '/outsource/payments', label: '결제 관리', icon: 'DollarOutlined', roles: OUTSOURCE_ROLES },
    ],
  },
  {
    key: '/inbound', label: '입고관리', icon: 'ImportOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/inbound/dashboard', label: '종합입고관리', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inbound/register', label: '입고등록', icon: 'PlusCircleOutlined', roles: ADMIN_HQ },
      { key: '/inbound/view', label: '입고조회', icon: 'FileSearchOutlined', roles: ADMIN_HQ_STORE },
    ],
  },
  {
    key: '/shipment', label: '출고관리', icon: 'ExportOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/shipment/dashboard', label: '종합출고관리', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/request', label: '출고등록', icon: 'SendOutlined', roles: ADMIN_HQ },
      { key: '/shipment/return', label: '반품관리', icon: 'RollbackOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/transfer', label: '수평이동', icon: 'SwapOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/view', label: '출고조회', icon: 'FileSearchOutlined', roles: ADMIN_HQ_STORE },
    ],
  },
  {
    key: '/sales', label: '판매관리', icon: 'LineChartOutlined', roles: ALL,
    children: [
      { key: '/sales/dashboard', label: '종합매출현황', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/sales/entry', label: '매출관리', icon: 'PlusCircleOutlined', roles: ALL },
      { key: '/sales/returns', label: '고객반품관리', icon: 'RollbackOutlined', roles: ADMIN_HQ_STORE },
      { key: '/sales/preorders', label: '예약판매', icon: 'ClockCircleOutlined', roles: ADMIN_HQ },
    ],
  },

  {
    key: 'sub-md', label: 'MD 관리', icon: 'FundProjectionScreenOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/md/analytics', label: 'MD 분석', icon: 'LineChartOutlined', roles: ADMIN_HQ },
      { key: '/md/schedules', label: '마크다운 스케줄', icon: 'ScheduleOutlined', roles: ADMIN_HQ },
      { key: '/vmd', label: 'VMD 진열관리', icon: 'AppstoreOutlined', roles: ADMIN_HQ_STORE },
    ],
  },
  {
    key: 'sub-crm', label: '고객관리', icon: 'TeamOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/crm', label: '고객현황', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/crm/list', label: '전체 고객 관리', icon: 'UnorderedListOutlined', roles: ADMIN_ONLY },
    ],
  },
  {
    key: 'sub-fund', label: '자금관리', icon: 'FundOutlined', roles: ADMIN_ONLY,
    children: [
      { key: '/fund', label: '자금계획', icon: 'ScheduleOutlined', roles: ADMIN_ONLY },
      { key: '/fund/financial-statement', label: '재무제표', icon: 'FileTextOutlined', roles: ADMIN_ONLY },
    ],
  },
  { key: '/users', label: '직원 관리', icon: 'UserOutlined', roles: ADMIN_HQ_STORE },
  { key: '/store/activity-logs', label: '활동 로그', icon: 'FileSearchOutlined', roles: ADMIN_HQ_STORE },
  {
    key: 'sub-master', label: '마스터관리', icon: 'AppstoreOutlined', roles: ADMIN_HQ,
    children: [
      { key: '/partners', label: '거래처 관리', icon: 'ShopOutlined', roles: ADMIN_HQ },
      { key: '/codes', label: '코드 관리', icon: 'DatabaseOutlined', roles: ADMIN_SYS },
    ],
  },
  {
    key: '/system', label: '시스템관리', icon: 'ToolOutlined', roles: ADMIN_SYS,
    children: [
      { key: '/system/settings', label: '시스템 설정', icon: 'SettingOutlined', roles: ADMIN_SYS },
      { key: '/system/overview', label: '권한설정', icon: 'SafetyCertificateOutlined', roles: ADMIN_SYS },
      { key: '/system/activity-logs', label: '활동 로그', icon: 'FileSearchOutlined', roles: ADMIN_SYS },
      { key: '/system/docs', label: '시스템 문서', icon: 'ReadOutlined', roles: ADMIN_SYS },
      { key: '/system/test-report', label: '테스트 보고서', icon: 'ExperimentOutlined', roles: ADMIN_SYS },
    ],
  },
];
