import { useEffect, useState } from 'react';
import { Table, Button, Select, Space, Tag, Input, DatePicker, message } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { STATUS_COLORS, STATUS_LABELS } from '../../components/shipment/ShipmentConstants';
import ShipmentDetailModal from '../../components/shipment/ShipmentDetailModal';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

export default function ShipmentViewPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (user?.partnerCode) params.partner = user.partnerCode;
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => { setPage(1); load(1); }, [statusFilter]);
  useEffect(() => { if (dateRange) { setPage(1); load(1); } }, [dateRange]);

  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); }
    catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no', width: 140 },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '유형', dataIndex: 'request_type', key: 'request_type', width: 90,
      render: (v: string) => {
        const colorMap: Record<string, string> = { '출고': 'blue', '반품': 'orange', '수평이동': 'purple' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      }},
    { title: '출발', dataIndex: 'from_partner_name', key: 'from_partner_name', render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', key: 'to_partner_name', render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', key: 'memo', render: (v: string) => v || '-', ellipsis: true },
    { title: '', key: 'action', width: 80, render: (_: any, record: any) => (
      <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
    )},
  ];

  return (
    <div>
      <PageHeader title="출고조회" />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input size="small" placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => { setPage(1); load(1); }} style={{ width: 200 }} />
        <Select size="small" placeholder="상태" allowClear value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }}
          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
        <RangePicker size="small" presets={datePresets} value={dateRange} onChange={(v) => setDateRange(v as any)} />
        <Button size="small" onClick={() => { setPage(1); load(1); }}>조회</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />

      <ShipmentDetailModal open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
