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
const STORE_ALL = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER, ROLES.STORE_STAFF];
const STORE_ONLY = [ROLES.STORE_MANAGER, ROLES.STORE_STAFF];

export const menuItems: MenuItem[] = [
  { key: '/', label: '대시보드', icon: 'DashboardOutlined', roles: ALL },
  { key: '/barcode', label: '바코드 관리', icon: 'BarcodeOutlined', roles: STORE_ONLY },
  { key: '/codes', label: '마스터관리', icon: 'AppstoreOutlined', roles: ADMIN_HQ },
  { key: '/partners', label: '거래처 관리', icon: 'ShopOutlined', roles: ADMIN_HQ },
  { key: '/products', label: '상품 관리', icon: 'TagsOutlined', roles: ADMIN_HQ },
  { key: '/products/events', label: '행사 상품', icon: 'FireOutlined', roles: ADMIN_HQ_STORE },
  {
    key: '/inventory', label: '재고관리', icon: 'InboxOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/inventory/status', label: '재고현황', icon: 'BarChartOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/my-store', label: '내 매장 재고', icon: 'ShopOutlined', roles: ADMIN_HQ_STORE },
      { key: '/inventory/store', label: '매장별 재고', icon: 'ShopOutlined', roles: ADMIN_HQ },
      { key: '/inventory/adjust', label: '재고조정', icon: 'EditOutlined', roles: ADMIN_HQ },
      { key: '/inventory/restock', label: '재입고 관리', icon: 'PlusSquareOutlined', roles: ADMIN_HQ },
      { key: '/inventory/restock-progress', label: '재입고 진행', icon: 'ClockCircleOutlined', roles: ADMIN_HQ },
    ],
  },
  {
    key: '/shipment', label: '출고관리', icon: 'ExportOutlined', roles: ADMIN_HQ_STORE,
    children: [
      { key: '/shipment/request', label: '의뢰등록', icon: 'FileAddOutlined', roles: ADMIN_HQ },
      { key: '/shipment/process', label: '출고처리', icon: 'SendOutlined', roles: ADMIN_HQ },
      { key: '/shipment/store', label: '출고관리', icon: 'ExportOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/return', label: '반품등록', icon: 'RollbackOutlined', roles: ADMIN_HQ_STORE },
      { key: '/shipment/transfer', label: '수평이동', icon: 'SwapOutlined', roles: ADMIN_HQ_STORE },
    ],
  },
  {
    key: '/sales', label: '판매관리', icon: 'LineChartOutlined', roles: STORE_ALL,
    children: [
      { key: '/sales/dashboard', label: '매출현황', icon: 'DashboardOutlined', roles: ADMIN_HQ },
      { key: '/sales/entry', label: '매출등록', icon: 'PlusCircleOutlined', roles: STORE_ALL },
      { key: '/sales/product-sales', label: '아이템별 매출', icon: 'BarChartOutlined', roles: STORE_ALL },

      { key: '/sales/partner-sales', label: '거래처별 매출', icon: 'ShopOutlined', roles: ADMIN_HQ },
      { key: '/sales/analytics', label: '판매분석', icon: 'LineChartOutlined', roles: STORE_ALL },
      { key: '/sales/sell-through', label: '판매율 분석', icon: 'PercentageOutlined', roles: STORE_ALL },
    ],
  },
  {
    key: '/production', label: '생산기획', icon: 'ExperimentOutlined', roles: ADMIN_HQ,
    children: [
      { key: '/production', label: '생산기획 대시보드', icon: 'DashboardOutlined', roles: ADMIN_HQ },
      { key: '/production/plans', label: '생산계획 관리', icon: 'ScheduleOutlined', roles: ADMIN_HQ },
      { key: '/production/progress', label: '생산진행 현황', icon: 'SyncOutlined', roles: ADMIN_HQ },
      { key: '/production/materials', label: '원단/자재 관리', icon: 'GoldOutlined', roles: ADMIN_HQ },
    ],
  },
  { key: '/fund', label: '자금계획', icon: 'FundOutlined', roles: ADMIN_ONLY },
  { key: '/users', label: '직원 관리', icon: 'UserOutlined', roles: ADMIN_HQ_STORE },
  {
    key: '/system', label: '시스템관리', icon: 'ToolOutlined', roles: ADMIN_SYS,
    children: [
      { key: '/system/settings', label: '시스템 설정', icon: 'SettingOutlined', roles: ADMIN_SYS },
      { key: '/system/data-upload', label: '데이터 올리기', icon: 'UploadOutlined', roles: ADMIN_SYS },
      { key: '/system/deleted-data', label: '삭제데이터 조회', icon: 'DeleteOutlined', roles: ADMIN_SYS },
    ],
  },
];
