import { useEffect, useState, useMemo } from 'react';
import { Card, Select, Space, Tag, Table, Row, Col, Statistic, Progress, Spin, Tabs, message, DatePicker, Button, Segmented, Modal } from 'antd';
import {
  RiseOutlined, FallOutlined, LineChartOutlined, FireOutlined,
  SkinOutlined, ColumnHeightOutlined, TagOutlined, BgColorsOutlined,
  LeftOutlined, RightOutlined, CalendarOutlined, FilterOutlined,
  DollarOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

const fmt = (v: number) => Number(v).toLocaleString();
const fmtW = (v: number) => `${fmt(v)}원`;
const ML = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4',
};
const SEASON_COLORS: Record<string, string> = {
  '봄/가을': '#10b981', '여름': '#f59e0b', '겨울': '#3b82f6', '기타': '#94a3b8',
};
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

const growthTag = (cur: number, prev: number) => {
  if (!prev) return cur > 0 ? <Tag color="blue">NEW</Tag> : <Tag color="default">-</Tag>;
  const pct = ((cur - prev) / prev * 100).toFixed(1);
  const n = Number(pct);
  if (n > 0) return <Tag color="red"><RiseOutlined /> +{pct}%</Tag>;
  if (n < 0) return <Tag color="blue"><FallOutlined /> {pct}%</Tag>;
  return <Tag color="default">0%</Tag>;
};

const growthPct = (cur: number, prev: number): number => {
  if (!prev) return cur > 0 ? 100 : 0;
  return Number(((cur - prev) / prev * 100).toFixed(1));
};

const barStyle = (ratio: number, color: string): React.CSSProperties => ({
  background: color, height: 8, borderRadius: 4,
  width: `${Math.min(100, Math.max(2, ratio))}%`, transition: 'width 0.3s',
});

