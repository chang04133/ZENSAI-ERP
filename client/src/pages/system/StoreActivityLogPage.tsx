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
  method: string;
  status_code: number;
  summary: string;
  created_at: string;
}

const METHOD_COLORS: Record<string, string> = {
  POST: 'green',
  PUT: 'blue',
  DELETE: 'red',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '관리자',
  HQ_MANAGER: '본사관리자',
  STORE_MANAGER: '매장관리자',
  STORE_STAFF: '매장직원',
};

const columns: ColumnsType<ActivityLog> = [
  {
    title: '시간', dataIndex: 'created_at', width: 150,
    render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
  },
  { title: '직원명', dataIndex: 'user_name', width: 80 },
  {
    title: '역할', dataIndex: 'role', width: 100,
    render: (v: string) => ROLE_LABELS[v] || v,
  },
  {
    title: '유형', dataIndex: 'method', width: 80, align: 'center',
    render: (v: string) => <Tag color={METHOD_COLORS[v] || 'default'}>{v}</Tag>,
  },
  {
    title: '상태', dataIndex: 'status_code', width: 70, align: 'center',
    render: (v: number) => <Tag color={v < 400 ? 'green' : 'red'}>{v}</Tag>,
  },
  { title: '요약', dataIndex: 'summary', ellipsis: true },
];

export default function StoreActivityLogPage() {
  const [data, setData] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [method, setMethod] = useState<string>();
  const [summarySearch, setSummarySearch] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>();

  const load = useCallback(async (p?: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p || page), limit: '50' };
      if (method) params.method = method;
      if (summarySearch) params.summary = summarySearch;
      if (dateRange?.[0]) params.start_date = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.end_date = dateRange[1].format('YYYY-MM-DD');

      const result = await systemApi.getStoreActivityLogs(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, method, summarySearch, dateRange]);

  useEffect(() => { setPage(1); load(1); }, [method, summarySearch, dateRange]);
  useEffect(() => { load(); }, [page]);

  return (
    <div>
      <PageHeader title="매장 활동 로그" />
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="유형" style={{ width: 120 }}
          value={method ?? ''} onChange={(v) => setMethod(v || undefined)}
          options={[
            { value: '', label: '전체' },
            { value: 'POST', label: '등록 (POST)' },
            { value: 'PUT', label: '수정 (PUT)' },
            { value: 'DELETE', label: '삭제 (DELETE)' },
          ]}
        />
        <Input.Search
          placeholder="요약 검색" allowClear style={{ width: 200 }}
          onSearch={setSummarySearch}
        />
        <RangePicker
          value={dateRange as any}
          onChange={(v) => setDateRange(v as any)}
        />
      </Space>
      <Table<ActivityLog>
        columns={columns} dataSource={data} rowKey="log_id" loading={loading}
        size="small" scroll={{ x: 800, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, pageSize: 50, total,
          showTotal: (t) => `총 ${t}건`,
          onChange: setPage,
        }}
      />
    </div>
  );
}
