import { useState } from 'react';
import { Layout, Menu, Dropdown, Button, theme } from 'antd';
import * as Icons from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import { crmMenuItems } from '../routes/crm-menu';

const { Header, Sider, Content } = Layout;

function getIcon(name: string): React.ReactNode {
  const IconComponent = (Icons as any)[name];
  return IconComponent ? <IconComponent /> : null;
}

export default function CrmLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const menuItemsAnt = crmMenuItems.map((item) => ({
    key: item.key,
    icon: getIcon(item.icon),
    label: item.label,
  }));

  // /crm/sender-settings, /crm/:id 등 경로도 선택되게
  const knownPaths = ['segments', 'dormant', 'after-sales', 'campaigns', 'templates', 'sender-settings', 'list'];
  const pathParts = location.pathname.split('/').filter(Boolean);
  const candidateKeys = crmMenuItems.map((m) => m.key);
  const isCustomerDetail = pathParts.length === 2 && pathParts[0] === 'crm' && !knownPaths.includes(pathParts[1]);
  const selectedKey = isCustomerDetail
    ? '/crm/list'
    : (candidateKeys.find((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
      || (pathParts.length >= 2 ? '/' + pathParts.slice(0, 2).join('/') : '/crm'));

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
        <div className="logo" style={{ background: 'rgba(99,102,241,0.15)' }}>
          {collapsed ? 'CRM' : '고객관리'}
        </div>
        <div style={{ padding: collapsed ? '8px 4px' : '8px 12px' }}>
          <Button
            type="text"
            block
            size="small"
            icon={getIcon('ArrowLeftOutlined')}
            style={{ color: 'rgba(255,255,255,0.65)', textAlign: 'left', fontSize: 12 }}
            onClick={() => navigate('/')}
          >
            {!collapsed && 'ERP 메인'}
          </Button>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItemsAnt}
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
