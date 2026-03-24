import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Input, Alert, Space, message, Popconfirm } from 'antd';
import { SearchOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { crmApi } from '../../modules/crm/crm.api';

const TIER_COLORS: Record<string, string> = {
  VVIP: 'gold',
  VIP: 'purple',
  '일반': 'blue',
  '신규': 'green',
};

export default function DormantCustomerPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dormantMonths, setDormantMonths] = useState(0);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmApi.getDormantCustomers({
        page: String(page),
        limit: '50',
        search,
      });
      setData(res.data);
      setTotal(res.total);
      setDormantMonths(res.dormantMonths);
    } catch {
      message.error('휴면 고객 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReactivate = async (customerId: number) => {
    try {
      await crmApi.reactivateCustomer(customerId);
      message.success('고객이 재활성화되었습니다.');
      fetchData();
    } catch {
      message.error('재활성화에 실패했습니다.');
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const columns = [
    {
      title: '이름',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (name: string, record: any) => (
        <a onClick={() => navigate(`/crm/${record.customer_id}`)}>{name}</a>
      ),
    },
    {
      title: '전화번호',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '등급',
      dataIndex: 'customer_tier',
      key: 'customer_tier',
      render: (tier: string) => (
        <Tag color={TIER_COLORS[tier] || 'default'}>{tier}</Tag>
      ),
    },
    {
      title: '매장',
      dataIndex: 'partner_name',
      key: 'partner_name',
    },
    {
      title: '최근 구매일',
      dataIndex: 'last_purchase_date',
      key: 'last_purchase_date',
      render: (date: string | null) =>
        date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '미구매 기간',
      dataIndex: 'days_since_purchase',
      key: 'days_since_purchase',
      render: (days: number | null) => {
        if (days == null) return '-';
        return (
          <span style={days > 365 ? { color: '#ff4d4f', fontWeight: 'bold' } : undefined}>
            {days}일
          </span>
        );
      },
    },
    {
      title: '재활성화',
      key: 'action',
      render: (_: any, record: any) => (
        <Popconfirm
          title="이 고객을 재활성화하시겠습니까?"
          onConfirm={() => handleReactivate(record.customer_id)}
          okText="확인"
          cancelText="취소"
        >
          <Button
            type="link"
            icon={<UserSwitchOutlined />}
            size="small"
          >
            재활성화
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <h2>휴면 고객 관리</h2>
      {dormantMonths > 0 && (
        <Alert
          type="info"
          showIcon
          message={`최근 ${dormantMonths}개월 동안 구매 이력이 없는 고객입니다.`}
          style={{ marginBottom: 16 }}
        />
      )}
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="이름, 전화번호 검색"
          allowClear
          enterButton={<SearchOutlined />}
          onSearch={handleSearch}
          style={{ width: 300 }}
        />
      </Space>
      <Table
        rowKey="customer_id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
      />
    </div>
  );
}