/* ─────── StyleBar ─────── */
function StyleBar({ label, value, maxValue, color, sub }: {
  label: string; value: number; maxValue: number; color: string; sub?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {fmtW(value)}
          {sub && <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>{sub}</span>}
        </span>
      </div>
      <div style={{ background: '#f3f4f6', borderRadius: 6, height: 16, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          borderRadius: 6, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

/* ─────── 기간 유틸 ─────── */
type ViewMode = 'daily' | 'weekly' | 'monthly';

function getRange(mode: ViewMode, ref: Dayjs): { from: string; to: string; label: string } {
  if (mode === 'daily') {
    const d = ref.format('YYYY-MM-DD');
    return { from: d, to: d, label: `${ref.format('YYYY.MM.DD')} (${ref.format('ddd')})` };
  }
  if (mode === 'weekly') {
    const start = ref.startOf('isoWeek');
    const end = ref.endOf('isoWeek');
    const endCapped = end.isAfter(dayjs()) ? dayjs() : end;
    return { from: start.format('YYYY-MM-DD'), to: endCapped.format('YYYY-MM-DD'), label: `${start.format('MM.DD')} ~ ${endCapped.format('MM.DD')}` };
  }
  const start = ref.startOf('month');
  const end = ref.endOf('month');
  const endCapped = end.isAfter(dayjs()) ? dayjs() : end;
  return { from: start.format('YYYY-MM-DD'), to: endCapped.format('YYYY-MM-DD'), label: `${ref.format('YYYY년 MM월')}` };
}

function moveRef(mode: ViewMode, ref: Dayjs, dir: number): Dayjs {
  if (mode === 'daily') return ref.add(dir, 'day');
  if (mode === 'weekly') return ref.add(dir, 'week');
  return ref.add(dir, 'month');
}

/* ═══════════════════════════════════════════
   Tab 1: 기간별 현황 (from StyleSalesPage)
   ═══════════════════════════════════════════ */
function PeriodTab() {
  const [mode, setMode] = useState<ViewMode>('monthly');
  const [refDate, setRefDate] = useState<Dayjs>(dayjs());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [variantModal, setVariantModal] = useState<{ open: boolean; code: string; name: string }>({ open: false, code: '', name: '' });
  const [variantData, setVariantData] = useState<any[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);

  const range = getRange(mode, refDate);

  const load = (m: ViewMode, ref: Dayjs, cat?: string | '') => {
    setLoading(true);
    const r = getRange(m, ref);
    salesApi.styleByRange(r.from, r.to, cat || undefined)
      .then(setData)
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(mode, refDate, categoryFilter); }, []);

  const handleModeChange = (v: string) => { const m = v as ViewMode; setMode(m); load(m, refDate, categoryFilter); };
  const handleMove = (dir: number) => { const next = moveRef(mode, refDate, dir); setRefDate(next); load(mode, next, categoryFilter); };
  const handleDatePick = (d: Dayjs | null) => { if (d) { setRefDate(d); load(mode, d, categoryFilter); } };
  const handleCategoryChange = (v: string) => { setCategoryFilter(v); load(mode, refDate, v); };

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
  const byCategory = data?.byCategory || [];
  const bySubCategory = data?.bySubCategory || [];
  const byFit = data?.byFit || [];
  const byLength = data?.byLength || [];
  const bySize = data?.bySize || [];
  const byColor = data?.byColor || [];
  const topProducts = data?.topProducts || [];
  const bySeason = data?.bySeason || [];

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
      <Space wrap style={{ marginBottom: 16 }}>
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
        <Select value={categoryFilter}
          onChange={handleCategoryChange} style={{ width: 130 }} size="small"
          options={[
            { label: '전체', value: '' },
            { label: 'TOP', value: 'TOP' }, { label: 'BOTTOM', value: 'BOTTOM' },
            { label: 'OUTER', value: 'OUTER' }, { label: 'DRESS', value: 'DRESS' }, { label: 'ACC', value: 'ACC' },
          ]} />
      </Space>

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

/* ═══════════════════════════════════════════
   Tab 2: 전년대비 분석 (기존 SalesAnalyticsPage)
   ═══════════════════════════════════════════ */
function YoYTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    salesApi.styleAnalytics(year)
      .then(setData)
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [year]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i)
    .map(y => ({ label: `${y}년`, value: y }));

  const totalSummary = useMemo(() => {
    if (!data?.monthlyYoY) return { cur: 0, prev: 0, curQty: 0, prevQty: 0 };
    return data.monthlyYoY.reduce((acc: any, m: any) => ({
      cur: acc.cur + Number(m.cur_amount), prev: acc.prev + Number(m.prev_amount),
      curQty: acc.curQty + Number(m.cur_qty), prevQty: acc.prevQty + Number(m.prev_qty),
    }), { cur: 0, prev: 0, curQty: 0, prevQty: 0 });
  }, [data]);

  if (loading && !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const maxCategoryAmount = Math.max(1, ...(data?.byCategory || []).map((c: any) => Number(c.cur_amount)));

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        {data?.period && (
          <span style={{ fontSize: 11, color: '#888' }}>
            비교기간: {data.period.curStart} ~ {data.period.curEnd} vs {data.period.prevStart} ~ {data.period.prevEnd}
          </span>
        )}
        <Select value={year} options={yearOptions} onChange={setYear} style={{ width: 100 }} />
      </Space>

      {/* 전체 요약 카드 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={`${year}년 매출`} value={totalSummary.cur} formatter={(v) => fmtW(Number(v))}
              valueStyle={{ fontSize: 18, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={`${year - 1}년 동기 매출`} value={totalSummary.prev} formatter={(v) => fmtW(Number(v))}
              valueStyle={{ fontSize: 16, color: '#888' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="매출 증감률" value={growthPct(totalSummary.cur, totalSummary.prev)}
              suffix="%" precision={1}
              valueStyle={{ color: growthPct(totalSummary.cur, totalSummary.prev) >= 0 ? '#cf1322' : '#3f8600', fontWeight: 700 }}
              prefix={growthPct(totalSummary.cur, totalSummary.prev) >= 0 ? <RiseOutlined /> : <FallOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="판매량 증감률" value={growthPct(totalSummary.curQty, totalSummary.prevQty)}
              suffix="%" precision={1}
              valueStyle={{ color: growthPct(totalSummary.curQty, totalSummary.prevQty) >= 0 ? '#cf1322' : '#3f8600' }}
              prefix={growthPct(totalSummary.curQty, totalSummary.prevQty) >= 0 ? <RiseOutlined /> : <FallOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* 월별 YoY 추이 */}
      <Card size="small" title={<><LineChartOutlined /> 월별 매출 전년대비</>} style={{ marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>구분</th>
                {ML.map((m, i) => <th key={i} style={{ padding: '6px 4px', textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{m}</th>)}
                <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700, background: '#e8edf5' }}>합계</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12 }}>{year}년</td>
                {ML.map((_, i) => {
                  const m = data?.monthlyYoY?.find((r: any) => r.month === String(i + 1).padStart(2, '0'));
                  return <td key={i} style={{ padding: '4px 4px', textAlign: 'right', fontSize: 12 }}>{m ? fmt(Number(m.cur_amount)) : '-'}</td>;
                })}
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontSize: 12, background: '#f0f2f5' }}>{fmtW(totalSummary.cur)}</td>
              </tr>
              <tr style={{ color: '#888' }}>
                <td style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12 }}>{year - 1}년</td>
                {ML.map((_, i) => {
                  const m = data?.monthlyYoY?.find((r: any) => r.month === String(i + 1).padStart(2, '0'));
                  return <td key={i} style={{ padding: '4px 4px', textAlign: 'right', fontSize: 12 }}>{m ? fmt(Number(m.prev_amount)) : '-'}</td>;
                })}
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontSize: 12, background: '#f0f2f5' }}>{fmtW(totalSummary.prev)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #1a3a6a' }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, fontSize: 12, color: '#1a3a6a' }}>증감률</td>
                {ML.map((_, i) => {
                  const m = data?.monthlyYoY?.find((r: any) => r.month === String(i + 1).padStart(2, '0'));
                  if (!m) return <td key={i} style={{ padding: '4px 4px', textAlign: 'right', fontSize: 11 }}>-</td>;
                  const g = growthPct(Number(m.cur_amount), Number(m.prev_amount));
                  return <td key={i} style={{ padding: '4px 4px', textAlign: 'right', fontSize: 11,
                    fontWeight: 600, color: g > 0 ? '#cf1322' : g < 0 ? '#3f8600' : '#888' }}>
                    {g > 0 ? '+' : ''}{g}%
                  </td>;
                })}
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontSize: 12, background: '#f0f2f5',
                  color: growthPct(totalSummary.cur, totalSummary.prev) >= 0 ? '#cf1322' : '#3f8600' }}>
                  {growthPct(totalSummary.cur, totalSummary.prev) > 0 ? '+' : ''}{growthPct(totalSummary.cur, totalSummary.prev)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Tabs defaultActiveKey="category" items={[
        {
          key: 'category',
          label: <><TagOutlined /> 카테고리별</>,
          children: (
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card size="small" title="카테고리별 전년대비">
                  {(data?.byCategory || []).map((c: any) => {
                    const g = growthPct(Number(c.cur_amount), Number(c.prev_amount));
                    const ratio = Number(c.cur_amount) / maxCategoryAmount * 100;
                    return (
                      <div key={c.category} style={{ marginBottom: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.category}</span>
                          {growthTag(Number(c.cur_amount), Number(c.prev_amount))}
                        </div>
                        <div style={barStyle(ratio, g >= 0 ? '#ff4d4f55' : '#1890ff55')} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, color: '#666' }}>
                          <span>{year}: <strong>{fmtW(Number(c.cur_amount))}</strong> ({fmt(Number(c.cur_qty))}개)</span>
                          <span>{year - 1}: {fmtW(Number(c.prev_amount))} ({fmt(Number(c.prev_qty))}개)</span>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="세부카테고리별 전년대비">
                  <Table
                    columns={[
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80 },
                      { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 80 },
                      { title: `${year} 매출`, key: 'cur', width: 100, align: 'right' as const,
                        render: (_: any, r: any) => fmtW(Number(r.cur_amount)) },
                      { title: `${year} 수량`, dataIndex: 'cur_qty', key: 'cq', width: 70, align: 'right' as const,
                        render: (v: number) => fmt(Number(v)) },
                      { title: '증감', key: 'growth', width: 90, align: 'center' as const,
                        render: (_: any, r: any) => growthTag(Number(r.cur_amount), Number(r.prev_amount)) },
                    ]}
                    dataSource={data?.bySubCategory || []}
                    rowKey={(r) => `${r.category}-${r.sub_category}`}
                    pagination={false} size="small" scroll={{ x: 500, y: 400 }}
                  />
                </Card>
              </Col>
            </Row>
          ),
        },
        {
          key: 'style',
          label: <><SkinOutlined /> 핏/기장/시즌</>,
          children: (
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card size="small" title="핏별 전년대비 — 스타일 평균">
                  <Table columns={[
                    { title: '핏', dataIndex: 'fit', key: 'fit', width: 70 },
                    { title: '스타일', key: 'sc', width: 55, align: 'center' as const,
                      render: (_: any, r: any) => { const ac = Number(r.active_style_count ?? r.product_count); const pc = Number(r.product_count); return <>{ac}종{pc > ac && <span style={{ color: '#ccc', fontSize: 10 }}> (-{pc - ac})</span>}</>; } },
                    { title: `${year}`, key: 'cur', width: 100, align: 'right' as const,
                      render: (_: any, r: any) => <><div style={{ fontWeight: 600 }}>{fmtW(Number(r.cur_amount))}</div><div style={{ fontSize: 10, color: '#999' }}>{fmt(Number(r.cur_qty))}개</div></> },
                    { title: '증감', key: 'g', width: 80, align: 'center' as const,
                      render: (_: any, r: any) => growthTag(Number(r.cur_amount), Number(r.prev_amount)) },
                  ]} dataSource={data?.byFit || []} rowKey="fit" pagination={false} size="small" scroll={{ x: 400 }} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" title={<><ColumnHeightOutlined /> 기장별 전년대비 — 스타일 평균</>}>
                  <Table columns={[
                    { title: '기장', dataIndex: 'length', key: 'len', width: 60 },
                    { title: '스타일', key: 'sc', width: 55, align: 'center' as const,
                      render: (_: any, r: any) => { const ac = Number(r.active_style_count ?? r.product_count); const pc = Number(r.product_count); return <>{ac}종{pc > ac && <span style={{ color: '#ccc', fontSize: 10 }}> (-{pc - ac})</span>}</>; } },
                    { title: `${year}`, key: 'cur', width: 100, align: 'right' as const,
                      render: (_: any, r: any) => <><div style={{ fontWeight: 600 }}>{fmtW(Number(r.cur_amount))}</div><div style={{ fontSize: 10, color: '#999' }}>{fmt(Number(r.cur_qty))}개</div></> },
                    { title: '증감', key: 'g', width: 80, align: 'center' as const,
                      render: (_: any, r: any) => growthTag(Number(r.cur_amount), Number(r.prev_amount)) },
                  ]} dataSource={data?.byLength || []} rowKey="length" pagination={false} size="small" scroll={{ x: 400 }} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" title="시즌별 전년대비">
                  <Table columns={[
                    { title: '시즌', dataIndex: 'season_type', key: 'season', width: 80 },
                    { title: `${year}`, key: 'cur', width: 100, align: 'right' as const,
                      render: (_: any, r: any) => <><div style={{ fontWeight: 600 }}>{fmtW(Number(r.cur_amount))}</div><div style={{ fontSize: 10, color: '#999' }}>{fmt(Number(r.cur_qty))}개</div></> },
                    { title: '증감', key: 'g', width: 80, align: 'center' as const,
                      render: (_: any, r: any) => growthTag(Number(r.cur_amount), Number(r.prev_amount)) },
                  ]} dataSource={data?.bySeason || []} rowKey="season_type" pagination={false} size="small" scroll={{ x: 350 }} />
                </Card>
              </Col>
            </Row>
          ),
        },
        {
          key: 'product',
          label: <><FireOutlined /> 제품별 증감</>,
          children: (
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card size="small" title={<><RiseOutlined style={{ color: '#cf1322' }} /> 매출 증가 TOP</>}>
                  <Table columns={[
                    { title: '상품', key: 'product', ellipsis: true,
                      render: (_: any, r: any) => <><div style={{ fontWeight: 500 }}>{r.product_name}</div><div style={{ fontSize: 10, color: '#999' }}>{r.product_code} | {r.category} {r.fit ? `| ${r.fit}` : ''}</div></> },
                    { title: `${year}`, key: 'cur', width: 100, align: 'right' as const, render: (_: any, r: any) => <strong>{fmtW(Number(r.cur_amount))}</strong> },
                    { title: `${year - 1}`, key: 'prev', width: 90, align: 'right' as const, render: (_: any, r: any) => <span style={{ color: '#888' }}>{fmtW(Number(r.prev_amount))}</span> },
                    { title: '증감률', key: 'g', width: 80, align: 'center' as const,
                      render: (_: any, r: any) => r.amount_growth !== null
                        ? <Tag color={Number(r.amount_growth) > 0 ? 'red' : 'blue'}>{Number(r.amount_growth) > 0 ? '+' : ''}{r.amount_growth}%</Tag>
                        : <Tag color="blue">NEW</Tag> },
                  ]}
                  dataSource={(data?.productGrowth || []).filter((r: any) => Number(r.cur_amount) > Number(r.prev_amount))
                    .sort((a: any, b: any) => Number(b.cur_amount) - Number(b.prev_amount) - (Number(a.cur_amount) - Number(a.prev_amount))).slice(0, 15)}
                  rowKey="product_code" pagination={false} size="small" scroll={{ x: 500 }} />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title={<><FallOutlined style={{ color: '#3f8600' }} /> 매출 감소 TOP</>}>
                  <Table columns={[
                    { title: '상품', key: 'product', ellipsis: true,
                      render: (_: any, r: any) => <><div style={{ fontWeight: 500 }}>{r.product_name}</div><div style={{ fontSize: 10, color: '#999' }}>{r.product_code} | {r.category} {r.fit ? `| ${r.fit}` : ''}</div></> },
                    { title: `${year}`, key: 'cur', width: 100, align: 'right' as const, render: (_: any, r: any) => <strong>{fmtW(Number(r.cur_amount))}</strong> },
                    { title: `${year - 1}`, key: 'prev', width: 90, align: 'right' as const, render: (_: any, r: any) => <span style={{ color: '#888' }}>{fmtW(Number(r.prev_amount))}</span> },
                    { title: '증감률', key: 'g', width: 80, align: 'center' as const,
                      render: (_: any, r: any) => r.amount_growth !== null
                        ? <Tag color={Number(r.amount_growth) > 0 ? 'red' : 'blue'}>{Number(r.amount_growth) > 0 ? '+' : ''}{r.amount_growth}%</Tag>
                        : <Tag>-</Tag> },
                  ]}
                  dataSource={(data?.productGrowth || []).filter((r: any) => Number(r.prev_amount) > 0 && Number(r.cur_amount) < Number(r.prev_amount))
                    .sort((a: any, b: any) => (Number(a.cur_amount) - Number(a.prev_amount)) - (Number(b.cur_amount) - Number(b.prev_amount))).slice(0, 15)}
                  rowKey="product_code" pagination={false} size="small" scroll={{ x: 500 }} />
                </Card>
              </Col>
              <Col xs={24}>
                <Card size="small" title="전체 제품 증감률">
                  <Table columns={[
                    { title: '코드', dataIndex: 'product_code', key: 'code', width: 100 },
                    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 140, ellipsis: true },
                    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80 },
                    { title: '핏', dataIndex: 'fit', key: 'fit', width: 80, render: (v: string) => v || '-' },
                    { title: '기장', dataIndex: 'length', key: 'len', width: 70, render: (v: string) => v || '-' },
                    { title: `${year} 수량`, dataIndex: 'cur_qty', key: 'cq', width: 80, align: 'right' as const, render: (v: number) => fmt(Number(v)) },
                    { title: `${year} 매출`, key: 'ca', width: 100, align: 'right' as const, render: (_: any, r: any) => fmtW(Number(r.cur_amount)) },
                    { title: `${year - 1} 수량`, dataIndex: 'prev_qty', key: 'pq', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: '#888' }}>{fmt(Number(v))}</span> },
                    { title: `${year - 1} 매출`, key: 'pa', width: 100, align: 'right' as const, render: (_: any, r: any) => <span style={{ color: '#888' }}>{fmtW(Number(r.prev_amount))}</span> },
                    { title: '수량 증감', key: 'qg', width: 80, align: 'center' as const, render: (_: any, r: any) => growthTag(Number(r.cur_qty), Number(r.prev_qty)) },
                    { title: '매출 증감', key: 'ag', width: 80, align: 'center' as const, render: (_: any, r: any) => growthTag(Number(r.cur_amount), Number(r.prev_amount)) },
                  ]}
                  dataSource={data?.productGrowth || []}
                  rowKey="product_code"
                  pagination={{ pageSize: 50, size: 'small', showTotal: (t: number) => `총 ${t}개 제품` }}
                  size="small" scroll={{ x: 1000 }}
                  />
                </Card>
              </Col>
            </Row>
          ),
        },
        {
          key: 'variant',
          label: <><BgColorsOutlined /> 사이즈/컬러</>,
          children: (
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card size="small" title="사이즈별 판매 비중">
                  {(() => {
                    const totalQty = (data?.bySize || []).reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                    return (data?.bySize || []).map((r: any) => {
                      const pct = totalQty > 0 ? (Number(r.total_qty) / totalQty * 100) : 0;
                      return (
                        <div key={r.size} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontWeight: 600 }}>{r.size}</span>
                            <span style={{ fontSize: 12, color: '#666' }}>{fmt(Number(r.total_qty))}개 ({pct.toFixed(1)}%)</span>
                          </div>
                          <Progress percent={Number(pct.toFixed(1))} showInfo={false} size="small"
                            strokeColor={pct > 25 ? '#1677ff' : pct > 15 ? '#69b1ff' : '#91caff'} />
                          <div style={{ fontSize: 11, color: '#999' }}>{fmtW(Number(r.total_amount))}</div>
                        </div>
                      );
                    });
                  })()}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title="컬러별 판매 TOP 15">
                  {(() => {
                    const totalQty = (data?.byColor || []).reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                    const colors: Record<string, string> = {
                      BK: '#000', WH: '#ccc', NV: '#001f6b', GR: '#52c41a', BE: '#d4b896',
                      RD: '#ff4d4f', BL: '#1890ff', BR: '#8b4513', PK: '#ff69b4', GY: '#999',
                      CR: '#fffdd0', IV: '#fffff0', KH: '#546b3e', WN: '#722f37',
                    };
                    return (data?.byColor || []).map((r: any) => {
                      const pct = totalQty > 0 ? (Number(r.total_qty) / totalQty * 100) : 0;
                      const bg = colors[r.color] || '#1890ff';
                      return (
                        <div key={r.color} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '4px 0' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 4, background: bg, border: '1px solid #ddd', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, width: 40 }}>{r.color}</span>
                          <div style={{ flex: 1 }}>
                            <div style={barStyle(pct * 3, bg + '66')} />
                          </div>
                          <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>{fmt(Number(r.total_qty))}개 ({pct.toFixed(1)}%)</span>
                        </div>
                      );
                    });
                  })()}
                </Card>
              </Col>
            </Row>
          ),
        },
      ]} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   메인 컴포넌트: 판매분석
   ═══════════════════════════════════════════ */
export default function SalesAnalyticsPage() {
  return (
    <div>
      <PageHeader title="판매분석" />
      <Tabs
        defaultActiveKey="period"
        type="card"
        items={[
          {
            key: 'period',
            label: <><CalendarOutlined /> 기간별 현황</>,
            children: <PeriodTab />,
          },
          {
            key: 'yoy',
            label: <><LineChartOutlined /> 전년대비 분석</>,
            children: <YoYTab />,
          },
        ]}
      />
    </div>
  );
}
