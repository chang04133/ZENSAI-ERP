import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form, Popconfirm,
  InputNumber, DatePicker, Badge, Card, Tag, message,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, CloseOutlined,
  DeleteOutlined, SendOutlined, CheckCircleOutlined,
  ClockCircleOutlined, StopOutlined, ArrowLeftOutlined,
  RollbackOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import ShipmentDetailModal from '../../components/shipment/ShipmentDetailModal';
import ShippedQtyModal from '../../components/shipment/ShippedQtyModal';
import ReceivedQtyModal from '../../components/shipment/ReceivedQtyModal';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { apiFetch } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

interface ItemRow {
  variant_id: number;
  request_qty: number;
  sku: string;
  product_name: string;
  color: string;
  size: string;
}

const STEPS = [
  { key: 'PENDING', label: '대기', desc: '반품 대기 중인 의뢰', icon: <ClockCircleOutlined />, color: '#8c8c8c', bg: '#fafafa' },
  { key: 'SHIPPED', label: '반품출고', desc: '반품 출고 완료, 수령 대기 중', icon: <RollbackOutlined />, color: '#fa8c16', bg: '#fff7e6' },
  { key: 'RECEIVED', label: '반품수령', desc: '반품 수령까지 완료된 의뢰', icon: <CheckCircleOutlined />, color: '#52c41a', bg: '#f6ffed' },
  { key: 'CANCELLED', label: '취소', desc: '취소된 반품 의뢰', icon: <StopOutlined />, color: '#ff4d4f', bg: '#fff2f0' },
] as const;

