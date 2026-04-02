import { useEffect, useState } from 'react';
import { Table, Button, Select, Tag, Input, DatePicker, message } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { STATUS_COLORS, getStatusLabel } from '../../components/shipment/ShipmentConstants';
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
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // 확장행
  const [expandedDetails, setExpandedDetails] = useState<Record<number, any[]>>({});
  const [expandLoading, setExpandLoading] = useState<Record<number, boolean>>({});

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.request_type = typeFilter;
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
  useEffect(() => { setPage(1); load(1); }, [statusFilter, typeFilter]);
  useEffect(() => { if (dateRange) { setPage(1); load(1); } }, [dateRange]);

  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); }
    catch (e: any) { message.error(e.message); }
  };

  const handleExpand = async (expanded: boolean, record: any) => {
    if (!expanded || expandedDetails[record.request_id]) return;
    setExpandLoading((prev) => ({ ...prev, [record.request_id]: true }));
    try {
      const d = await shipmentApi.get(record.request_id);
      setExpandedDetails((prev) => ({ ...prev, [record.request_id]: (d as any).items || [] }));
    } catch {}
    setExpandLoading((prev) => ({ ...prev, [record.request_id]: false }));
  };

  const expandedRowRender = (record: any) => {
    const items = expandedDetails[record.request_id];
    if (expandLoading[record.request_id]) return <div style={{ textAlign: 'center', padding: 12 }}>로딩 중...</div>;
    if (!items || items.length === 0) return <div style={{ textAlign: 'center', padding: 12, color: '#999' }}>품목 없음</div>;
    return (
      <Table size="small" dataSource={items} rowKey="item_id" pagination={false}
        columns={[
          { title: 'SKU', dataIndex: 'sku', width: 150 },
          { title: '상품명', dataIndex: 'product_name' },
          { title: '색상', dataIndex: 'color', width: 80 },
          { title: '사이즈', dataIndex: 'size', width: 70 },
          { title: '의뢰', dataIndex: 'request_qty', width: 70, align: 'right' as const },
          { title: '출고', dataIndex: 'shipped_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v ?? 0}</span> },
          { title: '수령', dataIndex: 'received_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#13c2c2' : '#ccc' }}>{v ?? 0}</span> },
        ]}
      />
    );
  };

  const STATUS_OPTIONS = [
    { label: '전체', value: '' },
    { label: '대기', value: 'PENDING' },
    { label: '출고완료', value: 'SHIPPED' },
    { label: '수량불일치', value: 'DISCREPANCY' },
    { label: '수령완료', value: 'RECEIVED' },
    { label: '취소', value: 'CANCELLED' },
  ];

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no', width: 140 },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-' },
    { title: '유형', dataIndex: 'request_type', key: 'request_type', width: 90,
      render: (v: string) => {
        const colorMap: Record<string, string> = { '출고': 'blue', '반품': 'orange', '수평이동': 'purple' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      }},
    { title: '출발', dataIndex: 'from_partner_name', key: 'from_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', key: 'to_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '품목', dataIndex: 'item_summary', key: 'item_summary', ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999' }}>({r.item_count}종)</span></span> : '-' },
    { title: '의뢰', dataIndex: 'total_request_qty', key: 'req_qty', width: 65, align: 'right' as const,
      render: (v: number) => <strong>{v || 0}</strong> },
    { title: '출고', dataIndex: 'total_shipped_qty', key: 'ship_qty', width: 65, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v || 0}</span> },
    { title: '수령', dataIndex: 'total_received_qty', key: 'recv_qty', width: 65, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#13c2c2' : '#ccc' }}>{v || 0}</span> },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string, r: any) => {
        if (v === 'RECEIVED' && r.to_partner_name) return <Tag color="cyan">{r.to_partner_name} 수령완료</Tag>;
        return <Tag color={STATUS_COLORS[v]}>{getStatusLabel(v, r.request_type)}</Tag>;
      } },
    { title: '메모', dataIndex: 'memo', key: 'memo', width: 120, render: (v: string) => v || '-', ellipsis: true },
    { title: '', key: 'action', width: 80, render: (_: any, record: any) => (
      <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
    )},
  ];

  return (
    <div>
      <PageHeader title="출고조회" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => { setPage(1); load(1); }} style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select value={typeFilter || ''} onChange={(v) => setTypeFilter(v || undefined)} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, { label: '출고', value: '출고' }, { label: '반품', value: '반품' }, { label: '수평이동', value: '수평이동' }]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter || ''} onChange={(v) => setStatusFilter(v || undefined)} style={{ width: 120 }}
            options={STATUS_OPTIONS} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={(v) => setDateRange(v as any)} /></div>
        <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        expandable={{ expandedRowRender, onExpand: handleExpand, rowExpandable: () => true }}
      />

      <ShipmentDetailModal open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} onUpdate={(d) => { setDetail(d); load(); }} />
    </div>
  );
}
