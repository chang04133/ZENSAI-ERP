import { useEffect, useState, useRef, useCallback, CSSProperties } from 'react';
import { Card, Col, Row, Table, Tag, Input, AutoComplete, Spin, message, Button } from 'antd';
import {
  InboxOutlined, ShopOutlined, TagsOutlined, SearchOutlined,
  StopOutlined, BarChartOutlined, SkinOutlined, ColumnHeightOutlined,
  SendOutlined, AlertOutlined, ThunderboltOutlined, WarningOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { restockApi } from '../../modules/restock/restock.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { apiFetch } from '../../core/api.client';
import type { RestockSuggestion } from '../../../../shared/types/restock';

/* ── 색상 팔레트 ── */
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];
const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4', '미분류': '#94a3b8',
};
const URGENCY_COLORS: Record<string, string> = { CRITICAL: 'red', WARNING: 'orange', NORMAL: 'blue' };
const URGENCY_LABELS: Record<string, string> = { CRITICAL: '위험', WARNING: '주의', NORMAL: '보통' };

/* ── Stat Card ── */
function StatCard({ title, value, icon, bg, color, sub, onClick }: {
  title: string; value: string | number; icon: React.ReactNode;
  bg: string; color: string; sub?: string; onClick?: () => void;
}) {
  const style: CSSProperties = {
    background: bg, borderRadius: 12, padding: '18px 22px', cursor: onClick ? 'pointer' : 'default',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 100,
    transition: 'transform 0.15s', border: 'none',
  };
  return (
    <div style={style} onClick={onClick}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}>
      <div>
        <div style={{ fontSize: 12, color: color + 'cc', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.2 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sub && <div style={{ fontSize: 11, color: color + '99', marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 32, color: color + '44' }}>{icon}</div>
    </div>
  );
}

/* ── Horizontal Bar ── */
function HBar({ data, colorKey }: { data: Array<{ label: string; value: number; sub?: string }>; colorKey?: Record<string, string> }) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const c = colorKey?.[d.label] || COLORS[i % COLORS.length];
        return (
          <div key={d.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: c }}>
                {d.value.toLocaleString()}개
                {d.sub && <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>{d.sub}</span>}
              </span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${c}, ${c}aa)`,
                borderRadius: 6, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function InventoryStatusPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const effectiveStore = isStore;

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── 본사: 재입고 제안 데이터 (60일+판매율+계절가중치) ──
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(true);

  // ── 매장: 기존 리오더 데이터 ──
  const [reorderData, setReorderData] = useState<{ urgent: any[]; recommend: any[] }>({ urgent: [], recommend: [] });
  const [reorderLoading, setReorderLoading] = useState(true);

  // 재고찾기
  const [searchText, setSearchText] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 매장용 재고 요청
  const [requestingIds, setRequestingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const onSearchChange = (value: string) => {
    setSearchText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setSearchSuggestions([]); setSearchResult(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await inventoryApi.searchSuggest(value);
        setSearchSuggestions(Array.isArray(data) ? data : []);
      } catch (e: any) {
        console.error('검색 자동완성 실패:', e);
        setSearchSuggestions([]);
      }
    }, 300);
  };

  const onSearchSelect = async (value: string) => {
    const q = (value || '').trim();
    if (!q) return;
    setSearchText(q);
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const data = await inventoryApi.searchItem(q);
      if (!data || (!data.product && (!data.variants || data.variants.length === 0))) {
        setSearchResult({ product: null, variants: [] });
        message.info('검색 결과가 없습니다.');
      } else {
        setSearchResult(data);
      }
    } catch (e: any) {
      message.error('검색 실패: ' + (e.message || '알 수 없는 오류'));
      setSearchResult(null);
    }
    finally { setSearchLoading(false); }
  };

  const loadMyPendingRequests = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications/my-pending-requests');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSentIds(new Set(data.data.map((vid: number) => String(vid))));
      }
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    setStatsLoading(true);
    inventoryApi.dashboardStats()
      .then(setStats)
      .catch((e: any) => message.error(e.message))
      .finally(() => setStatsLoading(false));

    if (effectiveStore) {
      // 매장: 기존 리오더 알림 유지
      setReorderLoading(true);
      inventoryApi.reorderAlerts(1, 3)
        .then(setReorderData)
        .catch((e: any) => console.error('리오더 조회 실패:', e))
        .finally(() => setReorderLoading(false));
      loadMyPendingRequests();
    } else {
      // 본사: 재입고 제안 엔진 (60일+판매율+계절가중치)
      setSugLoading(true);
      restockApi.getRestockSuggestions()
        .then(setSuggestions)
        .catch((e: any) => console.error('제안 조회 실패:', e))
        .finally(() => setSugLoading(false));
    }
  }, [effectiveStore, loadMyPendingRequests]);

  useEffect(() => { loadAll(); }, []);

  const handleStockRequest = async (item: any) => {
    const key = `${item.variant_id}`;
    if (requestingIds.has(key) || sentIds.has(key)) return;
    const allTargets = (item.other_locations || []).filter((loc: any) => loc.qty >= 1);
    if (allTargets.length === 0) {
      message.warning('다른 매장에 재고가 없습니다.');
      return;
    }
    const maxQty = Math.max(...allTargets.map((t: any) => t.qty));
    const targets = allTargets.filter((t: any) => t.qty === maxQty);
    setRequestingIds((prev) => new Set(prev).add(key));
    try {
      const res = await apiFetch('/api/notifications/stock-request', {
        method: 'POST',
        body: JSON.stringify({
          variant_id: item.variant_id,
          from_qty: item.current_qty,
          targets: targets.map((t: any) => ({ partner_code: t.partner_code, qty: t.qty })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`${targets.length}개 매장/본사에 재고 요청 완료 (최다재고 ${maxQty}개)`);
        setSentIds((prev) => new Set(prev).add(key));
      } else { message.error(data.error); }
    } catch (e: any) { message.error(e.message); }
    finally {
      setRequestingIds((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const overall = stats?.overall || {};
  const byCategory = (stats?.byCategory || []) as Array<{ category: string; product_count: number; variant_count: number; total_qty: number }>;
  const bySeason = (stats?.bySeason || []) as Array<{ season: string; product_count: number; variant_count: number; total_qty: number; partner_count: number }>;
  const byFit = (stats?.byFit || []) as Array<{ fit: string; product_count: number; variant_count: number; total_qty: number }>;
  const byLength = (stats?.byLength || []) as Array<{ length: string; product_count: number; variant_count: number; total_qty: number }>;

  // ── 본사: 제안 통계 ──
  const criticalCount = suggestions.filter(s => s.urgency === 'CRITICAL').length;
  const warningCount = suggestions.filter(s => s.urgency === 'WARNING').length;

  // ── 본사: 제안 테이블 컬럼 ──
  const sugColumns = [
    { title: '긴급도', dataIndex: 'urgency', key: 'urgency', width: 70,
      render: (v: string) => <Tag color={URGENCY_COLORS[v]}>{URGENCY_LABELS[v]}</Tag>,
      filters: [
        { text: '위험', value: 'CRITICAL' },
        { text: '주의', value: 'WARNING' },
        { text: '보통', value: 'NORMAL' },
      ],
      onFilter: (value: any, record: RestockSuggestion) => record.urgency === value,
    },
    { title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true,
      render: (v: string, r: RestockSuggestion) => <a onClick={() => navigate(`/products/${r.product_code}`)}>{v}</a>,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 55 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 55, render: (v: string) => <Tag>{v}</Tag> },
    { title: '판매율', dataIndex: 'sell_through_rate', key: 'sell_through_rate', width: 65,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.sell_through_rate - b.sell_through_rate,
      render: (v: number) => <span style={{ fontWeight: 600, color: v >= 70 ? '#f5222d' : v >= 50 ? '#fa8c16' : '#1890ff' }}>{v}%</span>,
    },
    { title: '현재고', dataIndex: 'current_stock', key: 'current_stock', width: 65,
      render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 5 ? 'orange' : 'default'}>{v}</Tag>,
    },
    { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage_qty', width: 65,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.shortage_qty - b.shortage_qty,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 700 }}>{v}</span> : '-',
    },
    { title: '소진일', dataIndex: 'days_of_stock', key: 'days_of_stock', width: 65,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.days_of_stock - b.days_of_stock,
      render: (v: number) => <Tag color={v < 7 ? 'red' : v < 14 ? 'orange' : v < 30 ? 'gold' : 'default'}>{v}일</Tag>,
    },
    { title: '권장수량', dataIndex: 'suggested_qty', key: 'suggested_qty', width: 75,
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : '-',
    },
  ];

  // ── 매장: 리오더 테이블 컬럼 ──
  const storeColumns = [
    { title: '상품', dataIndex: 'product_name', key: 'product_name',
      render: (v: string, r: any) => <a onClick={() => navigate(`/products/${r.product_code}`)}>{v}</a>,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 55 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 55, render: (v: string) => <Tag>{v}</Tag> },
    { title: '재고', dataIndex: 'current_qty', key: 'current_qty', width: 65,
      render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 1 ? 'orange' : 'blue'}>{v}</Tag>,
    },
    { title: '7일 판매', dataIndex: 'sold_7d', key: 'sold_7d', width: 75,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    { title: '일평균', dataIndex: 'daily_7d', key: 'daily_7d', width: 65 },
    { title: '잔여일(7d)', dataIndex: 'days_left_7d', key: 'days_left_7d', width: 80,
      render: (v: number | null) => v === null ? '-' : <Tag color={v <= 3 ? 'red' : v <= 7 ? 'orange' : 'gold'}>{v}일</Tag>,
    },
    { title: '30일 판매', dataIndex: 'sold_30d', key: 'sold_30d', width: 80,
      render: (v: number) => <span style={{ color: '#666' }}>{v}</span>,
    },
    { title: '잔여일(30d)', dataIndex: 'days_left_30d', key: 'days_left_30d', width: 85,
      render: (v: number | null) => v === null ? '-' : <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : 'gold'}>{v}일</Tag>,
    },
    { title: '다른 매장 재고', dataIndex: 'other_locations', key: 'other_locations',
      render: (locs: any[]) => {
        if (!locs || locs.length === 0) return <span style={{ color: '#ccc', fontSize: 12 }}>없음</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
            {locs.map((loc: any) => (
              <span key={loc.partner_code} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                <span style={{ color: loc.partner_type === '본사' ? '#6366f1' : '#888' }}>{loc.partner_name}</span>
                {' '}<Tag color={loc.qty >= 10 ? 'green' : loc.qty >= 5 ? 'blue' : 'default'} style={{ fontSize: 11, margin: 0 }}>{loc.qty}개</Tag>
              </span>
            ))}
          </div>
        );
      },
    },
    {
      title: '', key: 'request', width: 80,
      render: (_: any, record: any) => {
        const k = `${record.variant_id}`;
        const loading = requestingIds.has(k);
        const alreadySent = sentIds.has(k);
        const hasTargets = (record.other_locations || []).length > 0;
        if (alreadySent) {
          return <Button size="small" disabled style={{ fontSize: 12, color: '#52c41a', borderColor: '#b7eb8f' }}>요청완료</Button>;
        }
        return hasTargets ? (
          <Button type="primary" size="small" icon={<SendOutlined />}
            loading={loading} disabled={loading}
            onClick={() => handleStockRequest(record)}
            style={{ fontSize: 12 }}>
            요청
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <div>
      <PageHeader title={effectiveStore ? '내 매장 재고현황' : '재고현황'} />

      {/* ── 통계 카드 ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={effectiveStore ? 6 : 5}>
          <StatCard title={effectiveStore ? '내 매장 총 재고' : '총 재고수량'} value={Number(overall.total_qty || 0)}
            icon={<InboxOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
            sub={`${Number(overall.total_items || 0)}개 품목`} />
        </Col>
        {!effectiveStore && (
          <Col xs={24} sm={12} lg={5}>
            <StatCard title="거래처 수" value={Number(overall.total_partners || 0)}
              icon={<ShopOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
              sub="재고 보유 거래처" onClick={() => navigate('/inventory/store')} />
          </Col>
        )}
        {/* 본사: CRITICAL/WARNING 카운트, 매장: 리오더 긴급/추천 카운트 */}
        <Col xs={24} sm={8} lg={effectiveStore ? 6 : 5}>
          <StatCard
            title={effectiveStore ? '리오더 긴급' : '위험 (7일 미만)'}
            value={effectiveStore ? (reorderLoading ? '...' : reorderData.urgent.length) : (sugLoading ? '...' : criticalCount)}
            icon={<ThunderboltOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff" />
        </Col>
        <Col xs={24} sm={8} lg={effectiveStore ? 6 : 5}>
          <StatCard
            title={effectiveStore ? '리오더 추천' : '주의 (14일 미만)'}
            value={effectiveStore ? (reorderLoading ? '...' : reorderData.recommend.length) : (sugLoading ? '...' : warningCount)}
            icon={effectiveStore ? <AlertOutlined /> : <WarningOutlined />}
            bg="linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" color="#7c4a1e" />
        </Col>
        <Col xs={24} sm={8} lg={effectiveStore ? 6 : 4}>
          <StatCard title="품절" value={Number(overall.zero_stock_count || 0)}
            icon={<StopOutlined />} bg="linear-gradient(135deg, #fa709a 0%, #fee140 100%)" color="#fff"
            sub="재고 0개" />
        </Col>
      </Row>

      {/* ── 재고찾기 ── */}
      <Card
        title={<span><SearchOutlined style={{ marginRight: 8 }} />재고찾기</span>}
        size="small" style={{ borderRadius: 10, marginTop: 16 }}
        extra={<span style={{ color: '#888', fontSize: 12 }}>상품명, SKU, 상품코드로 검색</span>}
      >
        <AutoComplete
          value={searchText}
          onChange={onSearchChange}
          onSelect={onSearchSelect}
          style={{ width: '100%', marginBottom: searchResult ? 16 : 0 }}
          options={searchSuggestions.map(s => ({
            value: s.product_code,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.product_name}</span>
                <span style={{ color: '#888', fontSize: 12 }}>{s.product_code} · {s.category || '-'}</span>
              </div>
            ),
          }))}
        >
          <Input.Search
            placeholder="상품명, SKU, 상품코드 입력..."
            enterButton
            size="large"
            loading={searchLoading}
            onSearch={(v) => v.trim() && onSearchSelect(v.trim())}
          />
        </AutoComplete>

        {searchLoading && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}

        {!searchLoading && searchResult && !searchResult.product && (
          <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>검색 결과가 없습니다</div>
        )}

        {!searchLoading && searchResult?.product && (
          <div>
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fb', borderRadius: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{searchResult.product.product_name}</span>
              <span style={{ marginLeft: 12, color: '#6366f1', fontSize: 13, fontWeight: 600 }}>{searchResult.product.product_code}</span>
              {searchResult.product.category && <Tag color="blue" style={{ marginLeft: 8 }}>{searchResult.product.category}</Tag>}
              {searchResult.product.fit && <Tag style={{ marginLeft: 4 }}>{searchResult.product.fit}</Tag>}
              {searchResult.product.season && <Tag style={{ marginLeft: 4 }}>{searchResult.product.season}</Tag>}
              <span style={{ marginLeft: 12, color: '#888', fontSize: 12 }}>
                {searchResult.variants?.length || 0}개 옵션
              </span>
            </div>
            <Table
              dataSource={searchResult.variants}
              rowKey="variant_id"
              pagination={false}
              size="small"
              columns={[
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
                { title: 'Color', dataIndex: 'color', key: 'color', width: 70 },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v}</Tag> },
                ...(isStore ? [{
                  title: '내 매장', dataIndex: 'my_store_qty', key: 'my_store_qty', width: 80,
                  render: (v: number) => <span style={{ fontWeight: 700, color: v === 0 ? '#ef4444' : '#10b981', fontSize: 14 }}>{v}개</span>,
                }] : []),
                ...(!isStore ? [
                  { title: '총 재고', dataIndex: 'total_qty', key: 'total_qty', width: 80,
                    render: (v: number) => <span style={{ fontWeight: 700, color: v === 0 ? '#ef4444' : '#111' }}>{v}개</span>,
                  },
                  { title: '매장별 재고', dataIndex: 'locations', key: 'locations',
                    render: (locs: any[]) => {
                      if (!locs || locs.length === 0) return <span style={{ color: '#ccc', fontSize: 12 }}>재고 없음</span>;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                          {locs.map((loc: any) => (
                            <span key={loc.partner_code} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              <span style={{ color: loc.partner_type === '본사' ? '#6366f1' : '#333', fontWeight: loc.partner_type === '본사' ? 600 : 400 }}>
                                {loc.partner_name}
                              </span>
                              {' '}
                              <Tag color={loc.qty >= 10 ? 'green' : loc.qty >= 5 ? 'blue' : 'orange'} style={{ fontSize: 11, margin: 0 }}>
                                {loc.qty}개
                              </Tag>
                            </span>
                          ))}
                        </div>
                      );
                    },
                  },
                ] : []),
              ]}
            />
          </div>
        )}
      </Card>

      {/* ── 카테고리별 / 시즌별 (본사만) ── */}
      {!effectiveStore && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title={<span><TagsOutlined style={{ marginRight: 8 }} />카테고리별 물량</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar
                data={byCategory.map(c => ({
                  label: c.category,
                  value: Number(c.total_qty),
                  sub: `${c.product_count}상품 / ${c.variant_count}옵션`,
                }))}
                colorKey={CAT_COLORS}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={<span><BarChartOutlined style={{ marginRight: 8 }} />시즌(생산연도)별 물량</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar
                data={bySeason.map(s => ({
                  label: s.season || '미지정',
                  value: Number(s.total_qty),
                  sub: `${s.product_count}상품 / ${Number(s.partner_count)}거래처`,
                }))}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 핏별 / 기장별 (본사만) ── */}
      {!effectiveStore && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title={<span><SkinOutlined style={{ marginRight: 8 }} />핏별 재고현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar
                data={byFit.map(f => ({
                  label: f.fit,
                  value: Number(f.total_qty),
                  sub: `${f.product_count}상품 / ${f.variant_count}옵션`,
                }))}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={<span><ColumnHeightOutlined style={{ marginRight: 8 }} />기장별 재고현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar
                data={byLength.map(l => ({
                  label: l.length,
                  value: Number(l.total_qty),
                  sub: `${l.product_count}상품 / ${l.variant_count}옵션`,
                }))}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 본사: 보충 필요 품목 (재입고 제안 엔진) ── */}
      {!effectiveStore && (
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertOutlined style={{ color: '#f5222d' }} />
              보충 필요 품목 ({suggestions.length}건)
              <span style={{ fontSize: 12, fontWeight: 400, color: '#888', marginLeft: 8 }}>
                60일 판매 · 판매율 ≥40% · 계절가중치 · 소진일 기준
              </span>
            </span>
          }
          size="small" style={{ borderRadius: 10, marginTop: 16 }} loading={sugLoading}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => {
              setSugLoading(true);
              restockApi.getRestockSuggestions().then(setSuggestions).catch(() => {}).finally(() => setSugLoading(false));
            }}>새로고침</Button>
          }
        >
          {suggestions.length > 0 ? (
            <Table
              dataSource={suggestions}
              rowKey="variant_id"
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              pagination={{ pageSize: 50, size: 'small', showTotal: (t) => `총 ${t}건` }}
              columns={sugColumns}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
              <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
              보충 필요 품목이 없습니다
            </div>
          )}
        </Card>
      )}

      {/* ── 매장: 리오더 긴급 ── */}
      {effectiveStore && (
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ThunderboltOutlined style={{ color: '#f5222d' }} />
              리오더 긴급 ({reorderData.urgent.length}건)
              <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>재고 1개 이하</span>
            </span>
          }
          size="small" style={{ borderRadius: 10, marginTop: 16 }} loading={reorderLoading}
        >
          {reorderData.urgent.length > 0 ? (
            <Table
              dataSource={reorderData.urgent}
              rowKey="variant_id"
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              pagination={{ pageSize: 50, size: 'small', showTotal: (t) => `총 ${t}건` }}
              columns={storeColumns}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
              <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
              긴급 리오더 항목이 없습니다
            </div>
          )}
        </Card>
      )}

      {/* ── 매장: 리오더 추천 ── */}
      {effectiveStore && (
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertOutlined style={{ color: '#fa8c16' }} />
              리오더 추천 ({reorderData.recommend.length}건)
              <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>재고 3개 이하</span>
            </span>
          }
          size="small" style={{ borderRadius: 10, marginTop: 16 }} loading={reorderLoading}
        >
          {reorderData.recommend.length > 0 ? (
            <Table
              dataSource={reorderData.recommend}
              rowKey="variant_id"
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              pagination={{ pageSize: 50, size: 'small', showTotal: (t) => `총 ${t}건` }}
              columns={storeColumns}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
              <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
              리오더 추천 항목이 없습니다
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
