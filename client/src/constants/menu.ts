import { ROLES } from './roles';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  roles: string[];
  children?: MenuItem[];
}

export const menuItems: MenuItem[] = [
  {
    key: '/',
    label: '대시보드',
    icon: 'DashboardOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER, ROLES.STORE_STAFF],
  },
  {
    key: '/partners',
    label: '거래처 관리',
    icon: 'ShopOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
  },
  {
    key: '/products',
    label: '상품 관리',
    icon: 'TagsOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER, ROLES.STORE_STAFF],
  },
  {
    key: '/shipment',
    label: '출고관리',
    icon: 'ExportOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
    children: [
      {
        key: '/shipment/request',
        label: '의뢰등록',
        icon: 'FileAddOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
      {
        key: '/shipment/process',
        label: '출고처리',
        icon: 'SendOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
      {
        key: '/shipment/return',
        label: '반품처리',
        icon: 'RollbackOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
      {
        key: '/shipment/transfer',
        label: '수평이동',
        icon: 'SwapOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
    ],
  },
  {
    key: '/inventory',
    label: '재고관리',
    icon: 'DatabaseOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
    children: [
      {
        key: '/inventory/status',
        label: '재고현황',
        icon: 'BarChartOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
      {
        key: '/inventory/adjust',
        label: '재고조정',
        icon: 'EditOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER],
      },
    ],
  },
  {
    key: '/sales',
    label: '판매분석',
    icon: 'LineChartOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
    children: [
      {
        key: '/sales/monthly-sales',
        label: '월별판매현황',
        icon: 'CalendarOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
      {
        key: '/sales/monthly-revenue',
        label: '월별매출현황',
        icon: 'DollarOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
      {
        key: '/sales/weekly-style',
        label: '주간스타일판매',
        icon: 'SkinOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER],
      },
    ],
  },
  {
    key: '/codes',
    label: '코드관리',
    icon: 'SettingOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER],
  },
  {
    key: '/users',
    label: '사용자 관리',
    icon: 'UserOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER],
  },
  {
    key: '/system',
    label: '시스템관리',
    icon: 'ToolOutlined',
    roles: [ROLES.ADMIN, ROLES.HQ_MANAGER],
    children: [
      {
        key: '/system/data-upload',
        label: '데이터 올리기',
        icon: 'UploadOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER],
      },
      {
        key: '/system/deleted-data',
        label: '삭제데이터 조회',
        icon: 'DeleteOutlined',
        roles: [ROLES.ADMIN, ROLES.HQ_MANAGER],
      },
    ],
  },
];
