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

function buildMenuItems(items: MenuItem[], role: string): any[] {
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => {
      if (item.children) {
        const children = buildMenuItems(item.children, role);
        if (children.length === 0) return null;
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
  const { user, logout } = useAuthStore();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const filteredMenu = user ? buildMenuItems(menuItems, user.role) : [];

  const pathParts = location.pathname.split('/').filter(Boolean);
  const selectedKey = pathParts.length >= 2
    ? '/' + pathParts.slice(0, 2).join('/')
    : '/' + (pathParts[0] || '');
  const defaultOpen = findOpenKeys(menuItems, selectedKey) || (pathParts.length >= 2 ? ['/' + pathParts[0]] : []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userMenu = {
    items: [
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
