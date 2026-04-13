import { useEffect, useState, useCallback, CSSProperties } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Badge, Progress, Button, Popconfirm, Modal, InputNumber, Input, Select, message, Empty } from 'antd';
import {
  ShopOutlined, TagsOutlined, InboxOutlined, DollarOutlined,
  RiseOutlined, ShoppingCartOutlined, TruckOutlined,
  CheckOutlined, BellOutlined, SendOutlined,
  SwapOutlined, PercentageOutlined, WarningOutlined,
  PlusOutlined, RollbackOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import { ROLES, ROLE_LABELS } from '../../../shared/constants/roles';
import { apiFetch, safeJson } from '../core/api.client';
import { salesApi } from '../modules/sales/sales.api';
import type { ColumnsType } from 'antd/es/table';
import { ToolOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red', DISCREPANCY: 'orange',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '수령완료', CANCELLED: '취소', DISCREPANCY: '수량불일치',
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
            <div style={{ fontSize: 10, color: '#888' }}>{Number(d.revenue) > 0 ? `${Number(d.revenue).toLocaleString()}원` : ''}</div>
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
  const [generalNotifs, setGeneralNotifs] = useState<any[]>([]);

  const [sellThrough, setSellThrough] = useState<any>(null);
  const [asStats, setAsStats] = useState<any>(null);

  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  const loadAsStats = async () => {
    try {
      const res = await apiFetch('/api/crm/after-sales/stats');
      const data = await safeJson(res);
      if (data.success) setAsStats(data.data);
    } catch { /* ignore */ }
  };

  const loadSellThrough = async () => {
    try {
      const from = dayjs().startOf('year').format('YYYY-MM-DD');
      const to = dayjs().format('YYYY-MM-DD');
      const result = await salesApi.sellThrough(from, to);
      setSellThrough(result);
    } catch { /* ignore */ }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/dashboard/stats');
      const data = await safeJson(res);
      if (data.success) setStats(data.data);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadNotifications = async () => {
    setNotiLoading(true);
    try {
      const res = await apiFetch('/api/notifications?status=PENDING&limit=20');
      const data = await safeJson(res);
      if (data.success) setNotifications(data.data);
    } catch (e: any) { message.error('알림 로드 실패: ' + e.message); }
    finally { setNotiLoading(false); }
  };

  const loadGeneralNotifs = async () => {
    try {
      const res = await apiFetch('/api/notifications/general?limit=5');
      const data = await safeJson(res);
      if (data.success) setGeneralNotifs(data.data);
    } catch { /* ignore */ }
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

  const refreshAll = useCallback(() => {
    loadStats(); loadNotifications(); loadGeneralNotifs(); loadAsStats();
    if (!isStore) loadSellThrough();
    if (isStore) { loadMyPendingRequests(); }
  }, [isStore]);

  // 초기 로드 + 탭 전환/페이지 복귀 시 자동 새로고침
  useEffect(() => {
    refreshAll();
    const onFocus = () => refreshAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshAll]);

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


  // 예약판매 모달
  const [preorderModalOpen, setPreorderModalOpen] = useState(false);
  const [preorderList, setPreorderList] = useState<any[]>([]);
  const [preorderListLoading, setPreorderListLoading] = useState(false);
  const [preorderPartnerFilter, setPreorderPartnerFilter] = useState<string | undefined>(undefined);

  const loadPreorderList = async () => {
    setPreorderListLoading(true);
    try {
      const r = await salesApi.preorders();
      setPreorderList(r.data || r || []);
    } catch (e: any) { message.error('예약판매 로드 실패: ' + e.message); }
    finally { setPreorderListLoading(false); }
  };

  const openPreorderModal = (partnerCode?: string) => {
    setPreorderPartnerFilter(partnerCode || undefined);
    setPreorderModalOpen(true);
    loadPreorderList();
  };

  const pa = stats?.pendingActions || {};
  const discrepancyCount = pa.discrepancies?.length || 0;
  const preorderCount = stats?.preorderCount || 0;
  const transferToShipCount = (pa.transferToShip || []).length;
  const transferToReceiveCount = (pa.transferToReceive || []).length;

  // 해야할일: 직접 처리해야 하는 건
  const todoCount = isStore
    ? (pa.shipmentsToReceive?.length || 0) + (pa.shipmentsToShip?.length || 0) + discrepancyCount + preorderCount + transferToShipCount + transferToReceiveCount
    : (stats?.pendingApprovals?.length || 0) + (pa.pendingReturns?.length || 0) + discrepancyCount;
  // 대기중: 다른 사람의 처리를 기다리는 건 (본사만)
  const waitingCount = isAdmin
    ? (pa.shippedAwaitingReceipt?.length || 0) + preorderCount
    : 0;
  const totalPendingActions = todoCount;

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
    { title: '매출', dataIndex: 'total_amount', key: 'amt', width: 100, render: (v: number) => `${Number(v).toLocaleString()}원` },
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
      {/* ── 해야 할 일 (최상단 히어로 배너) ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          background: totalPendingActions > 0
            ? 'linear-gradient(135deg, #e8350e 0%, #ff6b35 40%, #f7931e 70%, #ffad33 100%)'
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6366f1 100%)',
          borderRadius: 18,
          padding: '28px 32px 24px',
          marginBottom: 14,
          boxShadow: totalPendingActions > 0
            ? '0 8px 32px rgba(232, 53, 14, 0.35)'
            : '0 8px 32px rgba(102, 126, 234, 0.35)',
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
                  {isStore && stats?.partnerCode ? ` · ${stats.partnerCode}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.3, letterSpacing: -0.5 }}>
                    {totalPendingActions > 0 ? (
                      <>{user?.userName}님, 처리할 일이 <span style={{
                        background: '#fff',
                        color: '#e8350e',
                        borderRadius: 8,
                        padding: '2px 12px',
                        fontSize: 24,
                        fontWeight: 900,
                      }}>{totalPendingActions}건</span> 있습니다</>
                    ) : (
                      <>{user?.userName}님, 좋은 하루 보내세요</>
                    )}
                  </div>
                </div>
              </div>

              {/* 매장 매니저: 할일 요약 카드들 */}
              {isStore && (
                <Row gutter={[14, 14]}>
                  <Col xs={24} sm={8}>
                    <div onClick={() => navigate('/shipment/dashboard?filter=todo')}
                      style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <InboxOutlined style={{ fontSize: 26, color: '#fff' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>수령 대기</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', lineHeight: 1.1 }}>{(pa.shipmentsToReceive || []).length + transferToReceiveCount}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: '#10b981', fontWeight: 600, textAlign: 'right' }}>확인하기 &rarr;</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <div onClick={() => navigate('/shipment/dashboard?filter=todo')}
                      style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <TruckOutlined style={{ fontSize: 26, color: '#fff' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>출고 처리</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#f97316', lineHeight: 1.1 }}>{(pa.shipmentsToShip || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: '#f97316', fontWeight: 600, textAlign: 'right' }}>처리하기 &rarr;</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <div onClick={() => navigate('/shipment/dashboard?filter=todo')}
                      style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <WarningOutlined style={{ fontSize: 26, color: '#fff' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>수량불일치</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#ea580c', lineHeight: 1.1 }}>{discrepancyCount}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: '#ea580c', fontWeight: 600, textAlign: 'right' }}>확인하기 &rarr;</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <div onClick={() => navigate('/sales/entry?tab=preorders')}
                      style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ShoppingCartOutlined style={{ fontSize: 26, color: '#fff' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>예약판매 대기</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#d97706', lineHeight: 1.1 }}>{preorderCount}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: '#d97706', fontWeight: 600, textAlign: 'right' }}>예약판매 관리 &rarr;</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <div onClick={() => navigate('/shipment/transfer')}
                      style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <SwapOutlined style={{ fontSize: 26, color: '#fff' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>수평이동 출고대기</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#0891b2', lineHeight: 1.1 }}>{transferToShipCount}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: '#0891b2', fontWeight: 600, textAlign: 'right' }}>출고처리 &rarr;</div>
                    </div>
                  </Col>
                </Row>
              )}

              {/* Admin/HQ: 해야할일 + 대기중 */}
              {isAdmin && (
                <div>
                  {/* 해야할일 */}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>해야할일</span>
                  </div>
                  <Row gutter={[14, 14]}>
                    <Col xs={24} sm={8}>
                      <div onClick={() => navigate('/shipment/dashboard?filter=todo')}
                        style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <TruckOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>출고/승인 대기</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#f97316', lineHeight: 1.1 }}>{(stats?.pendingApprovals || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#f97316', fontWeight: 600, textAlign: 'right' }}>처리하기 &rarr;</div>
                      </div>
                    </Col>
                    <Col xs={24} sm={8}>
                      <div onClick={() => navigate('/shipment/dashboard?filter=todo')}
                        style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <RollbackOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>반품 승인</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626', lineHeight: 1.1 }}>{(pa.pendingReturns || []).length}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626', fontWeight: 600, textAlign: 'right' }}>승인하기 &rarr;</div>
                      </div>
                    </Col>
                    <Col xs={24} sm={8}>
                      <div onClick={() => navigate('/shipment/dashboard?filter=todo')}
                        style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '20px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <WarningOutlined style={{ fontSize: 26, color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>수량불일치</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#ea580c', lineHeight: 1.1 }}>{discrepancyCount}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#ea580c', fontWeight: 600, textAlign: 'right' }}>확인하기 &rarr;</div>
                      </div>
                    </Col>
                  </Row>

                  {/* 대기중 */}
                  {waitingCount > 0 && (
                    <>
                      <div style={{ marginTop: 16, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>대기중</span>
                      </div>
                      <Row gutter={[14, 14]}>
                        <Col xs={24} sm={8}>
                          <div onClick={() => navigate('/shipment/dashboard?filter=waiting')}
                            style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 14, padding: '16px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e6f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <SwapOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>매장 수령대기</div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#1677ff', lineHeight: 1.1 }}>{(pa.shippedAwaitingReceipt || []).length}<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                              </div>
                            </div>
                          </div>
                        </Col>
                        <Col xs={24} sm={8}>
                          <div onClick={() => openPreorderModal()}
                            style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 14, padding: '16px 20px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <ShoppingCartOutlined style={{ fontSize: 22, color: '#d97706' }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>예약판매</div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', lineHeight: 1.1 }}>{preorderCount}<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 2 }}>건</span></div>
                              </div>
                            </div>
                          </div>
                        </Col>
                      </Row>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* ── 관리자: 오늘 매출 요약 ── */}
      {!isStore && stats?.todaySales && (() => {
        const gross = Number(stats.todaySales.today_gross || 0);
        const ret = Number(stats.todaySales.today_return || 0);
        const net = Number(stats.todaySales.today_revenue || 0);
        const types = [
          { label: '정상가', value: Number(stats.todaySales.today_normal || 0), color: '#0284c7' },
          { label: '할인가', value: Number(stats.todaySales.today_discount || 0), color: '#ca8a04' },
          { label: '행사가', value: Number(stats.todaySales.today_event || 0), color: '#9333ea' },
          { label: '예약판매', value: Number(stats.todaySales.today_preorder || 0), color: '#ea580c' },
        ];
        return (
          <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap', marginBottom: gross > 0 ? 14 : 0 }}>
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>오늘 총매출</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111', lineHeight: 1.1 }}>{gross.toLocaleString()}원</div>
              </div>
              <div style={{ fontSize: 20, color: '#ccc', fontWeight: 300 }}>−</div>
              <div>
                <div style={{ fontSize: 11, color: '#dc2626' }}>반품</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: ret > 0 ? '#dc2626' : '#ddd' }}>
                  {ret.toLocaleString()}원
                  {ret > 0 && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>({stats.todaySales.today_return_count || 0}건)</span>}
                </div>
              </div>
              <div style={{ fontSize: 20, color: '#ccc', fontWeight: 300 }}>=</div>
              <div>
                <div style={{ fontSize: 11, color: '#2563eb' }}>순매출</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb' }}>{net.toLocaleString()}원</div>
              </div>
              <div style={{ borderLeft: '1px solid #eee', paddingLeft: 16, display: 'flex', gap: 16 }}>
                <div><div style={{ fontSize: 11, color: '#888' }}>수량</div><div style={{ fontSize: 15, fontWeight: 700 }}>{Number(stats.todaySales.today_qty || 0).toLocaleString()}개</div></div>
                <div><div style={{ fontSize: 11, color: '#888' }}>건수</div><div style={{ fontSize: 15, fontWeight: 700 }}>{Number(stats.todaySales.today_sale_count || 0)}건</div></div>
              </div>
            </div>
            {gross > 0 && (
              <>
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 20, marginBottom: 8 }}>
                  {types.map(t => {
                    const pct = gross > 0 ? (t.value / gross) * 100 : 0;
                    if (pct === 0) return null;
                    return (
                      <div key={t.label} style={{
                        width: `${pct}%`, background: t.color, minWidth: pct > 3 ? 0 : 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: '#fff', fontWeight: 600,
                      }}>
                        {pct >= 10 ? `${t.label} ${pct.toFixed(0)}%` : pct >= 5 ? `${pct.toFixed(0)}%` : ''}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {types.map(t => (
                    <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: t.value > 0 ? t.color : '#ddd' }} />
                      <span style={{ fontSize: 12, color: '#666' }}>{t.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.value > 0 ? t.color : '#ccc' }}>{t.value.toLocaleString()}원</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        );
      })()}

      {isStore && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6366f1 100%)',
          borderRadius: 18, padding: '28px 32px', marginBottom: 16,
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.35)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -20, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -30, right: 100, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
                  <DollarOutlined style={{ marginRight: 6 }} />오늘 매출
                </div>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>
                  {`${Number(stats?.todaySales?.today_gross || 0).toLocaleString()}원`}
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>판매 수량</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{Number(stats?.todaySales?.today_qty || 0).toLocaleString()}개</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>판매 건수</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{(stats?.todaySalesDetail || []).length}건</div>
                  </div>
                  {Number(stats?.todaySales?.today_return || 0) > 0 && (
                    <>
                      <div style={{ background: 'rgba(255,100,100,0.25)', borderRadius: 10, padding: '8px 16px' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>반품</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#fca5a5' }}>-{Number(stats?.todaySales?.today_return || 0).toLocaleString()}원</div>
                      </div>
                      <div style={{ background: 'rgba(100,200,255,0.2)', borderRadius: 10, padding: '8px 16px' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>순매출</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#93c5fd' }}>{Number(stats?.todaySales?.today_revenue || 0).toLocaleString()}원</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <Button
                type="primary" size="large"
                icon={<PlusOutlined />}
                onClick={() => navigate('/sales/entry')}
                style={{
                  height: 52, fontSize: 16, fontWeight: 700, borderRadius: 14,
                  background: 'rgba(255,255,255,0.95)', color: '#6366f1', border: 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}
              >
                매출 등록
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 오늘 판매 내역 (매장 + 본사 공통) ── */}
      <Card
        title={<span><ShoppingCartOutlined style={{ marginRight: 8, color: '#6366f1' }} />오늘 판매 내역{!isStore && ' (전 매장)'}</span>}
        size="small"
        style={{ borderRadius: 12, marginBottom: 16, borderLeft: '4px solid #6366f1' }}
        extra={<a onClick={() => navigate('/sales/dashboard')}>전체보기</a>}
      >
        {(stats?.todaySalesDetail || []).length > 0 ? (
          <Table
            columns={[
              { title: '시간', dataIndex: 'sale_time', key: 'time', width: 60 },
              ...(!isStore ? [{ title: '매장' as const, dataIndex: 'partner_name' as const, key: 'partner', width: 100, ellipsis: true }] : []),
              { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
              { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 100, ellipsis: true,
                render: (v: string) => <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{v || '-'}</span>,
              },
              { title: '컬러/사이즈', key: 'variant', width: 110,
                render: (_: any, r: any) => <span style={{ fontSize: 12, color: '#666' }}>{r.color}/{r.size}</span>,
              },
              { title: '유형', dataIndex: 'sale_type', key: 'type', width: 70,
                render: (v: string) => <Tag color={v === '정상' ? 'blue' : v === '반품' ? 'red' : v === '예약판매' ? 'volcano' : 'orange'}>{v}</Tag>,
              },
              { title: '수량', dataIndex: 'qty', key: 'qty', width: 55, render: (v: number) => `${v}개` },
              { title: '금액', dataIndex: 'total_price', key: 'price', width: 90, align: 'right' as const,
                render: (v: number, r: any) => (
                  <span style={{ fontWeight: 600, color: r.sale_type === '반품' ? '#dc2626' : undefined }}>
                    {r.sale_type === '반품' ? '-' : ''}{Number(v).toLocaleString()}원
                  </span>
                ),
              },
            ]}
            dataSource={stats?.todaySalesDetail || []}
            rowKey="sale_id"
            pagination={false}
            size="small"
            scroll={{ x: isStore ? 500 : 700 }}
          />
        ) : (
          <Empty description="오늘 판매 내역이 없습니다" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* Main Stats */}
      <Row gutter={[16, 16]}>
        {/* 매장: 히어로에서 오늘 매출 표시하므로 월간매출부터 */}
        {!isStore && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard title="오늘 매출" value={`${Number(stats?.todaySales?.today_gross || 0).toLocaleString()}원`}
              icon={<DollarOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
              sub={Number(stats?.todaySales?.today_return || 0) > 0
                ? `반품 -${Number(stats.todaySales.today_return).toLocaleString()}원 / 순매출 ${Number(stats.todaySales.today_revenue).toLocaleString()}원`
                : `${Number(stats?.todaySales?.today_qty || 0).toLocaleString()}개 판매`}
              onClick={() => navigate('/sales/analytics?range=today')} />
          </Col>
        )}
        <Col xs={24} sm={12} lg={isStore ? 8 : 6}>
          <StatCard title={isStore ? '내 매장 월간 매출' : '월간 매출 (30일)'} value={`${Number(stats?.sales?.month_gross || 0).toLocaleString()}원`}
            icon={<RiseOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
            sub={Number(stats?.sales?.month_return || 0) > 0
              ? `반품 -${Number(stats.sales.month_return).toLocaleString()}원 / 순매출 ${Number(stats.sales.month_revenue).toLocaleString()}원`
              : `${Number(stats?.sales?.month_qty || 0).toLocaleString()}개 판매`}
            onClick={() => navigate('/sales/analytics?range=30d')} />
        </Col>
        <Col xs={24} sm={12} lg={isStore ? 8 : 6}>
          <StatCard title={isStore ? '내 매장 재고' : '총 재고'} value={stats?.inventory?.totalQty || 0}
            icon={<InboxOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
            sub={`${stats?.inventory?.totalItems || 0}개 품목`} onClick={() => navigate('/inventory/status')} />
        </Col>
        <Col xs={24} sm={12} lg={isStore ? 8 : 6}>
          <StatCard title={isStore ? '내 매장 대기 출고' : '대기 출고'} value={pendingCount}
            icon={<TruckOutlined />} bg="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" color="#fff"
            sub={`출고완료 ${shippedCount}건`} onClick={() => navigate(isStore ? '/shipment/store-request' : '/shipment/view')} />
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
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(stats?.sales?.week_gross || 0).toLocaleString()}원</div>
                {Number(stats?.sales?.week_return || 0) > 0 && (
                  <div style={{ fontSize: 11, color: '#dc2626' }}>반품 -{Number(stats.sales.week_return).toLocaleString()}원</div>
                )}
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
            extra={<a onClick={() => navigate(isStore ? '/shipment/store-request' : '/shipment/view')}>전체보기</a>}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: 16 }}>
              {[
                { label: '대기', count: pendingCount, color: '#6366f1' },
                { label: '출고완료', count: shippedCount, color: '#10b981' },
                { label: '수령완료', count: receivedCount, color: '#06b6d4' },
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
            extra={<a onClick={() => navigate('/sales/entry')}>매출관리</a>}>
            <MiniBar data={stats?.monthlySalesTrend || []} />
          </Card>
        </Col>
      </Row>

      {/* 판매율 분석 요약 (본사만) */}
      {isAdmin && sellThrough && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={<span><PercentageOutlined style={{ marginRight: 8 }} />판매율 분석 (올해)</span>}
              size="small" style={{ borderRadius: 10 }}
              extra={<a onClick={() => navigate('/sales/sell-through')}>상세보기</a>}
            >
              <Row gutter={[10, 10]}>
                {/* 전체 판매율 */}
                <Col xs={12} sm={8} md={4}>
                  <div style={{
                    background: Number(sellThrough.totals?.overall_rate) >= 50 ? '#e6f7ff' : Number(sellThrough.totals?.overall_rate) >= 30 ? '#fff7e6' : '#fff1f0',
                    borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                    border: `1px solid ${Number(sellThrough.totals?.overall_rate) >= 50 ? '#1890ff' : Number(sellThrough.totals?.overall_rate) >= 30 ? '#fa8c16' : '#ff4d4f'}33`,
                  }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>전체 판매율</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: Number(sellThrough.totals?.overall_rate) >= 50 ? '#1890ff' : Number(sellThrough.totals?.overall_rate) >= 30 ? '#fa8c16' : '#ff4d4f', lineHeight: 1.2 }}>
                      {sellThrough.totals?.overall_rate || 0}%
                    </div>
                    <Progress percent={sellThrough.totals?.overall_rate || 0} showInfo={false} size="small"
                      strokeColor={Number(sellThrough.totals?.overall_rate) >= 50 ? '#1890ff' : Number(sellThrough.totals?.overall_rate) >= 30 ? '#fa8c16' : '#ff4d4f'} style={{ marginTop: 4 }} />
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                      {Number(sellThrough.totals?.total_sold || 0).toLocaleString()}판매 / {Number(sellThrough.totals?.total_stock || 0).toLocaleString()}재고
                    </div>
                  </div>
                </Col>
                {/* 카테고리별 판매율 */}
                {(sellThrough.byCategory || []).slice(0, 7).map((c: any) => {
                  const rate = Number(c.sell_through_rate);
                  const CAT_C: Record<string, string> = { TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4' };
                  const color = CAT_C[c.category] || '#888';
                  return (
                    <Col xs={12} sm={8} md={4} key={c.category}>
                      <div style={{
                        borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                        border: `1px solid ${color}33`, background: `${color}08`,
                      }}>
                        <Tag style={{ color, borderColor: color, fontWeight: 600, marginBottom: 4 }}>{c.category}</Tag>
                        <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>
                          {rate}%
                        </div>
                        <Progress percent={rate} showInfo={false} size="small" strokeColor={color} style={{ marginTop: 4 }} />
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                          {Number(c.sold_qty).toLocaleString()}판매 / {Number(c.current_stock).toLocaleString()}재고
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          </Col>
        </Row>
      )}

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

      {/* 일반 알림 (재입고/출고/생산) */}
      {generalNotifs.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={<span><BellOutlined style={{ color: '#fa8c16', marginRight: 8 }} />최근 알림 <Badge count={generalNotifs.length} style={{ backgroundColor: '#fa8c16', marginLeft: 8 }} /></span>}
              size="small" style={{ borderRadius: 10, borderLeft: '4px solid #fa8c16' }}
            >
              <Table
                columns={[
                  { title: '유형', dataIndex: 'type', key: 'type', width: 90,
                    render: (v: string) => {
                      const colors: Record<string, string> = { RESTOCK: 'volcano', SHIPMENT: 'blue', PRODUCTION: 'purple' };
                      const labels: Record<string, string> = { RESTOCK: '재입고', SHIPMENT: '출고', PRODUCTION: '생산' };
                      return <Tag color={colors[v] || 'default'}>{labels[v] || v}</Tag>;
                    },
                  },
                  { title: '제목', dataIndex: 'title', key: 'title', width: 160,
                    render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
                  },
                  { title: '내용', dataIndex: 'message', key: 'message', ellipsis: true },
                  { title: '시간', dataIndex: 'created_at', key: 'created_at', width: 140,
                    render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
                  },
                ]}
                dataSource={generalNotifs}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 600 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Tables */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title={isStore ? '내 매장 최근 출고의뢰' : '최근 출고의뢰'} size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<a onClick={() => navigate(isStore ? '/shipment/store-request' : '/shipment/request')}>전체보기</a>}>
            <Table columns={shipmentColumns} dataSource={stats?.recentShipments || []} rowKey="request_no" pagination={false} size="small" scroll={{ x: 500 }} />
          </Card>
        </Col>
        <Col xs={24} md={10}>
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

      {/* A/S 현황 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title={<span><ToolOutlined style={{ color: '#8b5cf6', marginRight: 8 }} />A/S 현황</span>}
            size="small" style={{ borderRadius: 10, borderLeft: '4px solid #8b5cf6' }}
            extra={<a onClick={() => navigate('/crm/after-sales')}>전체보기</a>}
          >
            <Row gutter={[12, 12]}>
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef3f2', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>미처리</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#ef4444' }}>{asStats?.openCount || 0}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>접수 + 진행</div>
                </div>
              </Col>
              {(asStats?.byStatus || []).map((s: any) => {
                const statusColors: Record<string, { bg: string; text: string }> = {
                  '접수': { bg: '#eff6ff', text: '#3b82f6' },
                  '진행': { bg: '#fff7ed', text: '#f97316' },
                  '완료': { bg: '#f0fdf4', text: '#22c55e' },
                  '취소': { bg: '#fef2f2', text: '#ef4444' },
                };
                const c = statusColors[s.status] || { bg: '#f5f5f5', text: '#888' };
                return (
                  <Col xs={12} sm={6} key={s.status}>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: c.bg, borderRadius: 10 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.status}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: c.text }}>{s.count}</div>
                    </div>
                  </Col>
                );
              })}
            </Row>
            {(asStats?.byType || []).length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
                {(asStats?.byType || []).map((t: any) => {
                  const typeColors: Record<string, string> = { '수선': 'cyan', '클레임': 'red', '기타': 'default' };
                  return <Tag key={t.service_type} color={typeColors[t.service_type] || 'default'}>{t.service_type} {t.count}건</Tag>;
                })}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 재고 부족 알림 */}
      {(stats?.lowStock || []).length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={<span><WarningOutlined style={{ color: '#fa8c16', marginRight: 8 }} />재고 부족 알림</span>}
              size="small" style={{ borderRadius: 10, borderLeft: '4px solid #fa8c16' }}
              extra={<a onClick={() => navigate('/inventory/status')}>재고현황</a>}
            >
              <Table
                columns={lowStockColumns as ColumnsType<any>}
                dataSource={stats?.lowStock || []}
                rowKey={(r) => `${r.partner_code}-${r.variant_id}`}
                pagination={false}
                size="small"
                scroll={{ x: 600 }}
              />
            </Card>
          </Col>
        </Row>
      )}

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

      {/* 예약판매 상세 모달 */}
      <Modal
        open={preorderModalOpen}
        onCancel={() => setPreorderModalOpen(false)}
        title="매장별 예약판매 현황"
        width={1000}
        footer={null}
        destroyOnClose
      >
        {/* 매장별 요약 */}
        {(stats?.preordersByPartner || []).length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(stats?.preordersByPartner || []).map((sp: any) => (
              <Tag
                key={sp.partner_code}
                color={preorderPartnerFilter === sp.partner_code ? 'orange' : 'default'}
                style={{ cursor: 'pointer', fontSize: 13, padding: '4px 12px' }}
                onClick={() => setPreorderPartnerFilter(preorderPartnerFilter === sp.partner_code ? undefined : sp.partner_code)}
              >
                {sp.partner_name} <b>{sp.cnt}</b>건
              </Tag>
            ))}
            {preorderPartnerFilter && (
              <Tag style={{ cursor: 'pointer', fontSize: 13, padding: '4px 12px' }} onClick={() => setPreorderPartnerFilter(undefined)}>
                전체보기
              </Tag>
            )}
          </div>
        )}
        <Table
          size="small"
          loading={preorderListLoading}
          dataSource={preorderPartnerFilter ? preorderList.filter((p: any) => p.partner_code === preorderPartnerFilter) : preorderList}
          rowKey="preorder_id"
          scroll={{ x: 900, y: 400 }}
          pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
          columns={[
            { title: '등록일', dataIndex: 'preorder_date', width: 100, render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
            { title: '매장', dataIndex: 'partner_name', width: 100,
              render: (v: string, r: any) => (
                <a onClick={(e) => { e.stopPropagation(); setPreorderPartnerFilter(r.partner_code); }}
                  style={{ color: '#d97706', fontWeight: 600 }}>{v}</a>
              ),
            },
            { title: '상품명', dataIndex: 'product_name', width: 160, ellipsis: true },
            { title: 'SKU', dataIndex: 'sku', width: 120 },
            { title: '컬러', dataIndex: 'color', width: 80 },
            { title: '사이즈', dataIndex: 'size', width: 70 },
            { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const },
            { title: '단가', dataIndex: 'unit_price', width: 90, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() + '원' },
            { title: '합계', dataIndex: 'total_price', width: 100, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() + '원' },
            { title: '현재고', dataIndex: 'current_stock', width: 70, align: 'right' as const,
              render: (v: number, r: any) => (
                <span style={{ color: Number(v) >= Number(r.qty) ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{v ?? 0}</span>
              ),
            },
            { title: '메모', dataIndex: 'memo', width: 120, ellipsis: true },
          ] as ColumnsType<any>}
        />
      </Modal>

    </div>
  );
}
