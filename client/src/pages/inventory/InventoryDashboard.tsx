import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Card, Col, Row, Table, Tag, Input, Button, AutoComplete,
  Select, Space, Segmented, message, Modal, Spin, InputNumber,
} from 'antd';
import {
  InboxOutlined, ShopOutlined, TagsOutlined, SearchOutlined,
  StopOutlined, BarChartOutlined, CalendarOutlined,
  ReloadOutlined, SendOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

import HBar from '../../components/HBar';
import { CAT_COLORS, CAT_TAG_COLORS, renderQty, StatCard } from './InventoryStatusPage';

export function InventoryDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isStoreManager = user?.role === ROLES.STORE_MANAGER;
  // STORE_MANAGER는 타매장 재고도 조회 가능 — STORE_STAFF만 제한
  const effectiveStore = user?.role === ROLES.STORE_STAFF;

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // 검색/필터
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [page, setPage] = useState(1);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string[]>(
    isStore && user?.partnerCode ? [user.partnerCode] : [],
  );
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [invData, setInvData] = useState<any[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invLoading, setInvLoading] = useState(false);
  const [sortField, setSortField] = useState<string>('');
  const [sortDir, setSortDir] = useState<string>('');




  // 드릴다운 상태
  const [drillDown, setDrillDown] = useState<{ title: string; params: Record<string, string> } | null>(null);
  const [drillData, setDrillData] = useState<any[]>([]);
  const [drillTotal, setDrillTotal] = useState(0);
  const [drillSumQty, setDrillSumQty] = useState(0);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillPage, setDrillPage] = useState(1);
  const [drillSort, setDrillSort] = useState<string>('qty_desc');
  const [drillView, setDrillView] = useState<'size' | 'product' | 'color'>('size');

  // 매장별 재고 모달
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockModalProduct, setStockModalProduct] = useState<{ product_code: string; product_name: string } | null>(null);
  const [stockModalData, setStockModalData] = useState<any[]>([]);
  const [stockModalLoading, setStockModalLoading] = useState(false);

  const openStockModal = async (productCode: string, productName: string) => {
    setStockModalProduct({ product_code: productCode, product_name: productName });
    setStockModalOpen(true);
    setStockModalLoading(true);
    try {
      const data = await inventoryApi.byProduct(productCode);
      setStockModalData(data);
    } catch (e: any) { message.error(e.message); }
    finally { setStockModalLoading(false); }
  };

  // ── 통합 재고요청 모달 (매장매니저 전용) ──
  const [actionTarget, setActionTarget] = useState<any>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestMode, setRequestMode] = useState<'transfer' | 'hq'>('transfer');
  const [requestQty, setRequestQty] = useState(1);
  const [requestMemo, setRequestMemo] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [variantStocks, setVariantStocks] = useState<any[]>([]);
  const [variantStocksLoading, setVariantStocksLoading] = useState(false);

  // 본사 거래처 코드 집합
  const hqPartnerSet = useMemo(() => {
    const m = new Set<string>();
    partners.forEach((p: any) => {
      if (p.partner_type === '본사' || (p.partner_name && p.partner_name.includes('본사'))) m.add(p.partner_code);
    });
    return m;
  }, [partners]);
  // 출고요청용 본사 코드
  const hqCode = useMemo(() => {
    const hq = partners.find((p: any) => p.partner_type === '본사');
    return hq?.partner_code || '1';
  }, [partners]);

  const openRequestModal = async (record: any) => {
    setActionTarget(record);
    setRequestMode('transfer');
    setRequestQty(1);
    setRequestMemo('');
    setVariantStocks([]);
    setRequestModalOpen(true);
    setVariantStocksLoading(true);
    try {
      const data = await inventoryApi.byProduct(record.product_code);
      const filtered = data.filter((d: any) => d.variant_id === record.variant_id && Number(d.qty) !== 0);
      const enriched = filtered.map((d: any) => ({
        ...d,
        _isHq: d.partner_type === '본사' || hqPartnerSet.has(d.partner_code) || (d.partner_name && d.partner_name.includes('본사')),
      }));
      enriched.sort((a: any, b: any) => {
        if (a._isHq && !b._isHq) return -1;
        if (!a._isHq && b._isHq) return 1;
        return Number(b.qty) - Number(a.qty);
      });
      setVariantStocks(enriched);
    } catch (e: any) { message.error(e.message); }
    finally { setVariantStocksLoading(false); }
  };

  const handleSubmitRequest = async () => {
    if (requestQty <= 0) { message.error('수량을 입력해주세요'); return; }
    setRequestLoading(true);
    try {
      if (requestMode === 'transfer') {
        const targets = variantStocks
          .filter((s: any) => s.partner_code !== user?.partnerCode && !s._isHq && Number(s.qty) > 0)
          .map((s: any) => ({ partner_code: s.partner_code, qty: requestQty }));
        if (targets.length === 0) {
          message.warning('재고를 보유한 다른 매장이 없습니다');
          setRequestLoading(false);
          return;
        }
        const myStock = variantStocks.find((s: any) => s.partner_code === user?.partnerCode);
        const res = await apiFetch('/api/notifications/stock-request', {
          method: 'POST',
          body: JSON.stringify({
            variant_id: actionTarget.variant_id,
            from_qty: myStock ? Number(myStock.qty) : Number(actionTarget.qty || 0),
            targets,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const nos = data.data?.requestNos as string[] | undefined;
          Modal.success({
            title: '수평이동 의뢰 완료',
            content: nos?.[0]
              ? `의뢰번호: ${nos[0]}\n${targets.length}개 매장에 수평이동 요청을 보냈습니다.`
              : `${targets.length}개 매장에 수평이동 요청을 보냈습니다.`,
          });
        } else {
          message.error(data.error || '요청 실패');
          setRequestLoading(false);
          return;
        }
      } else {
        const result: any = await shipmentApi.create({
          request_type: '출고요청',
          from_partner: hqCode,
          items: [{ variant_id: actionTarget.variant_id, request_qty: requestQty }],
          memo: requestMemo.trim() || undefined,
        } as any);
        Modal.success({
          title: '본사 재고요청 완료',
          content: `의뢰번호: ${result?.request_no || '-'}\n수량: ${requestQty}개`,
        });
      }
      setRequestModalOpen(false);
    } catch (e: any) { message.error(e.message); }
    finally { setRequestLoading(false); }
  };

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

  useEffect(() => {
    if (drillDown) loadDrill(drillDown.params, drillPage);
  }, [drillPage, drillSort]);

  // 옵션 로드 (상품관리와 동일)
  useEffect(() => {
    partnerApi.list({ limit: '1000' }).then((result: any) => setPartners(result.data)).catch(() => {});
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('YEAR').then((data: any[]) => {
      setYearOptions(data.filter((c: any) => c.is_active).sort((a: any, b: any) => b.code_value.localeCompare(a.code_value)).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('SEASON').then((data: any[]) => {
      setSeasonOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
  }, []);

  // 재고 목록 로드 (race condition 방지 — loadVer로 stale response 무시)
  const loadVer = useRef(0);
  const load = async () => {
    const ver = ++loadVer.current;
    setInvLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter.length) params.partner_code = partnerFilter.join(',');
      if (categoryFilter.length) params.category = categoryFilter.join(',');
      if (yearFromFilter) params.year_from = yearFromFilter;
      if (yearToFilter) params.year_to = yearToFilter;
      if (seasonFilter.length) params.season = seasonFilter.join(',');
      if (statusFilter.length) params.sale_status = statusFilter.join(',');
      if (colorFilter.length) params.color = colorFilter.join(',');
      if (sizeFilter.length) params.size = sizeFilter.join(',');
      if (sortField) params.sort_field = sortField;
      if (sortDir) params.sort_dir = sortDir;
      const result = await inventoryApi.list(params);
      if (ver !== loadVer.current) return; // stale response 무시
      setInvData(result.data);
      setInvTotal(result.total);
    } catch (e: any) { if (ver === loadVer.current) message.error(e.message); }
    finally { if (ver === loadVer.current) setInvLoading(false); }
  };

  useEffect(() => { load(); }, [page, partnerFilter, categoryFilter, yearFromFilter, yearToFilter, seasonFilter, statusFilter, colorFilter, sizeFilter, sortField, sortDir]);

  const handleCategoryFilterChange = (value: string[]) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!value.trim()) { setSearchSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await productApi.searchSuggest(value);
        setSearchSuggestions(Array.isArray(data) ? data : []);
      } catch { setSearchSuggestions([]); }
    }, 300);
  };
  const onSearchSelect = (value: string) => { setSearch(value); setPage(1); load(); };
  useEffect(() => () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); }, []);

  const loadAll = useCallback(async () => {
    setStatsLoading(true);
    const pc = partnerFilter.length === 1 ? partnerFilter[0] : undefined;
    inventoryApi.dashboardStats(undefined, pc)
      .then(setStats)
      .catch((e: any) => message.error(e.message))
      .finally(() => setStatsLoading(false));
  }, [partnerFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const overall = stats?.overall || {};
  const byCategory = (stats?.byCategory || []) as Array<{ category: string; product_count: number; variant_count: number; total_qty: number }>;
  const bySeason = (stats?.bySeason || []) as Array<{ season: string; product_count: number; variant_count: number; total_qty: number; partner_count: number }>;
  const byYear = (stats?.byYear || []) as Array<{ year: string; product_count: number; variant_count: number; total_qty: number }>;
  const drillColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 110 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => openStockModal(r.product_code, v)}>{v}</a>,
    },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '판매가', dataIndex: 'base_price', key: 'base_price', width: 100, align: 'right' as const,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
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
      render: (v: string, r: any) => <a onClick={() => openStockModal(r.product_code, v)}>{v}</a> },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '판매가', dataIndex: 'base_price', key: 'base_price', width: 100, align: 'right' as const,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
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
      render: (v: string, r: any) => <a onClick={() => openStockModal(r.product_code, v)}>{v}</a> },
    { title: '색상', dataIndex: '_color', key: '_color', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '판매가', dataIndex: 'base_price', key: 'base_price', width: 100, align: 'right' as const,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
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
            <StatCard title="보유 매장" value={Number(overall.total_partners || 0)}
              icon={<ShopOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
              sub="재고 보유 매장 수"
              onClick={() => openDrillDown('전체 재고', {})} />
          </Col>
        )}


        {!effectiveStore && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard title="재입고 관리" value="바로가기"
              icon={<ReloadOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
              sub="보충 필요 품목 확인"
              onClick={() => navigate('/inventory/restock')} />
          </Col>
        )}
        <Col xs={24} sm={8} lg={6}>
          <StatCard title="품절" value={Number(overall.zero_stock_count || 0)}
            icon={<StopOutlined />} bg="linear-gradient(135deg, #fa709a 0%, #fee140 100%)" color="#fff" sub="재고 0개"
            onClick={() => openDrillDown('품절 (재고 0)', { stock_level: 'zero' })} />
        </Col>
        {Number(overall.negative_stock_count || 0) > 0 && (
          <Col xs={24} sm={8} lg={6}>
            <StatCard title="예약판매(음수)" value={Number(overall.negative_stock_count || 0)}
              icon={<MinusCircleOutlined />} bg="linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)" color="#fff" sub="입고 필요"
              onClick={() => openDrillDown('음수 재고 (예약판매)', { stock_level: 'negative' })} />
          </Col>
        )}
      </Row>

      {/* 검색바 (상품관리와 100% 동일) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete value={search} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map(s => ({
              value: s.product_code,
              label: <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</span>
                <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>{s.product_code} · {s.category || '-'}</span>
              </div>,
            }))}>
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={() => load()} />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
            value={partnerFilter} onChange={(v: string[]) => { setPartnerFilter(v); setPage(1); }}
            style={{ width: 180 }} placeholder="전체"
            options={partners.map((p: any) => ({ label: `${p.partner_name} (${p.partner_code})`, value: p.partner_code }))} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 140 }}
            placeholder="전체" options={categoryOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
          <Select allowClear value={yearFromFilter} onChange={(v) => { setYearFromFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
          <Select allowClear value={yearToFilter} onChange={(v) => { setYearToFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            value={seasonFilter} onChange={(v: string[]) => { setSeasonFilter(v); setPage(1); }} style={{ width: 130 }}
            placeholder="전체" options={seasonOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
            value={colorFilter} onChange={(v: string[]) => { setColorFilter(v); setPage(1); }} style={{ width: 140 }}
            placeholder="전체" options={colorOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
            value={sizeFilter} onChange={(v: string[]) => { setSizeFilter(v); setPage(1); }} style={{ width: 130 }}
            placeholder="전체" options={sizeOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            value={statusFilter} onChange={(v: string[]) => { setStatusFilter(v); setPage(1); }} style={{ width: 140 }}
            placeholder="전체" options={[{ label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} /></div>
        <Button onClick={load}>조회</Button>
      </div>
      <Table
        columns={[
          { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 100 },
          { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120, ellipsis: true,
            render: (v: string, r: any) => <a onClick={() => openStockModal(v, r.product_name || v)}>{v}</a> },
          { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 130, ellipsis: true, sorter: true },
          { title: '카테고리', dataIndex: 'category', key: 'category', width: 75, sorter: true,
            render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
          { title: '시즌', dataIndex: 'season', key: 'season', width: 75, sorter: true, render: (v: string) => v || '-' },
          { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, ellipsis: true, sorter: true },
          { title: '색상', dataIndex: 'color', key: 'color', width: 60, render: (v: string) => v || '-' },
          { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
          { title: '판매가', dataIndex: 'base_price', key: 'base_price', width: 90, align: 'right' as const,
            render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
          { title: '재고', dataIndex: 'qty', key: 'qty', width: 70, align: 'right' as const, sorter: true,
            render: (v: number) => renderQty(Number(v)) },
          ...(isStoreManager ? [{
            title: '요청', key: 'actions', width: 70, fixed: 'right' as const,
            render: (_: any, r: any) => (
              <Button type="link" size="small" icon={<SendOutlined />} style={{ padding: '0 4px', fontSize: 11 }}
                onClick={() => openRequestModal(r)}>요청</Button>
            ),
          }] : []),
        ]}
        dataSource={invData}
        rowKey="inventory_id"
        loading={invLoading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total: invTotal, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        onChange={(_pagination, _filters, sorter: any) => {
          const newField = sorter?.field && sorter?.order
            ? ({ qty: 'qty', product_name: 'product_name', category: 'category', season: 'season', sku: 'sku' }[sorter.field as string] || '')
            : '';
          const newDir = sorter?.order === 'ascend' ? 'ASC' : sorter?.order === 'descend' ? 'DESC' : '';
          if (newField !== sortField || newDir !== sortDir) {
            setSortField(newField);
            setSortDir(newDir);
            setPage(1);
          }
        }}
      />

      {/* 카테고리/시즌 (본사) */}
      {!effectiveStore && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title={<span><TagsOutlined style={{ marginRight: 8 }} />카테고리별 물량</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar data={byCategory.map(c => ({ label: c.category, value: Number(c.total_qty), sub: `${c.product_count}상품 / ${c.variant_count}옵션` }))} colorKey={CAT_COLORS}
                maxItems={7} onBarClick={(label) => openDrillDown(`카테고리: ${label}`, { category: label })} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={<span><BarChartOutlined style={{ marginRight: 8 }} />시즌(생산연도)별 물량</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={statsLoading}>
              <HBar data={bySeason.map(s => ({ label: s.season || '미지정', value: Number(s.total_qty), sub: `${s.product_count}상품 / ${Number(s.partner_count)}거래처` }))}
                maxItems={7} onBarClick={(label) => openDrillDown(`시즌: ${label}`, { season: label === '미지정' ? '' : label })} />
            </Card>
          </Col>
        </Row>
      )}
      {!effectiveStore && byYear.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card title={<span><CalendarOutlined style={{ marginRight: 8 }} />생산연도별 재고현황</span>}
              size="small" style={{ borderRadius: 10 }} loading={statsLoading}>
              <HBar data={byYear.map(y => ({ label: y.year || '미지정', value: Number(y.total_qty), sub: `${y.product_count}상품 / ${y.variant_count}옵션` }))}
                maxItems={7} onBarClick={(label) => openDrillDown(`연도: ${label}`, { year: label === '미지정' ? '' : label })} />
            </Card>
          </Col>
        </Row>
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

      {/* 매장별 재고 모달 */}
      <Modal
        title={stockModalProduct ? `${stockModalProduct.product_name} (${stockModalProduct.product_code}) — 매장별 재고` : '매장별 재고'}
        open={stockModalOpen}
        onCancel={() => setStockModalOpen(false)}
        footer={null}
        width={700}
      >
        {stockModalLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : stockModalData.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>재고 데이터가 없습니다.</div>
        ) : (
          <Table
            dataSource={stockModalData}
            rowKey="inventory_id"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            columns={[
              { title: '매장', dataIndex: 'partner_name', key: 'partner_name', width: 140 },
              { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180, ellipsis: true },
              { title: '색상', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
              { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
              { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
                sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty),
                defaultSortOrder: 'descend' as const,
                render: (v: number) => renderQty(Number(v)),
              },
            ]}
            summary={(data) => {
              const total = data.reduce((s, r) => s + Number(r.qty || 0), 0);
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}><strong>합계</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><strong>{total.toLocaleString()}</strong></Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        )}
      </Modal>

      {/* ── 통합 재고요청 모달 ── */}
      <Modal
        title="재고 요청"
        open={requestModalOpen}
        onCancel={() => setRequestModalOpen(false)}
        onOk={handleSubmitRequest}
        confirmLoading={requestLoading}
        okText={requestMode === 'transfer' ? '수평이동 알림 보내기' : '본사에 출고요청'}
        width={560}
      >
        {actionTarget && (
          <div>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{actionTarget.product_name}</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {actionTarget.product_code} / {actionTarget.sku} / {actionTarget.color}-{actionTarget.size}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                내 매장 재고: <strong style={{ color: Number(actionTarget.qty || 0) === 0 ? '#ff4d4f' : undefined }}>{Number(actionTarget.qty || 0)}개</strong>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {requestMode === 'transfer' ? '타 매장 재고 현황' : '매장별 재고 현황'}
            </div>
            {variantStocksLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
            ) : variantStocks.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: 12, marginBottom: 16 }}>재고 데이터 없음</div>
            ) : (
              <Table
                dataSource={requestMode === 'transfer' ? variantStocks.filter((s: any) => !s._isHq) : variantStocks}
                rowKey={(r: any) => `${r.partner_code}-${r.variant_id}`}
                size="small"
                pagination={false}
                scroll={{ y: 180 }}
                style={{ marginBottom: 16 }}
                columns={[
                  { title: '매장', dataIndex: 'partner_name', key: 'pn', ellipsis: true,
                    render: (v: string, r: any) => (
                      <span>
                        <span style={{ fontWeight: r.partner_code === user?.partnerCode ? 700 : 400, color: r.partner_code === user?.partnerCode ? '#52c41a' : undefined }}>
                          {v}
                        </span>
                        {r.partner_code === user?.partnerCode && <Tag color="green" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>내 매장</Tag>}
                        {r._isHq && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>본사</Tag>}
                      </span>
                    ),
                  },
                  { title: '재고', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' as const,
                    render: (v: number) => renderQty(Number(v)),
                  },
                ]}
              />
            )}

            <div style={{ marginBottom: 16 }}>
              <Segmented
                block
                value={requestMode}
                onChange={(v) => setRequestMode(v as 'transfer' | 'hq')}
                options={[
                  { label: '수평이동 요청', value: 'transfer' },
                  { label: '본사 재고요청', value: 'hq' },
                ]}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>요청 수량</div>
              <InputNumber min={1} value={requestQty} onChange={(v) => setRequestQty(v || 1)} style={{ width: 120 }} />
            </div>

            {requestMode === 'transfer' ? (() => {
              const storesWithStock = variantStocks.filter((s: any) => s.partner_code !== user?.partnerCode && !s._isHq && Number(s.qty) > 0);
              return (
                <div style={{ fontSize: 12, background: '#e6f4ff', padding: 10, borderRadius: 6 }}>
                  <div style={{ color: '#1677ff', marginBottom: storesWithStock.length ? 6 : 0 }}>
                    재고 보유 매장 {storesWithStock.length}곳에 알림이 발송됩니다
                  </div>
                  {storesWithStock.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {storesWithStock.map((s: any) => (
                        <Tag key={s.partner_code} color="blue" style={{ margin: 0 }}>
                          {s.partner_name} ({Number(s.qty)}개)
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : (
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모 (선택)</div>
                <Input value={requestMemo} onChange={(e) => setRequestMemo(e.target.value)} placeholder="요청 사유" />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
