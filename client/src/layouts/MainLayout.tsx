import { useState } from 'react';
import { Layout, Menu, Dropdown, Button, theme } from 'antd';
import * as Icons from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import { menuItems, MenuItem } from '../routes/menu';

const { Header, Sider, Content } = Layout;

/** Dynamically resolve icon by name string */
function getIcon(name: string): React.ReactNode {
  const IconComponent = (Icons as any)[name];
  return IconComponent ? <IconComponent /> : null;
}

function buildMenuItems(
  items: MenuItem[],
  role: string,
  hasPermission: (key: string) => boolean,
): any[] {
  return items
    .filter((item) => {
      // 기본 역할 체크 (하드코딩 fallback)
      if (!item.roles.includes(role)) return false;
      // DB 권한 체크
      if (item.children) {
        // 부모: 자식 중 하나라도 권한 있으면 표시
        return item.children.some(c => c.roles.includes(role) && hasPermission(c.key));
      }
      return hasPermission(item.key);
    })
    .map((item) => {
      if (item.children) {
        const children = item.children
          .filter(c => c.roles.includes(role) && hasPermission(c.key))
          .map(c => ({ key: c.key, icon: getIcon(c.icon), label: c.label }));
        if (children.length === 0) {
          return { key: item.key, icon: getIcon(item.icon), label: item.label };
        }
        return { key: item.key, icon: getIcon(item.icon), label: item.label, children };
      }
      return { key: item.key, icon: getIcon(item.icon), label: item.label };
    })
    .filter(Boolean);
}

/** 현재 선택된 메뉴의 모든 상위 키를 찾아 defaultOpenKeys로 사용 */
function findOpenKeys(items: MenuItem[], targetKey: string, parents: string[] = []): string[] | null {
  for (const item of items) {
    if (item.key === targetKey) return parents;
    if (item.children) {
      const result = findOpenKeys(item.children, targetKey, [...parents, item.key]);
      if (result !== null) return result;
    }
  }
  return null;
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission } = useAuthStore();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const filteredMenu = user ? buildMenuItems(menuItems, user.role, hasPermission) : [];

  const pathParts = location.pathname.split('/').filter(Boolean);
  const selectedKey = pathParts.length >= 2
    ? '/' + pathParts.slice(0, 2).join('/')
    : '/' + (pathParts[0] || '');
  const defaultOpen = findOpenKeys(menuItems, selectedKey) || (() => {
    if (pathParts.length < 2) return [];
    const prefix = '/' + pathParts[0];
    const parent = menuItems.find(m => m.children?.some(c => c.key.startsWith(prefix)));
    return parent ? [parent.key] : [prefix];
  })();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userMenu = {
    items: [
      { key: 'profile', icon: getIcon('EditOutlined'), label: '내 정보 수정', onClick: () => navigate('/my-profile') },
      { type: 'divider' as const },
      { key: 'logout', icon: getIcon('LogoutOutlined'), label: '로그아웃', onClick: handleLogout },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg">
        <div className="logo">
          {collapsed ? 'ZS' : 'ZENSAI ERP'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpen}
          items={filteredMenu}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            type="text"
            icon={collapsed ? getIcon('MenuUnfoldOutlined') : getIcon('MenuFoldOutlined')}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" icon={getIcon('UserOutlined')}>
              {user?.userName}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: colorBgContainer, borderRadius: borderRadiusLG }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
