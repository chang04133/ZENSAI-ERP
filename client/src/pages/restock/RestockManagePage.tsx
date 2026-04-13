import { useEffect, useState, CSSProperties } from 'react';
import {
  Table, Tag, Button, Select, Tabs, Modal, Form, InputNumber, DatePicker,
  Input, Space, Row, Col, Popconfirm, message,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, AlertOutlined,
  WarningOutlined, ExclamationCircleOutlined, FileTextOutlined,
  CheckCircleOutlined, ShoppingCartOutlined, InboxOutlined, DownloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { exportToExcel } from '../../utils/export-excel';
import { useCodeLabels } from '../../hooks/useCodeLabels';
import { restockApi } from '../../modules/restock/restock.api';
import { useRestockStore } from '../../modules/restock/restock.store';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import type { RestockSuggestion, RestockRequest } from '../../../../shared/types/restock';
import dayjs from 'dayjs';

const URGENCY_COLORS: Record<string, string> = { CRITICAL: 'red', WARNING: 'orange', NORMAL: 'blue' };
const URGENCY_LABELS: Record<string, string> = { CRITICAL: '위험', WARNING: '주의', NORMAL: '보통' };
const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', APPROVED: 'blue', ORDERED: 'cyan', RECEIVED: 'green', CANCELLED: 'red' };
const STATUS_LABELS: Record<string, string> = { DRAFT: '작성중', APPROVED: '승인', ORDERED: '발주', RECEIVED: '입고완료', CANCELLED: '취소' };

function SummaryCard({ title, count, icon, bg, color, sub, onClick }: {
  title: string; count: number; icon: React.ReactNode; bg: string; color: string; sub?: string; onClick?: () => void;
}) {
  const style: CSSProperties = {
    background: bg, borderRadius: 12, padding: '14px 18px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 80, border: 'none',
    cursor: onClick ? 'pointer' : undefined, transition: 'transform 0.15s',
  };
  return (
    <div style={style} onClick={onClick}>
      <div>
        <div style={{ fontSize: 11, color: color + 'cc' }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.3 }}>{count}건</div>
        {sub && <div style={{ fontSize: 11, color: color + '99', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 26, color: color + '44' }}>{icon}</div>
    </div>
  );
}

export default function RestockManagePage() {
  const navigate = useNavigate();
  const { formatCode } = useCodeLabels();

  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === 'STORE_MANAGER' || user?.role === 'STORE_STAFF';

  const [tab, setTab] = useState(isStore ? 'broken' : 'suggestions');
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState('');

  // ── 제안 탭 ──
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [salesPeriodDays, setSalesPeriodDays] = useState(60);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugCategoryFilter, setSugCategoryFilter] = useState<string[]>([]);
  const [sugSeasonFilter, setSugSeasonFilter] = useState<string[]>([]);
  const [sugUrgencyFilter, setSugUrgencyFilter] = useState<string[]>([]);

  // ── 의뢰 목록 탭 ──
  const { data: requests, total, loading: reqLoading, fetchList } = useRestockStore();
  const [reqPage, setReqPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // ── 진행관리 탭 ──
  const [progressPartnerFilter, setProgressPartnerFilter] = useState<string | undefined>();
  const [progressStatusFilter, setProgressStatusFilter] = useState<string | undefined>();
  const [progressStats, setProgressStats] = useState<any[]>([]);
  const [progressPage, setProgressPage] = useState(1);
  const [progressData, setProgressData] = useState<any[]>([]);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressLoading, setProgressLoading] = useState(false);

  // ── 매장 사이즈 깨짐 탭 ──
  const [brokenData, setBrokenData] = useState<any[]>([]);
  const [brokenLoading, setBrokenLoading] = useState(false);
  const [brokenPartner, setBrokenPartner] = useState<string | undefined>(isStore && user?.partnerCode ? user.partnerCode : undefined);

  // ── 생성 모달 ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [selectedItems, setSelectedItems] = useState<RestockSuggestion[]>([]);
  const [itemQtys, setItemQtys] = useState<Record<number, number>>({});
  const [creating, setCreating] = useState(false);

  // ── 상세 모달 ──
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<RestockRequest | null>(null);

  // ── 수령 모달 ──
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveItems, setReceiveItems] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/partners?limit=1000').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch(() => {});
  }, []);

  /* ── 데이터 로드 함수들 ── */
  const loadSuggestions = async () => {
    setSugLoading(true);
    try {
      const result = await restockApi.getRestockSuggestions();
      setSuggestions(result.suggestions);
      setSalesPeriodDays(result.salesPeriodDays);
    } catch (e: any) { message.error(e.message); }
    finally { setSugLoading(false); }
  };

  const loadRequests = () => {
    const params: Record<string, string> = { page: String(reqPage), limit: '50' };
    if (statusFilter.length) params.status = statusFilter.join(',');
    if (partnerFilter) params.partner_code = partnerFilter;
    fetchList(params);
  };

  const loadProgressStats = async () => {
    try { setProgressStats(await restockApi.getProgressStats(progressPartnerFilter)); }
    catch (e: any) { message.error(e.message); }
  };

  const loadProgressList = async () => {
    setProgressLoading(true);
    try {
      const params: Record<string, string> = { page: String(progressPage), limit: '50' };
      if (progressStatusFilter) params.status = progressStatusFilter;
      if (progressPartnerFilter) params.partner_code = progressPartnerFilter;
      const res = await apiFetch(`/api/restocks?${new URLSearchParams(params)}`);
      const d = await res.json();
      if (d.success) {
        setProgressData(d.data?.data || d.data || []);
        setProgressTotal(d.data?.total || d.total || 0);
      }
    } catch (e: any) { message.error(e.message); }
    finally { setProgressLoading(false); }
  };

  const loadBrokenSizes = async () => {
    const pc = isStore ? user?.partnerCode : brokenPartner;
    if (!pc) return;
    setBrokenLoading(true);
    try { setBrokenData(await restockApi.storeBrokenSizes(pc)); }
    catch (e: any) { message.error(e.message); }
    finally { setBrokenLoading(false); }
  };

  useEffect(() => {
    if (tab === 'suggestions') loadSuggestions();
    else if (tab === 'requests') loadRequests();
    else if (tab === 'progress') { loadProgressStats(); loadProgressList(); }
    else if (tab === 'broken') loadBrokenSizes();
  }, [tab]);

  useEffect(() => {
    if (tab === 'requests') loadRequests();
  }, [partnerFilter]);

  useEffect(() => { if (tab === 'requests') loadRequests(); }, [reqPage, statusFilter]);
  useEffect(() => { if (tab === 'progress') { loadProgressStats(); loadProgressList(); } }, [progressPartnerFilter]);
  useEffect(() => { if (tab === 'progress') loadProgressList(); }, [progressPage, progressStatusFilter]);
  useEffect(() => { if (tab === 'broken') loadBrokenSizes(); }, [brokenPartner]);

  /* ── 의뢰 생성 ── */
  const openCreateModal = () => {
    if (selectedItems.length === 0) { message.warning('제안 목록에서 품목을 선택해주세요.'); return; }
    const qtys: Record<number, number> = {};
    selectedItems.forEach(i => { qtys[i.variant_id] = i.suggested_qty; });
    setItemQtys(qtys);
    createForm.resetFields();
    setCreateOpen(true);
  };

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const items = selectedItems.map(s => ({
        variant_id: s.variant_id,
        request_qty: itemQtys[s.variant_id] || s.suggested_qty,
      }));
      // 선택된 아이템 중 최고 긴급도를 priority로 전달
      const priority = selectedItems.some(s => s.urgency === 'CRITICAL') ? 'CRITICAL'
        : selectedItems.some(s => s.urgency === 'WARNING') ? 'WARNING' : 'NORMAL';
      await restockApi.create({
        partner_code: values.partner_code,
        expected_date: values.expected_date ? values.expected_date.format('YYYY-MM-DD') : null,
        memo: values.memo,
        priority,
        items,
      });
      message.success('재입고 의뢰가 생성되었습니다.');
      setCreateOpen(false);
      setSelectedItems([]);
      setTab('requests');
      loadRequests();
    } catch (e: any) { message.error(e.message); }
    finally { setCreating(false); }
  };

  /* ── 생산계획으로 보내기 ── */
  const sendToProduction = () => {
    if (selectedItems.length === 0) { message.warning('품목을 선택해주세요.'); return; }
    navigate('/production/plan', {
      state: {
        restockItems: selectedItems.map(s => ({
          variant_id: s.variant_id,
          suggested_qty: itemQtys[s.variant_id] || s.suggested_qty,
        })),
      },
    });
  };

  /* ── 상세 ── */
  const openDetail = async (id: number) => {
    try {
      setDetailData(await restockApi.get(id));
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 진행관리: 상태변경 ── */
  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await restockApi.update(id, { status: newStatus });
      message.success(`상태가 ${STATUS_LABELS[newStatus]}(으)로 변경되었습니다.`);
      loadProgressStats();
      loadProgressList();
      if (detailData?.request_id === id) {
        setDetailData(await restockApi.get(id));
      }
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 수령확인 ── */
  const openReceive = () => {
    if (!detailData?.items) return;
    setReceiveItems(detailData.items.map(i => ({ ...i, received_qty: i.request_qty })));
    setReceiveOpen(true);
  };

  const handleReceive = async () => {
    if (!detailData) return;
    try {
      const items = receiveItems.map(i => ({ item_id: i.item_id, received_qty: i.received_qty }));
      await restockApi.receive(detailData.request_id, items);
      message.success('수령확인 완료. 재고가 자동 반영되었습니다.');
      setReceiveOpen(false);
      loadProgressStats();
      loadProgressList();
      setDetailData(await restockApi.get(detailData.request_id));
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 제안 데이터: 필터 적용 ── */
  const filteredSuggestions = suggestions.filter(s => {
    if (sugCategoryFilter.length && !sugCategoryFilter.includes(s.category)) return false;
    if (sugSeasonFilter.length && !sugSeasonFilter.includes(s.season)) return false;
    if (sugUrgencyFilter.length && !sugUrgencyFilter.includes(s.urgency)) return false;
    return true;
  });

  /* ── 제안 통계 ── */
  const criticalCount = suggestions.filter(s => s.urgency === 'CRITICAL').length;
  const warningCount = suggestions.filter(s => s.urgency === 'WARNING').length;
  const totalSugQty = suggestions.reduce((s, i) => s + (i.suggested_qty || 0), 0);

  /* ── 제안 카테고리 목록 ── */
  const sugCategories = [...new Set(suggestions.map(s => s.category).filter(Boolean))].sort();
  const sugSeasons = [...new Set(suggestions.map(s => s.season).filter(Boolean))].sort();

  /* ── 진행관리 통계 ── */
  const getStat = (status: string) => {
    const s = progressStats.find(p => p.status === status);
    return { count: s?.count || 0, qty: s?.total_qty || 0 };
  };
  const draft = getStat('DRAFT');
  const approved = getStat('APPROVED');
  const ordered = getStat('ORDERED');
  const received = getStat('RECEIVED');

  /* ── 제안 엑셀 내보내기 ── */
  const exportSuggestions = () => {
    exportToExcel(filteredSuggestions, [
      { title: '긴급도', key: 'urgency' }, { title: '상품코드', key: 'product_code' },
      { title: '상품명', key: 'product_name' }, { title: 'SKU', key: 'sku' },
      { title: '컬러', key: 'color' }, { title: '사이즈', key: 'size' },
      { title: '카테고리', key: 'category' }, { title: '시즌', key: 'season' },
      { title: '판매율(%)', key: 'sell_through_rate' },
      { title: `${salesPeriodDays}일판매`, key: 'total_sold' },
      { title: '현재고', key: 'current_stock' }, { title: '생산중', key: 'in_production_qty' },
      { title: '부족량', key: 'shortage_qty' }, { title: '소진일', key: 'days_of_stock' },
      { title: '권장수량', key: 'suggested_qty' },
    ], `재입고제안_${dayjs().format('YYYYMMDD')}`);
  };

  /* ── 컬럼 정의 ── */
  const sugColumns = [
    { title: '긴급도', dataIndex: 'urgency', key: 'urgency', width: 70,
      render: (v: string) => <Tag color={URGENCY_COLORS[v]}>{URGENCY_LABELS[v]}</Tag>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 60 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 55, render: (v: string) => <Tag>{v}</Tag> },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80,
      render: (v: string) => <Tag color="cyan">{v}</Tag>,
    },
    { title: '판매율', dataIndex: 'sell_through_rate', key: 'sell_through_rate', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.sell_through_rate - b.sell_through_rate,
      render: (v: number) => <span style={{ fontWeight: 600, color: v >= 70 ? '#f5222d' : v >= 50 ? '#fa8c16' : '#1890ff' }}>{v}%</span>,
    },
    { title: `${salesPeriodDays}일판매`, dataIndex: 'total_sold', key: 'total_sold', width: 80,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.total_sold - b.total_sold,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '현재고', dataIndex: 'current_stock', key: 'current_stock', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.current_stock - b.current_stock,
      render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 5 ? 'orange' : 'default'}>{v}</Tag>,
    },
    { title: '생산중', dataIndex: 'in_production_qty', key: 'in_production_qty', width: 65,
      render: (v: number) => v > 0 ? <span style={{ color: '#722ed1' }}>{v}</span> : '-',
    },
    { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage_qty', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.shortage_qty - b.shortage_qty,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 700 }}>{v}</span> : '-',
    },
    { title: '소진일', dataIndex: 'days_of_stock', key: 'days_of_stock', width: 65,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.days_of_stock - b.days_of_stock,
      render: (v: number) => <Tag color={v < 7 ? 'red' : v < 14 ? 'orange' : v < 30 ? 'gold' : 'default'}>{v}일</Tag>,
    },
    { title: '권장수량', dataIndex: 'suggested_qty', key: 'suggested_qty', width: 80,
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : '-',
    },
  ];

  const reqColumns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no',
      render: (v: string, r: any) => <a onClick={() => openDetail(r.request_id)}>{v}</a>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
    },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '입고예정', dataIndex: 'expected_date', key: 'expected_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70 },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80 },
    { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true },
  ];

  const progressColumns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no',
      render: (v: string, r: any) => <a onClick={() => openDetail(r.request_id)}>{v}</a>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
    },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '입고예정', dataIndex: 'expected_date', key: 'expected_date', width: 100,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '입고일', dataIndex: 'received_date', key: 'received_date', width: 100,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70 },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80 },
    { title: '관리', key: 'actions', width: 180,
      render: (_: any, r: any) => (
        <Space size="small">
          {r.status === 'DRAFT' && <Button size="small" type="primary" onClick={() => handleStatusChange(r.request_id, 'APPROVED')}>승인</Button>}
          {r.status === 'APPROVED' && <Button size="small" onClick={() => handleStatusChange(r.request_id, 'ORDERED')}>발주</Button>}
          {r.status === 'ORDERED' && <Button size="small" type="primary" onClick={() => openDetail(r.request_id)}>수령확인</Button>}
          {['DRAFT', 'APPROVED'].includes(r.status) && (
            <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(r.request_id, 'CANCELLED')}>
              <Button size="small" danger>취소</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── 탭 상단 액션바 (본사만) ── */}
      {!isStore && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
        {tab === 'suggestions' && (
          <>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
              <Select mode="multiple" maxTagCount="responsive" value={sugCategoryFilter} onChange={setSugCategoryFilter} placeholder="전체" allowClear style={{ width: 150 }}
                options={sugCategories.map(c => ({ label: c, value: c }))} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
              <Select mode="multiple" maxTagCount="responsive" value={sugSeasonFilter} onChange={setSugSeasonFilter} placeholder="전체" allowClear style={{ width: 150 }}
                options={sugSeasons.map(s => ({ label: formatCode('SEASON', s), value: s }))} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>긴급도</div>
              <Select mode="multiple" maxTagCount="responsive" value={sugUrgencyFilter} onChange={setSugUrgencyFilter} placeholder="전체" allowClear style={{ width: 150 }}
                options={[{ label: '위험', value: 'CRITICAL' }, { label: '주의', value: 'WARNING' }, { label: '보통', value: 'NORMAL' }]} /></div>
            <div style={{ flex: 1 }} />
            {!isStore && selectedItems.length > 0 && (
              <>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>재입고 의뢰 ({selectedItems.length}건)</Button>
                <Button icon={<ThunderboltOutlined />} onClick={sendToProduction}
                  style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>
                  생산계획으로 ({selectedItems.length}건)
                </Button>
              </>
            )}
            <Button icon={<DownloadOutlined />} onClick={exportSuggestions}>엑셀</Button>
            <Button icon={<ReloadOutlined />} onClick={loadSuggestions}>새로고침</Button>
          </>
        )}
        {tab === 'progress' && (
          <>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
              <Select placeholder="거래처" allowClear value={progressPartnerFilter}
                onChange={setProgressPartnerFilter} style={{ width: 150 }}
                options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} /></div>
            <div style={{ flex: 1 }} />
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(progressData, [
              { title: '의뢰번호', key: 'request_no' }, { title: '거래처', key: 'partner_name' },
              { title: '상태', key: 'status' }, { title: '의뢰일', key: 'request_date' },
              { title: '입고예정', key: 'expected_date' }, { title: '품목수', key: 'item_count' },
              { title: '총수량', key: 'total_qty' },
            ], `재입고진행_${dayjs().format('YYYYMMDD')}`)}>엑셀</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { loadProgressStats(); loadProgressList(); }}>새로고침</Button>
          </>
        )}
      </div>
      )}

      <Tabs activeKey={tab} onChange={setTab} items={[
        /* ── Tab: 재입고 제안 (본사만) ── */
        ...(!isStore ? [{
          key: 'suggestions', label: <span><AlertOutlined /> 재입고 제안{suggestions.length > 0 ? ` (${suggestions.length})` : ''}</span>,
          children: (
            <>
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                  <SummaryCard title="긴급 보충 (7일 미만)" count={criticalCount}
                    icon={<ExclamationCircleOutlined />} bg="linear-gradient(135deg, #ff4d4f22 0%, #ff4d4f11 100%)" color="#cf1322"
                    sub={`소진 임박 품목`}
                    onClick={() => { setSugUrgencyFilter(sugUrgencyFilter.includes('CRITICAL') ? [] : ['CRITICAL']); }} />
                </Col>
                <Col xs={24} sm={8}>
                  <SummaryCard title="주의 품목 (14일 미만)" count={warningCount}
                    icon={<WarningOutlined />} bg="linear-gradient(135deg, #fa8c1622 0%, #fa8c1611 100%)" color="#d46b08"
                    sub={`조기 발주 권장`}
                    onClick={() => { setSugUrgencyFilter(sugUrgencyFilter.includes('WARNING') ? [] : ['WARNING']); }} />
                </Col>
                <Col xs={24} sm={8}>
                  <SummaryCard title="전체 보충 필요" count={suggestions.length}
                    icon={<AlertOutlined />} bg="linear-gradient(135deg, #1890ff22 0%, #1890ff11 100%)" color="#096dd9"
                    sub={`총 권장수량 ${totalSugQty.toLocaleString()}개`}
                    onClick={() => { setSugUrgencyFilter([]); }} />
                </Col>
              </Row>
              <Table dataSource={filteredSuggestions} columns={sugColumns} rowKey="variant_id"
                loading={sugLoading} size="small" scroll={{ x: 1200, y: 'calc(100vh - 380px)' }}
                pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                rowSelection={isStore ? undefined : { selectedRowKeys: selectedItems.map(i => i.variant_id), onChange: (_keys, rows) => setSelectedItems(rows) }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                {salesPeriodDays}일 판매 기반 분석 · 판매율 &ge;40% · 계절가중치 적용 · 소진일 오름차순
              </div>
            </>
          ),
        }] : []),
        /* ── Tab: 의뢰 목록 (본사만) ── */
        ...(!isStore ? [{
          key: 'requests', label: '의뢰 목록',
          children: (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
                <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
                  <Select mode="multiple" maxTagCount="responsive" value={statusFilter} onChange={(v) => { setStatusFilter(v); setReqPage(1); }} style={{ width: 180 }}
                    placeholder="전체" allowClear options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))} /></div>
                <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
                  <Select value={partnerFilter} onChange={setPartnerFilter} style={{ width: 150 }}
                    options={[{ label: '전체 보기', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
              </div>
              <Table dataSource={requests} columns={reqColumns} rowKey="request_id"
                loading={reqLoading} size="small" scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
                pagination={{ current: reqPage, total, pageSize: 50, onChange: setReqPage, showTotal: (t) => `총 ${t}건` }} />
            </>
          ),
        },
        /* ── Tab: 진행관리 (본사만) ── */
        {
          key: 'progress', label: '진행관리',
          children: (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} lg={6}>
                  <SummaryCard title="작성중" count={draft.count} sub={`${draft.qty.toLocaleString()}개`}
                    icon={<FileTextOutlined />} bg="linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)" color="#333"
                    onClick={() => setProgressStatusFilter(progressStatusFilter === 'DRAFT' ? undefined : 'DRAFT')} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <SummaryCard title="승인완료" count={approved.count} sub={`${approved.qty.toLocaleString()}개`}
                    icon={<CheckCircleOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
                    onClick={() => setProgressStatusFilter(progressStatusFilter === 'APPROVED' ? undefined : 'APPROVED')} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <SummaryCard title="발주진행" count={ordered.count} sub={`${ordered.qty.toLocaleString()}개`}
                    icon={<ShoppingCartOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
                    onClick={() => setProgressStatusFilter(progressStatusFilter === 'ORDERED' ? undefined : 'ORDERED')} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <SummaryCard title="입고완료" count={received.count} sub={`${received.qty.toLocaleString()}개`}
                    icon={<InboxOutlined />} bg="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" color="#fff"
                    onClick={() => setProgressStatusFilter(progressStatusFilter === 'RECEIVED' ? undefined : 'RECEIVED')} />
                </Col>
              </Row>
              <Table dataSource={progressData} columns={progressColumns} rowKey="request_id"
                loading={progressLoading} size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
                pagination={{ current: progressPage, total: progressTotal, pageSize: 50, onChange: setProgressPage, showTotal: (t) => `총 ${t}건` }} />
            </>
          ),
        }] : []),
        /* ── Tab: 매장 사이즈 깨짐 (전체) ── */
        {
          key: 'broken', label: <span><ThunderboltOutlined /> {isStore ? '재입고 추천' : '매장 사이즈 깨짐'}{brokenData.length > 0 ? ` (${brokenData.length})` : ''}</span>,
          children: (
            <>
              {!isStore && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
                  <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>매장</div>
                    <Select value={brokenPartner} onChange={setBrokenPartner} style={{ width: 200 }}
                      placeholder="매장 선택" showSearch optionFilterProp="label"
                      options={partners.filter((p: any) => p.partner_type === '매장' || p.partner_type === 'STORE').map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
                  </div>
                  <Button icon={<ReloadOutlined />} onClick={loadBrokenSizes}>새로고침</Button>
                </div>
              )}
              {!brokenPartner && !isStore ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>매장을 선택해주세요</div>
              ) : (
                <Table dataSource={brokenData} rowKey={(r) => `${r.product_code}__${r.color}`}
                  loading={brokenLoading} size="small" scroll={{ x: 900, y: 'calc(100vh - 240px)' }}
                  pagination={{ pageSize: 50, showTotal: (t: number) => `총 ${t}건` }}
                  columns={[
                    { title: '품번', dataIndex: 'product_code', width: 130, fixed: 'left' as const },
                    { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
                    { title: '카테고리', dataIndex: 'category', width: 80 },
                    { title: '시즌', dataIndex: 'season', width: 80 },
                    { title: '컬러', dataIndex: 'color', width: 80 },
                    { title: '빠진 사이즈', key: 'missing', width: 160,
                      render: (_: any, r: any) => (
                        <Space size={4} wrap>
                          {(r.missing_sizes || []).map((s: string) => {
                            const v = r.missing_variants?.find((mv: any) => mv.size === s);
                            return <Tag key={s} color="red">{s}{v?.other_stock > 0 ? <span style={{ fontSize: 10, marginLeft: 2 }}>({v.other_stock})</span> : ''}</Tag>;
                          })}
                        </Space>
                      ),
                    },
                    { title: '보유 사이즈', key: 'instock', width: 80, align: 'center' as const,
                      render: (_: any, r: any) => <Tag color="green">{r.sizes_in_stock}개</Tag>,
                    },
                    { title: '전체', key: 'total', width: 60, align: 'center' as const,
                      render: (_: any, r: any) => `${r.total_sizes}`,
                    },
                  ]}
                />
              )}
              <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                매장에 일부 사이즈만 빠진 품목입니다. 전체 사이즈 0인 품번은 제외됩니다. 빨간 태그 옆 괄호 안 숫자는 다른 매장/본사 창고에 남아있는 재고 수량입니다.
              </div>
            </>
          ),
        },
      ]} />

      {/* ── 의뢰 생성 모달 ── */}
      <Modal title="재입고 의뢰 생성" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()} okText="생성" cancelText="취소" confirmLoading={creating} width={700}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="partner_code" label="입고 거래처" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
                <Select showSearch placeholder="거래처" optionFilterProp="label"
                  options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_date" label="입고 예정일">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 8, fontWeight: 600, marginBottom: 8 }}>선택 품목 ({selectedItems.length}건)</div>
        <Table dataSource={selectedItems} rowKey="variant_id" size="small" pagination={false} scroll={{ y: 300 }}
          columns={[
            { title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
            { title: 'Size', dataIndex: 'size', key: 'size', width: 50 },
            { title: '현재고', dataIndex: 'current_stock', key: 'current_stock', width: 60 },
            { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage_qty', width: 60,
              render: (v: number) => <span style={{ color: '#f5222d' }}>{v}</span>,
            },
            { title: '주문수량', key: 'qty', width: 100,
              render: (_: any, r: RestockSuggestion) => (
                <InputNumber min={1} value={itemQtys[r.variant_id] || r.suggested_qty}
                  onChange={(v) => setItemQtys(prev => ({ ...prev, [r.variant_id]: v || 1 }))}
                  size="small" style={{ width: 80 }} />
              ),
            },
          ]} />
      </Modal>

      {/* ── 상세 모달 ── */}
      <Modal
        title={detailData ? `재입고 의뢰 - ${detailData.request_no}` : '상세'}
        open={detailOpen} onCancel={() => setDetailOpen(false)} width={750}
        footer={
          <Space>
            {detailData?.status === 'DRAFT' && <Button type="primary" onClick={() => handleStatusChange(detailData.request_id, 'APPROVED')}>승인</Button>}
            {detailData?.status === 'APPROVED' && <Button onClick={() => handleStatusChange(detailData.request_id, 'ORDERED')}>발주 처리</Button>}
            {detailData?.status === 'ORDERED' && <Button type="primary" onClick={openReceive}>수령확인</Button>}
            {detailData && ['DRAFT', 'APPROVED'].includes(detailData.status) && (
              <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(detailData.request_id, 'CANCELLED')}>
                <Button danger>취소</Button>
              </Popconfirm>
            )}
            <Button onClick={() => setDetailOpen(false)}>닫기</Button>
          </Space>
        }>
        {detailData && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>거래처: <strong>{detailData.partner_name}</strong></Col>
              <Col span={8}>상태: <Tag color={STATUS_COLORS[detailData.status]}>{STATUS_LABELS[detailData.status]}</Tag></Col>
              <Col span={8}>의뢰일: {dayjs(detailData.request_date).format('YYYY-MM-DD')}</Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>입고예정: {detailData.expected_date ? dayjs(detailData.expected_date).format('YYYY-MM-DD') : '-'}</Col>
              <Col span={8}>입고일: {detailData.received_date ? dayjs(detailData.received_date).format('YYYY-MM-DD') : '-'}</Col>
              <Col span={8}>요청자: {detailData.requested_by || '-'}</Col>
            </Row>
            {detailData.memo && <div style={{ marginBottom: 12, color: '#888' }}>메모: {detailData.memo}</div>}
            <Table dataSource={detailData.items} rowKey="item_id" size="small" pagination={false}
              columns={[
                { title: '상품', dataIndex: 'product_name', key: 'product_name' },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
                { title: '컬러', dataIndex: 'color', key: 'color', width: 60 },
                { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => <Tag>{v}</Tag> },
                { title: '요청수량', dataIndex: 'request_qty', key: 'request_qty', width: 80 },
                { title: '입고수량', dataIndex: 'received_qty', key: 'received_qty', width: 80,
                  render: (v: number) => v > 0 ? <Tag color="green">{v}</Tag> : '-',
                },
              ]}
              summary={(data) => {
                const totalReq = data.reduce((s, r) => s + (r.request_qty || 0), 0);
                const totalRec = data.reduce((s, r) => s + (r.received_qty || 0), 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right"><strong>합계</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={4}><strong>{totalReq}</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={5}>{totalRec > 0 ? <Tag color="green"><strong>{totalRec}</strong></Tag> : '-'}</Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }} />
          </>
        )}
      </Modal>

      {/* ── 수령확인 모달 ── */}
      <Modal title="수령확인 - 입고수량 입력" open={receiveOpen} onCancel={() => setReceiveOpen(false)}
        onOk={handleReceive} okText="수령확인" cancelText="취소" width={600}>
        <p style={{ color: '#888', marginBottom: 12 }}>각 품목의 실제 입고 수량을 입력해주세요. 확인 시 재고에 자동 반영됩니다.</p>
        <Table dataSource={receiveItems} rowKey="item_id" size="small" pagination={false}
          columns={[
            { title: '상품', dataIndex: 'product_name', key: 'product_name' },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
            { title: '사이즈', dataIndex: 'size', key: 'size', width: 60 },
            { title: '요청', dataIndex: 'request_qty', key: 'request_qty', width: 60 },
            { title: '입고수량', key: 'received_qty', width: 100,
              render: (_: any, record: any, index: number) => (
                <InputNumber min={0} max={record.request_qty * 2} value={record.received_qty}
                  onChange={(v) => {
                    const updated = [...receiveItems];
                    updated[index] = { ...updated[index], received_qty: v || 0 };
                    setReceiveItems(updated);
                  }} size="small" style={{ width: 80 }} />
              ),
            },
          ]} />
      </Modal>
    </div>
  );
}
