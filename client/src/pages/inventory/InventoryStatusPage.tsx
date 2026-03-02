import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Card, Col, Row, Table, Tag, Input, AutoComplete, Spin, Button,
  InputNumber, Select, Space, Modal, Form, Segmented, message,
} from 'antd';
import {
  InboxOutlined, ShopOutlined, TagsOutlined, SearchOutlined,
  StopOutlined, BarChartOutlined, SkinOutlined, ColumnHeightOutlined,
  SendOutlined, AlertOutlined, ThunderboltOutlined,
  ReloadOutlined, EditOutlined, HistoryOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { restockApi } from '../../modules/restock/restock.api';

import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { apiFetch } from '../../core/api.client';
import RestockManagePage from '../restock/RestockManagePage';
import { sizeSort } from '../../utils/size-order';
import { CAT_COLORS, CAT_TAG_COLORS } from '../../utils/constants';
import StatCard from '../../components/StatCard';
import HBar from '../../components/HBar';

const TX_TYPE_LABELS: Record<string, string> = {
  ADJUST: '수동조정', SHIPMENT: '출고', RETURN: '반품', TRANSFER: '이동', SALE: '판매', RESTOCK: '재입고',
};
const TX_TYPE_COLORS: Record<string, string> = {
  ADJUST: 'purple', SHIPMENT: 'blue', RETURN: 'orange', TRANSFER: 'cyan', SALE: 'green', RESTOCK: 'magenta',
};

const renderQty = (qty: number) => {
  const n = Number(qty);
  const color = n === 0 ? '#ff4d4f' : n <= 5 ? '#faad14' : '#333';
  return <strong style={{ color, fontSize: 14 }}>{n.toLocaleString()}</strong>;
};


/* ══════════════════════════════════════════
   Tab 1: 대시보드 (기존 InventoryStatusPage)
   ══════════════════════════════════════════ */
function DashboardTab() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const effectiveStore = isStore;

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [reorderData, setReorderData] = useState<{ urgent: any[]; recommend: any[] }>({ urgent: [], recommend: [] });
  const [reorderLoading, setReorderLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [srchColorFilter, setSrchColorFilter] = useState('');
  const [srchSizeFilter, setSrchSizeFilter] = useState('');
  const [srchCategoryFilter, setSrchCategoryFilter] = useState('');
  const [srchSeasonFilter, setSrchSeasonFilter] = useState('');
  const [srchColorOpts, setSrchColorOpts] = useState<{ label: string; value: string }[]>([]);
  const [srchSizeOpts, setSrchSizeOpts] = useState<{ label: string; value: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const [requestingIds, setRequestingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // 재입고 제안
  const [restockData, setRestockData] = useState<any[]>([]);
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockGradeFilter, setRestockGradeFilter] = useState('');
  const restockRef = useRef<HTMLDivElement>(null);

  // 드릴다운 상태
  const [drillDown, setDrillDown] = useState<{ title: string; params: Record<string, string> } | null>(null);
  const [drillData, setDrillData] = useState<any[]>([]);
  const [drillTotal, setDrillTotal] = useState(0);
  const [drillSumQty, setDrillSumQty] = useState(0);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillPage, setDrillPage] = useState(1);
  const [drillSort, setDrillSort] = useState<string>('qty_desc');
  const [drillView, setDrillView] = useState<'size' | 'product' | 'color'>('size');

  const SORT_OPTIONS = [
    { label: '수량 많은순', value: 'qty_desc' },
    { label: '수량 적은순', value: 'qty_asc' },
    { label: '상품명순', value: 'product_name_asc' },
    { label: '카테고리순', value: 'category_asc' },
    { label: 'SKU순', value: 'sku_asc' },
  ];

  const parseDrillSort = (s: string) => {
    const [field, dir] = s.split('_').length === 3
      ? [s.substring(0, s.lastIndexOf('_')), s.substring(s.lastIndexOf('_') + 1).toUpperCase()]
      : [s.replace(/_desc|_asc/, ''), s.endsWith('_desc') ? 'DESC' : 'ASC'];
    return { sort_field: field, sort_dir: dir };
  };

  const loadDrill = useCallback(async (params: Record<string, string>, page: number, sort?: string) => {
    setDrillLoading(true);
    try {
      const { sort_field, sort_dir } = parseDrillSort(sort || drillSort);
      const result = await inventoryApi.list({ ...params, page: String(page), limit: '50', sort_field, sort_dir });
      setDrillData(result.data);
      setDrillTotal(result.total);
      setDrillSumQty(result.sumQty);
    } catch (e: any) { message.error(e.message); }
    finally { setDrillLoading(false); }
  }, [drillSort]);

  const openDrillDown = useCallback((title: string, params: Record<string, string>) => {
    setDrillDown({ title, params });
    setDrillPage(1);
    setDrillSort('qty_desc');
    setDrillView('size');
    loadDrill(params, 1, 'qty_desc');
    setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [loadDrill]);

  const openRestockSuggestions = useCallback(async () => {
    if (restockOpen) { setRestockOpen(false); return; }
    setRestockOpen(true);
    setRestockLoading(true);
    try {
      const result = await restockApi.getRestockSuggestions();
      setRestockData(result.suggestions);
    } catch (e: any) { message.error(e.message); }
    finally { setRestockLoading(false); }
    setTimeout(() => restockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [restockOpen]);

  useEffect(() => {
    if (drillDown) loadDrill(drillDown.params, drillPage);
  }, [drillPage, drillSort]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const onSearchChange = (value: string) => {
    setSearchText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setSearchSuggestions([]); setSearchResult(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await inventoryApi.searchSuggest(value);
        setSearchSuggestions(Array.isArray(data) ? data : []);
      } catch { setSearchSuggestions([]); }
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
      } else { setSearchResult(data); }
    } catch (e: any) {
      message.error('검색 실패: ' + (e.message || '알 수 없는 오류'));
      setSearchResult(null);
    } finally { setSearchLoading(false); }
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

    productApi.variantOptions().then((d: any) => {
      setSrchColorOpts((d.colors || []).map((c: string) => ({ label: c, value: c })));
      setSrchSizeOpts((d.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});

    if (effectiveStore) {
      setReorderLoading(true);
      inventoryApi.reorderAlerts(1, 3)
        .then(setReorderData)
        .catch(() => {})
        .finally(() => setReorderLoading(false));
      loadMyPendingRequests();
    }
  }, [effectiveStore, loadMyPendingRequests]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleStockRequest = async (item: any) => {
    const key = `${item.variant_id}`;
    if (requestingIds.has(key) || sentIds.has(key)) return;
    const allTargets = (item.other_locations || []).filter((loc: any) => loc.qty >= 1);
    if (allTargets.length === 0) { message.warning('다른 매장에 재고가 없습니다.'); return; }
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
    finally { setRequestingIds((prev) => { const s = new Set(prev); s.delete(key); return s; }); }
  };

  const overall = stats?.overall || {};
  const byCategory = (stats?.byCategory || []) as Array<{ category: string; product_count: number; variant_count: number; total_qty: number }>;
  const bySeason = (stats?.bySeason || []) as Array<{ season: string; product_count: number; variant_count: number; total_qty: number; partner_count: number }>;
  const byFit = (stats?.byFit || []) as Array<{ fit: string; product_count: number; variant_count: number; total_qty: number }>;
  const byLength = (stats?.byLength || []) as Array<{ length: string; product_count: number; variant_count: number; total_qty: number }>;
  const searchResultRef = useRef<HTMLDivElement>(null);

  const analyzeProduct = (productCode: string) => {
    onSearchSelect(productCode);
    setTimeout(() => searchResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  };

  const storeColumns = [
    { title: '상품', dataIndex: 'product_name', key: 'product_name',
      render: (v: string, r: any) => <a onClick={() => analyzeProduct(r.product_code)}>{v}</a>,
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
    { title: '', key: 'request', width: 80,
      render: (_: any, record: any) => {
        const k = `${record.variant_id}`;
        const loading = requestingIds.has(k);
        const alreadySent = sentIds.has(k);
        const hasTargets = (record.other_locations || []).length > 0;
        if (alreadySent) return <Button size="small" disabled style={{ fontSize: 12, color: '#52c41a', borderColor: '#b7eb8f' }}>요청완료</Button>;
        return hasTargets ? (
          <Button type="primary" size="small" icon={<SendOutlined />}
            loading={loading} disabled={loading}
            onClick={() => handleStockRequest(record)} style={{ fontSize: 12 }}>요청</Button>
        ) : null;
      },
    },
  ];

  const drillColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 110 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => analyzeProduct(r.product_code)}>{v}</a>,
    },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => renderQty(Number(v)) },
  ];

  // 드릴다운 뷰모드별 데이터
  const drillDisplayData = useMemo(() => {
    if (drillView === 'size') return drillData.map((r: any) => ({ ...r, _rowKey: `${r.inventory_id}` }));
    if (drillView === 'product') {
      const map: Record<string, any> = {};
      drillData.forEach((r: any) => {
        const key = `${r.partner_code}__${r.product_code}`;
        if (!map[key]) {
          map[key] = { ...r, total_qty: 0, variant_count: 0, _variants: [], _rowKey: key };
        }
        map[key].total_qty += Number(r.qty || 0);
        map[key].variant_count += 1;
        map[key]._variants.push(r);
      });
      return Object.values(map);
    }
    // color
    const map: Record<string, any> = {};
    drillData.forEach((r: any) => {
      const key = `${r.partner_code}__${r.product_code}__${r.color || '-'}`;
      if (!map[key]) {
        map[key] = { ...r, _color: r.color || '-', color_qty: 0, variant_count: 0, _variants: [], _rowKey: key };
      }
      map[key].color_qty += Number(r.qty || 0);
      map[key].variant_count += 1;
      map[key]._variants.push(r);
    });
    return Object.values(map);
  }, [drillData, drillView]);

  const drillProductColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 110 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => analyzeProduct(r.product_code)}>{v}</a> },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '옵션수', dataIndex: 'variant_count', key: 'vc', width: 70, align: 'center' as const,
      render: (v: number) => <Tag>{v}</Tag> },
    { title: '총 재고', dataIndex: 'total_qty', key: 'total_qty', width: 100, align: 'right' as const,
      sorter: (a: any, b: any) => a.total_qty - b.total_qty, defaultSortOrder: 'descend' as const,
      render: (v: number) => renderQty(v) },
  ];

  const drillColorColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 110 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => analyzeProduct(r.product_code)}>{v}</a> },
    { title: '색상', dataIndex: '_color', key: '_color', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '옵션수', dataIndex: 'variant_count', key: 'vc', width: 70, align: 'center' as const,
      render: (v: number) => <Tag>{v}</Tag> },
    { title: '재고', dataIndex: 'color_qty', key: 'color_qty', width: 100, align: 'right' as const,
      sorter: (a: any, b: any) => a.color_qty - b.color_qty, defaultSortOrder: 'descend' as const,
      render: (v: number) => renderQty(v) },
  ];

  const drillExpandedRow = (record: any) => {
    const variants = record._variants || [];
    if (!variants.length) return null;
    return <Table columns={[
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: '색상', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, render: (v: number) => renderQty(Number(v)) },
    ]} dataSource={variants} rowKey="inventory_id" pagination={false} size="small" />;
  };

  const drillRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* 통계 카드 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title={effectiveStore ? '내 매장 총 재고' : '총 재고수량'} value={Number(overall.total_qty || 0)}
            icon={<InboxOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
            sub={`${Number(overall.total_items || 0)}개 품목`}
            onClick={() => openDrillDown('전체 재고', {})} />
        </Col>
        {!effectiveStore && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard title="거래처 수" value={Number(overall.total_partners || 0)}
              icon={<ShopOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
              sub="재고 보유 거래처"
              onClick={() => openDrillDown('전체 재고', {})} />
          </Col>
        )}
        {effectiveStore && (
          <>
            <Col xs={24} sm={8} lg={6}>
              <StatCard title="리오더 긴급"
                value={reorderLoading ? '...' : reorderData.urgent.length}
                icon={<ThunderboltOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
                onClick={() => openDrillDown('재고 부족 (위험)', { stock_level: 'low' })} />
            </Col>
            <Col xs={24} sm={8} lg={6}>
              <StatCard title="리오더 추천"
                value={reorderLoading ? '...' : reorderData.recommend.length}
                icon={<AlertOutlined />}
                bg="linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" color="#7c4a1e"
                onClick={() => openDrillDown('재고 주의', { stock_level: 'medium' })} />
            </Col>
          </>
        )}
        {!effectiveStore && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard title="재입고 제안" value={restockOpen ? restockData.length : '조회'}
              icon={<ReloadOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
              sub="보충 필요 품목 확인"
              onClick={openRestockSuggestions} />
          </Col>
        )}
        <Col xs={24} sm={8} lg={6}>
          <StatCard title="품절" value={Number(overall.zero_stock_count || 0)}
            icon={<StopOutlined />} bg="linear-gradient(135deg, #fa709a 0%, #fee140 100%)" color="#fff" sub="재고 0개"
            onClick={() => openDrillDown('품절 (재고 0)', { stock_level: 'zero' })} />
        </Col>
      </Row>

      {/* 재고찾기 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16, marginBottom: searchResult ? 16 : 0, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete value={searchText} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map(s => ({
              value: s.product_code,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.product_name}</span>
                  <span style={{ color: '#888', fontSize: 12 }}>{s.product_code} · {s.category || '-'}</span>
                </div>
              ),
            }))}>
            <Input placeholder="상품명, SKU, 상품코드" prefix={<SearchOutlined />}
              onPressEnter={() => searchText.trim() && onSearchSelect(searchText.trim())} />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={srchCategoryFilter} onChange={(v) => { setSrchCategoryFilter(v); if (v) { openDrillDown(`카테고리: ${v}`, { category: v, ...(srchSeasonFilter ? { season: srchSeasonFilter } : {}) }); } }} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...byCategory.map(c => ({ label: c.category, value: c.category }))]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={srchSeasonFilter} onChange={(v) => { setSrchSeasonFilter(v); if (v) { openDrillDown(`시즌: ${v}`, { season: v, ...(srchCategoryFilter ? { category: srchCategoryFilter } : {}) }); } }} style={{ width: 120 }}
            options={[
              { label: '전체 보기', value: '' },
              ...bySeason.filter(s => s.season).map(s => ({ label: s.season, value: s.season })),
            ]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select showSearch optionFilterProp="label" value={srchColorFilter} onChange={setSrchColorFilter} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...srchColorOpts]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select showSearch optionFilterProp="label" value={srchSizeFilter} onChange={setSrchSizeFilter} style={{ width: 110 }}
            options={[{ label: '전체 보기', value: '' }, ...srchSizeOpts]} /></div>
        <Button onClick={() => {
          if (searchText.trim()) { onSearchSelect(searchText.trim()); return; }
          const params: Record<string, string> = {};
          if (srchCategoryFilter) params.category = srchCategoryFilter;
          if (srchSeasonFilter) params.season = srchSeasonFilter;
          if (srchColorFilter) params.color = srchColorFilter;
          if (srchSizeFilter) params.size = srchSizeFilter;
          if (Object.keys(params).length > 0) {
            const parts = [];
            if (params.category) parts.push(params.category);
            if (params.season) parts.push(params.season);
            if (params.color) parts.push(params.color);
            if (params.size) parts.push(params.size);
            openDrillDown(`필터: ${parts.join(' · ')}`, params);
          }
        }} loading={searchLoading}>조회</Button>
      </div>
        {searchLoading && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
        {!searchLoading && searchResult && !searchResult.product && (
          <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>검색 결과가 없습니다</div>
        )}
        {!searchLoading && searchResult?.product && (
          <div ref={searchResultRef}>
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fb', borderRadius: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{searchResult.product.product_name}</span>
              <span style={{ marginLeft: 12, color: '#6366f1', fontSize: 13, fontWeight: 600 }}>{searchResult.product.product_code}</span>
              {searchResult.product.category && <Tag color="blue" style={{ marginLeft: 8 }}>{searchResult.product.category}</Tag>}
              {searchResult.product.fit && <Tag style={{ marginLeft: 4 }}>{searchResult.product.fit}</Tag>}
              {searchResult.product.season && <Tag style={{ marginLeft: 4 }}>{searchResult.product.season}</Tag>}
              <span style={{ marginLeft: 12, color: '#888', fontSize: 12 }}>{searchResult.variants?.length || 0}개 옵션</span>
            </div>
            <Table dataSource={(searchResult.variants || []).filter((v: any) =>
                (!srchColorFilter || v.color === srchColorFilter) &&
                (!srchSizeFilter || v.size === srchSizeFilter)
              )} rowKey="variant_id"
              pagination={{ pageSize: 20, size: 'small', showTotal: (t: number) => `총 ${t}건` }} size="small"
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
                              <span style={{ color: loc.partner_type === '본사' ? '#6366f1' : '#333', fontWeight: loc.partner_type === '본사' ? 600 : 400 }}>{loc.partner_name}</span>
                              {' '}<Tag color={loc.qty >= 10 ? 'green' : loc.qty >= 5 ? 'blue' : 'orange'} style={{ fontSize: 11, margin: 0 }}>{loc.qty}개</Tag>
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

      {/* 카테고리/시즌 (본사) */}
      {!effectiveStore && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title={<span><TagsOutlined style={{ marginRight: 8 }} />카테고리별 물량</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar data={byCategory.map(c => ({ label: c.category, value: Number(c.total_qty), sub: `${c.product_count}상품 / ${c.variant_count}옵션` }))} colorKey={CAT_COLORS}
                onBarClick={(label) => openDrillDown(`카테고리: ${label}`, { category: label })} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={<span><BarChartOutlined style={{ marginRight: 8 }} />시즌(생산연도)별 물량</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar data={bySeason.map(s => ({ label: s.season || '미지정', value: Number(s.total_qty), sub: `${s.product_count}상품 / ${Number(s.partner_count)}거래처` }))}
                onBarClick={(label) => openDrillDown(`시즌: ${label}`, { season: label === '미지정' ? '' : label })} />
            </Card>
          </Col>
        </Row>
      )}
      {!effectiveStore && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title={<span><SkinOutlined style={{ marginRight: 8 }} />핏별 재고현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar data={byFit.map(f => ({ label: f.fit, value: Number(f.total_qty), sub: `${f.product_count}상품 / ${f.variant_count}옵션` }))}
                onBarClick={(label) => openDrillDown(`핏: ${label}`, { fit: label === '미지정' ? '' : label })} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={<span><ColumnHeightOutlined style={{ marginRight: 8 }} />기장별 재고현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar data={byLength.map(l => ({ label: l.length, value: Number(l.total_qty), sub: `${l.product_count}상품 / ${l.variant_count}옵션` }))}
                onBarClick={(label) => openDrillDown(`기장: ${label}`, { length: label === '미지정' ? '' : label })} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 매장: 리오더 긴급/추천 */}
      {effectiveStore && (
        <Card title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined style={{ color: '#f5222d' }} /> 리오더 긴급 ({reorderData.urgent.length}건)
          <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>재고 1개 이하</span>
        </span>} size="small" style={{ borderRadius: 10, marginTop: 16 }} loading={reorderLoading}>
          {reorderData.urgent.length > 0 ? (
            <Table dataSource={reorderData.urgent} rowKey="variant_id" size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              pagination={{ pageSize: 50, size: 'small', showTotal: (t) => `총 ${t}건` }}
              columns={storeColumns} />
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
              <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} /> 긴급 리오더 항목이 없습니다
            </div>
          )}
        </Card>
      )}
      {effectiveStore && (
        <Card title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertOutlined style={{ color: '#fa8c16' }} /> 리오더 추천 ({reorderData.recommend.length}건)
          <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>재고 3개 이하</span>
        </span>} size="small" style={{ borderRadius: 10, marginTop: 16 }} loading={reorderLoading}>
          {reorderData.recommend.length > 0 ? (
            <Table dataSource={reorderData.recommend} rowKey="variant_id" size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              pagination={{ pageSize: 50, size: 'small', showTotal: (t) => `총 ${t}건` }}
              columns={storeColumns} />
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#10b981' }}>
              <InboxOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} /> 리오더 추천 항목이 없습니다
            </div>
          )}
        </Card>
      )}

      {/* 재입고 제안 */}
      {restockOpen && (
        <div ref={restockRef} style={{ marginTop: 16 }}>
          <Card
            size="small"
            style={{ borderRadius: 10, border: '2px solid #d946ef' }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ReloadOutlined style={{ color: '#d946ef' }} />
                <span style={{ fontSize: 16, fontWeight: 700 }}>재입고 제안</span>
                <Tag color="purple">{(restockGradeFilter ? restockData.filter(r => r.grade === restockGradeFilter) : restockData).length}건</Tag>
              </div>
            }
            extra={
              <Space size="middle" wrap>
                <Segmented size="small" value={restockGradeFilter}
                  onChange={(v) => setRestockGradeFilter(v as string)}
                  options={[
                    { label: '전체', value: '' },
                    { label: 'S', value: 'S' },
                    { label: 'A', value: 'A' },
                    { label: 'B', value: 'B' },
                    { label: 'C', value: 'C' },
                  ]} />
                <Button size="small" onClick={() => navigate('/inventory/restock')}>재입고 관리</Button>
                <Button size="small" onClick={() => setRestockOpen(false)}>닫기</Button>
              </Space>
            }
          >
            <Table
              columns={[
                { title: '등급', dataIndex: 'grade', key: 'grade', width: 60, align: 'center' as const,
                  render: (v: string) => {
                    const colors: Record<string, string> = { S: 'red', A: 'orange', B: 'blue', C: 'default' };
                    return <Tag color={colors[v] || 'default'} style={{ fontWeight: 700 }}>{v}</Tag>;
                  },
                },
                { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 130, ellipsis: true,
                  render: (v: string) => <a onClick={() => analyzeProduct(v)}>{v}</a>,
                },
                { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, ellipsis: true },
                { title: '색상', dataIndex: 'color', key: 'color', width: 65 },
                { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => <Tag>{v}</Tag> },
                { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 75, align: 'right' as const,
                  render: (v: number) => {
                    const n = Number(v);
                    return <strong style={{ color: n === 0 ? '#ff4d4f' : n <= 5 ? '#faad14' : '#333' }}>{n}</strong>;
                  },
                },
                { title: '완판예상', dataIndex: 'sellout_date', key: 'sellout', width: 90, align: 'center' as const,
                  render: (v: string) => v ? <span style={{ fontSize: 12, fontWeight: 600 }}>{v.slice(5)}</span> : '-',
                },
                { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage', width: 75, align: 'right' as const,
                  render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 700 }}>{Number(v)}</span>,
                },
                { title: '제안수량', dataIndex: 'suggested_qty', key: 'suggest', width: 80, align: 'right' as const,
                  render: (v: number) => <Tag color="purple" style={{ fontWeight: 700 }}>{Number(v)}</Tag>,
                },
                { title: '잔여일', dataIndex: 'days_of_stock', key: 'days', width: 70, align: 'right' as const,
                  render: (v: number) => {
                    const d = Number(v);
                    const color = d <= 3 ? '#ff4d4f' : d <= 7 ? '#fa8c16' : d <= 14 ? '#faad14' : '#333';
                    return <span style={{ fontWeight: 700, color }}>{d}일</span>;
                  },
                },
                { title: '긴급도', dataIndex: 'urgency', key: 'urgency', width: 80, align: 'center' as const,
                  render: (v: string) => {
                    const m: Record<string, { color: string; label: string }> = {
                      CRITICAL: { color: 'red', label: '긴급' },
                      WARNING: { color: 'orange', label: '주의' },
                      NORMAL: { color: 'green', label: '정상' },
                    };
                    const info = m[v] || { color: 'default', label: v };
                    return <Tag color={info.color}>{info.label}</Tag>;
                  },
                },
              ]}
              dataSource={restockGradeFilter ? restockData.filter(r => r.grade === restockGradeFilter) : restockData}
              rowKey="variant_id"
              loading={restockLoading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 400px)' }}
              pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
            />
          </Card>
        </div>
      )}

      {/* 드릴다운 결과 */}
      {drillDown && (
        <div ref={drillRef} style={{ marginTop: 16 }}>
          <Card
            size="small"
            style={{ borderRadius: 10, border: '2px solid #6366f1' }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{drillDown.title}</span>
                <Tag color="blue">{drillTotal}건</Tag>
                <Tag>{drillSumQty.toLocaleString()}개</Tag>
              </div>
            }
            extra={
              <Space size="middle" wrap>
                <Segmented
                  size="small"
                  value={drillView}
                  onChange={(v) => setDrillView(v as 'size' | 'product' | 'color')}
                  options={[
                    { label: '사이즈별', value: 'size' },
                    { label: '품번별', value: 'product' },
                    { label: '컬러별', value: 'color' },
                  ]}
                />
                <Select
                  size="small"
                  value={drillSort}
                  onChange={(v) => { setDrillSort(v); setDrillPage(1); }}
                  style={{ width: 140 }}
                  options={SORT_OPTIONS}
                />
                <Button size="small" onClick={() => { setDrillDown(null); setDrillData([]); }}>닫기</Button>
              </Space>
            }
          >
            <Table
              columns={drillView === 'product' ? drillProductColumns : drillView === 'color' ? drillColorColumns : drillColumns}
              dataSource={drillDisplayData}
              rowKey="_rowKey"
              loading={drillLoading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 400px)' }}
              pagination={{
                current: drillPage,
                total: drillView === 'size' ? drillTotal : undefined,
                pageSize: drillView === 'size' ? 50 : 100,
                onChange: (p) => setDrillPage(p),
                showTotal: (t) => `총 ${t}건`,
              }}
              expandable={drillView !== 'size' ? {
                expandedRowRender: drillExpandedRow,
                rowExpandable: (r: any) => r._variants && r._variants.length > 0,
              } : undefined}
            />
          </Card>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════
   Tab 2: 재고조정 (기존 InventoryAdjustPage)
   ══════════════════════════════════════════ */
function AdjustTab() {
  const [selectedPartner, setSelectedPartner] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');

  // 재고 데이터
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [form] = Form.useForm();

  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [txCache, setTxCache] = useState<Record<string, any[]>>({});
  const [txLoadingKeys, setTxLoadingKeys] = useState<string[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);

  // 거래처 로드
  useEffect(() => {
    partnerApi.list({ limit: '1000' }).then(r => setPartners(r.data)).catch(() => {});
    productApi.variantOptions().then((d: any) => {
      setColorOptions((d.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((d.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    inventoryApi.summaryBySeason().then((d: any) => {
      const seasons = (Array.isArray(d) ? d : d?.data || []).filter((s: any) => s.season);
      setSeasonOptions(seasons.map((s: any) => ({ label: s.season, value: s.season })));
    }).catch(() => {});
  }, []);

  // 재고 로드 (거래처 선택 후)
  const load = async (p?: number) => {
    if (!selectedPartner) return;
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50', partner_code: selectedPartner.partner_code };
      if (searchText.trim()) params.search = searchText.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (seasonFilter) params.season = seasonFilter;
      if (colorFilter) params.color = colorFilter;
      if (sizeFilter) params.size = sizeFilter;
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (selectedPartner) load(); }, [page, selectedPartner, categoryFilter, seasonFilter, colorFilter, sizeFilter]);

  // 검색 AutoComplete
  const onSearchChange = (value: string) => {
    setSearchText(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) { setSearchSuggestions([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/inventory/search-suggest?q=${encodeURIComponent(value.trim())}`);
        const d = await res.json();
        if (d.success) setSearchSuggestions(d.data || []);
      } catch { /* ignore */ }
    }, 300);
  };
  const onSearchSelect = (value: string) => {
    setSearchText(value);
    setPage(1);
    setTimeout(() => load(1), 0);
  };

  const loadItemTx = async (record: any) => {
    const key = `${record.partner_code}_${record.variant_id}`;
    if (txCache[key]) return;
    setTxLoadingKeys(prev => [...prev, key]);
    try {
      const result = await inventoryApi.transactions({
        partner_code: record.partner_code,
        variant_id: String(record.variant_id),
        limit: '5',
      });
      setTxCache(prev => ({ ...prev, [key]: result.data }));
    } catch (e: any) { message.error(e.message); }
    finally { setTxLoadingKeys(prev => prev.filter(k => k !== key)); }
  };

  const openAdjust = (record: any) => {
    setAdjustTarget(record);
    form.resetFields();
    setModalOpen(true);
  };

  const handleAdjust = async (values: any) => {
    if (values.qty_change === 0) { message.warning('조정 수량은 0이 아니어야 합니다.'); return; }
    try {
      const result = await inventoryApi.adjust({
        partner_code: adjustTarget.partner_code,
        variant_id: adjustTarget.variant_id,
        qty_change: values.qty_change,
        memo: values.memo,
      });
      if (result.warning) { message.warning(result.warning); }
      else { message.success(`재고가 조정되었습니다. (변경: ${values.qty_change > 0 ? '+' : ''}${values.qty_change} → 현재: ${result.qty}개)`); }
      setModalOpen(false);
      const key = `${adjustTarget.partner_code}_${adjustTarget.variant_id}`;
      setTxCache(prev => { const next = { ...prev }; delete next[key]; return next; });
      if (expandedKeys.includes(adjustTarget.inventory_id)) loadItemTx(adjustTarget);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleBackToPartners = () => {
    setSelectedPartner(null);
    setData([]);
    setTotal(0);
    setPage(1);
    setSearchText('');
    setSearchSuggestions([]);
    setCategoryFilter('');
    setSeasonFilter('');
    setColorFilter('');
    setSizeFilter('');
    setExpandedKeys([]);
    setTxCache({});
  };

  const expandedRowRender = (record: any) => {
    const key = `${record.partner_code}_${record.variant_id}`;
    const items = txCache[key];
    const isLoading = txLoadingKeys.includes(key);
    if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '12px auto' }} />;
    if (!items || items.length === 0) {
      return (
        <div style={{ padding: '12px 16px', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>조정 이력이 없습니다.</span>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdjust(record)}>재고 조정</Button>
        </div>
      );
    }
    return (
      <div style={{ padding: '8px 0 8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}><HistoryOutlined /> 최근 조정이력</span>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdjust(record)}>재고 조정</Button>
        </div>
        <Table columns={[
          { title: '일시', dataIndex: 'created_at', key: 'time', width: 140, render: (v: string) => <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString('ko-KR')}</span> },
          { title: '유형', dataIndex: 'tx_type', key: 'type', width: 80, render: (v: string) => <Tag color={TX_TYPE_COLORS[v]}>{TX_TYPE_LABELS[v] || v}</Tag> },
          { title: '변동', dataIndex: 'qty_change', key: 'change', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>{v > 0 ? '+' : ''}{v}</span> },
          { title: '조정후', dataIndex: 'qty_after', key: 'after', width: 70, align: 'right' as const, render: (v: number) => <strong>{v}</strong> },
          { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true, render: (v: string) => <span style={{ fontSize: 12, color: '#666' }}>{v || '-'}</span> },
          { title: '작업자', dataIndex: 'created_by', key: 'user', width: 90, render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
        ]} dataSource={items} rowKey="tx_id" size="small" pagination={false} showHeader={true} />
      </div>
    );
  };

  // ── Step 1: 거래처 선택 ──
  if (!selectedPartner) {
    const filtered = partners.filter(p => {
      if (!partnerSearch.trim()) return true;
      const q = partnerSearch.trim().toLowerCase();
      return p.partner_name?.toLowerCase().includes(q) || p.partner_code?.toLowerCase().includes(q);
    });
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Input placeholder="거래처명 또는 코드 검색" prefix={<SearchOutlined />}
            value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)}
            style={{ width: 300 }} allowClear />
          <span style={{ marginLeft: 12, color: '#888', fontSize: 13 }}>{filtered.length}개 거래처</span>
        </div>
        <Row gutter={[12, 12]}>
          {filtered.map((p: any) => (
            <Col xs={12} sm={8} md={6} lg={4} key={p.partner_code}>
              <div
                onClick={() => setSelectedPartner(p)}
                style={{
                  border: '1px solid #e8e8e8', borderRadius: 10, padding: '16px 14px',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: '#fff',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(22,119,255,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.partner_name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{p.partner_code}</div>
              </div>
            </Col>
          ))}
        </Row>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>거래처가 없습니다.</div>
        )}
      </div>
    );
  }

  // ── Step 2: 재고 조정 화면 ──
  const invColumns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => v || '-' },
    { title: '현재수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      render: (v: number) => { const qty = Number(v); const color = qty === 0 ? '#ff4d4f' : qty <= 5 ? '#faad14' : '#333'; return <strong style={{ color, fontSize: 14 }}>{qty.toLocaleString()}</strong>; },
      sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty) },
    { title: '조정', key: 'action', width: 70, align: 'center' as const,
      render: (_: any, record: any) => <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openAdjust(record); }}>조정</Button> },
  ];

  return (
    <>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBackToPartners}>거래처 선택</Button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{selectedPartner.partner_name}</span>
        <Tag color="blue">{selectedPartner.partner_code}</Tag>
      </div>

      {/* 검색 + 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete
            value={searchText} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map((s: any) => ({
              value: s.product_code || s.sku || s.product_name,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.product_name}</span>
                  <span style={{ color: '#888', fontSize: 12 }}>{s.product_code} · {s.category || '-'}</span>
                </div>
              ),
            }))}
          >
            <Input placeholder="상품명, SKU, 상품코드" prefix={<SearchOutlined />}
              onPressEnter={() => { setPage(1); load(1); }} />
          </AutoComplete>
        </div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select style={{ width: 120 }} value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPage(1); }}
            options={[{ label: '전체', value: '' }, { label: 'TOP', value: 'TOP' }, { label: 'BOTTOM', value: 'BOTTOM' }, { label: 'OUTER', value: 'OUTER' }, { label: 'DRESS', value: 'DRESS' }, { label: 'ACC', value: 'ACC' }]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={seasonFilter} onChange={(v) => { setSeasonFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...seasonOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select showSearch optionFilterProp="label" value={colorFilter}
            onChange={(v) => { setColorFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...colorOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select showSearch optionFilterProp="label" value={sizeFilter}
            onChange={(v) => { setSizeFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체', value: '' }, ...sizeOptions]} /></div>
        <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
      </div>

      <Table columns={invColumns} dataSource={data} rowKey="inventory_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => setPage(p), showTotal: (t) => `총 ${t}건`, size: 'small' }}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpand: (expanded, record) => {
            if (expanded) { setExpandedKeys(prev => [...prev, record.inventory_id]); loadItemTx(record); }
            else { setExpandedKeys(prev => prev.filter(k => k !== record.inventory_id)); }
          },
          expandedRowRender,
        }} />

      {/* 조정 모달 */}
      <Modal title="재고 조정" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="조정" cancelText="취소">
        {adjustTarget && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ marginBottom: 4 }}><strong>거래처:</strong> {adjustTarget.partner_name}</div>
            <div style={{ marginBottom: 4 }}><strong>상품:</strong> {adjustTarget.product_name} ({adjustTarget.sku})</div>
            <div style={{ marginBottom: 4 }}><strong>색상/사이즈:</strong> {adjustTarget.color || '-'} / {adjustTarget.size || '-'}</div>
            <div><strong>현재수량:</strong> <span style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>{Number(adjustTarget.qty).toLocaleString()}</span></div>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleAdjust}>
          <Form.Item name="qty_change" label="조정 수량 (+ 증가 / - 감소)"
            rules={[
              { required: true, message: '수량을 입력해주세요' },
              { type: 'number', validator: (_, v) => v === 0 ? Promise.reject('0은 입력할 수 없습니다') : Promise.resolve() },
            ]}>
            <InputNumber style={{ width: '100%' }} placeholder="예: +10 또는 -5" />
          </Form.Item>
          <Form.Item name="memo" label="조정 사유">
            <Input.TextArea rows={2} placeholder="예: 재고실사 차이 보정, 파손 폐기 등" />
          </Form.Item>
        </Form>
      </Modal>

    </>
  );
}

/* ══════════════════════════════════════════
   메인 컴포넌트: URL 경로 기반 렌더링
   ══════════════════════════════════════════ */
const TITLE_MAP: Record<string, string> = {
  '/inventory/status': '재고현황',
  '/inventory/adjust': '재고조정',
  '/inventory/restock': '재입고',
};

export default function InventoryStatusPage() {
  const location = useLocation();
  const page = location.pathname;
  const title = TITLE_MAP[page] || '재고현황';

  return (
    <div>
      <PageHeader title={title} />
      {page === '/inventory/adjust' ? <AdjustTab />
        : page === '/inventory/restock' ? <RestockManagePage />
        : <DashboardTab />}
    </div>
  );
}
