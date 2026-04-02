import { ROLES } from '../../../shared/constants/roles';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  roles: string[];
  children?: MenuItem[];
}

const ALL = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER, ROLES.STORE_STAFF];
const ADMIN_ONLY = [ROLES.ADMIN];
const ADMIN_SYS = [ROLES.ADMIN, ROLES.SYS_ADMIN];
const ADMIN_HQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER];
const ADMIN_HQ_STORE = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER];

export const menuItems: MenuItem[] = [
  { key: '/', label: '대시보드', icon: 'DashboardOutlined', roles: ALL },
  { key: '/notices', label: '공지사항', icon: 'NotificationOutlined', roles: ALL },
  { key: '/barcode', label: '바코드 관리', icon: 'BarcodeOutlined', roles: ALL },
  {
    key: 'sub-products', label: '상품 관리', icon: 'TagsOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/products', label: '상품 목록', icon: 'UnorderedListOutlined', roles: ADMIN_HQ_STORE },
      { key: '/products/dead-stock', label: '악성재고', icon: 'WarningOutlined', roles: ADMIN_HQ_STORE },
      { key: '/products/event-price', label: '행사관리', icon: 'TagOutlined', roles: ADMIN_HQ },
      { key: '/seasons', label: '시즌관리', icon: 'CalendarOutlined', roles: ADMIN_HQ },
      { key: '/markdown', label: '마크다운 관리', icon: 'FallOutlined', roles: ADMIN_HQ },
    ],
  },
  {
    key: '/inventory', label: '재고관리', icon: 'InboxOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/inventory/status', label: '재고현황', icon: 'BarChartOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/store', label: '매장별 재고', icon: 'ShopOutlined', roles: ADMIN_HQ },
      { key: '/inventory/adjust', label: '재고조정', icon: 'EditOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/restock', label: '재입고 추천', icon: 'ReloadOutlined', roles: ADMIN_HQ },
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
    key: '/inbound', label: '입고관리', icon: 'ImportOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/inbound/dashboard', label: '종합입고관리', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inbound/register', label: '입고등록', icon: 'PlusCircleOutlined', roles: ADMIN_HQ },
      { key: '/inbound/view', label: '입고조회', icon: 'FileSearchOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/store-request', label: '매장입고 요청', icon: 'ShoppingCartOutlined', roles: [ROLES.STORE_MANAGER] },
    ],
  },
  {
    key: '/shipment', label: '출고관리', icon: 'ExportOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/shipment/dashboard', label: '종합출고관리', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/request', label: '출고등록', icon: 'SendOutlined', roles: ADMIN_HQ },
      { key: '/shipment/return', label: '반품관리', icon: 'RollbackOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/transfer', label: '수평이동', icon: 'SwapOutlined', roles: [ROLES.STORE_MANAGER] },
      { key: '/shipment/view', label: '출고조회', icon: 'FileSearchOutlined', roles: ADMIN_HQ_STORE },
    ],
  },
  {
    key: '/sales', label: '판매관리', icon: 'LineChartOutlined', roles: ALL,
    children: [
      { key: '/sales/dashboard', label: '종합매출현황', icon: 'DashboardOutlined', roles: ADMIN_HQ_STORE },
      { key: '/sales/analytics', label: '판매분석', icon: 'PieChartOutlined', roles: ADMIN_HQ_STORE },
      { key: '/sales/sell-through', label: '판매율 분석', icon: 'RiseOutlined', roles: ADMIN_HQ_STORE },
      { key: '/sales/entry', label: '매출등록', icon: 'PlusCircleOutlined', roles: ALL },
      { key: '/sales/product-sales', label: '아이템별 매출', icon: 'BarChartOutlined', roles: ALL },
    ],
  },

  { key: '/crm', label: '고객관리', icon: 'TeamOutlined', roles: ADMIN_HQ_STORE },
  {
    key: 'sub-fund', label: '자금관리', icon: 'FundOutlined', roles: ADMIN_ONLY,
    children: [
      { key: '/fund', label: '자금계획', icon: 'ScheduleOutlined', roles: ADMIN_ONLY },
      { key: '/fund/financial-statement', label: '재무제표', icon: 'FileTextOutlined', roles: ADMIN_ONLY },
    ],
  },
  { key: '/users', label: '직원 관리', icon: 'UserOutlined', roles: ADMIN_HQ_STORE },
  {
    key: 'sub-master', label: '마스터관리', icon: 'AppstoreOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/partners', label: '거래처 관리', icon: 'ShopOutlined', roles: ADMIN_HQ_STORE },
      { key: '/codes', label: '코드 관리', icon: 'DatabaseOutlined', roles: ADMIN_SYS },
    ],
  },
  {
    key: '/system', label: '시스템관리', icon: 'ToolOutlined', roles: ADMIN_SYS,
    children: [
      { key: '/system/settings', label: '시스템 설정', icon: 'SettingOutlined', roles: ADMIN_SYS },
      { key: '/system/deleted-data', label: '삭제데이터 조회', icon: 'DeleteOutlined', roles: ADMIN_SYS },
      { key: '/system/overview', label: '권한설정', icon: 'SafetyCertificateOutlined', roles: ADMIN_SYS },
      { key: '/system/activity-logs', label: '활동 로그', icon: 'FileSearchOutlined', roles: ADMIN_SYS },
    ],
  },
];
