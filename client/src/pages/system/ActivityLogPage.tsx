import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Select, Input, DatePicker, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { systemApi } from '../../modules/system/system.api';

const { RangePicker } = DatePicker;

interface ActivityLog {
  log_id: number;
  user_id: string;
  user_name: string;
  role: string;
  partner_code: string;
  method: string;
  path: string;
  status_code: number;
  summary: string;
  ip_address: string;
  created_at: string;
}

interface LogUser {
  user_id: string;
  user_name: string;
}

const METHOD_COLORS: Record<string, string> = {
  POST: 'green',
  PUT: 'blue',
  DELETE: 'red',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '관리자',
  SYS_ADMIN: '시스템관리자',
  HQ_MANAGER: '본사관리자',
  STORE_MANAGER: '매장관리자',
  STORE_STAFF: '매장직원',
};

const columns: ColumnsType<ActivityLog> = [
  {
    title: '시간', dataIndex: 'created_at', width: 150,
    render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
  },
  { title: '사용자ID', dataIndex: 'user_id', width: 110 },
  { title: '이름', dataIndex: 'user_name', width: 80 },
  {
    title: '역할', dataIndex: 'role', width: 100,
    render: (v: string) => ROLE_LABELS[v] || v,
  },
  { title: '거래처', dataIndex: 'partner_code', width: 90 },
  {
    title: '메소드', dataIndex: 'method', width: 80, align: 'center',
    render: (v: string) => <Tag color={METHOD_COLORS[v] || 'default'}>{v}</Tag>,
  },
  {
    title: '상태', dataIndex: 'status_code', width: 70, align: 'center',
    render: (v: number) => <Tag color={v < 400 ? 'green' : 'red'}>{v}</Tag>,
  },
  { title: '요약', dataIndex: 'summary', ellipsis: true },
  { title: '경로', dataIndex: 'path', width: 200, ellipsis: true },
  { title: 'IP', dataIndex: 'ip_address', width: 120 },
];

export default function ActivityLogPage() {
  const [data, setData] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<LogUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // filters
  const [userId, setUserId] = useState<string>();
  const [method, setMethod] = useState<string>();
  const [pathSearch, setPathSearch] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>();

  const load = useCallback(async (p?: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p || page), limit: '50' };
      if (userId) params.user_id = userId;
      if (method) params.method = method;
      if (pathSearch) params.path = pathSearch;
      if (dateRange?.[0]) params.start_date = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.end_date = dateRange[1].format('YYYY-MM-DD');

      const result = await systemApi.getActivityLogs(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, userId, method, pathSearch, dateRange]);

  useEffect(() => { systemApi.getActivityLogUsers().then(setUsers).catch(() => {}); }, []);
  useEffect(() => { setPage(1); load(1); }, [userId, method, pathSearch, dateRange]);
  useEffect(() => { load(); }, [page]);

  return (
    <div>
      <PageHeader title="활동 로그" />
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="사용자" style={{ width: 180 }}
          value={userId ?? ''} onChange={(v) => setUserId(v || undefined)}
          showSearch optionFilterProp="label"
          options={[
            { value: '', label: '전체' },
            ...users.map((u) => ({ value: u.user_id, label: `${u.user_name} (${u.user_id})` })),
          ]}
        />
        <Select
          placeholder="메소드" style={{ width: 120 }}
          value={method ?? ''} onChange={(v) => setMethod(v || undefined)}
          options={[
            { value: '', label: '전체' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'DELETE', label: 'DELETE' },
          ]}
        />
        <Input.Search
          placeholder="경로 검색" allowClear style={{ width: 200 }}
          onSearch={setPathSearch}
        />
        <RangePicker
          value={dateRange as any}
          onChange={(v) => setDateRange(v as any)}
        />
      </Space>
      <Table<ActivityLog>
        columns={columns} dataSource={data} rowKey="log_id" loading={loading}
        size="small" scroll={{ x: 1200, y: 'calc(100vh - 280px)' }}
        pagination={{
          current: page, pageSize: 50, total,
          showTotal: (t) => `총 ${t}건`,
          onChange: setPage,
        }}
      />
    </div>
  );
}
