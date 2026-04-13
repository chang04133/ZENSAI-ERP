import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form, Popconfirm, Radio,
  InputNumber, DatePicker, Badge, Card, Tag, message,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, CloseOutlined,
  DeleteOutlined, SendOutlined, CheckCircleOutlined,
  ClockCircleOutlined, StopOutlined, ArrowLeftOutlined,
  SwapOutlined, UnorderedListOutlined, ExclamationCircleOutlined,
  ImportOutlined,
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
  stock_qty?: number;
}

const STEPS = [
  { key: 'PENDING', label: '대기', desc: '출고/입고 확인 대기 중', icon: <ClockCircleOutlined />, color: '#faad14', bg: '#fffbe6' },
  { key: 'SHIPPED', label: '이동중', desc: '출고 완료, 수령 대기 중', icon: <SendOutlined />, color: '#1677ff', bg: '#e6f4ff' },
  { key: 'DISCREPANCY', label: '수량불일치', desc: '수령 수량이 출고 수량과 다른 건', icon: <ExclamationCircleOutlined />, color: '#fa541c', bg: '#fff2e8' },
  { key: 'RECEIVED', label: '완료', desc: '수령까지 완료된 의뢰', icon: <CheckCircleOutlined />, color: '#52c41a', bg: '#f6ffed' },
  { key: 'REJECTED', label: '거절', desc: '상대 매장에서 거절한 의뢰', icon: <CloseOutlined />, color: '#ff4d4f', bg: '#fff2f0' },
  { key: 'CANCELLED', label: '취소', desc: '취소된 이동 의뢰', icon: <StopOutlined />, color: '#ff4d4f', bg: '#fff2f0' },
] as const;

