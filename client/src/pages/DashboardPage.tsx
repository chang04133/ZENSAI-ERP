import { useEffect, useState } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Badge, Progress, Button, Popconfirm, Modal, InputNumber, message } from 'antd';
import {
  ShopOutlined, TagsOutlined, InboxOutlined, DollarOutlined,
  RiseOutlined, ShoppingCartOutlined, TruckOutlined,
  CheckOutlined, BellOutlined, SendOutlined,
  SwapOutlined, ReloadOutlined, PercentageOutlined,
  ExperimentOutlined, ScheduleOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import { ROLES, ROLE_LABELS } from '../../../shared/constants/roles';
import { apiFetch, safeJson } from '../core/api.client';
import { salesApi } from '../modules/sales/sales.api';
import { productionApi } from '../modules/production/production.api';
import { restockApi } from '../modules/restock/restock.api';
import type { RestockSuggestion } from '../../../shared/types/restock';
import dayjs from 'dayjs';
import StatCard from '../components/StatCard';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '입고완료', CANCELLED: '취소',
};

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

  const [sellThrough, setSellThrough] = useState<any>(null);
  const [prodDashboard, setProdDashboard] = useState<any>(null);
  const [catStats, setCatStats] = useState<any[]>([]);
  const [restockSuggestions, setRestockSuggestions] = useState<RestockSuggestion[]>([]);

  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.HQ_MANAGER;

  const loadSellThrough = async () => {
    try {
      const from = dayjs().startOf('year').format('YYYY-MM-DD');
      const to = dayjs().format('YYYY-MM-DD');
      const result = await salesApi.sellThrough(from, to);
      setSellThrough(result);
    } catch (e) { console.error('판매율 로드 실패:', e); }
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

  const loadProduction = async () => {
    try {
      const [dash, cats] = await Promise.all([
        productionApi.dashboard(),
        productionApi.categoryStats(),
      ]);
      setProdDashboard(dash);
      setCatStats(cats);
    } catch { /* ignore - 권한 없으면 무시 */ }
  };

  const loadRestockSuggestions = async () => {
    try {
      const result = await restockApi.getRestockSuggestions();
      setRestockSuggestions(result.suggestions);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadStats(); loadNotifications(); loadSellThrough(); if (isStore) loadMyPendingRequests(); if (isAdmin) { loadProduction(); loadRestockSuggestions(); } }, []);

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
                        onClick={() => navigate('/shipment/store')}
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
                        onClick={() => navigate('/shipment/store')}
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
                        onClick={() => navigate('/restock/progress')}
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
                        onClick={() => navigate('/shipment/request')}
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
                        onClick={() => navigate('/restock/progress')}
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
                        onClick={() => navigate('/shipment/process')}
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

          {/* 상세 테이블 (재입고만) */}
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
            sub={`${Number(stats?.todaySales?.today_qty || 0).toLocaleString()}개 판매`}
            onClick={() => navigate('/sales/entry')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title={isStore ? '내 매장 월간 매출' : '월간 매출 (30일)'} value={`${(Number(stats?.sales?.month_revenue || 0) / 10000).toFixed(0)}만원`}
            icon={<RiseOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
            sub={`${Number(stats?.sales?.month_qty || 0).toLocaleString()}개 판매`}
            onClick={() => navigate(isAdmin ? '/sales/dashboard' : '/sales/product-sales')} />
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
              <Card size="small" style={{ borderRadius: 10, cursor: 'pointer' }} loading={loading} onClick={() => navigate('/partners')}>
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
              <Card size="small" style={{ borderRadius: 10, cursor: 'pointer' }} loading={loading} onClick={() => navigate('/products')}>
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
          <Card size="small" style={{ borderRadius: 10, cursor: 'pointer' }} loading={loading} onClick={() => navigate('/sales/product-sales')}>
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
          <Card size="small" style={{ borderRadius: 10, cursor: 'pointer' }} loading={loading} onClick={() => navigate('/sales/product-sales')}>
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

      {/* 판매율 분석 요약 */}
      {sellThrough && (
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
                  <div onClick={() => navigate('/sales/sell-through')} style={{
                    background: Number(sellThrough.totals?.overall_rate) >= 50 ? '#e6f7ff' : Number(sellThrough.totals?.overall_rate) >= 30 ? '#fff7e6' : '#fff1f0',
                    borderRadius: 10, padding: '12px 14px', textAlign: 'center', cursor: 'pointer', transition: 'transform 0.15s',
                    border: `1px solid ${Number(sellThrough.totals?.overall_rate) >= 50 ? '#1890ff' : Number(sellThrough.totals?.overall_rate) >= 30 ? '#fa8c16' : '#ff4d4f'}33`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
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
                {(sellThrough.byCategory || []).map((c: any) => {
                  const rate = Number(c.sell_through_rate);
                  const CAT_C: Record<string, string> = { TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4' };
                  const color = CAT_C[c.category] || '#888';
                  return (
                    <Col xs={12} sm={8} md={4} key={c.category}>
                      <div onClick={() => navigate('/sales/sell-through')} style={{
                        borderRadius: 10, padding: '12px 14px', textAlign: 'center', cursor: 'pointer', transition: 'transform 0.15s',
                        border: `1px solid ${color}33`, background: `${color}08`,
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
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

      {/* 생산기획 요약 (Admin/HQ 전용) */}
      {isAdmin && prodDashboard && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {/* 생산 현황 */}
          <Col xs={24} md={8}>
            <Card
              title={<span><ExperimentOutlined style={{ marginRight: 8 }} />생산 현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%', cursor: 'pointer' }}
              extra={<a onClick={(e) => { e.stopPropagation(); navigate('/production/plans'); }}>전체보기</a>}
              onClick={() => navigate('/production/plans')}
            >
              <Row gutter={[8, 8]}>
                {(prodDashboard.statusCounts || []).map((s: any) => {
                  const STATUS_CONF: Record<string, { label: string; color: string; bg: string }> = {
                    DRAFT: { label: '초안', color: '#8c8c8c', bg: '#f5f5f5' },
                    CONFIRMED: { label: '확정', color: '#1890ff', bg: '#e6f7ff' },
                    IN_PRODUCTION: { label: '생산중', color: '#fa8c16', bg: '#fff7e6' },
                    COMPLETED: { label: '완료', color: '#52c41a', bg: '#f6ffed' },
                    CANCELLED: { label: '취소', color: '#ff4d4f', bg: '#fff1f0' },
                  };
                  const conf = STATUS_CONF[s.status] || { label: s.status, color: '#888', bg: '#f5f5f5' };
                  return (
                    <Col xs={12} key={s.status}>
                      <div style={{ background: conf.bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#888' }}>{conf.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: conf.color, lineHeight: 1.2 }}>{s.count}</div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>{Number(s.total_qty).toLocaleString()}개</div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          </Col>

          {/* 카테고리별 재고 커버리지 */}
          <Col xs={24} md={9}>
            <Card
              title={<span><ScheduleOutlined style={{ marginRight: 8 }} />카테고리 재고현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%', cursor: 'pointer' }}
              extra={<a onClick={(e) => { e.stopPropagation(); navigate('/production'); }}>상세보기</a>}
              onClick={() => navigate('/production')}
            >
              {catStats.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {catStats.map((cat: any) => {
                    const stock = Number(cat.current_stock) || 0;
                    const prod = Number(cat.in_production_qty) || 0;
                    const maxStock = Math.max(...catStats.map((c: any) => Number(c.current_stock) || 0), 1);
                    return (
                      <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Tag style={{ minWidth: 56, textAlign: 'center', fontWeight: 600 }}>{cat.category}</Tag>
                        <div style={{ flex: 1 }}>
                          <Progress percent={stock / maxStock * 100} showInfo={false} size="small" strokeColor="#1890ff" />
                        </div>
                        <div style={{ minWidth: 70, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{stock.toLocaleString()}</div>
                        {prod > 0 && <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>+{prod.toLocaleString()}</Tag>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>카테고리 데이터 없음</div>
              )}
            </Card>
          </Col>

          {/* 진행중 생산 */}
          <Col xs={24} md={7}>
            <Card
              title={<span><SyncOutlined style={{ marginRight: 8 }} />생산 진행</span>}
              size="small" style={{ borderRadius: 10, height: '100%', cursor: 'pointer' }}
              extra={<a onClick={(e) => { e.stopPropagation(); navigate('/production/progress'); }}>전체보기</a>}
              onClick={() => navigate('/production/progress')}
            >
              {(prodDashboard.progressItems || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(prodDashboard.progressItems || []).slice(0, 5).map((item: any) => {
                    const pct = item.plan_qty > 0 ? Math.round((item.produced_qty / item.plan_qty) * 100) : 0;
                    return (
                      <div key={item.item_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600 }}>{item.plan_no}</span>
                          <span style={{ color: '#888' }}>{item.category}</span>
                        </div>
                        <Progress percent={pct} size="small" strokeColor={pct >= 80 ? '#52c41a' : pct >= 50 ? '#1890ff' : '#fa8c16'} />
                        <div style={{ fontSize: 11, color: '#888', textAlign: 'right' }}>
                          {item.produced_qty}/{item.plan_qty}개
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>
                  <SyncOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
                  진행중인 생산이 없습니다
                </div>
              )}
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

      {/* 할일 섹션은 위로 이동됨 */}

      {/* Tables */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          {isAdmin && restockSuggestions.length > 0 ? (() => {
            const STATUS_CONF: Record<string, { label: string; color: string; bg: string; border: string }> = {
              ALERT: { label: '알림', color: '#f5222d', bg: '#fff1f0', border: '#ffa39e' },
              CONSIDER: { label: '고려', color: '#fa8c16', bg: '#fff7e6', border: '#ffd591' },
              NORMAL: { label: '정상', color: '#8c8c8c', bg: '#f5f5f5', border: '#d9d9d9' },
            };
            const grouped = { ALERT: [] as RestockSuggestion[], CONSIDER: [] as RestockSuggestion[], NORMAL: [] as RestockSuggestion[] };
            restockSuggestions.forEach(s => { (grouped[s.restock_status] || grouped.NORMAL).push(s); });
            return (
              <Card
                title={<span>재입고 제안 <Badge count={restockSuggestions.length} style={{ backgroundColor: '#ef4444', marginLeft: 8 }} /></span>}
                size="small" style={{ borderRadius: 10 }} loading={loading}
                extra={<a onClick={() => navigate('/restock/manage')}>전체보기</a>}
              >
                <Row gutter={[6, 6]} style={{ marginBottom: 12 }}>
                  {(['ALERT', 'CONSIDER', 'NORMAL'] as const).map(st => {
                    const conf = STATUS_CONF[st];
                    const items = grouped[st];
                    const totalQty = items.reduce((s, i) => s + i.suggested_qty, 0);
                    return (
                      <Col span={8} key={st}>
                        <div style={{
                          background: conf.bg, border: `1px solid ${conf.border}`, borderRadius: 8,
                          padding: '8px 4px', textAlign: 'center', cursor: 'pointer',
                        }} onClick={() => navigate('/restock/manage')}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: conf.color }}>{conf.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: conf.color, lineHeight: 1.2 }}>{items.length}</div>
                          <div style={{ fontSize: 10, color: '#888' }}>{totalQty.toLocaleString()}개</div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
                {/* 알림/고려 주요 품목 */}
                {(() => {
                  const topItems = [...grouped.ALERT, ...grouped.CONSIDER].slice(0, 5);
                  if (topItems.length === 0) return <div style={{ textAlign: 'center', padding: 12, color: '#aaa', fontSize: 12 }}>알림/고려 품목이 없습니다</div>;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {topItems.map(item => {
                        const conf = STATUS_CONF[item.restock_status];
                        return (
                          <div key={item.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <Tag style={{ margin: 0, fontWeight: 700, color: conf.color, borderColor: conf.border, background: conf.bg, minWidth: 32, textAlign: 'center', fontSize: 11 }}>{conf.label}</Tag>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product_name}</div>
                              <div style={{ fontSize: 10, color: '#888' }}>{item.color}/{item.size}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: conf.color }}>{item.suggested_qty}개</div>
                              <div style={{ fontSize: 10, color: '#888' }}>재고 {item.current_stock}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </Card>
            );
          })() : (
            <Card title={<span>{isStore ? '내 매장 재입고 필요' : '재입고 필요'} <Badge count={(stats?.lowStock || []).length} style={{ backgroundColor: '#ef4444', marginLeft: 8 }} /></span>}
              size="small" style={{ borderRadius: 10 }} loading={loading}
              extra={<a onClick={() => navigate('/inventory/status')}>전체보기</a>}>
              {(stats?.lowStock || []).length > 0 ? (
                <Table columns={lowStockColumns} dataSource={(stats?.lowStock || []).slice(0, 5)} rowKey={(r) => `${r.partner_code}-${r.variant_id}`} pagination={false} size="small" scroll={{ x: 500 }} />
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
                  <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
                  재입고 필요 품목이 없습니다
                </div>
              )}
            </Card>
          )}
        </Col>
        <Col xs={24} md={9}>
          <Card title={isStore ? '내 매장 최근 출고의뢰' : '최근 출고의뢰'} size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<a onClick={() => navigate(isStore ? '/shipment/store' : '/shipment/request')}>전체보기</a>}>
            <Table columns={shipmentColumns} dataSource={stats?.recentShipments || []} rowKey="request_no" pagination={false} size="small" scroll={{ x: 500 }}
              onRow={() => ({ onClick: () => navigate(isStore ? '/shipment/store' : '/shipment/request'), style: { cursor: 'pointer' } })} />
          </Card>
        </Col>
        <Col xs={24} md={7}>
          <Card title={isStore ? '내 매장 인기상품 TOP 5' : '인기상품 TOP 5'} size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<span style={{ fontSize: 11, color: '#888' }}>최근 30일</span>}>
            {(stats?.topProducts || []).length > 0 ? (
              <Table columns={productColumns} dataSource={stats?.topProducts || []} rowKey="product_code" pagination={false} size="small" scroll={{ x: 400 }}
                onRow={() => ({ onClick: () => navigate('/sales/product-sales'), style: { cursor: 'pointer' } })} />
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

    </div>
  );
}
