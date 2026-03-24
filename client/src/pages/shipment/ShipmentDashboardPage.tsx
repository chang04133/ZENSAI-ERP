import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Select, Tag, Input, DatePicker, message, Row, Col,
  Segmented, Steps, Popconfirm, Space,
} from 'antd';
import {
  SearchOutlined, EyeOutlined, CheckCircleOutlined, SendOutlined,
  CloseCircleOutlined, InboxOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { STATUS_COLORS, getStatusLabel } from '../../components/shipment/ShipmentConstants';
import ShippedQtyModal from '../../components/shipment/ShippedQtyModal';
import ReceivedQtyModal from '../../components/shipment/ReceivedQtyModal';
import ShipmentDetailModal from '../../components/shipment/ShipmentDetailModal';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

interface SummaryRow {
  status: string;
  request_type: string;
  count: number;
  total_request_qty: number;
  total_shipped_qty: number;
}

interface StatusSummary {
  count: number;
  qty: number;
}

const STATUS_CARD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: '#fffbe6', text: '#d48806', border: '#ffe58f' },
  SHIPPED: { bg: '#f6ffed', text: '#389e0d', border: '#b7eb8f' },
  RECEIVED: { bg: '#e6fffb', text: '#08979c', border: '#87e8de' },
  CANCELLED: { bg: '#fff1f0', text: '#cf1322', border: '#ffa39e' },
};

const STATUS_CARD_LABELS: Record<string, string> = {
  PENDING: '대기',
  SHIPPED: '출고완료',
  RECEIVED: '입고완료',
  CANCELLED: '취소',
};

const TYPE_OPTIONS = [
  { label: '전체', value: '' },
  { label: '출고', value: '출고' },
  { label: '반품', value: '반품' },
  { label: '수평이동', value: '수평이동' },
];

const STATUS_OPTIONS = [
  { label: '전체', value: '' },
  { label: '대기', value: 'PENDING' },
  { label: '출고완료', value: 'SHIPPED' },
  { label: '입고완료', value: 'RECEIVED' },
  { label: '취소', value: 'CANCELLED' },
];