export default function HorizontalTransferPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  /* ── 뷰 모드: 'dashboard' | status key ── */
  const [view, setView] = useState<string>('dashboard');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  /* ── 대시보드 카운트 ── */
  const [counts, setCounts] = useState<Record<string, number>>({ PENDING: 0, SHIPPED: 0, DISCREPANCY: 0, RECEIVED: 0, CANCELLED: 0 });
  const [countsLoading, setCountsLoading] = useState(false);

  /* ── 상세 뷰 데이터 ── */
  const [listData, setListData] = useState<any[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  /* ── 모달 상태 ── */
  const [transferMode, setTransferMode] = useState<'send' | 'request'>('send');
  const [modalOpen, setModalOpen] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipTarget, setShipTarget] = useState<any>(null);
  const [shippedQtys, setShippedQtys] = useState<Record<number, number>>({});
  const [shippedStockMap, setShippedStockMap] = useState<Record<number, number>>({});
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [stockPartner, setStockPartner] = useState('');

  const [stockRawData, setStockRawData] = useState<any[]>([]);
  const [loadingAllStock, setLoadingAllStock] = useState(false);

  const loadStockForPartner = async (partnerCode: string) => {
    if (!partnerCode) { setStockMap({}); setStockPartner(''); setStockRawData([]); return; }
    if (partnerCode === stockPartner) return;
    try {
      const res = await apiFetch(`/api/inventory/stock-map?partner_code=${partnerCode}`);
      const json = await res.json();
      if (json.success && json.data) {
        const map: Record<number, number> = {};
        const rawWithStock: any[] = [];
        for (const [vid, qty] of Object.entries(json.data)) {
          const numVid = Number(vid);
          const numQty = qty as number;
          map[numVid] = numQty;
          if (numQty > 0) rawWithStock.push({ variant_id: numVid, qty: numQty });
        }
        setStockMap(map);
        setStockPartner(partnerCode);
        setStockRawData(rawWithStock);
        setItems((prev) => prev.map((i) => ({ ...i, stock_qty: map[i.variant_id] ?? 0 })));
      }
    } catch {}
  };

  const handleLoadAllStock = async () => {
    const fromPartner = isStore ? user?.partnerCode : form.getFieldValue('from_partner');
    if (!fromPartner) { message.warning('출발 거래처를 먼저 선택해주세요'); return; }
    if (stockRawData.length === 0) {
      // 재고 로드가 안 됐으면 다시 로드
      setStockPartner('');
      await loadStockForPartner(fromPartner);
    }
    setLoadingAllStock(true);
    try {
      const variantIds = stockRawData.map((r: any) => r.variant_id).filter((id: number) => !items.find((i) => i.variant_id === id));
      if (variantIds.length === 0) { message.info('추가할 재고가 없습니다'); setLoadingAllStock(false); return; }
      const variants = await productApi.bulkGetVariants(variantIds);
      const variantMap = new Map(variants.map((v) => [v.variant_id, v]));
      const newItems: ItemRow[] = [];
      for (const raw of stockRawData) {
        if (items.find((i) => i.variant_id === raw.variant_id)) continue;
        const v = variantMap.get(raw.variant_id);
        if (!v) continue;
        newItems.push({
          variant_id: raw.variant_id,
          request_qty: raw.qty,
          sku: v.sku,
          product_name: v.product_name,
          color: v.color,
          size: v.size,
          stock_qty: raw.qty,
        });
      }
      setItems((prev) => [...prev, ...newItems]);
      message.success(`${newItems.length}개 품목이 추가되었습니다`);
    } catch (e: any) { message.error(e.message); }
    finally { setLoadingAllStock(false); }
  };

  /* ══════════ 데이터 로드 ══════════ */
  const buildParams = useCallback(() => {
    const params: Record<string, string> = { request_type: '수평이동' };
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

  /* 초기 로드 */
  useEffect(() => { loadCounts(); loadAll(1); }, []);
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/partners?limit=1000&scope=transfer');
        const json = await res.json();
        if (json.success && json.data?.data) setPartners(json.data.data);
      } catch {}
      try {
        const pc = isStore && user?.partnerCode ? user.partnerCode : undefined;
        setVariantOptions(await productApi.searchVariants('', pc));
      } catch {}
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
      try {
        const pc = isStore ? user?.partnerCode : form.getFieldValue('from_partner');
        setVariantOptions(await productApi.searchVariants(value, pc || undefined));
      } catch { setVariantOptions([]); }
    }
  };

  const handleAddItem = (variantId: number) => {
    const v = variantOptions.find((o) => o.variant_id === variantId);
    if (!v) return;
    if (items.find((i) => i.variant_id === variantId)) { message.warning('이미 추가된 품목입니다'); return; }
    const sq = stockMap[variantId] ?? 0;
    if (stockPartner && sq <= 0) message.warning('해당 품목의 출발 거래처 재고가 0입니다.');
    setItems([...items, { variant_id: variantId, request_qty: 1, sku: v.sku, product_name: v.product_name, color: v.color, size: v.size, stock_qty: sq }]);
  };

  const [creating, setCreating] = useState(false);
  const handleCreate = async (values: any) => {
    if (creating) return;
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    if (stockPartner && transferMode === 'send') {
      const over = items.find((i) => i.request_qty > (i.stock_qty ?? 0));
      if (over) { message.error(`${over.product_name} (${over.color}/${over.size}): 재고 ${over.stock_qty ?? 0}개 초과 (요청 ${over.request_qty}개)`); return; }
    }
    setCreating(true);
    try {
      const body: any = { ...values, request_type: '수평이동', items: items.map(({ variant_id, request_qty }) => ({ variant_id, request_qty })) };
      if (isStore && user?.partnerCode) {
        if (transferMode === 'send') {
          body.from_partner = user.partnerCode;
        } else {
          body.to_partner = user.partnerCode;
          // 요청 모드: 여러 매장 선택 시 from_partners 배열로 전송 (하나의 의뢰 생성)
          const fp = values.from_partner;
          if (Array.isArray(fp) && fp.length > 1) {
            body.from_partners = fp;
            delete body.from_partner;
          } else if (Array.isArray(fp)) {
            body.from_partner = fp[0];
          }
        }
      }
      await shipmentApi.create(body);
      const fpArr = values.from_partner;
      if (Array.isArray(fpArr) && fpArr.length > 1) {
        message.success(`${fpArr.length}개 매장에 수평이동 의뢰가 등록되었습니다.`);
      } else {
        message.success('수평이동 의뢰가 등록되었습니다.');
      }
      setModalOpen(false); form.resetFields(); setItems([]);
      if (view === 'PENDING') loadList('PENDING', 1);
      else if (view === 'ALL') loadList('ALL', listPage);
      loadCounts();
      if (view === 'dashboard') { setAllPage(1); loadAll(1, statusFilter); }
    } catch (e: any) { message.error(e.message); } finally { setCreating(false); }
  };

  const [submitting, setSubmitting] = useState(false);

  // 거절 모달
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await shipmentApi.update(rejectTarget, { status: 'REJECTED', reject_reason: rejectReason.trim() || undefined, reject_partner: user?.partnerCode });
      message.success('거절 처리되었습니다.');
      setRejectOpen(false); setRejectTarget(null); setRejectReason('');
      setExpandedDetails((prev) => { const next = { ...prev }; delete next[rejectTarget]; return next; });
      if (view === 'dashboard') { loadCounts(); loadAll(allPage, statusFilter || undefined); }
      else { loadList(view, listPage); loadCounts(); }
    } catch (e: any) { message.error(e.message); }
  };

  const handleCancel = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'CANCELLED' });
      message.success('취소되었습니다.');
      setExpandedDetails((prev) => { const next = { ...prev }; delete next[id]; return next; });
      if (view === 'dashboard') { loadCounts(); loadAll(allPage, statusFilter || undefined); }
      else { loadList(view, listPage); loadCounts(); }
    } catch (e: any) { message.error(e.message); }
  };

  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); }
    catch (e: any) { message.error(e.message); }
  };

  const handleOpenShipModal = async (record: any) => {
    try {
      const d = await shipmentApi.get(record.request_id);
      setShipTarget(d);
      const qtys: Record<number, number> = {};
      (d as any).items?.forEach((item: any) => { qtys[item.variant_id] = item.request_qty; });
      setShippedQtys(qtys);
      // 출발 매장 재고 조회
      const fromPartner = (d as any).from_partner;
      if (fromPartner) {
        try {
          const res = await apiFetch(`/api/inventory/stock-map?partner_code=${fromPartner}`);
          const json = await res.json();
          if (json.success && json.data) {
            const map: Record<number, number> = {};
            for (const [vid, qty] of Object.entries(json.data)) map[Number(vid)] = qty as number;
            setShippedStockMap(map);
          } else { setShippedStockMap({}); }
        } catch { setShippedStockMap({}); }
      } else { setShippedStockMap({}); }
      setShipModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmShip = async () => {
    if (!shipTarget || submitting) return;
    setSubmitting(true);
    try {
      const sItems = (shipTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id, shipped_qty: shippedQtys[item.variant_id] || 0,
      }));
      await shipmentApi.shipConfirm(shipTarget.request_id, sItems);
      message.success('출고 확인이 완료되었습니다.');
      setExpandedDetails((prev) => { const next = { ...prev }; delete next[shipTarget.request_id]; return next; });
      setShipModalOpen(false); setShipTarget(null);
      if (view === 'dashboard') { loadCounts(); loadAll(allPage, statusFilter || undefined); }
      else { loadList(view, listPage); loadCounts(); }
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
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
    if (!receiveTarget || submitting) return;
    setSubmitting(true);
    try {
      const rItems = (receiveTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id, received_qty: receivedQtys[item.variant_id] || 0,
      }));
      const result = await shipmentApi.receive(receiveTarget.request_id, rItems);
      if ((result as any)?.status === 'RECEIVED') {
        message.success('모든 수량 수령 완료 — 자동 완료 처리되었습니다.');
      } else if ((result as any)?.status === 'DISCREPANCY') {
        message.warning('수량 불일치가 감지되었습니다. 관리자 확인이 필요합니다.');
      } else {
        message.success('수령 확인이 완료되었습니다.');
      }
      setExpandedDetails((prev) => { const next = { ...prev }; delete next[receiveTarget.request_id]; return next; });
      setReceiveModalOpen(false); setReceiveTarget(null);
      if (view === 'dashboard') { loadCounts(); loadAll(allPage, statusFilter || undefined); }
      else { loadList(view, listPage); loadCounts(); }
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const partnerOptions = partners
    .filter((p) => p.partner_type !== '본사' && p.partner_type !== 'HQ')
    .filter((p) => !isStore || p.partner_code !== user?.partnerCode)
    .map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  const getDirection = (record: any): 'send' | 'receive' | null => {
    if (!user?.partnerCode) return null;
    if (record.from_partner === user.partnerCode) return 'send';
    if (record.to_partner === user.partnerCode) return 'receive';
    // 다중 매장 의뢰: target_partners에 포함되면 send 방향
    if (record.target_partners && String(record.target_partners).split(',').includes(user.partnerCode)) return 'send';
    return null;
  };

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
    const detailItems = expandedDetails[record.request_id];
    if (expandLoading[record.request_id]) return <div style={{ textAlign: 'center', padding: 12 }}>로딩 중...</div>;
    if (!detailItems || detailItems.length === 0) return <div style={{ textAlign: 'center', padding: 12, color: '#999' }}>품목 없음</div>;
    return (
      <Table size="small" dataSource={detailItems} rowKey="variant_id" pagination={false}
        columns={[
          { title: 'SKU', dataIndex: 'sku', width: 150 },
          { title: '상품명', dataIndex: 'product_name' },
          { title: '색상', dataIndex: 'color', width: 80 },
          { title: '사이즈', dataIndex: 'size', width: 70 },
          { title: '의뢰', dataIndex: 'request_qty', width: 70, align: 'right' as const },
          { title: '출고', dataIndex: 'shipped_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#1677ff' : '#ccc' }}>{v ?? 0}</span> },
          { title: '수령', dataIndex: 'received_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v ?? 0}</span> },
        ]}
      />
    );
  };

  /* ══════════ 컬럼 정의 ══════════ */
  const baseColumns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no', width: 130 },
    { title: '의뢰일', dataIndex: 'created_at', key: 'created_at', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-' },
    ...(isStore ? [{
      title: '구분', key: 'direction', width: 70,
      render: (_: any, record: any) => {
        const dir = getDirection(record);
        if (dir === 'send') return <Tag color="volcano">보내기</Tag>;
        if (dir === 'receive') return <Tag color="blue">받기</Tag>;
        return '-';
      },
    }] : []),
    { title: '출발', dataIndex: 'from_partner_name', key: 'from_partner_name', width: 130, ellipsis: true,
      render: (v: string, r: any) => {
        if (v) return v;
        if (r.target_partners) {
          const count = String(r.target_partners).split(',').length;
          return <Tag color="blue">{count}개 매장 대기</Tag>;
        }
        return '-';
      },
    },
    { title: '도착', dataIndex: 'to_partner_name', key: 'to_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '품목', dataIndex: 'item_summary', key: 'item_summary', ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999' }}>({r.item_count}종)</span></span> : '-' },
    { title: '의뢰수량', dataIndex: 'total_request_qty', key: 'req_qty', width: 80, align: 'right' as const,
      render: (v: number) => <strong>{v || 0}</strong> },
    { title: '출고수량', dataIndex: 'total_shipped_qty', key: 'ship_qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#1677ff' : '#ccc' }}>{v || 0}</span> },
    { title: '수령수량', dataIndex: 'total_received_qty', key: 'recv_qty', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v || 0}</span> },
    { title: '메모', dataIndex: 'memo', key: 'memo', width: 120, render: (v: string) => v || '-', ellipsis: true },
  ];

  const getStatusTag = (status: string, record: any): { color: string; label: string } => {
    const dir = getDirection(record);
    switch (status) {
      case 'PENDING': return { color: 'default', label: dir === 'receive' ? '입고대기' : '출고대기' };
      case 'SHIPPED': return { color: 'blue', label: dir === 'receive' ? '수령대기' : '상대수령대기' };
      case 'DISCREPANCY': return { color: 'volcano', label: '수량불일치' };
      case 'RECEIVED': return { color: 'green', label: '완료' };
      case 'REJECTED': return { color: 'red', label: '거절' };
      case 'CANCELLED': return { color: 'red', label: '취소' };
      default: return { color: 'default', label: status };
    }
  };

  const canCancelRecord = (record: any) => record.requested_by === user?.userId;

  const allActionColumn = {
    title: '', key: 'action', width: 280, render: (_: any, record: any) => {
      const st = record.status;
      const dir = getDirection(record);
      if (st === 'PENDING') return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {(dir === 'send' || isAdmin) && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleOpenShipModal(record)}>출고확인</Button>}
          {dir === 'send' && <Button size="small" danger style={{ borderColor: '#ff7875' }} icon={<CloseOutlined />} onClick={() => { setRejectTarget(record.request_id); setRejectReason(''); setRejectOpen(true); }}>거절</Button>}
          {(canCancelRecord(record) || isAdmin) && <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기"><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
      if (st === 'SHIPPED') return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {dir === 'receive' && <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleOpenReceiveModal(record)}>수령확인</Button>}
          {isAdmin && <Popconfirm title="취소하면 출고 재고가 복구됩니다. 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기"><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
      if (st === 'DISCREPANCY') return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {dir === 'receive' && <Button size="small" style={{ color: '#fa541c', borderColor: '#ffbb96' }} icon={<ExclamationCircleOutlined />} onClick={() => handleOpenReceiveModal(record)}>수량재확인</Button>}
          {isAdmin && <Popconfirm title="수량 불일치를 확인하고 완료 처리하시겠습니까?" onConfirm={async () => {
            try { await shipmentApi.update(record.request_id, { status: 'RECEIVED' }); message.success('완료 처리되었습니다.'); loadCounts(); loadAll(allPage); }
            catch (e: any) { message.error(e.message); }
          }} okText="완료처리" cancelText="닫기">
            <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} icon={<CheckCircleOutlined />}>완료처리</Button>
          </Popconfirm>}
          {isAdmin && <Popconfirm title="취소하면 재고가 복구됩니다. 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기"><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
      return <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>;
    },
  };

  const statusColumn = {
    title: '상태', dataIndex: 'status', key: 'status', width: 100,
    render: (v: string, record: any) => {
      const tag = getStatusTag(v, record);
      return <Tag color={tag.color}>{tag.label}</Tag>;
    },
  };

  const columnsByStatus: Record<string, any[]> = {
    ALL: [...baseColumns.slice(0, 2), statusColumn, ...baseColumns.slice(2), allActionColumn],
    PENDING: [...baseColumns, { title: '', key: 'action', width: 320, render: (_: any, record: any) => {
      const dir = getDirection(record);
      return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {(dir === 'send' || isAdmin) && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleOpenShipModal(record)}>출고확인</Button>}
          {dir === 'send' && <Button size="small" danger style={{ borderColor: '#ff7875' }} icon={<CloseOutlined />} onClick={() => { setRejectTarget(record.request_id); setRejectReason(''); setRejectOpen(true); }}>거절</Button>}
          {(canCancelRecord(record) || isAdmin) && <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기"><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
    }}],
    SHIPPED: [...baseColumns, { title: '', key: 'action', width: 280, render: (_: any, record: any) => {
      const dir = getDirection(record);
      return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {dir === 'receive' && <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleOpenReceiveModal(record)}>수령확인</Button>}
          {isAdmin && <Popconfirm title="취소하면 출고 재고가 복구됩니다. 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기"><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
    }}],
    DISCREPANCY: [...baseColumns, { title: '', key: 'action', width: 300, render: (_: any, record: any) => {
      const dir = getDirection(record);
      return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {dir === 'receive' && <Button size="small" style={{ color: '#fa541c', borderColor: '#ffbb96' }} icon={<ExclamationCircleOutlined />} onClick={() => handleOpenReceiveModal(record)}>수량재확인</Button>}
          {isAdmin && <Popconfirm title="수량 불일치를 확인하고 완료 처리하시겠습니까?" onConfirm={async () => {
            try { await shipmentApi.update(record.request_id, { status: 'RECEIVED' }); message.success('완료 처리되었습니다.'); loadCounts(); loadAll(allPage); }
            catch (e: any) { message.error(e.message); }
          }} okText="완료처리" cancelText="닫기">
            <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} icon={<CheckCircleOutlined />}>완료처리</Button>
          </Popconfirm>}
          {isAdmin && <Popconfirm title="취소하면 재고가 복구됩니다. 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기"><Button size="small" danger icon={<CloseOutlined />}>취소</Button></Popconfirm>}
        </Space>
      );
    }}],
    RECEIVED: [...baseColumns, { title: '', key: 'action', width: 60, render: (_: any, r: any) => <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.request_id)}>상세</Button> }],
    REJECTED: [...baseColumns, { title: '', key: 'action', width: 60, render: (_: any, r: any) => <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.request_id)}>상세</Button> }],
    CANCELLED: [...baseColumns, { title: '', key: 'action', width: 60, render: (_: any, r: any) => <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.request_id)}>상세</Button> }],
  };

  /* ══════════ 대시보드 렌더 ══════════ */
  const renderDashboard = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 상태별 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
      {STEPS.map((step) => {
        const count = counts[step.key] || 0;
        const needsAction = (step.key === 'PENDING' || step.key === 'SHIPPED' || step.key === 'DISCREPANCY') && count > 0;
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
          scroll={{ x: 1100, y: 'calc(100vh - 420px)' }}
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

  /* ══════════ 상태별 상세뷰 렌더 ══════════ */
  const renderStatusView = () => {
    const isAll = view === 'ALL';
    const step = isAll
      ? { key: 'ALL', label: '전체 의뢰', desc: '모든 수평이동 목록', icon: <UnorderedListOutlined />, color: '#6366f1', bg: '#eef2ff' }
      : STEPS.find((s) => s.key === view)!;
    return (
      <div>
        {/* 헤더 */}
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
          {!isAdmin && (view === 'PENDING' || isAll) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              form.resetFields(); setItems([]); setStockMap({}); setStockPartner(''); setStockRawData([]);
              setTransferMode('send');
              if (isStore && user?.partnerCode) loadStockForPartner(user.partnerCode);
              setModalOpen(true);
            }}>수평이동 등록</Button>
          )}
        </div>

        {/* 테이블 */}
        <Table
          columns={columnsByStatus[view]}
          dataSource={listData}
          rowKey="request_id"
          loading={listLoading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 310px)' }}
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
      <PageHeader title="수평이동" extra={!isAdmin && view === 'dashboard' ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          form.resetFields(); setItems([]); setStockMap({}); setStockPartner(''); setStockRawData([]);
              if (isStore && user?.partnerCode) loadStockForPartner(user.partnerCode);
              setModalOpen(true);
        }}>수평이동 등록</Button>
      ) : undefined} />

      {/* ── 검색 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="의뢰번호 / 상품명 / SKU 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={handleSearch} style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={(v) => setDateRange(v as any)} /></div>
        <Button onClick={handleSearch}>조회</Button>
      </div>

      {/* ── 대시보드 or 상세뷰 ── */}
      {view === 'dashboard' ? renderDashboard() : renderStatusView()}

      {/* ══ 모달 ══ */}
      <Modal title="수평이동 등록" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={creating} okText="등록" cancelText="취소" width={700}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          {isStore && (
            <div style={{ marginBottom: 16 }}>
              <Radio.Group value={transferMode} onChange={(e) => {
                const mode = e.target.value as 'send' | 'request';
                setTransferMode(mode);
                form.resetFields(['from_partner', 'to_partner']);
                setItems([]); setStockMap({}); setStockPartner(''); setStockRawData([]);
                if (mode === 'send' && user?.partnerCode) loadStockForPartner(user.partnerCode);
              }} buttonStyle="solid" style={{ width: '100%' }}>
                <Radio.Button value="send" style={{ width: '50%', textAlign: 'center' }}>보내기 (우리매장 → 상대매장)</Radio.Button>
                <Radio.Button value="request" style={{ width: '50%', textAlign: 'center' }}>요청하기 (상대매장 → 우리매장)</Radio.Button>
              </Radio.Group>
            </div>
          )}
          {!isStore && (
            <Form.Item name="from_partner" label="이동 출발 거래처" rules={[{ required: true, message: '출발 거래처를 선택해주세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions}
                onChange={(v) => loadStockForPartner(v)} />
            </Form.Item>
          )}
          {isStore && transferMode === 'request' && (
            <Form.Item name="from_partner" label="요청할 매장 (보내는 쪽) — 여러 매장 선택 가능" rules={[{ required: true, message: '매장을 선택해주세요' }]}>
              <Select mode="multiple" showSearch optionFilterProp="label" placeholder="매장을 선택하세요 (복수 선택 가능)" options={partnerOptions}
                onChange={(v: string[]) => { if (v.length === 1) loadStockForPartner(v[0]); else { setStockMap({}); setStockPartner(''); } }} />
            </Form.Item>
          )}
          {(isStore && transferMode === 'send') && (
            <Form.Item name="to_partner" label="보낼 매장 (받는 쪽)" rules={[{ required: true, message: '매장을 선택해주세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="매장 선택" options={partnerOptions} />
            </Form.Item>
          )}
          {!isStore && (
            <Form.Item name="to_partner" label="이동 도착 거래처" rules={[{ required: true, message: '도착 거래처를 선택해주세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
            </Form.Item>
          )}
          <Form.Item label="품목 추가">
            <div style={{ display: 'flex', gap: 8 }}>
              <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
                onSearch={handleVariantSearch} onChange={handleAddItem}
                notFoundContent="2자 이상 입력해주세요" style={{ flex: 1 }}>
                {variantOptions.map((v) => (
                  <Select.Option key={v.variant_id} value={v.variant_id}>{v.sku} - {v.product_name} ({v.color}/{v.size}){v.current_stock != null ? ` [재고: ${v.current_stock}]` : ''}</Select.Option>
                ))}
              </Select>
              <Button icon={<ImportOutlined />} loading={loadingAllStock} onClick={handleLoadAllStock}>전체재고</Button>
            </div>
          </Form.Item>
          {items.length > 0 && (
            <Table size="small" dataSource={items} rowKey="variant_id" pagination={false} style={{ marginBottom: 16 }}
              columns={[
                { title: 'SKU', dataIndex: 'sku', width: 140 },
                { title: '상품명', dataIndex: 'product_name', ellipsis: true },
                { title: '색상', dataIndex: 'color', width: 70 },
                { title: '사이즈', dataIndex: 'size', width: 65 },
                { title: '재고', dataIndex: 'stock_qty', width: 60, align: 'right' as const,
                  render: (v: number) => <span style={{ color: (v ?? 0) === 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>{v ?? 0}</span> },
                { title: '수량', key: 'qty', width: 100, render: (_: any, r: ItemRow) => {
                  const maxQty = stockPartner ? (r.stock_qty ?? 0) : undefined;
                  const isOver = stockPartner && r.request_qty > (r.stock_qty ?? 0);
                  return (
                    <InputNumber min={1} max={maxQty || undefined} value={r.request_qty} size="small"
                      status={isOver ? 'error' : undefined}
                      onChange={(v) => setItems(items.map((i) => i.variant_id === r.variant_id ? { ...i, request_qty: v || 1 } : i))} />
                  );
                }},
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
      <ShippedQtyModal open={shipModalOpen} detail={shipTarget} qtys={shippedQtys}
        onQtyChange={(vid, qty) => setShippedQtys({ ...shippedQtys, [vid]: qty })}
        onConfirm={handleConfirmShip} onCancel={() => setShipModalOpen(false)} confirmLoading={submitting}
        alertMessage={isAdmin ? "출고할 실제 수량을 입력하세요. 확인 시 출발매장 재고가 차감됩니다." : "출고를 확인하세요. 확인 시 출발매장 재고가 차감됩니다."}
        stockMap={shippedStockMap} readOnly={!isAdmin} />
      <ReceivedQtyModal open={receiveModalOpen} detail={receiveTarget} qtys={receivedQtys}
        onQtyChange={(vid, qty) => setReceivedQtys({ ...receivedQtys, [vid]: qty })}
        onConfirm={handleConfirmReceive} onCancel={() => setReceiveModalOpen(false)} confirmLoading={submitting}
        alertMessage="수령한 실제 수량을 입력하세요. 출고수량과 다르면 '수량불일치'로 신고됩니다." />

      {/* 거절 사유 입력 모달 */}
      <Modal
        title="수평이동 요청 거절"
        open={rejectOpen}
        onOk={handleReject}
        onCancel={() => { setRejectOpen(false); setRejectTarget(null); setRejectReason(''); }}
        okText="거절 처리"
        okButtonProps={{ danger: true }}
        cancelText="닫기"
      >
        <div style={{ marginBottom: 12, color: '#666' }}>거절 사유를 입력해주세요. 요청한 매장에 알림이 발송됩니다.</div>
        <Input.TextArea
          rows={3}
          placeholder="거절 사유 입력"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={200}
          showCount
        />
      </Modal>
    </div>
  );
}
