import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Card, Col, Row, Table, Tag, Input, Button, AutoComplete, DatePicker,
  Select, Space, Segmented, message,
} from 'antd';
import { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';
import {
  InboxOutlined, ShopOutlined, TagsOutlined, SearchOutlined,
  StopOutlined, BarChartOutlined, CalendarOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

import HBar from '../../components/HBar';
import { CAT_COLORS, CAT_TAG_COLORS, renderQty, StatCard } from './InventoryStatusPage';

export function InventoryDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const effectiveStore = isStore;

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // 검색/필터
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [page, setPage] = useState(1);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [invData, setInvData] = useState<any[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invLoading, setInvLoading] = useState(false);




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

  // 재고 목록 로드
  const load = async () => {
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
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }
      const result = await inventoryApi.list(params);
      setInvData(result.data);
      setInvTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setInvLoading(false); }
  };

  useEffect(() => { load(); }, [page, partnerFilter, categoryFilter, yearFromFilter, yearToFilter, seasonFilter, statusFilter, colorFilter, sizeFilter, dateRange]);

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
    inventoryApi.dashboardStats()
      .then(setStats)
      .catch((e: any) => message.error(e.message))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const overall = stats?.overall || {};
  const byCategory = (stats?.byCategory || []) as Array<{ category: string; product_count: number; variant_count: number; total_qty: number }>;
  const bySeason = (stats?.bySeason || []) as Array<{ season: string; product_count: number; variant_count: number; total_qty: number; partner_count: number }>;
  const byYear = (stats?.byYear || []) as Array<{ year: string; product_count: number; variant_count: number; total_qty: number }>;
  const drillColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 110 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => navigate(`/products/${r.product_code}`)}>{v}</a>,
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
      render: (v: string, r: any) => <a onClick={() => navigate(`/products/${r.product_code}`)}>{v}</a> },
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
      render: (v: string, r: any) => <a onClick={() => navigate(`/products/${r.product_code}`)}>{v}</a> },
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
      </Row>

      {/* 검색바 (상품관리와 100% 동일) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간(등록일)</div>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) => { setDateRange(v as [Dayjs, Dayjs] | null); setPage(1); }}
            presets={datePresets}
            format="YYYY-MM-DD"
            allowClear
            style={{ width: 300 }}
          /></div>
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
          { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 110 },
          { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true,
            render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a> },
          { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
          { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
            render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
          { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
          { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, ellipsis: true },
          { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
          { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
          { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
            sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty),
            render: (v: number) => renderQty(Number(v)) },
        ]}
        dataSource={invData}
        rowKey="inventory_id"
        loading={invLoading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total: invTotal, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
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
    </>
  );
}
