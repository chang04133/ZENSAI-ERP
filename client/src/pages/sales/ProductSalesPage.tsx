import { useEffect, useState } from 'react';
import { Card, Table, Tag, DatePicker, Space, Spin, Select, Input, message, Row, Col, Button, Progress, Segmented } from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, SearchOutlined,
  ShopOutlined, TagOutlined, SkinOutlined, PercentageOutlined,
  CalendarOutlined, FieldTimeOutlined, FilterOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { codeApi } from '../../modules/code/code.api';
import { productApi } from '../../modules/product/product.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import dayjs, { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';
import { fmt } from '../../utils/format';
import { CAT_TAG_COLORS as CAT_COLORS } from '../../utils/constants';

const { RangePicker } = DatePicker;

/* ── 색상 헬퍼 ── */
const rateColor = (r: number) => r >= 80 ? '#52c41a' : r >= 50 ? '#1890ff' : r >= 30 ? '#fa8c16' : '#ff4d4f';
const rateBg = (r: number) => r >= 80 ? '#f6ffed' : r >= 50 ? '#e6f7ff' : r >= 30 ? '#fff7e6' : '#fff1f0';

const SEASON_LABELS: Record<string, string> = {
  SA: '봄/가을', SM: '여름', WN: '겨울', '신상': '신상', '미지정': '미지정',
};
const SEASON_COLORS: Record<string, string> = {
  SA: '#52c41a', SM: '#fa8c16', WN: '#1890ff', '신상': '#722ed1', '미지정': '#8c8c8c',
};

type AnalysisView = 'category' | 'season' | 'age';

