import { useEffect, useState, useRef, CSSProperties } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Badge, Progress, Button, Popconfirm, Modal, InputNumber, Alert, message } from 'antd';
import {
  ShopOutlined, TagsOutlined, InboxOutlined, DollarOutlined,
  RiseOutlined, ShoppingCartOutlined, WarningOutlined, TruckOutlined,
  CheckOutlined, CloseOutlined, BellOutlined, SendOutlined,
  ClockCircleOutlined, SwapOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import { ROLES, ROLE_LABELS } from '../../../shared/constants/roles';
import { apiFetch } from '../core/api.client';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '입고완료', CANCELLED: '취소',
};
const RESTOCK_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'blue', ORDERED: 'cyan', RECEIVED: 'green', CANCELLED: 'red',
};
const RESTOCK_STATUS_LABELS: Record<string, string> = {
  DRAFT: '작성중', APPROVED: '승인', ORDERED: '발주', RECEIVED: '입고완료', CANCELLED: '취소',
};

/* ── Styled Stat Card ── */
interface StatCardProps {
  title: string; value: string | number; icon: React.ReactNode;
  bg: string; color: string; sub?: string; onClick?: () => void;
}
function StatCard({ title, value, icon, bg, color, sub, onClick }: StatCardProps) {
  const style: CSSProperties = {
    background: bg, borderRadius: 12, padding: '20px 24px', cursor: onClick ? 'pointer' : 'default',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 110,
    transition: 'transform 0.15s', border: 'none',
  };
  return (
    <div style={style} onClick={onClick}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}>
      <div>
        <div style={{ fontSize: 13, color: color + 'cc', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.2 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {sub && <div style={{ fontSize: 12, color: color + '99', marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 36, color: color + '44' }}>{icon}</div>
    </div>
  );
}

/* ── Mini Bar for Sales Trend ── */
function MiniBar({ data }: { data: Array<{ label: string; revenue: number }> }) {
  if (!data || data.length === 0) return <div style={{ color: '#aaa', textAlign: 'center', padding: 24 }}>매출 데이터가 없습니다</div>;
  const max = Math.max(...data.map(d => Number(d.revenue)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '0 4px' }}>
      {data.map((d, i) => {
        const h = Math.max((Number(d.revenue) / max) * 80, 4);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 10, color: '#888' }}>{Number(d.revenue) > 0 ? `${(Number(d.revenue) / 10000).toFixed(0)}만` : ''}</div>
            <div style={{ width: '100%', maxWidth: 28, height: h, background: 'linear-gradient(180deg, #4f46e5, #818cf8)', borderRadius: 4 }} />
            <div style={{ fontSize: 9, color: '#aaa' }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notiLoading, setNotiLoading] = useState(false);

  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.HQ_MANAGER;

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/dashboard/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadNotifications = async () => {
    setNotiLoading(true);
    try {
      const res = await apiFetch('/api/notifications?status=PENDING&limit=20');
      const data = await res.json();
      if (data.success) setNotifications(data.data);
    } catch (e: any) { message.error('알림 로드 실패: ' + e.message); }
    finally { setNotiLoading(false); }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) => prev.filter((n) => n.notification_id !== id));
    } catch (e: any) { message.error('읽음 처리 실패: ' + e.message); }
  };

  // 재고 요청 처리 모달
  const [processTarget, setProcessTarget] = useState<any>(null);
  const [processQty, setProcessQty] = useState(1);
  const [processLoading, setProcessLoading] = useState(false);

  const openProcessModal = (record: any) => {
    setProcessTarget(record);
    setProcessQty(1);
  };

  const handleProcess = async () => {
    if (!processTarget) return;
    setProcessLoading(true);
    try {
      const res = await apiFetch(`/api/notifications/${processTarget.notification_id}/process`, {
        method: 'PUT',
        body: JSON.stringify({ qty: processQty }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => prev.filter((n) => n.notification_id !== processTarget.notification_id));
        message.success(`수평이동 의뢰 ${data.data.requestNo} 생성 완료`);
        setProcessTarget(null);
        loadStats();
      } else { message.error(data.error); }
    } catch (e: any) { message.error('처리 실패: ' + e.message); }
    finally { setProcessLoading(false); }
  };

  const handleResolve = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/resolve`, { method: 'PUT' });
      setNotifications((prev) => prev.filter((n) => n.notification_id !== id));
      message.success('처리 완료');
    } catch (e: any) { message.error('처리 실패: ' + e.message); }
  };

  useEffect(() => { loadStats(); loadNotifications(); if (isStore) loadMyPendingRequests(); }, []);

  const handleApprove = async (requestId: number) => {
    try {
      const res = await apiFetch(`/api/shipments/${requestId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SHIPPED' }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('출고 처리되었습니다.');
        loadStats();
      } else { message.error(data.error); }
    } catch (e: any) { message.error(e.message); }
  };

  const handleReject = async (requestId: number) => {
    try {
      const res = await apiFetch(`/api/shipments/${requestId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('반려되었습니다.');
        loadStats();
      } else { message.error(data.error); }
    } catch (e: any) { message.error(e.message); }
  };

  // 재고 요청 (매장 매니저용)
  const [requestingIds, setRequestingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // 이미 보낸 요청 로드
  const loadMyPendingRequests = async () => {
    try {
      const res = await apiFetch('/api/notifications/my-pending-requests');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSentIds(new Set(data.data.map((vid: number) => String(vid))));
      }
    } catch { /* ignore */ }
  };

  const handleStockRequest = async (item: any) => {
    const key = `${item.partner_code}-${item.variant_id}`;
    const variantKey = String(item.variant_id);
    if (requestingIds.has(key) || sentIds.has(variantKey)) return;
    const allTargets = (item.other_locations || []).filter((loc: any) => loc.qty >= 1);
    if (allTargets.length === 0) { message.warning('다른 매장에 재고가 없습니다.'); return; }
    // 가장 수량 많은 지점만 요청 (동일 수량이면 전부)
    const maxQty = Math.max(...allTargets.map((t: any) => t.qty));
    const targets = allTargets.filter((t: any) => t.qty === maxQty);
    setRequestingIds((prev) => new Set(prev).add(key));
    try {
      const res = await apiFetch('/api/notifications/stock-request', {
        method: 'POST',
        body: JSON.stringify({
          variant_id: item.variant_id,
          from_qty: item.qty,
          targets: targets.map((t: any) => ({ partner_code: t.partner_code, qty: t.qty })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`${targets.length}개 매장/본사에 재고 요청 완료 (최다재고 ${maxQty}개)`);
        setSentIds((prev) => new Set(prev).add(variantKey));
      }
      else message.error(data.error);
    } catch (e: any) { message.error(e.message); }
    finally {
      setRequestingIds((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  // 수령확인 모달 (대시보드 내 인라인 처리)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});
  const [receiveLoading, setReceiveLoading] = useState(false);
  const todoDetailRef = useRef<HTMLDivElement>(null);

  const handleOpenReceiveModal = async (record: any) => {
    try {
      const res = await apiFetch(`/api/shipments/${record.request_id}`);
      const data = await res.json();
      if (!data.success) { message.error(data.error); return; }
      const detail = data.data;
      setReceiveTarget(detail);
      const qtys: Record<number, number> = {};
      (detail.items || []).forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty; });
      setReceivedQtys(qtys);
      setReceiveModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmReceive = async () => {
    if (!receiveTarget) return;
    setReceiveLoading(true);
    try {
      const rItems = (receiveTarget.items || []).map((item: any) => ({
        variant_id: item.variant_id,
        received_qty: receivedQtys[item.variant_id] || 0,
      }));
      const res = await apiFetch(`/api/shipments/${receiveTarget.request_id}/receive`, {
        method: 'PUT', body: JSON.stringify({ items: rItems }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('수령 확인이 완료되었습니다.');
        setReceiveModalOpen(false);
        setReceiveTarget(null);
        loadStats();
      } else { message.error(data.error); }
    } catch (e: any) { message.error(e.message); }
    finally { setReceiveLoading(false); }
  };

  const scrollToDetail = () => {
    todoDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRestockApprove = async (requestId: number) => {
    try {
      const res = await apiFetch(`/api/restocks/${requestId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      const data = await res.json();
      if (data.success) { message.success('재입고 의뢰가 승인되었습니다.'); loadStats(); }
      else { message.error(data.error); }
    } catch (e: any) { message.error(e.message); }
  };

  const handleRestockReject = async (requestId: number) => {
    try {
      const res = await apiFetch(`/api/restocks/${requestId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const data = await res.json();
      if (data.success) { message.success('재입고 의뢰가 취소되었습니다.'); loadStats(); }
      else { message.error(data.error); }
    } catch (e: any) { message.error(e.message); }
  };

  const pa = stats?.pendingActions || {};
  const totalPendingActions = isStore
    ? (pa.shipmentsToProcess?.length || 0) + (pa.shipmentsToReceive?.length || 0) + (pa.restockPending?.length || 0)
    : (stats?.pendingApprovals?.length || 0) + (pa.pendingRestocks?.length || 0) + (pa.shippedAwaitingReceipt?.length || 0);

  const pendingCount = Number(stats?.shipments?.pending || 0);
  const shippedCount = Number(stats?.shipments?.shipped || 0);
  const receivedCount = Number(stats?.shipments?.received || 0);
  const totalShipments = pendingCount + shippedCount + receivedCount;

  const shipmentColumns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no', width: 120 },
    { title: '유형', dataIndex: 'request_type', key: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '출발', dataIndex: 'from_partner_name', key: 'from', ellipsis: true, render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', key: 'to', ellipsis: true, render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
  ];

  const productColumns = [
    { title: '#', key: 'rank', width: 36, render: (_: any, __: any, i: number) => <span style={{ color: i < 3 ? '#f59e0b' : '#aaa', fontWeight: 600 }}>{i + 1}</span> },
    { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
    { title: '판매', dataIndex: 'total_qty', key: 'qty', width: 70, render: (v: number) => `${Number(v).toLocaleString()}개` },
    { title: '매출', dataIndex: 'total_amount', key: 'amt', width: 100, render: (v: number) => `${(Number(v) / 10000).toFixed(0)}만원` },
  ];

  const lowStockColumns = [
    { title: '상품', dataIndex: 'product_name', key: 'name', ellipsis: true,
      render: (v: string, r: any) => <span>{v} <span style={{ color: '#aaa', fontSize: 11 }}>{r.color}/{r.size}</span></span>,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 110, ellipsis: true },
    ...(!isStore ? [{ title: '거래처' as const, dataIndex: 'partner_name' as const, key: 'partner', width: 90, ellipsis: true }] : []),
    { title: '재고', dataIndex: 'qty', key: 'qty', width: 50, render: (v: number) => <Tag color={v === 0 ? 'red' : 'orange'}>{v}</Tag> },
    { title: '다른 매장', dataIndex: 'other_locations', key: 'other', ellipsis: true,
      render: (locs: any[]) => {
        if (!locs || locs.length === 0) return <span style={{ color: '#ccc', fontSize: 11 }}>없음</span>;
        return (
          <span style={{ fontSize: 11 }}>
            {locs.slice(0, 3).map((loc: any) => (
              <span key={loc.partner_code} style={{ marginRight: 6 }}>
                <span style={{ color: loc.partner_type === '본사' ? '#6366f1' : '#888' }}>{loc.partner_name}</span>
                {' '}<Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>{loc.qty}</Tag>
              </span>
            ))}
            {locs.length > 3 && <span style={{ color: '#aaa' }}>+{locs.length - 3}</span>}
          </span>
        );
      },
    },
    ...(isStore ? [{
      title: '' as const, key: 'req', width: 75,
      render: (_: any, record: any) => {
        const k = `${record.partner_code}-${record.variant_id}`;
        const variantKey = String(record.variant_id);
        const loading = requestingIds.has(k);
        const alreadySent = sentIds.has(variantKey);
        const hasTargets = (record.other_locations || []).length > 0;
        if (alreadySent) {
          return <Button size="small" disabled style={{ fontSize: 11, padding: '0 6px', color: '#52c41a', borderColor: '#b7eb8f' }}>요청완료</Button>;
        }
        return hasTargets ? (
          <Button type="primary" size="small" icon={<SendOutlined />}
            loading={loading} disabled={loading} onClick={() => handleStockRequest(record)}
            style={{ fontSize: 11, padding: '0 6px' }}>
            요청
          </Button>
        ) : null;
      },
    }] : []),
  ];

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  return (
    <div>
      {/* ── 해야 할 일 (최상단 히어로 배너 + 인사말 통합) ── */}
      {totalPendingActions > 0 ? (
        <div style={{ marginBottom: 24 }}>
          {/* 히어로 배너 */}
          <div style={{
            background: 'linear-gradient(135deg, #e8350e 0%, #ff6b35 40%, #f7931e 70%, #ffad33 100%)',
            borderRadius: 18,
            padding: '28px 32px 24px',
            marginBottom: 14,
            boxShadow: '0 8px 32px rgba(232, 53, 14, 0.35)',
            position: 'relative' as const,
            overflow: 'hidden',
          }}>
            {/* 배경 장식 원 */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -40, right: 80, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

            {/* 인사말 + 할일 헤더 */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                  {dateStr} &middot; {user ? ROLE_LABELS[user.role] || user.role : ''}
                  {isStore && stats?.partnerCode ? ` &middot; ${stats.partnerCode}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.3, letterSpacing: -0.5 }}>
                    {user?.userName}님, 처리할 일이 <span style={{
                      background: '#fff',
                      color: '#e8350e',
                      borderRadius: 8,
                      padding: '2px 12px',
                      fontSize: 24,
                      fontWeight: 900,
                    }}>{totalPendingActions}건</span> 있습니다
                  </div>
                </div>
              </div>

              {/* 매장 매니저: 할일 요약 카드들 (더 크게) */}
              {isStore && (
                <Row gutter={[14, 14]}>
                  {(pa.shipmentsToProcess || []).length > 0 && (
                    <Col xs={24} sm={8}>
                      <div
                        onClick={scrollToDetail}
                        style={{
                          background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px',
                          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <TruckOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>출고 처리 대기</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#f97316', lineHeight: 1.1 }}>{(pa.shipmentsToProcess || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#f97316', fontWeight: 600, textAlign: 'right' }}>처리하기 &rarr;</div>
                      </div>
                    </Col>
                  )}
                  {(pa.shipmentsToReceive || []).length > 0 && (
                    <Col xs={24} sm={8}>
                      <div
                        onClick={scrollToDetail}
                        style={{
                          background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px',
                          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <InboxOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>수령확인 대기</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', lineHeight: 1.1 }}>{(pa.shipmentsToReceive || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#10b981', fontWeight: 600, textAlign: 'right' }}>확인하기 &rarr;</div>
                      </div>
                    </Col>
                  )}
                  {(pa.restockPending || []).length > 0 && (
                    <Col xs={24} sm={8}>
                      <div
                        onClick={scrollToDetail}
                        style={{
                          background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px',
                          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ReloadOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>재입고 진행</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#8b5cf6', lineHeight: 1.1 }}>{(pa.restockPending || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#8b5cf6', fontWeight: 600, textAlign: 'right' }}>전체보기 &rarr;</div>
                      </div>
                    </Col>
                  )}
                </Row>
              )}

              {/* Admin/HQ: 할일 요약 카드들 (더 크게) */}
              {isAdmin && (
                <Row gutter={[14, 14]}>
                  {(stats?.pendingApprovals || []).length > 0 && (
                    <Col xs={24} sm={8}>
                      <div
                        onClick={scrollToDetail}
                        style={{
                          background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px',
                          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <TruckOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>출고 대기</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#f97316', lineHeight: 1.1 }}>{(stats?.pendingApprovals || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#f97316', fontWeight: 600, textAlign: 'right' }}>처리하기 &rarr;</div>
                      </div>
                    </Col>
                  )}
                  {(pa.pendingRestocks || []).length > 0 && (
                    <Col xs={24} sm={8}>
                      <div
                        onClick={scrollToDetail}
                        style={{
                          background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px',
                          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ReloadOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>재입고 승인</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#8b5cf6', lineHeight: 1.1 }}>{(pa.pendingRestocks || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#8b5cf6', fontWeight: 600, textAlign: 'right' }}>승인하기 &rarr;</div>
                      </div>
                    </Col>
                  )}
                  {(pa.shippedAwaitingReceipt || []).length > 0 && (
                    <Col xs={24} sm={8}>
                      <div
                        onClick={scrollToDetail}
                        style={{
                          background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px',
                          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <SwapOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>수령확인 대기</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', lineHeight: 1.1 }}>{(pa.shippedAwaitingReceipt || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#10b981', fontWeight: 600, textAlign: 'right' }}>확인하기 &rarr;</div>
                      </div>
                    </Col>
                  )}
                </Row>
              )}
            </div>
          </div>

          {/* 상세 테이블 */}
          <div ref={todoDetailRef} />
          <Card size="small" style={{ borderRadius: 14, border: '2px solid #ff6b35' }} loading={loading}>
            {/* ── Admin/HQ: 출고 대기 ── */}
            {isAdmin && (stats?.pendingApprovals || []).length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TruckOutlined style={{ color: '#f59e0b' }} />
                  <Typography.Text strong>출고 대기</Typography.Text>
                  <Badge count={(stats?.pendingApprovals || []).length} style={{ backgroundColor: '#f59e0b' }} />
                </div>
                <Table
                  columns={[
                    { title: '의뢰번호', dataIndex: 'request_no', key: 'no', width: 130 },
                    { title: '유형', dataIndex: 'request_type', key: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '출발', dataIndex: 'from_partner_name', key: 'from', ellipsis: true },
                    { title: '도착', dataIndex: 'to_partner_name', key: 'to', ellipsis: true, render: (v: string) => v || '-' },
                    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 60, render: (v: number) => `${Number(v).toLocaleString()}개` },
                    { title: '의뢰일', dataIndex: 'request_date', key: 'date', width: 95, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                    { title: '요청자', dataIndex: 'requested_by_name', key: 'by', width: 90 },
                    {
                      title: '처리', key: 'action', width: 140, fixed: 'right' as const,
                      render: (_: any, record: any) => (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <Popconfirm title="출고 처리하시겠습니까?" onConfirm={() => handleApprove(record.request_id)} okText="출고" cancelText="취소">
                            <Button type="primary" size="small" icon={<CheckOutlined />}>출고</Button>
                          </Popconfirm>
                          <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleReject(record.request_id)} okText="취소처리" cancelText="돌아가기" okButtonProps={{ danger: true }}>
                            <Button danger size="small" icon={<CloseOutlined />}>취소</Button>
                          </Popconfirm>
                        </span>
                      ),
                    },
                  ]}
                  dataSource={stats?.pendingApprovals || []}
                  rowKey="request_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                />
              </>
            )}

            {/* ── Admin/HQ: 재입고 승인 대기 ── */}
            {isAdmin && (pa.pendingRestocks || []).length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: (stats?.pendingApprovals || []).length > 0 ? 20 : 0, marginBottom: 8 }}>
                  <ReloadOutlined style={{ color: '#722ed1' }} />
                  <Typography.Text strong>재입고 승인 대기</Typography.Text>
                  <Badge count={(pa.pendingRestocks || []).length} style={{ backgroundColor: '#722ed1' }} />
                </div>
                <Table
                  columns={[
                    { title: '의뢰번호', dataIndex: 'request_no', key: 'no', width: 130 },
                    { title: '거래처', dataIndex: 'partner_name', key: 'partner', ellipsis: true },
                    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, render: (v: number) => `${Number(v).toLocaleString()}개` },
                    { title: '의뢰일', dataIndex: 'request_date', key: 'date', width: 95, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                    {
                      title: '처리', key: 'action', width: 140, fixed: 'right' as const,
                      render: (_: any, record: any) => (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <Popconfirm title="승인하시겠습니까?" onConfirm={() => handleRestockApprove(record.request_id)} okText="승인" cancelText="취소">
                            <Button type="primary" size="small" icon={<CheckOutlined />}>승인</Button>
                          </Popconfirm>
                          <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleRestockReject(record.request_id)} okText="취소처리" cancelText="돌아가기" okButtonProps={{ danger: true }}>
                            <Button danger size="small" icon={<CloseOutlined />}>취소</Button>
                          </Popconfirm>
                        </span>
                      ),
                    },
                  ]}
                  dataSource={pa.pendingRestocks || []}
                  rowKey="request_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 600 }}
                />
              </>
            )}

            {/* ── Admin/HQ: 수령확인 대기 (출고완료) ── */}
            {isAdmin && (pa.shippedAwaitingReceipt || []).length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8 }}>
                  <SwapOutlined style={{ color: '#10b981' }} />
                  <Typography.Text strong>수령확인 대기</Typography.Text>
                  <Badge count={(pa.shippedAwaitingReceipt || []).length} style={{ backgroundColor: '#10b981' }} />
                </div>
                <Table
                  columns={[
                    { title: '의뢰번호', dataIndex: 'request_no', key: 'no', width: 130 },
                    { title: '유형', dataIndex: 'request_type', key: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '출발', dataIndex: 'from_partner_name', key: 'from', ellipsis: true },
                    { title: '도착', dataIndex: 'to_partner_name', key: 'to', ellipsis: true, render: (v: string) => v || '-' },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, render: (v: number) => `${Number(v).toLocaleString()}개` },
                    { title: '의뢰일', dataIndex: 'request_date', key: 'date', width: 95, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                    {
                      title: '처리', key: 'action', width: 100, fixed: 'right' as const,
                      render: (_: any, record: any) => (
                        <Button size="small" type="primary" style={{ background: '#13c2c2' }}
                          icon={<InboxOutlined />} onClick={() => handleOpenReceiveModal(record)}>
                          수령확인
                        </Button>
                      ),
                    },
                  ]}
                  dataSource={pa.shippedAwaitingReceipt || []}
                  rowKey="request_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 700 }}
                />
              </>
            )}

            {/* ── Store: 출고 처리 대기 ── */}
            {isStore && (pa.shipmentsToProcess || []).length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TruckOutlined style={{ color: '#f59e0b' }} />
                  <Typography.Text strong>출고 처리 대기</Typography.Text>
                  <Badge count={(pa.shipmentsToProcess || []).length} style={{ backgroundColor: '#f59e0b' }} />
                </div>
                <Table
                  columns={[
                    { title: '의뢰번호', dataIndex: 'request_no', key: 'no', width: 130 },
                    { title: '유형', dataIndex: 'request_type', key: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '도착지', dataIndex: 'to_partner_name', key: 'to', ellipsis: true, render: (v: string) => v || '-' },
                    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, render: (v: number) => `${Number(v).toLocaleString()}개` },
                    { title: '의뢰일', dataIndex: 'request_date', key: 'date', width: 95, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                    {
                      title: '처리', key: 'action', width: 140, fixed: 'right' as const,
                      render: (_: any, record: any) => (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <Popconfirm title="출고 처리하시겠습니까?" onConfirm={() => handleApprove(record.request_id)} okText="출고" cancelText="취소">
                            <Button type="primary" size="small" icon={<CheckOutlined />}>출고</Button>
                          </Popconfirm>
                          <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleReject(record.request_id)} okText="취소처리" cancelText="돌아가기" okButtonProps={{ danger: true }}>
                            <Button danger size="small" icon={<CloseOutlined />}>취소</Button>
                          </Popconfirm>
                        </span>
                      ),
                    },
                  ]}
                  dataSource={pa.shipmentsToProcess || []}
                  rowKey="request_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 700 }}
                />
              </>
            )}

            {/* ── Store: 수령확인 대기 ── */}
            {isStore && (pa.shipmentsToReceive || []).length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: (pa.shipmentsToProcess || []).length > 0 ? 20 : 0, marginBottom: 8 }}>
                  <InboxOutlined style={{ color: '#10b981' }} />
                  <Typography.Text strong>수령확인 대기</Typography.Text>
                  <Badge count={(pa.shipmentsToReceive || []).length} style={{ backgroundColor: '#10b981' }} />
                </div>
                <Table
                  columns={[
                    { title: '의뢰번호', dataIndex: 'request_no', key: 'no', width: 130 },
                    { title: '유형', dataIndex: 'request_type', key: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '출발지', dataIndex: 'from_partner_name', key: 'from', ellipsis: true },
                    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, render: (v: number) => `${Number(v).toLocaleString()}개` },
                    { title: '의뢰일', dataIndex: 'request_date', key: 'date', width: 95, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                    {
                      title: '처리', key: 'action', width: 100, fixed: 'right' as const,
                      render: (_: any, record: any) => (
                        <Button size="small" type="primary" style={{ background: '#13c2c2' }}
                          icon={<InboxOutlined />} onClick={() => handleOpenReceiveModal(record)}>
                          수령확인
                        </Button>
                      ),
                    },
                  ]}
                  dataSource={pa.shipmentsToReceive || []}
                  rowKey="request_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 700 }}
                />
              </>
            )}

            {/* ── Store: 재입고 진행현황 ── */}
            {isStore && (pa.restockPending || []).length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: ((pa.shipmentsToProcess || []).length > 0 || (pa.shipmentsToReceive || []).length > 0) ? 20 : 0, marginBottom: 8 }}>
                  <ReloadOutlined style={{ color: '#722ed1' }} />
                  <Typography.Text strong>재입고 진행</Typography.Text>
                  <Badge count={(pa.restockPending || []).length} style={{ backgroundColor: '#722ed1' }} />
                </div>
                <Table
                  columns={[
                    { title: '의뢰번호', dataIndex: 'request_no', key: 'no', width: 130 },
                    { title: '상태', dataIndex: 'status', key: 'status', width: 80,
                      render: (v: string) => <Tag color={RESTOCK_STATUS_COLORS[v]}>{RESTOCK_STATUS_LABELS[v] || v}</Tag> },
                    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, render: (v: number) => `${Number(v).toLocaleString()}개` },
                    { title: '의뢰일', dataIndex: 'request_date', key: 'date', width: 95, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                    { title: '입고예정', dataIndex: 'expected_date', key: 'expect', width: 95,
                      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
                  ]}
                  dataSource={pa.restockPending || []}
                  rowKey="request_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 500 }}
                />
              </>
            )}
          </Card>
        </div>
      ) : (
        /* 할일 없을 때 기본 인사말 */
        <div style={{ marginBottom: 28 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {user?.userName}님, 좋은 하루 보내세요
          </Typography.Title>
          <Typography.Text type="secondary">
            {dateStr} &middot; {user ? ROLE_LABELS[user.role] || user.role : ''}
            {isStore && stats?.partnerCode && (
              <Tag color="blue" style={{ marginLeft: 8 }}>{stats.partnerCode}</Tag>
            )}
          </Typography.Text>
        </div>
      )}

      {/* Main Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title={isStore ? '내 매장 오늘 매출' : '오늘 매출'} value={`${(Number(stats?.todaySales?.today_revenue || 0) / 10000).toFixed(0)}만원`}
            icon={<DollarOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
            sub={`${Number(stats?.todaySales?.today_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title={isStore ? '내 매장 월간 매출' : '월간 매출 (30일)'} value={`${(Number(stats?.sales?.month_revenue || 0) / 10000).toFixed(0)}만원`}
            icon={<RiseOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
            sub={`${Number(stats?.sales?.month_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title={isStore ? '내 매장 재고' : '총 재고'} value={stats?.inventory?.totalQty || 0}
            icon={<InboxOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
            sub={`${stats?.inventory?.totalItems || 0}개 품목`} onClick={() => navigate('/inventory/status')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title={isStore ? '내 매장 대기 출고' : '대기 출고'} value={pendingCount}
            icon={<TruckOutlined />} bg="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" color="#fff"
            sub={`출고완료 ${shippedCount}건`} onClick={() => navigate(isStore ? '/shipment/store' : '/shipment/process')} />
        </Col>
      </Row>

      {/* Sub Stats */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {!isStore && (
          <>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ShopOutlined style={{ fontSize: 24, color: '#6366f1' }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#888' }}>거래처</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{stats?.partners || 0}</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <TagsOutlined style={{ fontSize: 24, color: '#ec4899' }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#888' }}>등록 상품</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{stats?.products || 0}</div>
                  </div>
                </div>
              </Card>
            </Col>
          </>
        )}
        <Col xs={12} sm={isStore ? 12 : 6}>
          <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShoppingCartOutlined style={{ fontSize: 24, color: '#f59e0b' }} />
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>{isStore ? '내 매장 주간 매출' : '주간 매출'}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{(Number(stats?.sales?.week_revenue || 0) / 10000).toFixed(0)}만</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={isStore ? 12 : 6}>
          <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShoppingCartOutlined style={{ fontSize: 24, color: '#10b981' }} />
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>{isStore ? '내 매장 주간 판매량' : '주간 판매량'}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(stats?.sales?.week_qty || 0).toLocaleString()}개</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Shipment Pipeline + Sales Trend */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={isStore ? '내 매장 출고 현황' : '출고 현황'} size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}
            extra={<a onClick={() => navigate(isStore ? '/shipment/store' : '/shipment/process')}>전체보기</a>}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: 16 }}>
              {[
                { label: '대기', count: pendingCount, color: '#6366f1' },
                { label: '출고완료', count: shippedCount, color: '#10b981' },
                { label: '입고완료', count: receivedCount, color: '#06b6d4' },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {totalShipments > 0 && (
              <Progress
                percent={100}
                success={{ percent: (receivedCount / totalShipments) * 100 }}
                strokeColor="#10b981"
                trailColor="#f3f4f6"
                showInfo={false}
                style={{ marginBottom: 8 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="최근 14일 매출 추이" size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}
            extra={<a onClick={() => navigate('/sales/entry')}>매출등록</a>}>
            <MiniBar data={stats?.monthlySalesTrend || []} />
          </Card>
        </Col>
      </Row>

      {/* Stock Request Notifications */}
      {notifications.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={<span><BellOutlined style={{ color: '#6366f1', marginRight: 8 }} />재고 요청 알림 <Badge count={notifications.length} style={{ backgroundColor: '#6366f1', marginLeft: 8 }} /></span>}
              size="small" style={{ borderRadius: 10, borderLeft: '4px solid #6366f1' }} loading={notiLoading}
            >
              <Table
                columns={[
                  { title: '요청 매장', dataIndex: 'from_partner_name', key: 'from', width: 110 },
                  { title: '상품', key: 'product', ellipsis: true,
                    render: (_: any, r: any) => <span>{r.product_name} <span style={{ color: '#888', fontSize: 12 }}>({r.color}/{r.size})</span></span>,
                  },
                  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
                  { title: '요청측 재고', dataIndex: 'from_qty', key: 'from_qty', width: 90,
                    render: (v: number) => <Tag color={v === 0 ? 'red' : 'orange'}>{v}개</Tag>,
                  },
                  { title: '우리 재고', dataIndex: 'to_qty', key: 'to_qty', width: 90,
                    render: (v: number) => <Tag color="blue">{v}개</Tag>,
                  },
                  { title: '요청일', dataIndex: 'created_at', key: 'date', width: 100,
                    render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-',
                  },
                  { title: '처리', key: 'action', width: 180, fixed: 'right' as const,
                    render: (_: any, r: any) => (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => openProcessModal(r)}>보내기</Button>
                        <Button size="small" icon={<CheckOutlined />} onClick={() => handleResolve(r.notification_id)}>무시</Button>
                      </span>
                    ),
                  },
                ]}
                dataSource={notifications}
                rowKey="notification_id"
                pagination={false}
                size="small"
                scroll={{ x: 750 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 할일 섹션은 위로 이동됨 */}

      {/* Tables */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card title={<span>{isStore ? '내 매장 재고 부족' : '재고 부족'} <Badge count={(stats?.lowStock || []).length} style={{ backgroundColor: '#ef4444', marginLeft: 8 }} /></span>}
            size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<a onClick={() => navigate('/inventory/status')}>전체보기</a>}>
            {(stats?.lowStock || []).length > 0 ? (
              <Table columns={lowStockColumns} dataSource={stats?.lowStock || []} rowKey={(r) => `${r.partner_code}-${r.variant_id}`} pagination={false} size="small" scroll={{ x: 500 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
                <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
                재고 부족 품목이 없습니다
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={9}>
          <Card title={isStore ? '내 매장 최근 출고의뢰' : '최근 출고의뢰'} size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<a onClick={() => navigate(isStore ? '/shipment/store' : '/shipment/request')}>전체보기</a>}>
            <Table columns={shipmentColumns} dataSource={stats?.recentShipments || []} rowKey="request_no" pagination={false} size="small" scroll={{ x: 500 }} />
          </Card>
        </Col>
        <Col xs={24} md={7}>
          <Card title={isStore ? '내 매장 인기상품 TOP 5' : '인기상품 TOP 5'} size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<span style={{ fontSize: 11, color: '#888' }}>최근 30일</span>}>
            {(stats?.topProducts || []).length > 0 ? (
              <Table columns={productColumns} dataSource={stats?.topProducts || []} rowKey="product_code" pagination={false} size="small" scroll={{ x: 400 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>판매 데이터가 없습니다</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 재고 요청 처리 모달 */}
      <Modal
        title="재고 요청 처리 — 수평이동 생성"
        open={!!processTarget}
        onCancel={() => setProcessTarget(null)}
        onOk={handleProcess}
        confirmLoading={processLoading}
        okText="수평이동 생성"
        cancelText="취소"
      >
        {processTarget && (
          <div>
            <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>요청 매장:</strong> {processTarget.from_partner_name}
                <Tag color="red" style={{ marginLeft: 8 }}>재고 {processTarget.from_qty}개</Tag>
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>상품:</strong> {processTarget.product_name}
                <span style={{ color: '#888', marginLeft: 8 }}>({processTarget.color}/{processTarget.size})</span>
              </div>
              <div><strong>SKU:</strong> {processTarget.sku}</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>보낼 수량:</strong>
            </div>
            <InputNumber
              min={1}
              value={processQty}
              onChange={(v) => setProcessQty(v || 1)}
              style={{ width: 120 }}
              size="large"
            />
            <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
              수평이동 의뢰가 생성되며, 출고확인 후 재고가 이동됩니다.
            </div>
          </div>
        )}
      </Modal>

      {/* 수령확인 모달 */}
      <Modal
        title="수령 확인"
        open={receiveModalOpen}
        onCancel={() => { setReceiveModalOpen(false); setReceiveTarget(null); setReceivedQtys({}); }}
        onOk={handleConfirmReceive}
        confirmLoading={receiveLoading}
        okText="수령 확인"
        cancelText="취소"
        width={600}
      >
        {receiveTarget && (
          <div>
            <Alert
              type="info"
              message="수령한 실제 수량을 입력하세요. 확인 시 재고가 증가합니다."
              style={{ marginBottom: 16 }}
            />
            <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 8, marginBottom: 16 }}>
              <div><strong>의뢰번호:</strong> {receiveTarget.request_no}</div>
              <div><strong>출발:</strong> {receiveTarget.from_partner_name || '-'} <strong style={{ marginLeft: 12 }}>도착:</strong> {receiveTarget.to_partner_name || '-'}</div>
            </div>
            <Table
              columns={[
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130, ellipsis: true },
                { title: '상품', key: 'name', ellipsis: true,
                  render: (_: any, r: any) => <span>{r.product_name} <span style={{ color: '#888', fontSize: 12 }}>({r.color}/{r.size})</span></span>,
                },
                { title: '출고수량', dataIndex: 'shipped_qty', key: 'shipped', width: 80,
                  render: (v: number) => `${v}개`,
                },
                { title: '수령수량', key: 'received', width: 110,
                  render: (_: any, r: any) => (
                    <InputNumber
                      min={0}
                      max={r.shipped_qty}
                      value={receivedQtys[r.variant_id] || 0}
                      onChange={(v) => setReceivedQtys(prev => ({ ...prev, [r.variant_id]: v || 0 }))}
                      size="small"
                      style={{ width: 80 }}
                    />
                  ),
                },
              ]}
              dataSource={receiveTarget.items || []}
              rowKey="variant_id"
              pagination={false}
              size="small"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
