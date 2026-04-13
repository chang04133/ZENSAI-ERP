import { useEffect } from 'react';
import { Layout, Menu, Dropdown, Button, Tabs, theme } from 'antd';
import * as Icons from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import { menuItems, MenuItem } from '../routes/menu';
import { useTabStore, findMenuLabel } from '../stores/tab.store';
import { ROLES } from '../../../shared/constants/roles';

const { Header, Sider, Content } = Layout;

/** Dynamically resolve icon by name string */
function getIcon(name: string): React.ReactNode {
  const IconComponent = (Icons as any)[name];
  return IconComponent ? <IconComponent /> : null;
}

const HQ_ROLES: string[] = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER];

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
      // 본사 계정: "고객관리" → "고객 데이터"
      const label = item.key === '/crm' && HQ_ROLES.includes(role) ? '고객 데이터' : item.label;
      if (item.children) {
        const children = item.children
          .filter(c => c.roles.includes(role) && hasPermission(c.key))
          .map(c => ({ key: c.key, icon: getIcon(c.icon), label: c.label }));
        if (children.length === 0) {
          return { key: item.key, icon: getIcon(item.icon), label };
        }
        return { key: item.key, icon: getIcon(item.icon), label, children };
      }
      return { key: item.key, icon: getIcon(item.icon), label };
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
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission } = useAuthStore();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const { tabs, addTab, removeTab } = useTabStore();

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

  // 현재 URL에 매칭되는 탭 키 계산
  const activeTabKey = (() => {
    // 정확 매칭
    if (tabs.some(t => t.key === selectedKey)) return selectedKey;
    // 경로 prefix 매칭 (하위 페이지)
    const match = [...tabs].reverse().find(t => t.key !== '/' && selectedKey.startsWith(t.key));
    if (match) return match.key;
    return '/';
  })();

  // 페이지 직접 접근 시 해당 탭 자동 추가
  useEffect(() => {
    if (selectedKey && !tabs.some(t => t.key === selectedKey)) {
      const label = findMenuLabel(menuItems, selectedKey);
      if (label) {
        addTab({ key: selectedKey, label });
      }
    }
  }, [selectedKey]);

  // 메뉴 클릭 → 탭 추가 + 네비게이션
  const handleMenuClick = ({ key }: { key: string }) => {
    const label = findMenuLabel(menuItems, key) || key;
    addTab({ key, label });
    navigate(key);
  };

  // 탭 클릭 → 네비게이션
  const handleTabChange = (activeKey: string) => {
    navigate(activeKey);
  };

  // 탭 닫기
  const handleTabEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove',
  ) => {
    if (action === 'remove' && typeof targetKey === 'string') {
      const isActive = targetKey === activeTabKey;
      const nextKey = removeTab(targetKey);
      if (isActive) {
        navigate(nextKey);
      }
    }
  };

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
      <Sider trigger={null} breakpoint="lg">
        <div className="logo">ZENSAI ERP</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpen}
          items={filteredMenu}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ marginRight: 12, fontSize: 13 }}>
            <span style={{ color: '#888' }}>소속</span>{' '}
            <span style={{ color: '#1677ff', fontWeight: 600 }}>{user?.partnerName || '본사'}</span>
          </span>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" icon={getIcon('UserOutlined')}>
              {user?.userName}
            </Button>
          </Dropdown>
        </Header>
        <Tabs
          type="editable-card"
          hideAdd
          activeKey={activeTabKey}
          onChange={handleTabChange}
          onEdit={handleTabEdit}
          className="main-tabs"
          items={tabs.map((t) => ({
            key: t.key,
            label: t.label,
            closable: t.key !== '/',
          }))}
          style={{ margin: '0 16px', marginBottom: 0 }}
        />
        <Content style={{ margin: '0 24px 24px', padding: 24, background: colorBgContainer, borderRadius: borderRadiusLG }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