export default function ProductSalesPage() {
  const user = useAuthStore((s) => s.user);
  const isHQ = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [data, setData] = useState<any>(null);
  const [sellThrough, setSellThrough] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [analysisView, setAnalysisView] = useState<AnalysisView>('category');
  const [showFilters, setShowFilters] = useState(false);

  // 필터 상태
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [fitFilter, setFitFilter] = useState('');
  const [lengthFilter, setLengthFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');

  // 옵션 데이터
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [lengthOptions, setLengthOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  // 옵션 로드
  useEffect(() => {
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setAllCategoryCodes(data);
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('FIT').then((data: any[]) => {
      setFitOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('LENGTH').then((data: any[]) => {
      setLengthOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    if (isHQ) {
      partnerApi.list({ limit: '1000' }).then((r: any) => {
        setPartners(r.data || []);
      }).catch(() => {});
    }
  }, []);

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setSubCategoryFilter('');
    if (!value) { setSubCategoryOptions([]); return; }
    const parent = allCategoryCodes.find((c: any) => c.code_value === value && !c.parent_code);
    if (parent) {
      setSubCategoryOptions(
        allCategoryCodes.filter((c: any) => c.parent_code === parent.code_id && c.is_active)
          .map((c: any) => ({ label: c.code_label, value: c.code_value })),
      );
    } else {
      setSubCategoryOptions([]);
    }
  };

  const buildFilters = () => {
    const f: Record<string, string> = {};
    if (search) f.search = search;
    if (categoryFilter) f.category = categoryFilter;
    if (subCategoryFilter) f.sub_category = subCategoryFilter;
    if (seasonFilter) f.season = seasonFilter;
    if (fitFilter) f.fit = fitFilter;
    if (lengthFilter) f.length = lengthFilter;
    if (colorFilter) f.color = colorFilter;
    if (sizeFilter) f.size = sizeFilter;
    if (partnerFilter) f.partner_code = partnerFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  };

  const load = async (from: Dayjs, to: Dayjs) => {
    setLoading(true);
    try {
      const [salesResult, stResult] = await Promise.all([
        salesApi.productsByRange(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), buildFilters()),
        salesApi.sellThrough(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), categoryFilter || undefined),
      ]);
      setData(salesResult);
      setSellThrough(stResult);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(range[0], range[1]); }, []);

  const handleSearch = () => load(range[0], range[1]);

  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    load(from, to);
  };
  const today = dayjs();

  const totals = data?.totals || {};
  const summary = data?.summary || [];
  const stTotals = sellThrough?.totals || {};

  // 판매율 맵: product_code → { sell_through_rate, current_stock }
  const stMap: Record<string, { rate: number; stock: number }> = {};
  for (const p of (sellThrough?.byProduct || [])) {
    stMap[p.product_code] = { rate: Number(p.sell_through_rate), stock: Number(p.current_stock) };
  }

  // summary에 판매율 병합
  const enrichedSummary = summary.map((r: any) => ({
    ...r,
    sell_through_rate: stMap[r.product_code]?.rate ?? null,
    current_stock: stMap[r.product_code]?.stock ?? null,
  }));

  // 활성 필터 개수
  const activeFilterCount = [categoryFilter, subCategoryFilter, seasonFilter, fitFilter, lengthFilter, colorFilter, sizeFilter, partnerFilter, search].filter(Boolean).length;

  /* ── 분석 카드 렌더러 ── */
  const renderAnalysisCard = (
    label: string, rate: number, soldQty: number, stockQty: number,
    productCount: number, accentColor: string, extra?: string,
  ) => (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '14px 16px',
      border: `1px solid #f0f0f0`, position: 'relative', overflow: 'hidden',
      transition: 'all 0.2s', cursor: 'default',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor + '66'; e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}15`; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* 상단 장식선 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accentColor, opacity: 0.7 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{label}</div>
          {extra && <div style={{ fontSize: 10, color: '#aaa' }}>{extra}</div>}
        </div>
        <div style={{
          background: rateBg(rate), border: `1px solid ${rateColor(rate)}33`,
          borderRadius: 8, padding: '2px 10px', fontWeight: 800, fontSize: 16,
          color: rateColor(rate),
        }}>{rate}%</div>
      </div>
      <Progress percent={rate} showInfo={false} size="small"
        strokeColor={accentColor} trailColor="#f5f5f5"
        style={{ marginBottom: 8 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
        <span>판매 <b style={{ color: '#333' }}>{fmt(soldQty)}</b></span>
        <span>재고 <b style={{ color: '#333' }}>{fmt(stockQty)}</b></span>
        <span>{productCount}종</span>
      </div>
    </div>
  );

  /* ── 시즌 라벨 파서 ── */
  const parseSeasonLabel = (s: string) => {
    if (s === '신상' || s === '미지정') return { label: s, color: SEASON_COLORS[s] || '#888' };
    // e.g. "2025SA" → "25 봄/가을"
    const year = s.slice(2, 4);
    const code = s.slice(4);
    return {
      label: `${year} ${SEASON_LABELS[code] || code}`,
      color: SEASON_COLORS[code] || '#888',
    };
  };

  return (
    <div>
      <PageHeader title="아이템별 매출" />

      {/* ── 검색 바 ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginBottom: 8, padding: '10px 14px',
        background: '#f5f7fa', borderRadius: 10, border: '1px solid #e0e4ea',
      }}>
        <RangePicker
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
          presets={datePresets}
          format="YYYY-MM-DD"
          size="small"
          style={{ width: 240 }}
        />
        <Space size={4} wrap>
          <Button size="small" onClick={() => quickRange(today, today)}>오늘</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" type="primary" ghost onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month'))}>전월</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('year'), today)}>올해</Button>
        </Space>
        <div style={{ flex: 1 }} />
        <Input
          placeholder="상품코드/이름 검색"
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 200 }}
          size="small"
        />
        <Button type={showFilters ? 'primary' : 'default'} size="small" icon={<FilterOutlined />}
          onClick={() => setShowFilters(!showFilters)}>
          필터{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>검색</Button>
      </div>

      {/* ── 세부 필터 (접이식) ── */}
      {showFilters && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, padding: '10px 14px',
          background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8',
        }}>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
            <Select value={categoryFilter} onChange={handleCategoryChange} style={{ width: 120 }} size="small"
              options={[{ label: '전체', value: '' }, ...categoryOptions]} /></div>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>세부</div>
            <Select value={subCategoryFilter} onChange={setSubCategoryFilter} style={{ width: 130 }} size="small"
              options={[{ label: '전체', value: '' }, ...subCategoryOptions]} disabled={!categoryFilter} /></div>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
            <Select value={seasonFilter} onChange={setSeasonFilter} style={{ width: 120 }} size="small"
              options={[
                { label: '전체', value: '' },
                { label: '26 봄/가을', value: '2026SA' }, { label: '26 여름', value: '2026SM' }, { label: '26 겨울', value: '2026WN' },
                { label: '25 봄/가을', value: '2025SA' }, { label: '25 여름', value: '2025SM' }, { label: '25 겨울', value: '2025WN' },
              ]} /></div>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>핏</div>
            <Select value={fitFilter} onChange={setFitFilter} style={{ width: 110 }} size="small"
              options={[{ label: '전체', value: '' }, ...fitOptions]} /></div>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기장</div>
            <Select value={lengthFilter} onChange={setLengthFilter} style={{ width: 110 }} size="small"
              options={[{ label: '전체', value: '' }, ...lengthOptions]} /></div>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
            <Select showSearch optionFilterProp="label" value={colorFilter}
              onChange={setColorFilter} style={{ width: 110 }} size="small"
              options={[{ label: '전체', value: '' }, ...colorOptions]} /></div>
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
            <Select showSearch optionFilterProp="label" value={sizeFilter}
              onChange={setSizeFilter} style={{ width: 90 }} size="small"
              options={[{ label: '전체', value: '' }, ...sizeOptions]} /></div>
          {isHQ && (
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
              <Select showSearch optionFilterProp="label" value={partnerFilter}
                onChange={setPartnerFilter} style={{ width: 150 }} size="small"
                options={[{ label: '전체', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
          )}
          {activeFilterCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button size="small" danger onClick={() => {
                setSearch(''); setCategoryFilter(''); setSubCategoryFilter(''); setSubCategoryOptions([]);
                setSeasonFilter(''); setFitFilter(''); setLengthFilter('');
                setColorFilter(''); setSizeFilter(''); setPartnerFilter('');
              }}>초기화</Button>
            </div>
          )}
        </div>
      )}

      {loading && !data ? (
        <Spin style={{ display: 'block', margin: '60px auto' }} />
      ) : (
        <>
          {/* ── 상단 요약 카드 ── */}
          <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
            {[
              { label: '총 매출', value: `${fmt(totals.total_amount || 0)}원`, icon: <DollarOutlined />, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
              { label: '판매수량', value: `${fmt(totals.total_qty || 0)}개`, icon: <ShoppingCartOutlined />, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
              { label: '판매상품', value: `${enrichedSummary.length}종`, icon: <SkinOutlined />, gradient: 'linear-gradient(135deg, #fa8c16 0%, #f5576c 100%)' },
              { label: '거래처', value: `${totals.partner_count || 0}곳`, icon: <ShopOutlined />, gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
            ].map((item) => (
              <Col xs={12} sm={6} key={item.label}>
                <div style={{
                  background: item.gradient, borderRadius: 12, padding: '16px 18px',
                  color: '#fff', position: 'relative', overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 60, opacity: 0.12 }}>{item.icon}</div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{item.value}</div>
                </div>
              </Col>
            ))}
          </Row>

          {/* ── 판매율 분석 섹션 ── */}
          {sellThrough && (
            <div style={{
              background: '#fafbfd', borderRadius: 12, padding: '14px 16px',
              marginBottom: 16, border: '1px solid #eef0f5',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <PercentageOutlined style={{ fontSize: 18, color: '#1890ff' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>판매율 분석</span>
                  {stTotals.overall_rate != null && (
                    <Tag style={{
                      background: rateBg(stTotals.overall_rate),
                      color: rateColor(stTotals.overall_rate),
                      border: `1px solid ${rateColor(stTotals.overall_rate)}44`,
                      fontWeight: 800, fontSize: 14, padding: '2px 12px',
                    }}>전체 {stTotals.overall_rate}%</Tag>
                  )}
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    {fmt(stTotals.total_sold || 0)}판매 / {fmt(stTotals.total_stock || 0)}재고
                  </span>
                </div>
                <Segmented
                  size="small"
                  value={analysisView}
                  onChange={(v) => setAnalysisView(v as AnalysisView)}
                  options={[
                    { value: 'category', label: '카테고리별' },
                    { value: 'season', label: '시즌별' },
                    { value: 'age', label: '연차별' },
                  ]}
                />
              </div>

              {/* 카테고리별 */}
              {analysisView === 'category' && (
                <Row gutter={[10, 10]}>
                  {(sellThrough.byCategory || []).map((c: any) => {
                    const rate = Number(c.sell_through_rate);
                    const color = CAT_COLORS[c.category] ? `#${CAT_COLORS[c.category] === 'purple' ? '722ed1' : CAT_COLORS[c.category] === 'magenta' ? 'eb2f96' : CAT_COLORS[c.category] === 'orange' ? 'fa8c16' : CAT_COLORS[c.category] === 'green' ? '52c41a' : CAT_COLORS[c.category] === 'cyan' ? '13c2c2' : CAT_COLORS[c.category] === 'blue' ? '1890ff' : '888888'}` : '#888';
                    return (
                      <Col xs={12} sm={8} md={6} lg={4} key={c.category}>
                        {renderAnalysisCard(
                          c.category, rate,
                          Number(c.sold_qty), Number(c.current_stock),
                          Number(c.product_count), color,
                        )}
                      </Col>
                    );
                  })}
                </Row>
              )}

              {/* 시즌별 */}
              {analysisView === 'season' && (
                <Row gutter={[10, 10]}>
                  {(sellThrough.bySeason || []).map((s: any) => {
                    const rate = Number(s.sell_through_rate);
                    const { label, color } = parseSeasonLabel(s.season);
                    return (
                      <Col xs={12} sm={8} md={6} lg={4} key={s.season}>
                        {renderAnalysisCard(
                          label, rate,
                          Number(s.sold_qty), Number(s.current_stock),
                          Number(s.product_count), color,
                          s.season,
                        )}
                      </Col>
                    );
                  })}
                  {(sellThrough.bySeason || []).length === 0 && (
                    <Col span={24}>
                      <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
                        <CalendarOutlined style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                        시즌 데이터가 없습니다
                      </div>
                    </Col>
                  )}
                </Row>
              )}

              {/* 연차별 */}
              {analysisView === 'age' && (
                <Row gutter={[10, 10]}>
                  {(sellThrough.byAge || []).map((a: any) => {
                    const rate = Number(a.sell_through_rate);
                    const AGE_COLORS: Record<string, string> = {
                      '신상': '#722ed1', '1년차': '#1890ff', '2년차': '#fa8c16',
                      '3년차': '#f5222d', '미지정': '#8c8c8c',
                    };
                    const color = AGE_COLORS[a.age_group] || '#595959';
                    return (
                      <Col xs={12} sm={8} md={6} lg={4} key={a.age_group}>
                        {renderAnalysisCard(
                          a.age_group, rate,
                          Number(a.sold_qty), Number(a.current_stock),
                          Number(a.product_count), color,
                          a.age_group === '신상' ? '입고 1년 미만' : undefined,
                        )}
                      </Col>
                    );
                  })}
                  {(sellThrough.byAge || []).length === 0 && (
                    <Col span={24}>
                      <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
                        <FieldTimeOutlined style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                        연차 데이터가 없습니다
                      </div>
                    </Col>
                  )}
                </Row>
              )}
            </div>
          )}

          {/* ── 상품별 매출 테이블 ── */}
          <Card size="small" style={{ borderRadius: 10 }}
            title={<span style={{ fontWeight: 700 }}><TagOutlined style={{ marginRight: 6 }} />상품별 매출 ({enrichedSummary.length}개)</span>}
            extra={<span style={{ fontSize: 11, color: '#888' }}>
              {range[0].format('MM.DD')} ~ {range[1].format('MM.DD')}
              {activeFilterCount > 0 && <Tag color="blue" style={{ marginLeft: 6 }}>필터 {activeFilterCount}개</Tag>}
            </span>}
          >
            <Table
              columns={[
                { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110,
                  render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
                { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true,
                  render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
                { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                  render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'} style={{ margin: 0 }}>{v}</Tag>,
                  filters: Object.keys(CAT_COLORS).map(k => ({ text: k, value: k })),
                  onFilter: (v: any, r: any) => r.category === v },
                { title: '시즌', dataIndex: 'season_type', key: 'season', width: 80,
                  render: (v: string) => {
                    if (!v) return <span style={{ color: '#ccc' }}>-</span>;
                    const { label, color } = parseSeasonLabel(v);
                    return <Tag style={{ margin: 0, color, borderColor: color + '44', background: color + '0a' }}>{label}</Tag>;
                  },
                },
                { title: '판매수량', dataIndex: 'total_qty', key: 'qty', width: 85, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}</strong>,
                  sorter: (a: any, b: any) => a.total_qty - b.total_qty },
                { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const,
                  render: (v: number | null) => v != null ? <span style={{ color: v === 0 ? '#ff4d4f' : '#666' }}>{fmt(v)}</span> : <span style={{ color: '#ccc' }}>-</span>,
                  sorter: (a: any, b: any) => (a.current_stock ?? 0) - (b.current_stock ?? 0) },
                { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 120, align: 'center' as const,
                  render: (v: number | null) => {
                    if (v == null) return <span style={{ color: '#ccc' }}>-</span>;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <div style={{
                          background: rateBg(v), border: `1px solid ${rateColor(v)}33`,
                          borderRadius: 6, padding: '1px 8px', fontWeight: 800, fontSize: 12,
                          color: rateColor(v), minWidth: 44, textAlign: 'center',
                        }}>{v}%</div>
                        <Progress percent={v} showInfo={false} size="small"
                          strokeColor={rateColor(v)} style={{ width: 44, margin: 0 }} />
                      </div>
                    );
                  },
                  sorter: (a: any, b: any) => (a.sell_through_rate ?? -1) - (b.sell_through_rate ?? -1) },
                { title: '매출금액', dataIndex: 'total_amount', key: 'amt', width: 120, align: 'right' as const,
                  render: (v: number) => <strong style={{ color: '#1a3a6a' }}>{fmt(v)}원</strong>,
                  sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                  defaultSortOrder: 'descend' as const },
                { title: '평균단가', key: 'avg', width: 100, align: 'right' as const,
                  render: (_: any, r: any) => {
                    const avg = r.total_qty > 0 ? Math.round(Number(r.total_amount) / r.total_qty) : 0;
                    return <span style={{ color: '#666' }}>{fmt(avg)}원</span>;
                  },
                },
                { title: '건수', dataIndex: 'sale_count', key: 'cnt', width: 55, align: 'center' as const },
                { title: '거래처', dataIndex: 'partner_count', key: 'pc', width: 60, align: 'center' as const,
                  render: (v: number) => v > 1 ? <Tag color="purple" style={{ margin: 0 }}>{v}곳</Tag> : <span style={{ color: '#888' }}>{v}곳</span> },
              ]}
              dataSource={enrichedSummary}
              rowKey="product_code"
              loading={loading}
              size="small"
              scroll={{ x: 1200, y: 'calc(100vh - 400px)' }}
              pagination={{
                pageSize: 50,
                showTotal: (t) => `총 ${t}건`,
              }}
              summary={() => {
                if (enrichedSummary.length === 0) return null;
                const totalQty = enrichedSummary.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                const totalAmt = enrichedSummary.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
                const totalStock = enrichedSummary.reduce((s: number, r: any) => s + Number(r.current_stock || 0), 0);
                const avgPrice = totalQty > 0 ? Math.round(totalAmt / totalQty) : 0;
                const overallRate = (totalQty + totalStock) > 0 ? Math.round(totalQty / (totalQty + totalStock) * 1000) / 10 : 0;
                return (
                  <Table.Summary.Row style={{ background: '#f0f4ff', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <span style={{ color: '#1a3a6a' }}>합계</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">{fmt(totalQty)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">{fmt(totalStock)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="center">
                      <span style={{ color: rateColor(overallRate), fontWeight: 800, fontSize: 13 }}>{overallRate}%</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <span style={{ color: '#1a3a6a' }}>{fmt(totalAmt)}원</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">{fmt(avgPrice)}원</Table.Summary.Cell>
                    <Table.Summary.Cell index={9} colSpan={2} />
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>

          {enrichedSummary.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              해당 기간에 판매 내역이 없습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
