import { useEffect, useState } from 'react';
import { Card, Tag, DatePicker, Space, Spin, message, Row, Col, Table, Segmented, Button, Progress } from 'antd';
import {
  SkinOutlined, LeftOutlined, RightOutlined, TagOutlined,
  DollarOutlined, ShoppingCartOutlined, ColumnHeightOutlined,
  BgColorsOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { salesApi } from '../../modules/sales/sales.api';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

const fmt = (v: number) => Number(v).toLocaleString();
const fmtW = (v: number) => `${fmt(v)}원`;

const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4',
};
const SEASON_COLORS: Record<string, string> = {
  '봄/가을': '#10b981', '여름': '#f59e0b', '겨울': '#3b82f6', '기타': '#94a3b8',
};
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

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

/* Bar component for style breakdowns */
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

export default function StyleSalesPage() {
  const [mode, setMode] = useState<ViewMode>('daily');
  const [refDate, setRefDate] = useState<Dayjs>(dayjs());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const range = getRange(mode, refDate);

  const load = async (m: ViewMode, ref: Dayjs) => {
    setLoading(true);
    try {
      const r = getRange(m, ref);
      const result = await salesApi.styleByRange(r.from, r.to);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(mode, refDate); }, []);

  const handleModeChange = (v: string) => {
    const m = v as ViewMode;
    setMode(m);
    load(m, refDate);
  };

  const handleMove = (dir: number) => {
    const next = moveRef(mode, refDate, dir);
    setRefDate(next);
    load(mode, next);
  };

  const handleDatePick = (d: Dayjs | null) => {
    if (d) { setRefDate(d); load(mode, d); }
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
  const maxFitAmt = Math.max(1, ...byFit.map((f: any) => Number(f.total_amount)));
  const maxLenAmt = Math.max(1, ...byLength.map((l: any) => Number(l.total_amount)));
  const totalSizeQty = bySize.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
  const totalColorQty = byColor.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
  const grandSeasonAmt = bySeason.reduce((s: number, r: any) => s + Number(r.total_amount), 0);

  return (
    <div style={{ maxWidth: 1200 }}>
      <Card
        title={
          <Space>
            <SkinOutlined />
            <span>스타일별 판매현황</span>
          </Space>
        }
        extra={
          <Space wrap>
            <Segmented
              value={mode}
              onChange={handleModeChange}
              options={[
                { label: '일별', value: 'daily' },
                { label: '주별', value: 'weekly' },
                { label: '월별', value: 'monthly' },
              ]}
              size="small"
            />
            <Button size="small" icon={<LeftOutlined />} onClick={() => handleMove(-1)} />
            <DatePicker
              value={refDate}
              onChange={handleDatePick}
              picker={pickerType}
              allowClear={false}
              style={{ width: mode === 'monthly' ? 130 : 150 }}
              size="small"
            />
            <Button size="small" icon={<RightOutlined />} onClick={() => handleMove(1)}
              disabled={isForwardDisabled()} />
            <Tag color="blue" style={{ fontSize: 12, padding: '1px 8px', margin: 0 }}>
              {range.label}
            </Tag>
          </Space>
        }
      >
        {loading && !data ? (
          <Spin style={{ display: 'block', margin: '60px auto' }} />
        ) : (
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
                <Card size="small" title={<><TagOutlined style={{ marginRight: 6 }} />카테고리별 매출</>}
                  style={{ height: '100%' }}>
                  {byCategory.length > 0 ? byCategory.map((c: any) => (
                    <StyleBar
                      key={c.category}
                      label={c.category}
                      value={Number(c.total_amount)}
                      maxValue={maxCatAmt}
                      color={CAT_COLORS[c.category] || '#94a3b8'}
                      sub={`${fmt(Number(c.total_qty))}개 / ${c.product_count}종`}
                    />
                  )) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title="세부카테고리별 매출" style={{ height: '100%' }}>
                  <Table
                    columns={[
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                        render: (v: string) => <Tag color={CAT_COLORS[v] ? undefined : 'default'} style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag> },
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
                    pagination={false}
                    size="small"
                    scroll={{ y: 300 }}
                  />
                </Card>
              </Col>
            </Row>

            {/* 핏별 + 기장별 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} md={12}>
                <Card size="small" title={<><SkinOutlined style={{ marginRight: 6 }} />핏별 매출</>}
                  style={{ height: '100%' }}>
                  {byFit.length > 0 ? byFit.map((f: any, i: number) => (
                    <StyleBar
                      key={f.fit}
                      label={f.fit}
                      value={Number(f.total_amount)}
                      maxValue={maxFitAmt}
                      color={COLORS[i % COLORS.length]}
                      sub={`${fmt(Number(f.total_qty))}개 / ${f.product_count}종`}
                    />
                  )) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title={<><ColumnHeightOutlined style={{ marginRight: 6 }} />기장별 매출</>}
                  style={{ height: '100%' }}>
                  {byLength.length > 0 ? byLength.map((l: any, i: number) => (
                    <StyleBar
                      key={l.length}
                      label={l.length}
                      value={Number(l.total_amount)}
                      maxValue={maxLenAmt}
                      color={COLORS[(i + 3) % COLORS.length]}
                      sub={`${fmt(Number(l.total_qty))}개 / ${l.product_count}종`}
                    />
                  )) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>}
                </Card>
              </Col>
            </Row>

            {/* 시즌별 */}
            {bySeason.length > 0 && (
              <Card size="small" title={<><CalendarOutlined style={{ marginRight: 6 }} />시즌별 매출 비중</>}
                style={{ marginBottom: 16 }}>
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
                <Card size="small" title={<><BgColorsOutlined style={{ marginRight: 6 }} />컬러별 판매 TOP</>}
                  style={{ height: '100%' }}>
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
                    { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110 },
                    { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                      render: (v: string) => <Tag color={CAT_COLORS[v] ? undefined : 'default'}
                        style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag>,
                      filters: [...new Set(topProducts.map((p: any) => p.category))].map((v: any) => ({ text: v, value: v })),
                      onFilter: (v: any, r: any) => r.category === v },
                    { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 75,
                      render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                    { title: '핏', dataIndex: 'fit', key: 'fit', width: 70,
                      render: (v: string) => v || '-' },
                    { title: '기장', dataIndex: 'length', key: 'len', width: 70,
                      render: (v: string) => v || '-' },
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
                  pagination={false}
                  size="small"
                  scroll={{ x: 900 }}
                />
              </Card>
            )}

            {byCategory.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                해당 기간에 판매 내역이 없습니다.
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
