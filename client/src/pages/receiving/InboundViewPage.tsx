import { useEffect, useState } from 'react';
import { Table, Button, Select, Tag, Input, DatePicker, Modal, Row, Col, Space, message } from 'antd';
import { SearchOutlined, EyeOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inboundApi } from '../../modules/inbound/inbound.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { datePresets } from '../../utils/date-presets';
import { fmt } from '../../utils/format';
import type { InboundRecord, InboundItem } from '../../../../shared/types/inbound';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const STATUS_COLORS: Record<string, string> = { PENDING: 'orange', COMPLETED: 'green' };
const STATUS_LABELS: Record<string, string> = { PENDING: '대기중', COMPLETED: '완료' };
const SOURCE_COLORS: Record<string, string> = { PRODUCTION: 'purple', MANUAL: 'default' };

export default function InboundViewPage() {
  const user = useAuthStore((s) => s.user);
  const isHQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user?.role as any);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [sourceFilter, setSourceFilter] = useState<string | undefined>();
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [partners, setPartners] = useState<any[]>([]);

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<InboundRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Expandable
  const [expandedDetails, setExpandedDetails] = useState<Record<number, InboundItem[]>>({});
  const [expandLoading, setExpandLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    apiFetch('/api/partners?limit=1000').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch(() => {});
  }, []);

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source_type = sourceFilter;
      if (partnerFilter) params.partner_code = partnerFilter;
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      const result = await inboundApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => { setPage(1); load(1); }, [statusFilter, sourceFilter, partnerFilter]);
  useEffect(() => { if (dateRange) { setPage(1); load(1); } }, [dateRange]);

  const showDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await apiFetch(`/api/inbounds/${id}`);
      const d = await res.json();
      if (d.success) setDetailData(d.data);
      else message.error(d.error || '상세 조회 실패');
    } catch (e: any) { message.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const handleExpand = async (expanded: boolean, record: any) => {
    if (!expanded || expandedDetails[record.record_id]) return;
    setExpandLoading(prev => ({ ...prev, [record.record_id]: true }));
    try {
      const res = await apiFetch(`/api/inbounds/${record.record_id}`);
      const d = await res.json();
      if (d.success) setExpandedDetails(prev => ({ ...prev, [record.record_id]: d.data.items || [] }));
    } catch { /* ignore */ }
    setExpandLoading(prev => ({ ...prev, [record.record_id]: false }));
  };

  const expandedRowRender = (record: any) => {
    const items = expandedDetails[record.record_id];
    if (expandLoading[record.record_id]) return <div style={{ textAlign: 'center', padding: 12 }}>로딩 중...</div>;
    if (!items || items.length === 0) {
      if (record.status === 'PENDING') return <div style={{ textAlign: 'center', padding: 12, color: '#fa8c16' }}>입고 대기중 — 품목 미등록</div>;
      return <div style={{ textAlign: 'center', padding: 12, color: '#999' }}>품목 없음</div>;
    }
    return (
      <Table size="small" dataSource={items} rowKey="item_id" pagination={false}
        columns={[
          { title: '품번', dataIndex: 'product_code', width: 120 },
          { title: 'SKU', dataIndex: 'sku', width: 160 },
          { title: '상품명', dataIndex: 'product_name', ellipsis: true },
          { title: '색상', dataIndex: 'color', width: 80 },
          { title: '사이즈', dataIndex: 'size', width: 70 },
          { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const,
            render: (v: number) => <strong>{fmt(v)}</strong> },
          { title: '원가(원)', dataIndex: 'unit_price', width: 90, align: 'right' as const,
            render: (v: number | null) => v != null ? `${fmt(v)}원` : '-' },
        ]}
      />
    );
  };

  const columns = [
    { title: '입고번호', dataIndex: 'inbound_no', key: 'inbound_no', width: 140 },
    { title: '입고일', dataIndex: 'inbound_date', key: 'inbound_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '출처', dataIndex: 'source_type', key: 'source_type', width: 120,
      render: (_: string, r: any) => r.source_type === 'PRODUCTION'
        ? <Tag color="purple">{r.plan_no || '생산'}</Tag>
        : <span style={{ color: '#999' }}>수동</span> },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 130, ellipsis: true, render: (v: string) => v || '-' },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70, align: 'right' as const,
      render: (v: number) => `${v}건` },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 90, align: 'right' as const,
      render: (v: number, r: any) => r.status === 'PENDING'
        ? <span style={{ color: '#fa8c16' }}>예상 {fmt(r.expected_qty || 0)}</span>
        : <strong>{fmt(v)}</strong> },
    { title: '비고', dataIndex: 'memo', key: 'memo', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '등록일', dataIndex: 'created_at', key: 'created_at', width: 100,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
    { title: '', key: 'action', width: 70, render: (_: any, record: any) => (
      <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record.record_id)}>상세</Button>
    )},
  ];

  return (
    <div>
      <PageHeader title="입고조회" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="입고번호 검색" prefix={<SearchOutlined />} value={search}
            onChange={e => setSearch(e.target.value)} onPressEnter={() => { setPage(1); load(1); }} style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter || ''} onChange={v => setStatusFilter(v || undefined)} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, { label: '대기중', value: 'PENDING' }, { label: '완료', value: 'COMPLETED' }]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>출처</div>
          <Select value={sourceFilter || ''} onChange={v => setSourceFilter(v || undefined)} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, { label: '생산', value: 'PRODUCTION' }, { label: '수동', value: 'MANUAL' }]} /></div>
        {isHQ && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
            <Select showSearch optionFilterProp="label" value={partnerFilter || ''} onChange={v => setPartnerFilter(v || undefined)} style={{ width: 160 }}
              options={[{ label: '전체', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
        )}
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={v => setDateRange(v as any)} /></div>
        <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
      </div>

      <Table columns={columns} dataSource={data} rowKey="record_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: t => `총 ${t}건` }}
        expandable={{ expandedRowRender, onExpand: handleExpand, rowExpandable: () => true }}
        rowClassName={r => r.status === 'PENDING' ? 'row-pending' : ''}
      />

      {/* 상세 모달 */}
      <Modal title={detailData ? `입고 상세 — ${detailData.inbound_no}` : '입고 상세'}
        open={detailOpen} onCancel={() => setDetailOpen(false)} width={850}
        footer={<Button onClick={() => setDetailOpen(false)}>닫기</Button>}
        loading={detailLoading}
      >
        {detailData && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={6}>
                <Tag color="blue">{detailData.inbound_no}</Tag>
                <Tag color={STATUS_COLORS[detailData.status]}>{STATUS_LABELS[detailData.status]}</Tag>
              </Col>
              <Col span={6}>거래처: <b>{detailData.partner_name}</b></Col>
              <Col span={6}>입고일: <b>{dayjs(detailData.inbound_date).format('YYYY-MM-DD')}</b></Col>
              <Col span={6}>등록자: <b>{detailData.created_by}</b></Col>
            </Row>
            {detailData.expected_qty != null && detailData.status === 'PENDING' && (
              <div style={{ marginBottom: 8, color: '#fa8c16', fontWeight: 500 }}>
                <ClockCircleOutlined /> 예상 수량: {fmt(detailData.expected_qty)}개
              </div>
            )}
            {detailData.memo && <div style={{ marginBottom: 8, color: '#666' }}>비고: {detailData.memo}</div>}
            {detailData.status === 'COMPLETED' && detailData.items && detailData.items.length > 0 ? (
              <>
                <Table dataSource={detailData.items} columns={[
                  { title: '품번', dataIndex: 'product_code', width: 120 },
                  { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
                  { title: 'SKU', dataIndex: 'sku', width: 160 },
                  { title: '색상', dataIndex: 'color', width: 70 },
                  { title: '사이즈', dataIndex: 'size', width: 65 },
                  { title: '수량', dataIndex: 'qty', width: 80, render: (v: number) => <b>{fmt(v)}</b> },
                  { title: '원가(원)', dataIndex: 'unit_price', width: 100,
                    render: (v: number | null) => v != null ? fmt(v) + '원' : '-' },
                ]} rowKey="item_id" size="small" pagination={false} />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                  <span>총 품목: <b>{detailData.items.length}</b>건</span>
                  <span>총 수량: <b>{fmt(detailData.items.reduce((s: number, i: InboundItem) => s + i.qty, 0))}</b>개</span>
                </div>
              </>
            ) : detailData.status === 'PENDING' ? (
              <div style={{ padding: 16, background: '#fffbe6', borderRadius: 8, textAlign: 'center', color: '#fa8c16' }}>
                입고 대기중 — 종합입고관리에서 입고확정을 진행하세요.
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>등록된 품목이 없습니다.</div>
            )}
          </div>
        )}
      </Modal>

      <style>{`.row-pending td { background: #fffbe6 !important; }`}</style>
    </div>
  );
}