export default function ShipmentDashboardPage() {
  const user = useAuthStore((s) => s.user);

  // Summary
  const [summaryData, setSummaryData] = useState<SummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // List
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const triggerLoad = () => { setPage(1); setLoadTrigger((p) => p + 1); };

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // Ship confirm modal
  const [shipOpen, setShipOpen] = useState(false);
  const [shipDetail, setShipDetail] = useState<any>(null);
  const [shipQtys, setShipQtys] = useState<Record<number, number>>({});
  const [shipLoading, setShipLoading] = useState(false);

  // Receive confirm modal
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvDetail, setRecvDetail] = useState<any>(null);
  const [recvQtys, setRecvQtys] = useState<Record<number, number>>({});
  const [recvLoading, setRecvLoading] = useState(false);

  // Expanded rows
  const [expandedDetails, setExpandedDetails] = useState<Record<number, any[]>>({});
  const [expandLoading, setExpandLoading] = useState<Record<number, boolean>>({});

  // --- Data Loading ---
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const result = await shipmentApi.summary();
      setSummaryData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setSummaryLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
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
  }, [page, search, statusFilter, typeFilter, dateRange, user?.partnerCode]);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadList();
  }, [loadSummary, loadList]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [page, loadTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Summary aggregation ---
  const statusSummary: Record<string, StatusSummary> = { PENDING: { count: 0, qty: 0 }, SHIPPED: { count: 0, qty: 0 }, RECEIVED: { count: 0, qty: 0 }, CANCELLED: { count: 0, qty: 0 } };
  for (const row of summaryData) {
    if (statusSummary[row.status]) {
      statusSummary[row.status].count += row.count;
      statusSummary[row.status].qty += row.total_request_qty;
    }
  }

  // --- Handlers ---
  const handleCardClick = (status: string) => {
    setStatusFilter((prev) => prev === status ? '' : status);
    triggerLoad();
  };

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
    } catch { /* ignore */ }
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

  // Ship confirm
  const openShipConfirm = async (id: number) => {
    try {
      const d = await shipmentApi.get(id);
      setShipDetail(d);
      const qtys: Record<number, number> = {};
      ((d as any).items || []).forEach((item: any) => { qtys[item.variant_id] = item.request_qty; });
      setShipQtys(qtys);
      setShipOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleShipConfirm = async () => {
    if (!shipDetail) return;
    setShipLoading(true);
    try {
      const items = Object.entries(shipQtys).map(([vid, qty]) => ({ variant_id: Number(vid), shipped_qty: qty }));
      await shipmentApi.shipConfirm(shipDetail.request_id, items);
      message.success('출고확인 완료');
      setShipOpen(false);
      setExpandedDetails({});
      refreshAll();
    } catch (e: any) { message.error(e.message); }
    finally { setShipLoading(false); }
  };

  // Receive confirm
  const openRecvConfirm = async (id: number) => {
    try {
      const d = await shipmentApi.get(id);
      setRecvDetail(d);
      const qtys: Record<number, number> = {};
      ((d as any).items || []).forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty; });
      setRecvQtys(qtys);
      setRecvOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleRecvConfirm = async () => {
    if (!recvDetail) return;
    setRecvLoading(true);
    try {
      const items = Object.entries(recvQtys).map(([vid, qty]) => ({ variant_id: Number(vid), received_qty: qty }));
      await shipmentApi.receive(recvDetail.request_id, items);
      message.success('수령확인 완료');
      setRecvOpen(false);
      setExpandedDetails({});
      refreshAll();
    } catch (e: any) { message.error(e.message); }
    finally { setRecvLoading(false); }
  };

  // Cancel
  const handleCancel = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'CANCELLED' });
      message.success('취소 처리되었습니다.');
      setExpandedDetails({});
      refreshAll();
    } catch (e: any) { message.error(e.message); }
  };

  // --- Columns ---
  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', width: 130 },
    { title: '의뢰일', dataIndex: 'request_date', width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '유형', dataIndex: 'request_type', width: 90,
      render: (v: string) => {
        const colorMap: Record<string, string> = { '출고': 'blue', '반품': 'orange', '수평이동': 'purple' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      }},
    { title: '출발', dataIndex: 'from_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '품목', dataIndex: 'item_summary', ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999' }}>({r.item_count}종)</span></span> : '-' },
    { title: '의뢰', dataIndex: 'total_request_qty', width: 60, align: 'right' as const,
      render: (v: number) => <strong>{v || 0}</strong> },
    { title: '출고', dataIndex: 'total_shipped_qty', width: 60, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v || 0}</span> },
    { title: '수령', dataIndex: 'total_received_qty', width: 60, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#13c2c2' : '#ccc' }}>{v || 0}</span> },
    { title: '상태', dataIndex: 'status', width: 90,
      render: (v: string, r: any) => <Tag color={STATUS_COLORS[v]}>{getStatusLabel(v, r.request_type)}</Tag> },
    { title: '액션', key: 'action', width: 200, render: (_: any, record: any) => (
      <Space size={4}>
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
        {record.status === 'PENDING' && (
          <Button size="small" type="primary" icon={<SendOutlined />}
            onClick={() => openShipConfirm(record.request_id)}>출고확인</Button>
        )}
        {record.status === 'SHIPPED' && (
          <Button size="small" style={{ color: '#08979c', borderColor: '#87e8de' }}
            icon={<CheckCircleOutlined />}
            onClick={() => openRecvConfirm(record.request_id)}>수령확인</Button>
        )}
        {(record.status === 'PENDING' || record.status === 'SHIPPED') && (
          <Popconfirm title="정말 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)}
            okText="취소처리" cancelText="닫기">
            <Button size="small" danger icon={<CloseCircleOutlined />}>취소</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <PageHeader title="종합출고관리" />

      {/* 상태 요약 카드 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(['PENDING', 'SHIPPED', 'RECEIVED', 'CANCELLED'] as const).map((status) => {
          const colors = STATUS_CARD_COLORS[status];
          const s = statusSummary[status];
          const isActive = statusFilter === status;
          return (
            <Col xs={12} sm={6} key={status}>
              <div
                onClick={() => handleCardClick(status)}
                style={{
                  background: isActive ? colors.text : colors.bg,
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  border: `2px solid ${isActive ? colors.text : colors.border}`,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 11, color: isActive ? '#fff' : colors.text, opacity: 0.8 }}>
                  {STATUS_CARD_LABELS[status]}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: isActive ? '#fff' : colors.text }}>
                  {summaryLoading ? '-' : `${s.count}건`}
                </div>
                {status !== 'CANCELLED' && (
                  <div style={{ fontSize: 11, color: isActive ? '#ffffffcc' : colors.text, opacity: 0.7 }}>
                    총 {summaryLoading ? '-' : s.qty}수량
                  </div>
                )}
              </div>
            </Col>
          );
        })}
      </Row>

      {/* 상태 흐름 시각화 */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
        <Steps
          size="small"
          items={[
            {
              title: `대기 ${statusSummary.PENDING.count}건`,
              description: `${statusSummary.PENDING.qty}수량`,
              icon: <InboxOutlined />,
              status: 'wait' as const,
            },
            {
              title: `출고완료 ${statusSummary.SHIPPED.count}건`,
              description: `${statusSummary.SHIPPED.qty}수량`,
              icon: <SendOutlined />,
              status: 'process' as const,
            },
            {
              title: `입고완료 ${statusSummary.RECEIVED.count}건`,
              description: `${statusSummary.RECEIVED.qty}수량`,
              icon: <CheckCircleOutlined />,
              status: 'finish' as const,
            },
          ]}
        />
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={triggerLoad}
            style={{ width: '100%' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Segmented options={TYPE_OPTIONS} value={typeFilter}
            onChange={(v) => { setTypeFilter(v as string); triggerLoad(); }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter || ''} onChange={(v) => { setStatusFilter(v || ''); triggerLoad(); }} style={{ width: 120 }}
            options={STATUS_OPTIONS} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={(v) => { setDateRange(v as any); triggerLoad(); }} />
        </div>
        <Button onClick={triggerLoad}>조회</Button>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="request_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
        expandable={{ expandedRowRender, onExpand: handleExpand, rowExpandable: () => true }}
      />

      {/* 모달들 */}
      <ShipmentDetailModal open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} />

      <ShippedQtyModal
        open={shipOpen}
        detail={shipDetail}
        qtys={shipQtys}
        onQtyChange={(vid, qty) => setShipQtys((prev) => ({ ...prev, [vid]: qty }))}
        onConfirm={handleShipConfirm}
        onCancel={() => setShipOpen(false)}
        confirmLoading={shipLoading}
      />

      <ReceivedQtyModal
        open={recvOpen}
        detail={recvDetail}
        qtys={recvQtys}
        onQtyChange={(vid, qty) => setRecvQtys((prev) => ({ ...prev, [vid]: qty }))}
        onConfirm={handleRecvConfirm}
        onCancel={() => setRecvOpen(false)}
        confirmLoading={recvLoading}
      />
    </div>
  );
}
