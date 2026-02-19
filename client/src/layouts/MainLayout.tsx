import { useState } from 'react';
import { Layout, Menu, Dropdown, Button, theme } from 'antd';
import {
  DashboardOutlined,
  ShopOutlined,
  TagsOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ToolOutlined,
  UploadOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileAddOutlined,
  SendOutlined,
  RollbackOutlined,
  SwapOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  EditOutlined,
  LineChartOutlined,
  CalendarOutlined,
  DollarOutlined,
  SkinOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { menuItems, MenuItem } from '../constants/menu';

const { Header, Sider, Content } = Layout;

const iconMap: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  ShopOutlined: <ShopOutlined />,
  TagsOutlined: <TagsOutlined />,
  SettingOutlined: <SettingOutlined />,
  UserOutlined: <UserOutlined />,
  ToolOutlined: <ToolOutlined />,
  UploadOutlined: <UploadOutlined />,
  DeleteOutlined: <DeleteOutlined />,
  ExportOutlined: <ExportOutlined />,
  FileAddOutlined: <FileAddOutlined />,
  SendOutlined: <SendOutlined />,
  RollbackOutlined: <RollbackOutlined />,
  SwapOutlined: <SwapOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  BarChartOutlined: <BarChartOutlined />,
  EditOutlined: <EditOutlined />,
  LineChartOutlined: <LineChartOutlined />,
  CalendarOutlined: <CalendarOutlined />,
  DollarOutlined: <DollarOutlined />,
  SkinOutlined: <SkinOutlined />,
};

function buildMenuItems(items: MenuItem[], role: string) {
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => {
      if (item.children) {
        const children = item.children
          .filter((child) => child.roles.includes(role))
          .map((child) => ({
            key: child.key,
            icon: iconMap[child.icon],
            label: child.label,
          }));
        return {
          key: item.key,
          icon: iconMap[item.icon],
          label: item.label,
          children,
        };
      }
      return {
        key: item.key,
        icon: iconMap[item.icon],
        label: item.label,
      };
    });
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const filteredMenu = user ? buildMenuItems(menuItems, user.role) : [];

  const pathParts = location.pathname.split('/').filter(Boolean);
  const selectedKey = pathParts.length >= 2 ? '/' + pathParts.slice(0, 2).join('/') : '/' + (pathParts[0] || '');
  const openKey = pathParts.length >= 2 ? '/' + pathParts[0] : '';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', onClick: handleLogout },
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
          defaultOpenKeys={[openKey]}
          items={filteredMenu}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />}>
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