export default function ReturnManagePage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  const [view, setView] = useState<string>('dashboard');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  /* ── 대시보드 카운트 ── */
  const [counts, setCounts] = useState<Record<string, number>>({ PENDING: 0, SHIPPED: 0, RECEIVED: 0, CANCELLED: 0 });
  const [countsLoading, setCountsLoading] = useState(false);

  /* ── 상세 뷰 데이터 ── */
  const [listData, setListData] = useState<any[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  /* ── 모달 상태 ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [shippedModalOpen, setShippedModalOpen] = useState(false);
  const [shippedTarget, setShippedTarget] = useState<any>(null);
  const [shippedQtys, setShippedQtys] = useState<Record<number, number>>({});
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});

  /* ══════════ 데이터 로드 ══════════ */
  const buildParams = useCallback(() => {
    const params: Record<string, string> = { request_type: '반품' };
    if (search) params.search = search;
    if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
    if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
    if (isStore && user?.partnerCode) params.partner = user.partnerCode;
    return params;
  }, [search, dateRange, isStore, user?.partnerCode]);

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    const base = buildParams();
    const results = await Promise.all(
      STEPS.map(async (s) => {
        try {
          const r = await shipmentApi.list({ ...base, status: s.key, limit: '1', page: '1' });
          return { key: s.key, total: r.total };
        } catch { return { key: s.key, total: 0 }; }
      }),
    );
    const next: Record<string, number> = {};
    results.forEach((r) => { next[r.key] = r.total; });
    setCounts(next);
    setCountsLoading(false);
  }, [buildParams]);

  const loadList = useCallback(async (status: string, page: number) => {
    setListLoading(true);
    try {
      const params: Record<string, string> = { ...buildParams(), page: String(page), limit: '50' };
      if (status !== 'ALL') params.status = status;
      const result = await shipmentApi.list(params);
      setListData(result.data);
      setListTotal(result.total);
      if (status !== 'ALL') setCounts((prev) => ({ ...prev, [status]: result.total }));
    } catch (e: any) { message.error(e.message); }
    finally { setListLoading(false); }
  }, [buildParams]);

  const openStatus = (status: string) => {
    setView(status);
    setListPage(1);
    setListData([]);
    loadList(status, 1);
  };

  const backToDashboard = () => {
    setView('dashboard');
    loadCounts();
    setAllPage(1);
    loadAll(1, statusFilter);
  };

  /* 대시보드 전체목록 */
  const [allData, setAllData] = useState<any[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [allPage, setAllPage] = useState(1);
  const [allLoading, setAllLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const loadAll = useCallback(async (page: number, status?: string) => {
    setAllLoading(true);
    try {
      const params: Record<string, string> = { ...buildParams(), page: String(page), limit: '50' };
      if (status) params.status = status;
      const result = await shipmentApi.list(params);
      setAllData(result.data);
      setAllTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setAllLoading(false); }
  }, [buildParams]);

  useEffect(() => { loadCounts(); loadAll(1); }, []);
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/partners?limit=1000&scope=transfer');
        const json = await res.json();
        if (json.success && json.data?.data) setPartners(json.data.data);
      } catch {}
      try { setVariantOptions(await productApi.searchVariants('')); } catch {}
    })();
  }, []);

  const handleSearch = () => {
    if (view === 'dashboard') { loadCounts(); setAllPage(1); loadAll(1, statusFilter); }
    else { setListPage(1); loadList(view, 1); }
  };

  const handlePageChange = (p: number) => {
    setListPage(p);
    loadList(view, p);
  };

  /* ══════════ 이벤트 핸들러 ══════════ */
  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) {
      try { setVariantOptions(await productApi.searchVariants(value)); }
      catch { setVariantOptions([]); }
    }
  };

  const handleAddItem = (variantId: number) => {
    const v = variantOptions.find((o) => o.variant_id === variantId);
    if (!v) return;
    if (items.find((i) => i.variant_id === variantId)) { message.warning('이미 추가된 품목입니다'); return; }
    setItems([...items, { variant_id: variantId, request_qty: 1, sku: v.sku, product_name: v.product_name, color: v.color, size: v.size }]);
  };

  const handleCreate = async (values: any) => {
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    const body: any = { ...values, request_type: '반품', items: items.map(({ variant_id, request_qty }) => ({ variant_id, request_qty })) };
    if (isStore && user?.partnerCode) body.from_partner = user.partnerCode;
    try {
      await shipmentApi.create(body);
      message.success('반품의뢰가 등록되었습니다.');
      setModalOpen(false); form.resetFields(); setItems([]);
      if (view === 'PENDING') loadList('PENDING', 1);
      else if (view === 'ALL') loadList('ALL', listPage);
      loadCounts();
      if (view === 'dashboard') { setAllPage(1); loadAll(1, statusFilter); }
    } catch (e: any) { message.error(e.message); }
  };

  const handleCancel = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'CANCELLED' });
      message.success('취소되었습니다.');
      loadList(view, listPage);
      loadCounts();
    } catch (e: any) { message.error(e.message); }
  };

  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); }
    catch (e: any) { message.error(e.message); }
  };

  const handleOpenShippedModal = async (record: any) => {
    try {
      const d = await shipmentApi.get(record.request_id);
      setShippedTarget(d);
      const qtys: Record<number, number> = {};
      (d as any).items?.forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty || item.request_qty; });
      setShippedQtys(qtys);
      setShippedModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmShipped = async () => {
    if (!shippedTarget) return;
    try {
      const sItems = (shippedTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id, shipped_qty: shippedQtys[item.variant_id] || 0,
      }));
      await shipmentApi.shipConfirm(shippedTarget.request_id, sItems);
      message.success('반품 출고가 완료되었습니다.');
      setShippedModalOpen(false); setShippedTarget(null);
      loadList(view, listPage);
      loadCounts();
    } catch (e: any) { message.error(e.message); }
  };

  const handleOpenReceiveModal = async (record: any) => {
    try {
      const d = await shipmentApi.get(record.request_id);
      setReceiveTarget(d);
      const qtys: Record<number, number> = {};
      (d as any).items?.forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty; });
      setReceivedQtys(qtys);
      setReceiveModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmReceive = async () => {
    if (!receiveTarget) return;
    try {
      const rItems = (receiveTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id, received_qty: receivedQtys[item.variant_id] || 0,
      }));
      await shipmentApi.receive(receiveTarget.request_id, rItems);
      message.success('반품 수령이 완료되었습니다.');
      setReceiveModalOpen(false); setReceiveTarget(null);
      loadList(view, listPage);
      loadCounts();
    } catch (e: any) { message.error(e.message); }
  };

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  /* ══════════ 확장 행 (품목 상세) ══════════ */
  const [expandedDetails, setExpandedDetails] = useState<Record<number, any[]>>({});
  const [expandLoading, setExpandLoading] = useState<Record<number, boolean>>({});

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
      <Table size="small" dataSource={items} rowKey="variant_id" pagination={false}
        columns={[
          { title: 'SKU', dataIndex: 'sku', width: 150 },
          { title: '상품명', dataIndex: 'product_name' },
          { title: '색상', dataIndex: 'color', width: 80 },
          { title: '사이즈', dataIndex: 'size', width: 70 },
          { title: '의뢰', dataIndex: 'request_qty', width: 70, align: 'right' as const },
          { title: '출고', dataIndex: 'shipped_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#fa8c16' : '#ccc' }}>{v ?? 0}</span> },
          { title: '수령', dataIndex: 'received_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v ?? 0}</span> },
        ]}
      />
    );
  };

  /* ══════════ 컬럼 정의 ══════════ */
  const baseColumns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no', width: 130 },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 95,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '반품처', dataIndex: 'from_partner_name', key: 'from_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '입고처', dataIndex: 'to_partner_name', key: 'to_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '품목', dataIndex: 'item_summary', key: 'item_summary', ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999' }}>({r.item_count}종)</span></span> : '-' },
    { title: '의뢰수량', dataIndex: 'total_request_qty', key: 'req_qty', width: 80, align: 'right' as const,
      render: (v: number) => <strong>{v || 0}</strong> },
    { title: '반품출고', dataIndex: 'total_shipped_qty', key: 'ship_qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#fa8c16' : '#ccc' }}>{v || 0}</span> },
    { title: '반품수령', dataIndex: 'total_received_qty', key: 'recv_qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v || 0}</span> },
    { title: '메모', dataIndex: 'memo', key: 'memo', width: 120, render: (v: string) => v || '-', ellipsis: true },
  ];

  const STATUS_TAG: Record<string, { color: string; label: string }> = {
    PENDING: { color: 'default', label: '대기' },
    SHIPPED: { color: 'orange', label: '반품출고' },
    RECEIVED: { color: 'green', label: '반품수령' },
    CANCELLED: { color: 'red', label: '취소' },
  };

  const allActionColumn = {
    title: '', key: 'action', width: 220, render: (_: any, record: any) => {
      const st = record.status;
      if (st === 'PENDING') {
        const canShip = isAdmin || record.from_partner === user?.partnerCode;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
            {canShip && <Button size="small" type="primary" icon={<SendOutlined />} style={{ background: '#fa8c16', borderColor: '#fa8c16' }} onClick={() => handleOpenShippedModal(record)}>반품출고</Button>}
            {isAdmin && <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)}><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
          </Space>
        );
      }
      if (st === 'SHIPPED') {
        const canReceive = isAdmin || record.to_partner === user?.partnerCode;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
            {canReceive && <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleOpenReceiveModal(record)}>반품수령</Button>}
          </Space>
        );
      }
      return <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>;
    },
  };

  const statusColumn = {
    title: '상태', dataIndex: 'status', key: 'status', width: 90,
    render: (v: string) => <Tag color={STATUS_TAG[v]?.color || 'default'}>{STATUS_TAG[v]?.label || v}</Tag>,
  };

  const columnsByStatus: Record<string, any[]> = {
    ALL: [...baseColumns.slice(0, 2), statusColumn, ...baseColumns.slice(2), allActionColumn],
    PENDING: [...baseColumns, { title: '', key: 'action', width: 220, render: (_: any, record: any) => {
      const canShip = isAdmin || record.from_partner === user?.partnerCode;
      return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {canShip && <Button size="small" type="primary" icon={<SendOutlined />} style={{ background: '#fa8c16', borderColor: '#fa8c16' }} onClick={() => handleOpenShippedModal(record)}>반품출고</Button>}
          {isAdmin && <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)}><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
    }}],
    SHIPPED: [...baseColumns, { title: '', key: 'action', width: 160, render: (_: any, record: any) => {
      const canReceive = isAdmin || record.to_partner === user?.partnerCode;
      return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {canReceive && <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleOpenReceiveModal(record)}>반품수령</Button>}
        </Space>
      );
    }}],
    RECEIVED: [...baseColumns, { title: '', key: 'action', width: 60, render: (_: any, r: any) => <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.request_id)}>상세</Button> }],
    CANCELLED: [...baseColumns, { title: '', key: 'action', width: 60, render: (_: any, r: any) => <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.request_id)}>상세</Button> }],
  };

  /* ══════════ 대시보드 ══════════ */
  const renderDashboard = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 상태별 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {STEPS.map((step) => {
        const count = counts[step.key] || 0;
        const needsAction = (step.key === 'PENDING' || step.key === 'SHIPPED') && count > 0;
        return (
          <Card
            key={step.key}
            hoverable
            onClick={() => {
              const next = statusFilter === step.key ? '' : step.key;
              setStatusFilter(next);
              setAllPage(1);
              loadAll(1, next || undefined);
            }}
            style={{
              cursor: 'pointer',
              borderColor: statusFilter === step.key ? step.color : '#f0f0f0',
              boxShadow: statusFilter === step.key ? `0 0 0 2px ${step.color}30` : 'none',
              transition: 'all 0.2s',
            }}
            styles={{ body: { padding: '20px 24px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: step.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, color: step.color,
              }}>
                {step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 2 }}>{step.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: step.color, lineHeight: 1 }}>
                  {countsLoading ? '-' : count}
                </div>
              </div>
              {needsAction && <Badge count={count} style={{ backgroundColor: step.color }} />}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#999' }}>{step.desc}</div>
          </Card>
        );
      })}
      </div>

      {/* 전체 의뢰 목록 */}
      <div style={{ marginTop: 16 }}>
        <Table
          columns={columnsByStatus['ALL']}
          dataSource={allData}
          rowKey="request_id"
          loading={allLoading}
          size="small"
          scroll={{ x: 1200, y: 'calc(100vh - 420px)' }}
          pagination={{
            current: allPage, total: allTotal, pageSize: 50,
            onChange: (p) => { setAllPage(p); loadAll(p, statusFilter || undefined); },
            showTotal: (t) => `총 ${t}건`,
          }}
          expandable={{
            expandedRowRender,
            onExpand: handleExpand,
            rowExpandable: () => true,
          }}
        />
      </div>
    </div>
  );

  /* ══════════ 상태별 상세뷰 ══════════ */
  const renderStatusView = () => {
    const isAll = view === 'ALL';
    const step = isAll
      ? { key: 'ALL', label: '전체 의뢰', desc: '모든 반품의뢰 목록', icon: <UnorderedListOutlined />, color: '#6366f1', bg: '#eef2ff' }
      : STEPS.find((s) => s.key === view)!;
    return (
      <div>
        <div style={{
          padding: '12px 16px', marginBottom: 16, borderRadius: 8,
          background: step.bg, border: `1px solid ${step.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={backToDashboard}>대시보드</Button>
            <span style={{ fontSize: 20, color: step.color }}>{step.icon}</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: 16, color: step.color }}>{step.label}</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: '#666' }}>{step.desc}</span>
            </div>
            <Badge count={listTotal} style={{ backgroundColor: step.color, marginLeft: 4 }} showZero />
          </div>
          {(view === 'PENDING' || isAll) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              form.resetFields();
              if (isStore && user?.partnerCode) form.setFieldsValue({ from_partner: user.partnerCode });
              setItems([]); setModalOpen(true);
            }}>반품의뢰 등록</Button>
          )}
        </div>

        <Table
          columns={columnsByStatus[view]}
          dataSource={listData}
          rowKey="request_id"
          loading={listLoading}
          size="small"
          scroll={{ x: 1200, y: 'calc(100vh - 310px)' }}
          pagination={{
            current: listPage, total: listTotal, pageSize: 50,
            onChange: handlePageChange, showTotal: (t) => `총 ${t}건`,
          }}
          expandable={{
            expandedRowRender,
            onExpand: handleExpand,
            rowExpandable: () => true,
          }}
        />
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="반품관리" extra={view === 'dashboard' ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          form.resetFields();
          if (isStore && user?.partnerCode) form.setFieldsValue({ from_partner: user.partnerCode });
          setItems([]); setModalOpen(true);
        }}>반품의뢰 등록</Button>
      ) : undefined} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={handleSearch} style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={(v) => setDateRange(v as any)} /></div>
        <Button onClick={handleSearch}>조회</Button>
      </div>

      {view === 'dashboard' ? renderDashboard() : renderStatusView()}

      {/* ══ 모달 ══ */}
      <Modal title="반품의뢰 등록" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="등록" cancelText="취소" width={700}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          {!isStore && (
            <Form.Item name="from_partner" label="반품처 (출발)" rules={[{ required: true, message: '반품처를 선택해주세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
            </Form.Item>
          )}
          <Form.Item name="to_partner" label={isStore ? '반품 보낼 곳' : '입고처 (도착)'}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" allowClear options={partnerOptions} />
          </Form.Item>
          <Form.Item label="품목 추가">
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} onChange={handleAddItem} value={null as any}
              notFoundContent="2자 이상 입력해주세요" style={{ width: '100%' }}>
              {variantOptions.map((v) => (
                <Select.Option key={v.variant_id} value={v.variant_id}>{v.sku} - {v.product_name} ({v.color}/{v.size})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          {items.length > 0 && (
            <Table size="small" dataSource={items} rowKey="variant_id" pagination={false} style={{ marginBottom: 16 }}
              columns={[
                { title: 'SKU', dataIndex: 'sku', width: 160 },
                { title: '상품명', dataIndex: 'product_name' },
                { title: '색상', dataIndex: 'color', width: 80 },
                { title: '사이즈', dataIndex: 'size', width: 80 },
                { title: '수량', key: 'qty', width: 100, render: (_: any, r: ItemRow) => (
                  <InputNumber min={1} value={r.request_qty} size="small"
                    onChange={(v) => setItems(items.map((i) => i.variant_id === r.variant_id ? { ...i, request_qty: v || 1 } : i))} />
                )},
                { title: '', key: 'del', width: 40, render: (_: any, r: ItemRow) => (
                  <Button type="text" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => setItems(items.filter((i) => i.variant_id !== r.variant_id))} />
                )},
              ]} />
          )}
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <ShipmentDetailModal open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} />
      <ShippedQtyModal open={shippedModalOpen} detail={shippedTarget} qtys={shippedQtys}
        onQtyChange={(vid, qty) => setShippedQtys({ ...shippedQtys, [vid]: qty })}
        onConfirm={handleConfirmShipped} onCancel={() => setShippedModalOpen(false)}
        title="반품출고" okText="반품출고"
        alertMessage="반품할 실제 수량을 입력하세요. 확인 시 반품처 재고가 차감됩니다." />
      <ReceivedQtyModal open={receiveModalOpen} detail={receiveTarget} qtys={receivedQtys}
        onQtyChange={(vid, qty) => setReceivedQtys({ ...receivedQtys, [vid]: qty })}
        onConfirm={handleConfirmReceive} onCancel={() => setReceiveModalOpen(false)}
        title="반품수령" okText="반품수령"
        alertMessage="수령한 실제 수량을 입력하세요. 확인 시 입고처 재고가 증가합니다." />
    </div>
  );
}
