import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Table, Switch, Button, Space, message, Spin, Tag, Typography } from 'antd';
import { SaveOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';
import { menuItems, MenuItem } from '../../routes/menu';
import { useAuthStore } from '../../modules/auth/auth.store';

const { Text } = Typography;

interface RoleGroup {
  group_id: number;
  group_name: string;
  description: string;
  permissions: Record<string, boolean>;
}

interface FlatMenu {
  key: string;
  label: string;
  depth: number;
  isParent: boolean;
}

/** menuItems를 flat 리스트로 변환 */
function flattenMenu(items: MenuItem[], depth = 0): FlatMenu[] {
  const result: FlatMenu[] = [];
  for (const item of items) {
    const isParent = !!item.children;
    result.push({ key: item.key, label: item.label, depth, isParent });
    if (item.children) {
      result.push(...flattenMenu(item.children, depth + 1));
    }
  }
  return result;
}

/** 현재 하드코딩된 roles 기반으로 기본 permissions 생성 */
function buildDefaultPermissions(items: MenuItem[]): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  function walk(menuList: MenuItem[]) {
    for (const item of menuList) {
      for (const role of item.roles) {
        if (!result[role]) result[role] = {};
        result[role][item.key] = true;
      }
      if (item.children) walk(item.children);
    }
  }
  walk(items);
  return result;
}

export default function SystemOverviewPage() {
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([]);
  const [editPerms, setEditPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const flatMenu = useMemo(() => flattenMenu(menuItems), []);
  const defaults = useMemo(() => buildDefaultPermissions(menuItems), []);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/system/permissions');
      const json = await res.json();
      if (json.success) {
        const groups: RoleGroup[] = json.data;
        setRoleGroups(groups);

        // DB permissions → 토글 형식 변환
        const perms: Record<string, Record<string, boolean>> = {};
        for (const g of groups) {
          const dbPerms = g.permissions || {};
          const keys = Object.keys(dbPerms);
          // 토글 형식 검증: 키가 '/'로 시작하고 값이 boolean이면 정상 형식
          const isToggleFormat = keys.length > 0 && keys.some(k => k.startsWith('/') && typeof dbPerms[k] === 'boolean');
          if (isToggleFormat) {
            perms[g.group_name] = { ...dbPerms };
          } else {
            // 시드 형식이거나 빈 경우 → menu.ts 기본값 사용
            perms[g.group_name] = {};
            for (const fm of flatMenu) {
              perms[g.group_name][fm.key] = !!(defaults[g.group_name]?.[fm.key]);
            }
          }
        }
        setEditPerms(perms);
        setDirty(false);
      }
    } catch (e: any) {
      message.error('권한 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [flatMenu, defaults]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const handleToggle = (roleName: string, menuKey: string, checked: boolean) => {
    setEditPerms(prev => ({
      ...prev,
      [roleName]: { ...prev[roleName], [menuKey]: checked },
    }));
    setDirty(true);
  };

  /** 부모 토글 시 하위 항목 일괄 변경 */
  const handleParentToggle = (roleName: string, parentKey: string, checked: boolean) => {
    const parent = menuItems.find(m => m.key === parentKey);
    if (!parent?.children) {
      handleToggle(roleName, parentKey, checked);
      return;
    }
    setEditPerms(prev => {
      const updated = { ...prev[roleName], [parentKey]: checked };
      for (const child of parent.children!) {
        updated[child.key] = checked;
      }
      return { ...prev, [roleName]: updated };
    });
    setDirty(true);
  };

  const loadPermissions_auth = useAuthStore((s) => s.loadPermissions);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/system/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: editPerms }),
      });
      const json = await res.json();
      if (json.success) {
        message.success('권한이 저장되었습니다.');
        setDirty(false);
        // 저장 후 자기 자신의 권한도 즉시 다시 로드
        await loadPermissions_auth();
      } else {
        message.error(json.error || '저장 실패');
      }
    } catch (e: any) {
      message.error('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 역할 컬럼 (ADMIN 제외한 편집 가능 역할)
  const roleColumns = roleGroups
    .filter(g => g.group_name !== 'ADMIN')
    .sort((a, b) => a.group_id - b.group_id);

  const columns = [
    {
      title: '메뉴',
      dataIndex: 'label',
      width: 220,
      fixed: 'left' as const,
      render: (_: any, record: FlatMenu) => (
        <span style={{ paddingLeft: record.depth * 20, fontWeight: record.isParent ? 600 : 400 }}>
          {record.isParent ? '📁 ' : '　 '}{record.label}
        </span>
      ),
    },
    {
      title: <Tag color="#fa541c">ADMIN</Tag>,
      width: 100,
      align: 'center' as const,
      render: () => <Switch checked disabled size="small" />,
    },
    ...roleColumns.map(rg => ({
      title: <Tag color={
        rg.group_name === 'HQ_MANAGER' ? '#fa8c16' :
        rg.group_name === 'STORE_MANAGER' ? '#1677ff' :
        rg.group_name === 'STORE_STAFF' ? '#52c41a' : '#595959'
      }>{rg.description || rg.group_name}</Tag>,
      width: 110,
      align: 'center' as const,
      render: (_: any, record: FlatMenu) => {
        const checked = editPerms[rg.group_name]?.[record.key] ?? false;
        return (
          <Switch
            size="small"
            checked={checked}
            onChange={(v) => record.isParent
              ? handleParentToggle(rg.group_name, record.key, v)
              : handleToggle(rg.group_name, record.key, v)
            }
          />
        );
      },
    })),
  ];

  return (
    <div>
      <PageHeader
        title="권한설정"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadPermissions} loading={loading}>새로고침</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              disabled={!dirty}
            >
              저장
            </Button>
          </Space>
        }
      />

      <Card
        size="small"
        title={<><SafetyCertificateOutlined /> 역할별 메뉴 접근 권한</>}
        extra={dirty && <Text type="warning">변경사항이 있습니다</Text>}
      >
        <Spin spinning={loading}>
          <Table
            dataSource={flatMenu}
            columns={columns}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 700 }}
            rowClassName={(record) => record.isParent ? 'permission-parent-row' : ''}
          />
        </Spin>
      </Card>

      <style>{`
        .permission-parent-row { background: #fafafa; }
        .permission-parent-row:hover > td { background: #f0f0f0 !important; }
      `}</style>
    </div>
  );
}
