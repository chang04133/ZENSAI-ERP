import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { useUserStore } from '../../modules/user/user.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { userApi } from '../../modules/user/user.api';
import { ROLES, ROLE_LABELS, ROLE_LEVEL } from '../../../../shared/constants/roles';

export default function UserListPage() {
  const navigate = useNavigate();
  const { data: users, total, loading, fetchList: fetchUsers } = useUserStore();
  const user = useAuthStore((s) => s.user);
  const isStoreManager = user?.role === ROLES.STORE_MANAGER;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    fetchUsers(params);
  };

  useEffect(() => { load(); }, [page]);

  const handleDelete = async (id: string) => {
    try {
      await userApi.remove(id);
      message.success('사용자가 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '아이디', dataIndex: 'user_id', key: 'user_id' },
    { title: '이름', dataIndex: 'user_name', key: 'user_name' },
    { title: '직급', dataIndex: 'role_name', key: 'role_name',
      render: (v: string) => <Tag color="blue">{ROLE_LABELS[v] || v}</Tag>,
    },
    ...(!isStoreManager ? [
      { title: '소속매장', dataIndex: 'partner_name', key: 'partner_name', render: (v: string) => v || '-' },
    ] : []),
    { title: '상태', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
    },
    { title: '최종로그인', dataIndex: 'last_login', key: 'last_login',
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR') : '-',
    },
    {
      title: '관리', key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/users/${record.user_id}/edit`)}>수정</Button>
          {record.user_id !== user?.userId && (ROLE_LEVEL[record.role_name] || 99) > (ROLE_LEVEL[user?.role || ''] || 99) && (
            <Popconfirm title="정말 삭제하시겠습니까?" onConfirm={() => handleDelete(record.user_id)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={isStoreManager ? '직원 관리' : '사용자 관리'}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/users/new')}>{isStoreManager ? '직원 등록' : '사용자 등록'}</Button>}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          size="small"
          placeholder="아이디 또는 이름 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          style={{ width: 250 }}
        />
        <Button size="small" onClick={load}>조회</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="user_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
      />
    </div>
  );
}
