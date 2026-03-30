import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Input, Select, Space, Tag, Card, Row, Col, Statistic, Segmented, AutoComplete, message } from 'antd';
import { SearchOutlined, InboxOutlined, WarningOutlined, ReloadOutlined, ShopOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { sizeSort } from '../../utils/size-order';
import { useCodeLabels } from '../../hooks/useCodeLabels';

const STOCK_LEVELS = [
  { label: '품절', value: 'zero' },
  { label: '부족', value: 'low' },
  { label: '보통', value: 'medium' },
  { label: '충분', value: 'good' },
];
type ViewMode = 'product' | 'color' | 'size';

export default function MyStoreInventoryPage() {
  const user = useAuthStore((s) => s.user);
  const isHqOrAbove = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;
  const { formatCode } = useCodeLabels();

  // 매장 선택 (HQ 이상)
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<string>('');

  const [rawData, setRawData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sumQty, setSumQty] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('product');

  // Filters
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string[]>([]);
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [stockLevelFilter, setStockLevelFilter] = useState<string[]>([]);
  const [sortValue, setSortValue] = useState('qty_ASC');

  // Dynamic filter options (상품관리와 동일)
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);

  // Dashboard stats
  const [stats, setStats] = useState<any>(null);

  // 코드 옵션 로드 (상품관리와 동일)
  useEffect(() => {
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

  const handleCategoryFilterChange = (value: string[]) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const load = useCallback(async (p?: number, searchOverride?: string) => {
    if (isHqOrAbove && !selectedPartner) return;
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const s = searchOverride !== undefined ? searchOverride : search;
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (isHqOrAbove && selectedPartner) params.partner_code = selectedPartner;
      if (s) params.search = s;
      if (categoryFilter.length) params.category = categoryFilter.join(',');
      if (seasonFilter.length) params.season = seasonFilter.join(',');
      if (yearFromFilter) params.year_from = yearFromFilter;
      if (yearToFilter) params.year_to = yearToFilter;
      if (sizeFilter.length) params.size = sizeFilter.join(',');
      if (colorFilter.length) params.color = colorFilter.join(',');
      if (stockLevelFilter.length) params.stock_level = stockLevelFilter.join(',');
      // Parse sort
      const lastUnderscore = sortValue.lastIndexOf('_');
      params.sort_field = sortValue.substring(0, lastUnderscore);
      params.sort_dir = sortValue.substring(lastUnderscore + 1);
      const result = await inventoryApi.list(params);
      setRawData(result.data);
      setTotal(result.total);
      setSumQty(result.sumQty ?? 0);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, categoryFilter, seasonFilter, yearFromFilter, yearToFilter, sizeFilter, colorFilter, stockLevelFilter, sortValue, isHqOrAbove, selectedPartner]);

  const loadStats = useCallback(async () => {
    if (isHqOrAbove && !selectedPartner) return;
    try {
      const s = await inventoryApi.dashboardStats(undefined, isHqOrAbove ? selectedPartner : undefined);
      setStats(s);
    } catch (e: any) { console.error(e); }
  }, [isHqOrAbove, selectedPartner]);

  // HQ: 매장 목록 로드
  useEffect(() => {
    if (isHqOrAbove) {
      partnerApi.list({ limit: '1000' }).then(r => {
        const stores = r.data.filter((p: any) => p.partner_type !== '본사');
        setPartners(stores);
      }).catch(() => {});
    }
  }, [isHqOrAbove]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { load(); }, [page, categoryFilter, seasonFilter, yearFromFilter, yearToFilter, sizeFilter, colorFilter, stockLevelFilter, sortValue, selectedPartner]);

  const doSearch = () => { setPage(1); load(1); };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!value.trim()) { setSearchSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await inventoryApi.searchSuggest(value);
        setSearchSuggestions(Array.isArray(data) ? data : []);
      } catch { setSearchSuggestions([]); }
    }, 300);
  };

  const onSearchSelect = (value: string) => {
    setSearch(value);
    setPage(1);
    load(1, value);
  };

  useEffect(() => {
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, []);

  const resetFilters = () => {
    setSearch(''); setCategoryFilter([]);
    setSeasonFilter([]); setYearFromFilter(''); setYearToFilter('');
    setSizeFilter([]); setColorFilter([]); setStockLevelFilter([]);
    setSortValue('qty_ASC');
    setPage(1);
  };

  // --- 뷰모드별 데이터 변환 ---
  const displayData = useMemo(() => {
    if (viewMode === 'product') {
      const map: Record<string, any> = {};
      rawData.forEach((r) => {
        const key = r.product_code;
        if (!map[key]) {
          map[key] = {
            product_code: r.product_code, product_name: r.product_name, category: r.category,
            brand: r.brand, season: r.season, year: r.year,
            base_price: r.base_price, image_url: r.image_url,
            total_qty: 0, _variants: [],
          };
        }
        map[key].total_qty += Number(r.qty || 0);
        map[key]._variants.push(r);
      });
      return Object.values(map);
    }

    if (viewMode === 'color') {
      const map: Record<string, any> = {};
      rawData.forEach((r) => {
        const key = `${r.product_code}__${r.color || '-'}`;
        if (!map[key]) {
          map[key] = {
            product_code: r.product_code, product_name: r.product_name, category: r.category,
            brand: r.brand, season: r.season, year: r.year,
            base_price: r.base_price, image_url: r.image_url,
            _color: r.color || '-', _colorQty: 0, _colorVariants: [], _rowKey: key,
          };
        }
        map[key]._colorQty += Number(r.qty || 0);
        map[key]._colorVariants.push(r);
      });
      Object.values(map).forEach((row: any) => {
        row._colorVariants.sort((a: any, b: any) => sizeSort(a.size, b.size));
      });
      return Object.values(map);
    }

    return rawData.map((r) => ({ ...r, _rowKey: `${r.inventory_id}` }));
  }, [viewMode, rawData]);

  const renderQty = (qty: number) => {
    const n = Number(qty);
    let label: string | undefined;
    if (n === 0) { label = '품절'; }
    else if (n <= 5) { label = '부족'; }
    const clr = n === 0 ? '#ff4d4f' : n <= 5 ? '#faad14' : '#333';
    return (
      <Space size={4}>
        <span style={{ fontWeight: 600, color: clr }}>{n.toLocaleString()}</span>
        {label && <Tag color={n === 0 ? 'red' : 'orange'} style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{label}</Tag>}
      </Space>
    );
  };

  // --- 품번별 columns ---
  const productColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '연도', dataIndex: 'year', key: 'year', width: 60, render: (v: string) => v ? formatCode('YEAR', v) : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 90, render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '총 재고', dataIndex: 'total_qty', key: 'total_qty', width: 100, render: (v: number) => renderQty(v) },
  ];

  // --- 컬러별 columns ---
  const colorColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', key: 'product_code', width: 130, ellipsis: true, render: (_: any, r: any) => r.product_code },
    { title: 'Color', dataIndex: '_color', key: '_color', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
    { title: '재고', dataIndex: '_colorQty', key: '_colorQty', width: 100, render: (v: number) => renderQty(v) },
  ];

  // --- 사이즈별 columns ---
  const sizeColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70, render: (v: string) => <Tag>{v || '-'}</Tag> },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v || '-'}</Tag> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 170, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '재고', dataIndex: 'qty', key: 'qty', width: 100, render: (v: number) => renderQty(Number(v)) },
  ];

  const displayColumns = useMemo(() => {
    if (viewMode === 'product') return productColumns;
    if (viewMode === 'color') return colorColumns;
    return sizeColumns;
  }, [viewMode]);

  // --- Expandable rows ---
  const productExpandedRow = (record: any) => {
    const variants = record._variants || [];
    if (variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const colorMap: Record<string, any[]> = {};
    variants.forEach((v: any) => {
      const c = v.color || '-';
      if (!colorMap[c]) colorMap[c] = [];
      colorMap[c].push(v);
    });
    const rows: any[] = [];
    Object.entries(colorMap).forEach(([, vs]) => {
      vs.sort((a: any, b: any) => sizeSort(a.size, b.size));
      vs.forEach((v: any) => rows.push(v));
    });
    const cols = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: 'Color', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, render: (v: number) => renderQty(Number(v)) },
    ];
    return <Table columns={cols} dataSource={rows} rowKey="inventory_id" pagination={false} size="small" style={{ margin: 0 }} />;
  };

  const colorExpandedRow = (record: any) => {
    const variants = record._colorVariants || [];
    if (variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const cols = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, render: (v: number) => renderQty(Number(v)) },
    ];
    return <Table columns={cols} dataSource={variants} rowKey="inventory_id" pagination={false} size="small" style={{ margin: 0 }} />;
  };

  const tableExpandable = useMemo(() => {
    if (viewMode === 'product') return { expandedRowRender: productExpandedRow };
    if (viewMode === 'color') return { expandedRowRender: colorExpandedRow };
    return undefined;
  }, [viewMode, rawData]);

  const overall = stats?.overall;
  const byCategory = stats?.byCategory || [];
  const selectedPartnerName = partners.find(p => p.partner_code === selectedPartner)?.partner_name;

  return (
    <div>
      <PageHeader title={isHqOrAbove ? '매장재고' : '내 매장 재고'} />

      {/* HQ: 매장 선택 */}
      {isHqOrAbove && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShopOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          <span style={{ fontWeight: 600 }}>매장 선택:</span>
          <Select
            showSearch optionFilterProp="label"
            placeholder="매장을 선택해주세요"
            value={selectedPartner || undefined}
            onChange={(v) => { setSelectedPartner(v); setPage(1); setRawData([]); setStats(null); }}
            style={{ width: 280 }}
            options={partners.map(p => ({ label: `${p.partner_name} (${p.partner_code})`, value: p.partner_code }))}
          />
          {selectedPartnerName && <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>{selectedPartnerName}</Tag>}
        </div>
      )}

      {isHqOrAbove && !selectedPartner && (
        <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>
          <ShopOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
          <div style={{ fontSize: 16 }}>매장을 선택하면 해당 매장의 재고를 확인할 수 있습니다.</div>
        </div>
      )}

      {/* Summary Cards */}
      {(!isHqOrAbove || selectedPartner) && overall && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Statistic title="총 재고수량" value={overall.total_qty} suffix="개" valueStyle={{ fontSize: 22 }} prefix={<InboxOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Statistic title="품목 수" value={overall.total_items} suffix="종" valueStyle={{ fontSize: 22 }} prefix={<InboxOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Statistic title="품절 품목" value={overall.zero_stock_count} suffix="종" valueStyle={{ fontSize: 22, color: overall.zero_stock_count > 0 ? '#ff4d4f' : undefined }} prefix={<WarningOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>카테고리별</div>
              <Space wrap size={4}>
                {byCategory.map((c: any) => (
                  <Tag
                    key={c.category}
                    color={categoryFilter.includes(c.category) ? 'blue' : undefined}
                    style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => { setCategoryFilter(prev => prev.includes(c.category) ? prev.filter(x => x !== c.category) : [...prev, c.category]); setPage(1); }}
                  >
                    {c.category} ({c.total_qty})
                  </Tag>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters + Table */}
      {(!isHqOrAbove || selectedPartner) && (<>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete
            value={search} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map(s => ({
              value: s.product_code,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</span>
                  <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>{s.product_code} · {s.category || '-'}</span>
                </div>
              ),
            }))}
          >
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={doSearch} allowClear />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 140 }}
            placeholder="전체" options={categoryOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
          <Select allowClear value={yearFromFilter || undefined} onChange={(v) => { setYearFromFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
          <Select allowClear value={yearToFilter || undefined} onChange={(v) => { setYearToFilter(v || ''); setPage(1); }} style={{ width: 90 }}
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
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>재고상태</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            value={stockLevelFilter} onChange={(v: string[]) => { setStockLevelFilter(v); setPage(1); }}
            style={{ width: 150 }} placeholder="전체"
            options={[{ label: '품절', value: 'zero' }, { label: '부족', value: 'low' }, { label: '보통', value: 'medium' }, { label: '충분', value: 'good' }]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>정렬</div>
          <Select value={sortValue} onChange={(v) => { setSortValue(v); setPage(1); }} style={{ width: 150 }}
            options={[
              { label: '재고 적은순', value: 'qty_ASC' },
              { label: '재고 많은순', value: 'qty_DESC' },
              { label: '상품명순', value: 'product_name_ASC' },
              { label: '가격 높은순', value: 'base_price_DESC' },
              { label: '가격 낮은순', value: 'base_price_ASC' },
            ]} /></div>
        <Button onClick={doSearch}>조회</Button>
        <Button icon={<ReloadOutlined />} onClick={resetFilters}>초기화</Button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '품번별', value: 'product' },
            { label: '컬러별', value: 'color' },
            { label: '사이즈별', value: 'size' },
          ]}
        />
        <span style={{ marginLeft: 12, fontSize: 13, color: '#666' }}>
          조회결과: <strong>{total.toLocaleString()}</strong>건 / 필터 재고합계: <strong>{sumQty.toLocaleString()}</strong>개
        </span>
      </div>

      <Table
        columns={displayColumns}
        dataSource={displayData}
        rowKey={viewMode === 'product' ? 'product_code' : '_rowKey'}
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          onChange: (p) => setPage(p),
          showTotal: (t) => `총 ${t}건`,
        }}
        expandable={tableExpandable}
        rowClassName={(record) => {
          const qty = viewMode === 'product' ? Number(record.total_qty) : viewMode === 'color' ? Number(record._colorQty) : Number(record.qty);
          if (qty === 0) return 'row-stock-zero';
          if (qty <= 5) return 'row-stock-low';
          return '';
        }}
      />
      </>)}

      <style>{`
        .row-stock-zero td { background: #fff2f0 !important; }
        .row-stock-low td { background: #fffbe6 !important; }
      `}</style>
    </div>
  );
}
