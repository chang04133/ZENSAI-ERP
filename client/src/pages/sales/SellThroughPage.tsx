import { useEffect, useState } from 'react';
import { Card, Tag, DatePicker, Space, Spin, message, Row, Col, Table, Segmented, Button, Progress, Select } from 'antd';
import {
  PercentageOutlined, ShoppingCartOutlined, InboxOutlined, SkinOutlined,
  DownOutlined, RightOutlined, CalendarOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import { salesApi } from '../../modules/sales/sales.api';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const fmt = (v: number) => Number(v).toLocaleString();

const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4',
};
const COLOR_MAP: Record<string, string> = {
  BK: '#000', WH: '#ccc', NV: '#001f6b', GR: '#52c41a', BE: '#d4b896',
  RD: '#ff4d4f', BL: '#1890ff', BR: '#8b4513', PK: '#ff69b4', GY: '#999',
  CR: '#fffdd0', IV: '#fffff0', KH: '#546b3e', WN: '#722f37',
};

const AGE_COLORS: Record<string, { color: string; bg: string }> = {
  '신상': { color: '#1890ff', bg: '#e6f7ff' },
  '1년차': { color: '#52c41a', bg: '#f6ffed' },
  '2년차': { color: '#fa8c16', bg: '#fff7e6' },
  '3년차': { color: '#fa541c', bg: '#fff2e8' },
  '4년차': { color: '#cf1322', bg: '#fff1f0' },
  '5년차': { color: '#8c8c8c', bg: '#fafafa' },
  '미지정': { color: '#999', bg: '#fafafa' },
};
const getAgeColor = (ag: string) => AGE_COLORS[ag] || { color: '#8c8c8c', bg: '#fafafa' };

const SEASON_SUFFIX: Record<string, string> = {
  SA: '봄/가을', SM: '여름', WN: '겨울', FW: '가을/겨울', SS: '봄/여름',
};

const rateColor = (rate: number) => {
  if (rate >= 80) return '#52c41a';
  if (rate >= 50) return '#1890ff';
  if (rate >= 30) return '#fa8c16';
  return '#ff4d4f';
};
const rateBg = (rate: number) => {
  if (rate >= 80) return '#f6ffed';
  if (rate >= 50) return '#e6f7ff';
  if (rate >= 30) return '#fff7e6';
  return '#fff1f0';
};

const seasonLabel = (s: string) => {
  if (!s || s === '미지정') return '미지정';
  const year = s.substring(0, 4);
  const suffix = s.substring(4);
  return `${year} ${SEASON_SUFFIX[suffix] || suffix}`;
};

type ViewTab = 'season' | 'product' | 'category' | 'daily' | 'drop_milestone' | 'drop_cohort' | 'velocity';

const QUICK_RANGES: { label: string; from: Dayjs; to: Dayjs }[] = [
  { label: '이번달', from: dayjs().startOf('month'), to: dayjs() },
  { label: '최근 3개월', from: dayjs().subtract(3, 'month').add(1, 'day'), to: dayjs() },
  { label: '최근 6개월', from: dayjs().subtract(6, 'month').add(1, 'day'), to: dayjs() },
  { label: '올해', from: dayjs().startOf('year'), to: dayjs() },
  { label: '작년', from: dayjs().subtract(1, 'year').startOf('year'), to: dayjs().subtract(1, 'year').endOf('year') },
];

