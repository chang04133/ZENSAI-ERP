import { ROLES } from './roles';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  roles: string[];
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
];
