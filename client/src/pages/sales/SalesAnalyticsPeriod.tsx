import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Select, Space, Tag, Table, Row, Col, Progress, Spin, message, DatePicker, Button, Segmented, Modal, AutoComplete, Input } from 'antd';
import {
  SkinOutlined, ColumnHeightOutlined, TagOutlined, BgColorsOutlined,
  LeftOutlined, RightOutlined, CalendarOutlined,
  DollarOutlined, ShoppingCartOutlined, SearchOutlined,
} from '@ant-design/icons';
import { salesApi } from '../../modules/sales/sales.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import dayjs, { Dayjs } from 'dayjs';
import {
  fmt, fmtW, CAT_COLORS, SEASON_COLORS, COLORS,
  StyleBar, getRange, moveRef, fmtSeason, capArr,
} from './SalesAnalyticsPage';
import type { ViewMode } from './SalesAnalyticsPage';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'];
const MAX_CHART = 7;

export function SalesAnalyticsPeriod() {
  const [mode, setMode] = useState<ViewMode>('monthly');
  const [refDate, setRefDate] = useState<Dayjs>(dayjs());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string; season: string; brand: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [yearOptions, setYearOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [seasonFilter, setSeasonFilter] = useState('');
  const [fitFilter, setFitFilter] = useState('');
  const [lengthFilter, setLengthFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterCombos, setFilterCombos] = useState<any[]>([]);
  const [variantModal, setVariantModal] = useState<{ open: boolean; code: string; name: string }>({ open: false, code: '', name: '' });
  const [variantData, setVariantData] = useState<any[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);

  const range = getRange(mode, refDate);

  /* -- 깔때기 필터 옵션 (상위 선택 -> 하위 좁혀짐) -- */
  const dynamicCategoryOptions = useMemo(() => {
    const cats = [...new Set(filterCombos.map(c => c.category).filter(Boolean))].sort();
    return cats.map(c => ({ label: c, value: c }));
  }, [filterCombos]);

  const dynamicSubCategoryOptions = useMemo(() => {
    let f = filterCombos;
    if (categoryFilter) f = f.filter(c => c.category === categoryFilter);
    const subs = [...new Set(f.map(c => c.sub_category).filter(Boolean))].sort();
    return subs.map(s => ({ label: s, value: s }));
  }, [filterCombos, categoryFilter]);

  const dynamicSeasonOptions = useMemo(() => {
    let f = filterCombos;
    if (categoryFilter) f = f.filter(c => c.category === categoryFilter);
    if (subCategoryFilter) f = f.filter(c => c.sub_category === subCategoryFilter);
    const seasons = [...new Set(f.map(c => c.season).filter(Boolean))].sort().reverse();
    return seasons.map(s => ({ label: fmtSeason(s), value: s }));
  }, [filterCombos, categoryFilter, subCategoryFilter]);

  const dynamicFitOptions = useMemo(() => {
    let f = filterCombos;
    if (categoryFilter) f = f.filter(c => c.category === categoryFilter);
    if (subCategoryFilter) f = f.filter(c => c.sub_category === subCategoryFilter);
    if (seasonFilter) f = f.filter(c => c.season === seasonFilter);
    const fits = [...new Set(f.map(c => c.fit).filter(Boolean))].sort();
    return fits.map(v => ({ label: v, value: v }));
  }, [filterCombos, categoryFilter, subCategoryFilter, seasonFilter]);

  const dynamicColorOptions = useMemo(() => {
    let f = filterCombos;
    if (categoryFilter) f = f.filter(c => c.category === categoryFilter);
    if (subCategoryFilter) f = f.filter(c => c.sub_category === subCategoryFilter);
    if (seasonFilter) f = f.filter(c => c.season === seasonFilter);
    if (fitFilter) f = f.filter(c => c.fit === fitFilter);
    const colors = [...new Set(f.map(c => c.color).filter(Boolean))].sort();
    return colors.map(v => ({ label: v, value: v }));
  }, [filterCombos, categoryFilter, subCategoryFilter, seasonFilter, fitFilter]);

  const dynamicSizeOptions = useMemo(() => {
    let f = filterCombos;
    if (categoryFilter) f = f.filter(c => c.category === categoryFilter);
    if (subCategoryFilter) f = f.filter(c => c.sub_category === subCategoryFilter);
    if (seasonFilter) f = f.filter(c => c.season === seasonFilter);
    if (fitFilter) f = f.filter(c => c.fit === fitFilter);
    if (colorFilter) f = f.filter(c => c.color === colorFilter);
    const sizes = [...new Set(f.map(c => c.size).filter(Boolean))];
    sizes.sort((a, b) => (SIZE_ORDER.indexOf(a) === -1 ? 99 : SIZE_ORDER.indexOf(a)) - (SIZE_ORDER.indexOf(b) === -1 ? 99 : SIZE_ORDER.indexOf(b)));
    return sizes.map(v => ({ label: v, value: v }));
  }, [filterCombos, categoryFilter, subCategoryFilter, seasonFilter, fitFilter, colorFilter]);

  const dynamicLengthOptions = useMemo(() => {
    let f = filterCombos;
    if (categoryFilter) f = f.filter(c => c.category === categoryFilter);
    if (subCategoryFilter) f = f.filter(c => c.sub_category === subCategoryFilter);
    if (seasonFilter) f = f.filter(c => c.season === seasonFilter);
    if (fitFilter) f = f.filter(c => c.fit === fitFilter);
    const lengths = [...new Set(f.map(c => c.length).filter(Boolean))].sort();
    return lengths.map(v => ({ label: v, value: v }));
  }, [filterCombos, categoryFilter, subCategoryFilter, seasonFilter, fitFilter]);

  /* -- YEAR 코드 로드 -- */
  useEffect(() => {
    codeApi.getByType('YEAR').then((data: any[]) => {
      data.sort((a: any, b: any) => b.code_value.localeCompare(a.code_value));
      setYearOptions(data.map((c: any) => ({ label: c.code_label || c.code_value, value: c.code_value })));
    }).catch(() => {});
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, []);

  /* -- AutoComplete 핸들러 -- */
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

  const onSearchSelect = (value: string) => {
    setSearch(value);
    load(value);
  };

  /* -- 데이터 로드 -- */
  const load = (searchOverride?: string) => {
    setLoading(true);
    const r = getRange(mode, refDate);
    const filters: Record<string, string> = {};
    if (subCategoryFilter) filters.sub_category = subCategoryFilter;
    if (seasonFilter) filters.season = seasonFilter;
    if (fitFilter) filters.fit = fitFilter;
    if (colorFilter) filters.color = colorFilter;
    if (sizeFilter) filters.size = sizeFilter;
    const s = searchOverride !== undefined ? searchOverride : search;
    if (s) filters.search = s;
    if (statusFilter) filters.sale_status = statusFilter;
    if (yearFromFilter) filters.year_from = yearFromFilter;
    if (yearToFilter) filters.year_to = yearToFilter;
    if (lengthFilter) filters.length = lengthFilter;
    salesApi.styleByRange(r.from, r.to, categoryFilter || undefined, filters)
      .then((d) => { setData(d); if (d?.filterCombinations) setFilterCombos(d.filterCombinations); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [mode, refDate, categoryFilter, subCategoryFilter, yearFromFilter, yearToFilter, seasonFilter, fitFilter, lengthFilter, colorFilter, sizeFilter, statusFilter]);

  const handleModeChange = (v: string) => { setMode(v as ViewMode); };
  const handleMove = (dir: number) => { setRefDate(moveRef(mode, refDate, dir)); };
  const handleDatePick = (d: Dayjs | null) => { if (d) setRefDate(d); };

  /* -- 카테고리 변경 -> 하위 필터 자동 리셋 -- */
  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value);
    setSubCategoryFilter('');
    // 하위 필터가 새 카테고리에 없으면 리셋
    const combos = value ? filterCombos.filter(c => c.category === value) : filterCombos;
    if (seasonFilter && !combos.some(c => c.season === seasonFilter)) setSeasonFilter('');
    if (fitFilter && !combos.some(c => c.fit === fitFilter)) setFitFilter('');
    if (colorFilter && !combos.some(c => c.color === colorFilter)) setColorFilter('');
    if (sizeFilter && !combos.some(c => c.size === sizeFilter)) setSizeFilter('');
  };
  const handleSubCategoryChange = (value: string) => {
    setSubCategoryFilter(value);
    const combos = filterCombos.filter(c =>
      (!categoryFilter || c.category === categoryFilter) && (!value || c.sub_category === value)
    );
    if (seasonFilter && !combos.some(c => c.season === seasonFilter)) setSeasonFilter('');
    if (fitFilter && !combos.some(c => c.fit === fitFilter)) setFitFilter('');
    if (colorFilter && !combos.some(c => c.color === colorFilter)) setColorFilter('');
    if (sizeFilter && !combos.some(c => c.size === sizeFilter)) setSizeFilter('');
  };
  const handleSeasonChange = (value: string) => {
    setSeasonFilter(value);
    const combos = filterCombos.filter(c =>
      (!categoryFilter || c.category === categoryFilter) &&
      (!subCategoryFilter || c.sub_category === subCategoryFilter) &&
      (!value || c.season === value)
    );
    if (fitFilter && !combos.some(c => c.fit === fitFilter)) setFitFilter('');
    if (colorFilter && !combos.some(c => c.color === colorFilter)) setColorFilter('');
    if (sizeFilter && !combos.some(c => c.size === sizeFilter)) setSizeFilter('');
  };

  const handleProductClick = async (record: any) => {
    setVariantModal({ open: true, code: record.product_code, name: record.product_name });
    setVariantLoading(true);
    setVariantData([]);
    try {
      const r = getRange(mode, refDate);
      const result = await salesApi.productVariantSales(record.product_code, r.from, r.to);
      setVariantData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setVariantLoading(false); }
  };

  const isForwardDisabled = () => {
    const next = moveRef(mode, refDate, 1);
    const nextRange = getRange(mode, next);
    return nextRange.from > dayjs().format('YYYY-MM-DD');
  };

  const totals = data?.totals || {};
  const byCategory = capArr(data?.byCategory || [], MAX_CHART, 'category', ['total_amount', 'total_qty', 'product_count']);
  const bySubCategory = data?.bySubCategory || [];
  const byFit = capArr(data?.byFit || [], MAX_CHART, 'fit', ['total_amount', 'total_qty', 'product_count', 'active_style_count']);
  const byLength = capArr(data?.byLength || [], MAX_CHART, 'length', ['total_amount', 'total_qty', 'product_count', 'active_style_count']);
  const bySize = capArr(data?.bySize || [], MAX_CHART, 'size', ['total_qty', 'total_amount']);
  const byColor = capArr(data?.byColor || [], MAX_CHART, 'color', ['total_qty', 'total_amount']);
  const topProducts = (data?.topProducts || []).slice(0, MAX_CHART);
  const bySeason = capArr(data?.bySeason || [], MAX_CHART, 'season_type', ['total_amount', 'total_qty']);

  const pickerType = mode === 'monthly' ? 'month' : mode === 'weekly' ? 'week' : undefined;
  const maxCatAmt = Math.max(1, ...byCategory.map((c: any) => Number(c.total_amount)));
  const fitAvgPerStyle = (r: any) => { const ac = Number(r.active_style_count ?? r.product_count); return ac > 0 ? Number(r.total_amount) / ac : 0; };
  const lenAvgPerStyle = (r: any) => { const ac = Number(r.active_style_count ?? r.product_count); return ac > 0 ? Number(r.total_amount) / ac : 0; };
  const maxFitAmt = Math.max(1, ...byFit.map(fitAvgPerStyle));
  const maxLenAmt = Math.max(1, ...byLength.map(lenAvgPerStyle));
  const totalSizeQty = bySize.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
  const totalColorQty = byColor.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
  const grandSeasonAmt = bySeason.reduce((s: number, r: any) => s + Number(r.total_amount), 0);

  return (
    <div>
      {/* 기간 선택 */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented value={mode} onChange={handleModeChange} options={[
          { label: '일별', value: 'daily' },
          { label: '주별', value: 'weekly' },
          { label: '월별', value: 'monthly' },
        ]} size="small" />
        <Button size="small" icon={<LeftOutlined />} onClick={() => handleMove(-1)} />
        <DatePicker value={refDate} onChange={handleDatePick} picker={pickerType}
          allowClear={false} style={{ width: mode === 'monthly' ? 130 : 150 }} size="small" />
        <Button size="small" icon={<RightOutlined />} onClick={() => handleMove(1)} disabled={isForwardDisabled()} />
        <Tag color="blue" style={{ fontSize: 12, padding: '1px 8px', margin: 0 }}>{range.label}</Tag>
      </Space>

      {/* 검색 필터 (깔때기: 상위 선택 -> 하위 옵션 자동 좁혀짐) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete
            value={search} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map(s => ({
              value: s.product_code,
              label: <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.product_code}</span>
                <span style={{ color: '#888', fontSize: 12 }}>{s.product_name}</span>
              </div>,
            }))}
          >
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />}
              onPressEnter={() => load()} />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicCategoryOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>세부</div>
          <Select value={subCategoryFilter} onChange={handleSubCategoryChange} style={{ width: 140 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicSubCategoryOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
          <Select value={yearFromFilter} onChange={(v) => setYearFromFilter(v)} style={{ width: 100 }}
            options={[{ label: '전체', value: '' }, ...yearOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
          <Select value={yearToFilter} onChange={(v) => setYearToFilter(v)} style={{ width: 100 }}
            options={[{ label: '전체', value: '' }, ...yearOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={seasonFilter} onChange={handleSeasonChange} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicSeasonOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>핏</div>
          <Select value={fitFilter} onChange={(v) => setFitFilter(v)} style={{ width: 130 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicFitOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기장</div>
          <Select value={lengthFilter} onChange={(v) => setLengthFilter(v)} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicLengthOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select showSearch optionFilterProp="label" value={colorFilter}
            onChange={(v) => setColorFilter(v)} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicColorOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select showSearch optionFilterProp="label" value={sizeFilter}
            onChange={(v) => setSizeFilter(v)} style={{ width: 110 }}
            options={[{ label: '전체 보기', value: '' }, ...dynamicSizeOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, { label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} /></div>
        <Button onClick={() => load()}>조회</Button>
      </div>

      {loading && !data ? <Spin style={{ display: 'block', margin: '60px auto' }} /> : (
        <>
          {/* 요약 카드 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: '총 매출', value: `${fmt(totals.total_amount || 0)}원`, icon: <DollarOutlined />, color: '#1890ff', bg: '#e6f7ff' },
              { label: '판매 수량', value: `${fmt(totals.total_qty || 0)}개`, icon: <ShoppingCartOutlined />, color: '#52c41a', bg: '#f6ffed' },
              { label: '판매 건수', value: `${totals.sale_count || 0}건`, icon: <TagOutlined />, color: '#fa8c16', bg: '#fff7e6' },
              { label: '판매 상품', value: `${totals.variant_count || 0}종`, icon: <SkinOutlined />, color: '#722ed1', bg: '#f9f0ff' },
            ].map((item) => (
              <Col xs={12} sm={6} key={item.label}>
                <div style={{ background: item.bg, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 22, color: item.color }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>

          {/* 카테고리별 + 세부카테고리 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title={<><TagOutlined style={{ marginRight: 6 }} />카테고리별 매출</>} style={{ height: '100%' }}>
                {byCategory.length > 0 ? byCategory.map((c: any) => (
                  <StyleBar key={c.category} label={c.category} value={Number(c.total_amount)}
                    maxValue={maxCatAmt} color={CAT_COLORS[c.category] || '#94a3b8'}
                    sub={`${fmt(Number(c.total_qty))}개 / ${c.product_count}종`} />
                )) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="세부카테고리별 매출" style={{ height: '100%' }}>
                <Table
                  columns={[
                    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                      render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag> },
                    { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 80,
                      render: (v: string) => v !== '미분류' ? <Tag color="cyan">{v}</Tag> : <span style={{ color: '#aaa' }}>-</span> },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, align: 'right' as const,
                      render: (v: number) => fmt(Number(v)) },
                    { title: '매출액', key: 'amt', width: 100, align: 'right' as const,
                      render: (_: any, r: any) => <strong>{fmtW(Number(r.total_amount))}</strong>,
                      sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                      defaultSortOrder: 'descend' as const },
                    { title: '상품', dataIndex: 'product_count', key: 'pc', width: 55, align: 'center' as const,
                      render: (v: number) => `${v}종` },
                  ]}
                  dataSource={bySubCategory}
                  rowKey={(r) => `${r.category}-${r.sub_category}`}
                  pagination={false} size="small" scroll={{ y: 300 }}
                />
              </Card>
            </Col>
          </Row>

          {/* 핏별 + 기장별 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title={<><SkinOutlined style={{ marginRight: 6 }} />핏별 매출 — 스타일 평균</>} style={{ height: '100%' }}>
                {byFit.length > 0 ? byFit.map((f: any, i: number) => {
                  const ac = Number(f.active_style_count ?? f.product_count);
                  const pc = Number(f.product_count);
                  const avg = fitAvgPerStyle(f);
                  return (
                    <StyleBar key={f.fit} label={f.fit} value={avg}
                      maxValue={maxFitAmt} color={COLORS[i % COLORS.length]}
                      sub={`${fmt(Number(f.total_qty))}개 / ${ac}종${pc > ac ? ` (${pc - ac}종 일부품절)` : ''} / 평균 ${fmtW(avg)}`} />
                  );
                }) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title={<><ColumnHeightOutlined style={{ marginRight: 6 }} />기장별 매출 — 스타일 평균</>} style={{ height: '100%' }}>
                {byLength.length > 0 ? byLength.map((l: any, i: number) => {
                  const ac = Number(l.active_style_count ?? l.product_count);
                  const pc = Number(l.product_count);
                  const avg = lenAvgPerStyle(l);
                  return (
                    <StyleBar key={l.length} label={l.length} value={avg}
                      maxValue={maxLenAmt} color={COLORS[(i + 3) % COLORS.length]}
                      sub={`${fmt(Number(l.total_qty))}개 / ${ac}종${pc > ac ? ` (${pc - ac}종 일부품절)` : ''} / 평균 ${fmtW(avg)}`} />
                  );
                }) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
              </Card>
            </Col>
          </Row>

          {/* 시즌별 */}
          {bySeason.length > 0 && (
            <Card size="small" title={<><CalendarOutlined style={{ marginRight: 6 }} />시즌별 매출 비중</>} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 28, marginBottom: 12 }}>
                {bySeason.map((d: any) => {
                  const pct = grandSeasonAmt > 0 ? (Number(d.total_amount) / grandSeasonAmt) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div key={d.season_type} style={{
                      width: `${pct}%`, background: SEASON_COLORS[d.season_type] || '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#fff', fontWeight: 600, minWidth: pct > 5 ? 0 : 30,
                    }}>
                      {pct >= 8 ? `${d.season_type} ${pct.toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>
              <Row gutter={[16, 8]}>
                {bySeason.map((d: any) => {
                  const pct = grandSeasonAmt > 0 ? (Number(d.total_amount) / grandSeasonAmt) * 100 : 0;
                  const c = SEASON_COLORS[d.season_type] || '#94a3b8';
                  return (
                    <Col xs={12} sm={6} key={d.season_type}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{d.season_type}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: c, marginLeft: 'auto' }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#888', paddingLeft: 18 }}>
                        {fmtW(Number(d.total_amount))} / {fmt(Number(d.total_qty))}개
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          )}

          {/* 사이즈별 + 컬러별 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card size="small" title="사이즈별 판매 비중" style={{ height: '100%' }}>
                {bySize.length > 0 ? bySize.map((r: any) => {
                  const pct = totalSizeQty > 0 ? (Number(r.total_qty) / totalSizeQty * 100) : 0;
                  return (
                    <div key={r.size} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600 }}>{r.size}</span>
                        <span style={{ fontSize: 12, color: '#666' }}>{fmt(Number(r.total_qty))}개 ({pct.toFixed(1)}%)</span>
                      </div>
                      <Progress percent={Number(pct.toFixed(1))} showInfo={false} size="small"
                        strokeColor={pct > 25 ? '#1677ff' : pct > 15 ? '#69b1ff' : '#91caff'} />
                      <div style={{ fontSize: 11, color: '#999' }}>{fmtW(Number(r.total_amount))}</div>
                    </div>
                  );
                }) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title={<><BgColorsOutlined style={{ marginRight: 6 }} />컬러별 판매 TOP</>} style={{ height: '100%' }}>
                {byColor.length > 0 ? byColor.map((r: any) => {
                  const pct = totalColorQty > 0 ? (Number(r.total_qty) / totalColorQty * 100) : 0;
                  const colorMap: Record<string, string> = {
                    BK: '#000', WH: '#ccc', NV: '#001f6b', GR: '#52c41a', BE: '#d4b896',
                    RD: '#ff4d4f', BL: '#1890ff', BR: '#8b4513', PK: '#ff69b4', GY: '#999',
                    CR: '#fffdd0', IV: '#fffff0', KH: '#546b3e', WN: '#722f37',
                  };
                  const bg = colorMap[r.color] || '#1890ff';
                  return (
                    <div key={r.color} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '3px 0' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: bg, border: '1px solid #ddd', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, width: 36 }}>{r.color}</span>
                      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                        <div style={{ width: `${pct * 3}%`, height: '100%', background: bg + '66', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                        {fmt(Number(r.total_qty))}개 ({pct.toFixed(1)}%)
                      </span>
                    </div>
                  );
                }) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
              </Card>
            </Col>
          </Row>

          {/* 인기상품 TOP 15 */}
          {topProducts.length > 0 && (
            <Card size="small" title={`인기상품 TOP ${topProducts.length}`}>
              <Table
                columns={[
                  { title: '#', key: 'rank', width: 36,
                    render: (_: any, __: any, i: number) => (
                      <span style={{ color: i < 3 ? '#f59e0b' : '#aaa', fontWeight: 600, fontSize: 14 }}>{i + 1}</span>
                    ) },
                  { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110,
                    render: (v: string, record: any) => (
                      <a onClick={() => handleProductClick(record)}>{v}</a>
                    ) },
                  { title: '상품명', dataIndex: 'product_name', key: 'name', width: 140, ellipsis: true },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                    render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag>,
                    filters: [...new Set(topProducts.map((p: any) => p.category))].map((v: any) => ({ text: v, value: v })),
                    onFilter: (v: any, r: any) => r.category === v },
                  { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 75,
                    render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                  { title: '핏', dataIndex: 'fit', key: 'fit', width: 70, render: (v: string) => v || '-' },
                  { title: '기장', dataIndex: 'length', key: 'len', width: 70, render: (v: string) => v || '-' },
                  { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, align: 'right' as const,
                    render: (v: number) => <strong>{fmt(v)}</strong> },
                  { title: '매출액', dataIndex: 'total_amount', key: 'amt', width: 110, align: 'right' as const,
                    render: (v: number) => <strong>{fmtW(Number(v))}</strong> },
                  { title: '비율', key: 'ratio', width: 130,
                    render: (_: any, r: any) => {
                      const total = topProducts.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
                      const pct = total > 0 ? (Number(r.total_amount) / total) * 100 : 0;
                      return <Progress percent={Math.round(pct)} size="small" strokeColor="#6366f1" />;
                    } },
                ]}
                dataSource={topProducts}
                rowKey="product_code"
                pagination={false} size="small" scroll={{ x: 900 }}
              />
            </Card>
          )}

          {byCategory.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>해당 기간에 판매 내역이 없습니다.</div>
          )}
        </>
      )}

      {/* 상품별 컬러/사이즈 판매 모달 */}
      <Modal
        title={`${variantModal.name} (${variantModal.code}) - 컬러/사이즈별 판매`}
        open={variantModal.open}
        onCancel={() => setVariantModal({ open: false, code: '', name: '' })}
        footer={<Button onClick={() => setVariantModal({ open: false, code: '', name: '' })}>닫기</Button>}
        width={600}
      >
        {variantLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : variantData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>판매 데이터가 없습니다.</div>
        ) : (
          <Table
            columns={[
              { title: '컬러', dataIndex: 'color', key: 'color', width: 80 },
              { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v}</Tag> },
              { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
              { title: '판매수량', dataIndex: 'total_qty', key: 'qty', width: 90, align: 'right' as const,
                render: (v: number) => <strong>{fmt(v)}</strong> },
              { title: '매출액', dataIndex: 'total_amount', key: 'amt', width: 120, align: 'right' as const,
                render: (v: number) => <strong>{fmtW(Number(v))}</strong> },
            ]}
            dataSource={variantData}
            rowKey="sku"
            pagination={false} size="small"
            summary={(data) => {
              const totalQty = data.reduce((s, r) => s + Number(r.total_qty), 0);
              const totalAmt = data.reduce((s, r) => s + Number(r.total_amount), 0);
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3} align="right"><strong>합계</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><strong>{fmt(totalQty)}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><strong>{fmtW(totalAmt)}</strong></Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
}