export default function SellThroughPage() {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('year'), dayjs()]);
  const [viewTab, setViewTab] = useState<ViewTab>('season');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [showCustomRange, setShowCustomRange] = useState(false);

  // 드랍 분석 데이터
  const [dropData, setDropData] = useState<any>(null);
  const [dropLoading, setDropLoading] = useState(false);

  const loadDropData = async (cat?: string | '') => {
    if (dropLoading) return;
    setDropLoading(true);
    try {
      const result = await salesApi.dropAnalysis(cat || undefined);
      setDropData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setDropLoading(false); }
  };

  const load = async (from: Dayjs, to: Dayjs, cat?: string | '') => {
    setLoading(true);
    try {
      const result = await salesApi.sellThrough(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), cat || undefined);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(dateRange[0], dateRange[1], categoryFilter); }, []);

  const handleRangeChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
      load(dates[0], dates[1], categoryFilter);
    }
  };
  const handleQuickRange = (from: Dayjs, to: Dayjs) => {
    setDateRange([from, to]);
    setShowCustomRange(false);
    load(from, to, categoryFilter);
  };
  const handleCategoryChange = (v: string) => {
    setCategoryFilter(v);
    load(dateRange[0], dateRange[1], v);
    // 드랍 탭이 활성화 상태면 드랍 데이터도 재로드
    if (['drop_milestone', 'drop_cohort', 'velocity'].includes(viewTab)) {
      setDropData(null);
      loadDropData(v);
    }
  };

  const totals = data?.totals || {};
  const byProduct = data?.byProduct || [];
  const byVariant = data?.byVariant || [];
  const byCategory = data?.byCategory || [];
  const bySeason = data?.bySeason || [];
  const byAge = data?.byAge || [];
  const daily = data?.daily || [];
  const dailyByCategory = data?.dailyByCategory || [];
  const dailyByProduct = data?.dailyByProduct || [];

  // 신상 vs 1년차 비교
  const newRate = byAge.find((a: any) => a.age_group === '신상')?.sell_through_rate || 0;
  const oneYearRate = byAge.find((a: any) => a.age_group === '1년차')?.sell_through_rate || 0;
  const yoyDelta = newRate - oneYearRate;

  // 제품 클릭 시 인라인 확장
  const toggleExpand = (code: string) => {
    setExpandedKeys((prev) =>
      prev.includes(code) ? prev.filter((k) => k !== code) : [...prev, code],
    );
  };

  const variantsForProduct = (code: string) =>
    byVariant.filter((v: any) => v.product_code === code);

  const expandedRowRender = (record: any) => {
    const variants = variantsForProduct(record.product_code);
    if (variants.length === 0) return <div style={{ padding: 12, color: '#aaa' }}>변형 데이터가 없습니다.</div>;

    const colorGroups: Record<string, any[]> = {};
    for (const v of variants) {
      if (!colorGroups[v.color]) colorGroups[v.color] = [];
      colorGroups[v.color].push(v);
    }

    return (
      <div style={{ padding: '4px 0 4px 32px' }}>
        {Object.entries(colorGroups).map(([color, items]) => {
          const bg = COLOR_MAP[color] || '#1890ff';
          const colorSold = items.reduce((s: number, r: any) => s + Number(r.sold_qty), 0);
          const colorStock = items.reduce((s: number, r: any) => s + Number(r.current_stock), 0);
          const colorRate = (colorSold + colorStock) > 0
            ? Math.round(colorSold / (colorSold + colorStock) * 1000) / 10 : 0;
          return (
            <div key={color} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: bg, border: '1px solid #ddd', flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{color}</span>
                <span style={{ fontSize: 12, color: '#888' }}>
                  판매 {fmt(colorSold)} / 재고 {fmt(colorStock)}
                </span>
                <Tag color={colorRate >= 80 ? 'green' : colorRate >= 50 ? 'blue' : colorRate >= 30 ? 'orange' : 'red'}
                  style={{ fontWeight: 700, fontSize: 11 }}>{colorRate}%</Tag>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 24 }}>
                {items.map((item: any) => {
                  const rate = Number(item.sell_through_rate);
                  const sold = Number(item.sold_qty);
                  const stock = Number(item.current_stock);
                  return (
                    <div key={item.sku} style={{
                      border: `1px solid ${rateColor(rate)}44`,
                      background: rateBg(rate),
                      borderRadius: 8, padding: '6px 10px', minWidth: 80, textAlign: 'center',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#333' }}>{item.size}</div>
                      <div style={{
                        fontSize: 15, fontWeight: 800, color: rateColor(rate), margin: '2px 0',
                      }}>{rate}%</div>
                      <div style={{ fontSize: 11, color: '#666' }}>
                        <span style={{ color: '#1890ff' }}>{sold}</span>
                        <span style={{ color: '#aaa' }}> / </span>
                        <span style={{ color: '#fa8c16' }}>{stock}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const rangeLabel = `${dateRange[0].format('YYYY.MM.DD')} ~ ${dateRange[1].format('YYYY.MM.DD')}`;

  return (
    <div>
      <Card
        title={<Space><PercentageOutlined /><span>판매율 분석</span></Space>}
        extra={
          <Select
            value={categoryFilter} onChange={handleCategoryChange}
            style={{ width: 110 }} size="small"
            options={[
              { label: '전체', value: '' },
              { label: 'TOP', value: 'TOP' },
              { label: 'BOTTOM', value: 'BOTTOM' },
              { label: 'OUTER', value: 'OUTER' },
              { label: 'DRESS', value: 'DRESS' },
              { label: 'ACC', value: 'ACC' },
            ]}
          />
        }
      >
        {loading && !data ? (
          <Spin style={{ display: 'block', margin: '60px auto' }} />
        ) : (
          <>
            {/* 기간 선택 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {QUICK_RANGES.map((q) => {
                const isActive = dateRange[0].format('YYYY-MM-DD') === q.from.format('YYYY-MM-DD') &&
                  dateRange[1].format('YYYY-MM-DD') === q.to.format('YYYY-MM-DD') && !showCustomRange;
                return (
                  <Button key={q.label} size="small" type={isActive ? 'primary' : 'default'}
                    onClick={() => handleQuickRange(q.from, q.to)}>
                    {q.label}
                  </Button>
                );
              })}
              <Button size="small" icon={<CalendarOutlined />}
                type={showCustomRange ? 'primary' : 'default'}
                onClick={() => setShowCustomRange(!showCustomRange)}>
                직접입력
              </Button>
              {showCustomRange && (
                <RangePicker
                  value={dateRange}
                  onChange={handleRangeChange}
                  size="small"
                  style={{ width: 240 }}
                  allowClear={false}
                />
              )}
              <span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>
                {rangeLabel}
              </span>
            </div>

            {/* 연차별 판매율 카드 */}
            <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
              {/* 전체 판매율 */}
              <Col xs={12} sm={8} md={4}>
                <div style={{
                  background: rateBg(totals.overall_rate || 0), borderRadius: 10,
                  padding: '12px 14px', border: `1px solid ${rateColor(totals.overall_rate || 0)}33`,
                  height: '100%',
                }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>전체 판매율</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: rateColor(totals.overall_rate || 0), lineHeight: 1.2 }}>
                    {totals.overall_rate || 0}%
                  </div>
                  <Progress percent={totals.overall_rate || 0} showInfo={false} size="small"
                    strokeColor={rateColor(totals.overall_rate || 0)} style={{ marginTop: 4 }} />
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                    {fmt(totals.total_sold || 0)}판매 / {fmt(totals.total_stock || 0)}재고
                  </div>
                </div>
              </Col>
              {/* 연차별 카드 */}
              {byAge.filter((a: any) => a.age_group !== '미지정').map((a: any) => {
                const ac = getAgeColor(a.age_group);
                const rate = Number(a.sell_through_rate);
                return (
                  <Col xs={12} sm={8} md={4} key={a.age_group}>
                    <div style={{
                      background: ac.bg, borderRadius: 10, padding: '12px 14px',
                      border: `1px solid ${ac.color}33`, height: '100%',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 11, color: '#888' }}>{a.age_group} 판매율</div>
                        {a.age_group === '신상' && oneYearRate > 0 && (
                          <Tag color={yoyDelta >= 0 ? 'green' : 'red'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                            {yoyDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                            {Math.abs(yoyDelta).toFixed(1)}%p
                          </Tag>
                        )}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: ac.color, lineHeight: 1.2 }}>
                        {rate}%
                      </div>
                      <Progress percent={rate} showInfo={false} size="small"
                        strokeColor={ac.color} style={{ marginTop: 4 }} />
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        {a.product_count}종 · {fmt(a.sold_qty)}판매 / {fmt(a.current_stock)}재고
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>

            {/* 작년대비 신상 비교 인라인 */}
            {oneYearRate > 0 && (
              <div style={{
                background: '#f5f5f5', borderRadius: 8, padding: '8px 14px', marginBottom: 14,
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}>
                <span style={{ color: '#888' }}>신상 vs 1년차 비교:</span>
                <span>신상 <strong style={{ color: AGE_COLORS['신상'].color }}>{newRate}%</strong></span>
                <span style={{ color: '#aaa' }}>→</span>
                <span>1년차 <strong style={{ color: AGE_COLORS['1년차'].color }}>{oneYearRate}%</strong></span>
                <Tag color={yoyDelta >= 0 ? 'green' : 'red'} style={{ fontWeight: 700 }}>
                  {yoyDelta >= 0 ? '+' : ''}{yoyDelta.toFixed(1)}%p
                </Tag>
                <span style={{ fontSize: 11, color: '#999' }}>
                  (신상 판매율이 1년차 재고 대비 {yoyDelta >= 0 ? '높음' : '낮음'})
                </span>
              </div>
            )}

            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              {viewTab === 'velocity'
                ? '첫 입고일 기준 | 보정판매 = 판매 / (경과일 × 시즌가중치) | 가중치: 시스템설정 > 시즌 수요 가중치'
                : ['drop_milestone', 'drop_cohort'].includes(viewTab)
                ? '첫 입고일 기준 | 판매율 = 총판매 / 총공급량(초기입고+리오더) × 100'
                : `${rangeLabel} 기준 | 판매율 = 판매수량 / (판매수량 + 현재재고) x 100`}
            </div>

            {/* 뷰 탭 전환 */}
            <Segmented
              value={viewTab}
              onChange={(v) => {
                const tab = v as ViewTab;
                setViewTab(tab);
                if (['drop_milestone', 'drop_cohort', 'velocity'].includes(tab) && !dropData) {
                  loadDropData(categoryFilter);
                }
              }}
              options={[
                { label: '시즌/연차별', value: 'season' },
                { label: '품번별', value: 'product' },
                { label: '카테고리별', value: 'category' },
                { label: '일자별', value: 'daily' },
                { label: '드랍별 소화율', value: 'drop_milestone' },
                { label: '드랍회차 비교', value: 'drop_cohort' },
                { label: '판매속도 순위', value: 'velocity' },
              ]}
              style={{ marginBottom: 16 }}
            />

            {/* 시즌/연차별 탭 */}
            {viewTab === 'season' && (
              <>
                {/* 연차별 테이블 */}
                <Table
                  columns={[
                    { title: '연차', dataIndex: 'age_group', key: 'age', width: 100,
                      render: (v: string) => {
                        const ac = getAgeColor(v);
                        return <Tag color={ac.color} style={{ fontWeight: 700 }}>{v}</Tag>;
                      } },
                    { title: '상품수', dataIndex: 'product_count', key: 'pc', width: 80, align: 'center' as const,
                      render: (v: number) => `${v}종` },
                    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 100, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong> },
                    { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 100, align: 'right' as const,
                      render: (v: number) => fmt(v) },
                    { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 180, align: 'center' as const,
                      render: (v: number) => {
                        const n = Number(v);
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <div style={{
                              background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
                              borderRadius: 6, padding: '2px 10px', fontWeight: 800, fontSize: 14,
                              color: rateColor(n), minWidth: 52, textAlign: 'center',
                            }}>{n}%</div>
                            <Progress percent={n} showInfo={false} size="small"
                              strokeColor={rateColor(n)} style={{ width: 70, margin: 0 }} />
                          </div>
                        );
                      },
                      sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate) },
                  ]}
                  dataSource={byAge}
                  rowKey="age_group"
                  size="small"
                  pagination={false}
                  style={{ marginBottom: 20 }}
                />

                {/* 시즌별 테이블 */}
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>시즌별 판매율</div>
                <Table
                  columns={[
                    { title: '시즌', dataIndex: 'season', key: 'season', width: 140,
                      render: (v: string) => <strong>{seasonLabel(v)}</strong> },
                    { title: '연차', key: 'age', width: 80,
                      render: (_: any, r: any) => {
                        const year = parseInt((r.season || '').substring(0, 4));
                        const diff = new Date().getFullYear() - year;
                        const ag = isNaN(diff) ? '미지정' : diff <= 0 ? '신상' : `${diff}년차`;
                        const ac = getAgeColor(ag);
                        return <Tag style={{ color: ac.color, borderColor: ac.color, fontSize: 11 }}>{ag}</Tag>;
                      } },
                    { title: '상품수', dataIndex: 'product_count', key: 'pc', width: 80, align: 'center' as const,
                      render: (v: number) => `${v}종` },
                    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 100, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong>,
                      sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
                    { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 100, align: 'right' as const,
                      render: (v: number) => fmt(v),
                      sorter: (a: any, b: any) => a.current_stock - b.current_stock },
                    { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 180, align: 'center' as const,
                      render: (v: number) => {
                        const n = Number(v);
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <div style={{
                              background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
                              borderRadius: 6, padding: '2px 10px', fontWeight: 800, fontSize: 14,
                              color: rateColor(n), minWidth: 52, textAlign: 'center',
                            }}>{n}%</div>
                            <Progress percent={n} showInfo={false} size="small"
                              strokeColor={rateColor(n)} style={{ width: 70, margin: 0 }} />
                          </div>
                        );
                      },
                      sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate),
                      defaultSortOrder: 'descend' as const },
                  ]}
                  dataSource={bySeason}
                  rowKey="season"
                  size="small"
                  pagination={false}
                  scroll={{ x: 700 }}
                />
              </>
            )}

            {/* 품번별 탭 */}
            {viewTab === 'product' && (
              <Table
                columns={[
                  { title: '', key: 'expand', width: 36,
                    render: (_: any, r: any) => (
                      <span style={{ cursor: 'pointer', color: '#999' }}
                        onClick={() => toggleExpand(r.product_code)}>
                        {expandedKeys.includes(r.product_code) ? <DownOutlined /> : <RightOutlined />}
                      </span>
                    ) },
                  { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                    render: (v: string) => (
                      <a onClick={() => toggleExpand(v)} style={{ fontWeight: 600 }}>{v}</a>
                    ) },
                  { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true,
                    render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                    render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v || '-'}</Tag>,
                    filters: [...new Set(byProduct.map((p: any) => p.category))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
                    onFilter: (v: any, r: any) => r.category === v },
                  { title: '시즌', dataIndex: 'season', key: 'season', width: 90,
                    render: (v: string) => v ? <Tag>{v}</Tag> : '-',
                    filters: [...new Set(byProduct.map((p: any) => p.season))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
                    onFilter: (v: any, r: any) => r.season === v },
                  { title: '판매', dataIndex: 'sold_qty', key: 'sold', width: 75, align: 'right' as const,
                    render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong>,
                    sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
                  { title: '재고', dataIndex: 'current_stock', key: 'stock', width: 75, align: 'right' as const,
                    render: (v: number) => <span style={{ color: Number(v) === 0 ? '#ff4d4f' : '#666' }}>{fmt(v)}</span>,
                    sorter: (a: any, b: any) => a.current_stock - b.current_stock },
                  { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 140, align: 'center' as const,
                    render: (v: number) => {
                      const n = Number(v);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          <div style={{
                            background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
                            borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 13,
                            color: rateColor(n), minWidth: 48, textAlign: 'center',
                          }}>{n}%</div>
                          <Progress percent={n} showInfo={false} size="small"
                            strokeColor={rateColor(n)} style={{ width: 50, margin: 0 }} />
                        </div>
                      );
                    },
                    sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate),
                    defaultSortOrder: 'descend' as const },
                ]}
                dataSource={byProduct}
                rowKey="product_code"
                size="small"
                scroll={{ x: 900, y: 'calc(100vh - 420px)' }}
                pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                expandable={{
                  expandedRowKeys: expandedKeys,
                  onExpand: (_, record) => toggleExpand(record.product_code),
                  expandedRowRender,
                  expandIcon: () => null,
                  expandRowByClick: false,
                }}
              />
            )}

            {/* 카테고리별 탭 */}
            {viewTab === 'category' && (
              <>
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  {byCategory.map((c: any) => {
                    const rate = Number(c.sell_through_rate);
                    return (
                      <Col xs={12} sm={8} md={6} key={c.category}>
                        <Card size="small" style={{ textAlign: 'center', border: `1px solid ${rateColor(rate)}33` }}>
                          <Tag style={CAT_COLORS[c.category] ? { color: CAT_COLORS[c.category], borderColor: CAT_COLORS[c.category], marginBottom: 8, fontWeight: 600 } : { marginBottom: 8 }}>
                            {c.category}
                          </Tag>
                          <Progress type="circle" percent={rate} size={80}
                            strokeColor={rateColor(rate)}
                            format={(p) => <span style={{ fontSize: 16, fontWeight: 700 }}>{p}%</span>} />
                          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                            판매 <strong style={{ color: '#1890ff' }}>{fmt(Number(c.sold_qty))}</strong> / 재고 <strong style={{ color: '#fa8c16' }}>{fmt(Number(c.current_stock))}</strong>
                          </div>
                          <div style={{ fontSize: 11, color: '#999' }}>{c.product_count}종</div>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
                <Table
                  columns={[
                    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 100,
                      render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v], fontWeight: 600 } : {}}>{v}</Tag> },
                    { title: '상품수', dataIndex: 'product_count', key: 'pc', width: 80, align: 'center' as const,
                      render: (v: number) => `${v}종` },
                    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 100, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(Number(v))}</strong> },
                    { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 100, align: 'right' as const,
                      render: (v: number) => fmt(Number(v)) },
                    { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 150, align: 'center' as const,
                      render: (v: number) => {
                        const n = Number(v);
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <div style={{
                              background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
                              borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 13,
                              color: rateColor(n), minWidth: 48, textAlign: 'center',
                            }}>{n}%</div>
                            <Progress percent={n} showInfo={false} size="small"
                              strokeColor={rateColor(n)} style={{ width: 60, margin: 0 }} />
                          </div>
                        );
                      },
                      sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate),
                      defaultSortOrder: 'descend' as const },
                  ]}
                  dataSource={byCategory}
                  rowKey="category"
                  size="small"
                  pagination={false}
                />
              </>
            )}

            {/* 일자별 탭 */}
            {viewTab === 'daily' && (
              <>
                <Card size="small" title="일자별 판매 추이" style={{ marginBottom: 16 }}>
                  <Table
                    columns={[
                      { title: '날짜', dataIndex: 'date', key: 'date', width: 120,
                        render: (v: string) => <strong>{v}</strong> },
                      { title: '판매수량', dataIndex: 'daily_sold_qty', key: 'qty', width: 100, align: 'right' as const,
                        render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong>,
                        sorter: (a: any, b: any) => a.daily_sold_qty - b.daily_sold_qty },
                      { title: '판매상품', dataIndex: 'product_count', key: 'pc', width: 90, align: 'center' as const,
                        render: (v: number) => `${v}종` },
                    ]}
                    dataSource={daily}
                    rowKey="date"
                    size="small"
                    pagination={false}
                    scroll={{ y: 200 }}
                  />
                </Card>

                <Card size="small" title="일자별 카테고리별 판매" style={{ marginBottom: 16 }}>
                  <Table
                    columns={[
                      { title: '날짜', dataIndex: 'date', key: 'date', width: 120 },
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 100,
                        render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag>,
                        filters: [...new Set(dailyByCategory.map((r: any) => r.category))].map((v: any) => ({ text: v, value: v })),
                        onFilter: (v: any, r: any) => r.category === v },
                      { title: '판매수량', dataIndex: 'daily_sold_qty', key: 'qty', width: 100, align: 'right' as const,
                        render: (v: number) => <strong>{fmt(v)}</strong>,
                        sorter: (a: any, b: any) => a.daily_sold_qty - b.daily_sold_qty },
                    ]}
                    dataSource={dailyByCategory}
                    rowKey={(r) => `${r.date}-${r.category}`}
                    size="small"
                    scroll={{ x: 500, y: 'calc(100vh - 480px)' }}
                    pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                  />
                </Card>

                <Card size="small" title="일자별 아이템별 판매">
                  <Table
                    columns={[
                      { title: '날짜', dataIndex: 'date', key: 'date', width: 110 },
                      { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120 },
                      { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                        render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v || '-'}</Tag>,
                        filters: [...new Set(dailyByProduct.map((r: any) => r.category))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
                        onFilter: (v: any, r: any) => r.category === v },
                      { title: '판매수량', dataIndex: 'daily_sold_qty', key: 'qty', width: 90, align: 'right' as const,
                        render: (v: number) => <strong>{fmt(v)}</strong>,
                        sorter: (a: any, b: any) => a.daily_sold_qty - b.daily_sold_qty,
                        defaultSortOrder: 'descend' as const },
                    ]}
                    dataSource={dailyByProduct}
                    rowKey={(r) => `${r.date}-${r.product_code}`}
                    size="small"
                    scroll={{ x: 700, y: 'calc(100vh - 340px)' }}
                    pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                  />
                </Card>
              </>
            )}

            {/* 드랍별 소화율 탭 */}
            {viewTab === 'drop_milestone' && (
              dropLoading && !dropData ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
                <Table
                  columns={[
                    { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                      render: (v: string) => <strong>{v}</strong> },
                    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
                    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                      render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag>,
                      filters: [...new Set((dropData?.milestones || []).map((p: any) => p.category))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
                      onFilter: (v: any, r: any) => r.category === v },
                    { title: '출시일', dataIndex: 'launch_date', key: 'launch', width: 100,
                      sorter: (a: any, b: any) => a.launch_date.localeCompare(b.launch_date) },
                    { title: '경과일', dataIndex: 'days_since_launch', key: 'days', width: 70, align: 'center' as const,
                      render: (v: number) => <span style={{ color: '#888' }}>{v}일</span>,
                      sorter: (a: any, b: any) => a.days_since_launch - b.days_since_launch },
                    { title: '총공급', dataIndex: 'total_supplied', key: 'supply', width: 75, align: 'right' as const,
                      render: (v: number) => <strong>{fmt(v)}</strong>,
                      sorter: (a: any, b: any) => a.total_supplied - b.total_supplied },
                    { title: '초기/리오더', key: 'breakdown', width: 95, align: 'center' as const,
                      render: (_: any, r: any) => (
                        <span style={{ fontSize: 11 }}>
                          {fmt(Number(r.initial_supply))}
                          {Number(r.reorder_supply) > 0 && <span style={{ color: '#fa8c16' }}> +{fmt(Number(r.reorder_supply))}</span>}
                        </span>
                      ) },
                    ...[
                      { key: '7d', title: '7일', field: 'rate_7d' },
                      { key: '14d', title: '14일', field: 'rate_14d' },
                      { key: '30d', title: '30일', field: 'rate_30d' },
                      { key: '60d', title: '60일', field: 'rate_60d' },
                      { key: '90d', title: '90일', field: 'rate_90d' },
                    ].map((m) => ({
                      title: m.title, dataIndex: m.field, key: m.key, width: 72, align: 'center' as const,
                      render: (v: number | null) => v == null ? <span style={{ color: '#ddd' }}>-</span> : (
                        <div style={{
                          background: rateBg(v), border: `1px solid ${rateColor(v)}33`,
                          borderRadius: 4, padding: '1px 6px', fontWeight: 700, fontSize: 12,
                          color: rateColor(v), display: 'inline-block', minWidth: 40,
                        }}>{v}%</div>
                      ),
                      sorter: (a: any, b: any) => (a[m.field] ?? -1) - (b[m.field] ?? -1),
                    })),
                    { title: '현재', dataIndex: 'sell_through_rate', key: 'rate', width: 80, align: 'center' as const,
                      render: (v: number) => {
                        const n = Number(v);
                        return (
                          <div style={{
                            background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
                            borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 13,
                            color: rateColor(n), display: 'inline-block',
                          }}>{n}%</div>
                        );
                      },
                      sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate),
                      defaultSortOrder: 'descend' as const },
                    { title: '총판매', dataIndex: 'sold_total', key: 'sold', width: 75, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong>,
                      sorter: (a: any, b: any) => a.sold_total - b.sold_total },
                    { title: '재고', dataIndex: 'current_stock', key: 'stock', width: 70, align: 'right' as const,
                      render: (v: number) => fmt(v),
                      sorter: (a: any, b: any) => a.current_stock - b.current_stock },
                  ]}
                  dataSource={dropData?.milestones || []}
                  rowKey="product_code"
                  size="small"
                  scroll={{ x: 1200, y: 'calc(100vh - 420px)' }}
                  pagination={{ pageSize: 50, showTotal: (t: number) => `총 ${t}건` }}
                  loading={dropLoading}
                />
              )
            )}

            {/* 드랍회차 비교 탭 */}
            {viewTab === 'drop_cohort' && (
              dropLoading && !dropData ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
                <>
                  <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                    {(dropData?.cohorts || []).slice(0, 6).map((c: any) => {
                      const rate = Number(c.sell_through_rate);
                      return (
                        <Col xs={12} sm={8} md={4} key={c.cohort_month}>
                          <div style={{
                            background: rateBg(rate), borderRadius: 10, padding: '12px 14px',
                            border: `1px solid ${rateColor(rate)}33`, textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                              {c.cohort_month.replace('-', '년 ')}월
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: rateColor(rate), lineHeight: 1.2 }}>
                              {rate}%
                            </div>
                            <Progress percent={rate} showInfo={false} size="small"
                              strokeColor={rateColor(rate)} style={{ marginTop: 4 }} />
                            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                              {c.product_count}종 · 판매 {fmt(Number(c.total_sold))}
                            </div>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                  <Table
                    columns={[
                      { title: '드랍회차', dataIndex: 'cohort_month', key: 'month', width: 110,
                        render: (v: string) => <strong>{v.replace('-', '년 ')}월</strong> },
                      { title: '상품수', dataIndex: 'product_count', key: 'cnt', width: 75, align: 'center' as const,
                        render: (v: number) => `${v}종` },
                      { title: '총공급', dataIndex: 'total_supplied', key: 'supply', width: 80, align: 'right' as const,
                        render: (v: number) => <strong>{fmt(Number(v))}</strong> },
                      { title: '초기입고', dataIndex: 'total_initial', key: 'init', width: 85, align: 'right' as const,
                        render: (v: number) => fmt(Number(v)) },
                      { title: '리오더', dataIndex: 'total_reorder', key: 'reorder', width: 75, align: 'right' as const,
                        render: (v: number) => Number(v) > 0 ? <Tag color="orange">{fmt(v)}</Tag> : <span style={{ color: '#ddd' }}>-</span> },
                      { title: '총판매', dataIndex: 'total_sold', key: 'sold', width: 90, align: 'right' as const,
                        render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(Number(v))}</strong> },
                      { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const,
                        render: (v: number) => fmt(Number(v)) },
                      { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 140, align: 'center' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                              <div style={{
                                background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
                                borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 13,
                                color: rateColor(n), minWidth: 48, textAlign: 'center',
                              }}>{n}%</div>
                              <Progress percent={n} showInfo={false} size="small"
                                strokeColor={rateColor(n)} style={{ width: 50, margin: 0 }} />
                            </div>
                          );
                        },
                        sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate),
                        defaultSortOrder: 'descend' as const },
                      { title: '평균판매/상품', dataIndex: 'avg_sold_per_product', key: 'avg', width: 110, align: 'right' as const,
                        render: (v: number) => Number(v).toFixed(1),
                        sorter: (a: any, b: any) => Number(a.avg_sold_per_product) - Number(b.avg_sold_per_product) },
                      { title: '7일 판매', dataIndex: 'sold_7d', key: 's7', width: 85, align: 'right' as const,
                        render: (v: number) => fmt(Number(v)) },
                      { title: '14일 판매', dataIndex: 'sold_14d', key: 's14', width: 85, align: 'right' as const,
                        render: (v: number) => fmt(Number(v)) },
                      { title: '30일 판매', dataIndex: 'sold_30d', key: 's30', width: 85, align: 'right' as const,
                        render: (v: number) => fmt(Number(v)) },
                      { title: '총매출', dataIndex: 'total_revenue', key: 'rev', width: 110, align: 'right' as const,
                        render: (v: number) => `₩${fmt(Number(v))}` },
                    ]}
                    dataSource={dropData?.cohorts || []}
                    rowKey="cohort_month"
                    size="small"
                    pagination={false}
                    scroll={{ x: 1100 }}
                    loading={dropLoading}
                  />
                </>
              )
            )}

            {/* 판매속도 순위 탭 */}
            {viewTab === 'velocity' && (
              dropLoading && !dropData ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
                <>
                  {/* Top 5 빠른 상품 카드 */}
                  <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                    {(dropData?.velocity || []).slice(0, 5).map((v: any, i: number) => {
                      const rate = Number(v.sell_through_rate);
                      const vel = Number(v.daily_velocity);
                      return (
                        <Col xs={12} sm={8} md={4} lg={4} key={v.product_code}>
                          <div style={{
                            background: rateBg(rate), borderRadius: 10, padding: '10px 12px',
                            border: `1px solid ${rateColor(rate)}33`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <Tag color={i === 0 ? 'gold' : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : 'default'}
                                style={{ fontWeight: 700, margin: 0, fontSize: 11 }}>#{i + 1}</Tag>
                              <Space size={4}>
                                {Number(v.season_weight) < 1 && <Tag color="orange" style={{ fontSize: 10, margin: 0, padding: '0 3px', lineHeight: '16px' }}>×{Number(v.season_weight)}</Tag>}
                                <span style={{ fontSize: 11, color: '#888' }}>{v.days_since_launch}일</span>
                              </Space>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{v.product_code}</div>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.product_name}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#1890ff' }}>
                              {vel.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400, color: '#888' }}>/일</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              판매 {fmt(Number(v.total_sold))} · 재고 {fmt(Number(v.current_stock))} · <span style={{ color: rateColor(rate), fontWeight: 700 }}>{rate}%</span>
                            </div>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                  <Table
                    columns={[
                      { title: '#', key: 'rank', width: 45, align: 'center' as const,
                        render: (_: any, __: any, i: number) => <strong style={{ color: i < 3 ? '#fa8c16' : '#888' }}>{i + 1}</strong> },
                      { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                        render: (v: string) => <strong>{v}</strong> },
                      { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                        render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag>,
                        filters: [...new Set((dropData?.velocity || []).map((p: any) => p.category))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
                        onFilter: (v: any, r: any) => r.category === v },
                      { title: '출시일', dataIndex: 'launch_date', key: 'launch', width: 100 },
                      { title: '경과일', dataIndex: 'days_since_launch', key: 'days', width: 70, align: 'center' as const,
                        render: (v: number) => `${v}일`,
                        sorter: (a: any, b: any) => a.days_since_launch - b.days_since_launch },
                      { title: '총공급', dataIndex: 'total_supplied', key: 'supply', width: 75, align: 'right' as const,
                        render: (v: number) => <strong>{fmt(v)}</strong>,
                        sorter: (a: any, b: any) => a.total_supplied - b.total_supplied },
                      { title: '리오더', dataIndex: 'reorder_supply', key: 'reorder', width: 70, align: 'right' as const,
                        render: (v: number) => Number(v) > 0 ? <Tag color="orange">{fmt(v)}</Tag> : <span style={{ color: '#ddd' }}>-</span>,
                        sorter: (a: any, b: any) => a.reorder_supply - b.reorder_supply },
                      { title: '총판매', dataIndex: 'total_sold', key: 'sold', width: 80, align: 'right' as const,
                        render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong>,
                        sorter: (a: any, b: any) => a.total_sold - b.total_sold },
                      { title: '일평균판매', dataIndex: 'daily_velocity', key: 'vel', width: 95, align: 'right' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          const c = n >= 5 ? '#52c41a' : n >= 2 ? '#1890ff' : n >= 1 ? '#fa8c16' : '#ff4d4f';
                          return <strong style={{ color: c, fontSize: 14 }}>{n.toFixed(1)}</strong>;
                        },
                        sorter: (a: any, b: any) => Number(a.daily_velocity) - Number(b.daily_velocity),
                        defaultSortOrder: 'descend' as const },
                      { title: '가중치', dataIndex: 'season_weight', key: 'sw', width: 65, align: 'center' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          return <Tag color={n >= 0.8 ? 'green' : n >= 0.5 ? 'blue' : n >= 0.3 ? 'orange' : 'red'}
                            style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>×{n}</Tag>;
                        } },
                      { title: '보정판매', dataIndex: 'adj_velocity', key: 'adjvel', width: 95, align: 'right' as const,
                        render: (v: number, r: any) => {
                          const n = Number(v);
                          const sw = Number(r.season_weight);
                          const c = n >= 5 ? '#52c41a' : n >= 2 ? '#1890ff' : n >= 1 ? '#fa8c16' : '#ff4d4f';
                          return sw < 1 ? <strong style={{ color: c, fontSize: 14 }}>{n.toFixed(1)}</strong>
                            : <span style={{ color: '#aaa' }}>{n.toFixed(1)}</span>;
                        },
                        sorter: (a: any, b: any) => Number(a.adj_velocity) - Number(b.adj_velocity) },
                      { title: '재고', dataIndex: 'current_stock', key: 'stock', width: 65, align: 'right' as const,
                        render: (v: number) => fmt(v) },
                      { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 75, align: 'center' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          return <div style={{
                            background: rateBg(n), borderRadius: 4, padding: '1px 6px',
                            fontWeight: 700, fontSize: 12, color: rateColor(n), display: 'inline-block',
                          }}>{n}%</div>;
                        },
                        sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate) },
                      { title: '소진예상', dataIndex: 'est_days_to_sellout', key: 'est', width: 80, align: 'center' as const,
                        render: (v: number | null) => {
                          if (v == null) return <span style={{ color: '#ddd' }}>-</span>;
                          const n = Number(v);
                          const c = n <= 14 ? '#52c41a' : n <= 30 ? '#1890ff' : n <= 60 ? '#fa8c16' : '#ff4d4f';
                          return <Tag color={c} style={{ fontWeight: 600 }}>{n}일</Tag>;
                        },
                        sorter: (a: any, b: any) => (a.est_days_to_sellout ?? 9999) - (b.est_days_to_sellout ?? 9999) },
                      { title: '보정소진', dataIndex: 'adj_est_days', key: 'adjest', width: 80, align: 'center' as const,
                        render: (v: number | null, r: any) => {
                          if (v == null) return <span style={{ color: '#ddd' }}>-</span>;
                          const n = Number(v);
                          const sw = Number(r.season_weight);
                          const c = n <= 14 ? '#52c41a' : n <= 30 ? '#1890ff' : n <= 60 ? '#fa8c16' : '#ff4d4f';
                          return sw < 1 ? <Tag color={c} style={{ fontWeight: 600 }}>{n}일</Tag>
                            : <span style={{ color: '#aaa' }}>{n}일</span>;
                        },
                        sorter: (a: any, b: any) => (a.adj_est_days ?? 9999) - (b.adj_est_days ?? 9999) },
                    ]}
                    dataSource={dropData?.velocity || []}
                    rowKey="product_code"
                    size="small"
                    scroll={{ x: 1200, y: 'calc(100vh - 420px)' }}
                    pagination={{ pageSize: 50, showTotal: (t: number) => `총 ${t}건` }}
                    loading={dropLoading}
                  />
                </>
              )
            )}

            {byProduct.length === 0 && byCategory.length === 0 && !loading && !['drop_milestone', 'drop_cohort', 'velocity'].includes(viewTab) && (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                해당 기간에 판매/재고 데이터가 없습니다.
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
