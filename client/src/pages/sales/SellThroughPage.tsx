import { useEffect, useMemo, useState } from 'react';
import { Card, Tag, DatePicker, Space, Spin, message, Row, Col, Table, Segmented, Button, Progress, Select } from 'antd';
import {
  PercentageOutlined,
  DownOutlined, RightOutlined, CalendarOutlined, ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { salesApi } from '../../modules/sales/sales.api';
import { restockApi } from '../../modules/restock/restock.api';
import { apiFetch } from '../../core/api.client';
import { fmtW } from '../../utils/format';
import dayjs, { Dayjs } from 'dayjs';

import { datePresets } from '../../utils/date-presets';
import { fmt } from '../../utils/format';
import { CAT_COLORS } from '../../utils/constants';

const { RangePicker } = DatePicker;
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

const rateCell = (v: number, width = 50) => {
  const n = Number(v);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
      <div style={{
        background: rateBg(n), border: `1px solid ${rateColor(n)}44`,
        borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 13,
        color: rateColor(n), minWidth: 48, textAlign: 'center',
      }}>{n}%</div>
      <Progress percent={n} showInfo={false} size="small"
        strokeColor={rateColor(n)} style={{ width, margin: 0 }} />
    </div>
  );
};

type ViewTab = 'summary' | 'product' | 'drop_analysis' | 'item_velocity';

const QUICK_RANGES: { label: string; from: Dayjs; to: Dayjs }[] = [
  { label: '이번달', from: dayjs().startOf('month'), to: dayjs() },
  { label: '최근 3개월', from: dayjs().subtract(3, 'month').add(1, 'day'), to: dayjs() },
  { label: '최근 6개월', from: dayjs().subtract(6, 'month').add(1, 'day'), to: dayjs() },
  { label: '올해', from: dayjs().startOf('year'), to: dayjs() },
  { label: '작년', from: dayjs().subtract(1, 'year').startOf('year'), to: dayjs().subtract(1, 'year').endOf('year') },
];

export default function SellThroughPage() {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('year'), dayjs()]);
  const [viewTab, setViewTab] = useState<ViewTab>('summary');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [dropData, setDropData] = useState<any>(null);
  const [dropLoading, setDropLoading] = useState(false);

  const [itemVelocity, setItemVelocity] = useState<any[]>([]);
  const [itemVelLoading, setItemVelLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState('');

  useEffect(() => {
    apiFetch('/api/partners?limit=1000').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch(() => {});
  }, []);

  const loadItemVelocity = async (pc?: string) => {
    setItemVelLoading(true);
    try { setItemVelocity(await restockApi.getSellingVelocity(pc || '')); }
    catch (e: any) { message.error(e.message); }
    finally { setItemVelLoading(false); }
  };

  const loadDropData = async (cat?: string | '') => {
    if (dropLoading) return;
    setDropLoading(true);
    try { setDropData(await salesApi.dropAnalysis(cat || undefined)); }
    catch (e: any) { message.error(e.message); }
    finally { setDropLoading(false); }
  };

  const load = async (from: Dayjs, to: Dayjs, cat?: string | '') => {
    setLoading(true);
    try { setData(await salesApi.sellThrough(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), cat || undefined)); }
    catch (e: any) { message.error(e.message); }
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
    if (viewTab === 'drop_analysis') {
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

  const newRate = byAge.find((a: any) => a.age_group === '신상')?.sell_through_rate || 0;
  const oneYearRate = byAge.find((a: any) => a.age_group === '1년차')?.sell_through_rate || 0;
  const yoyDelta = newRate - oneYearRate;

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
                      <div style={{ fontSize: 15, fontWeight: 800, color: rateColor(rate), margin: '2px 0' }}>{rate}%</div>
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

  // 드랍분석: velocity 데이터를 milestone에 병합
  const velocityMap = useMemo(() => {
    const map: Record<string, { daily_velocity: number; est_days_to_sellout: number | null }> = {};
    for (const v of (dropData?.velocity || []))
      map[v.product_code] = { daily_velocity: Number(v.daily_velocity), est_days_to_sellout: v.est_days_to_sellout };
    return map;
  }, [dropData]);

  const enrichedMilestones = useMemo(() =>
    (dropData?.milestones || []).map((m: any) => ({
      ...m,
      daily_velocity: velocityMap[m.product_code]?.daily_velocity ?? 0,
      est_days_to_sellout: velocityMap[m.product_code]?.est_days_to_sellout ?? null,
    })), [dropData, velocityMap]);

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
                  presets={datePresets}
                  size="small"
                  style={{ width: 240 }}
                  allowClear={false}
                />
              )}
              <span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>{rangeLabel}</span>
            </div>

            {/* 연차별 판매율 카드 */}
            <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
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
                      <div style={{ fontSize: 26, fontWeight: 800, color: ac.color, lineHeight: 1.2 }}>{rate}%</div>
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

            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              {viewTab === 'drop_analysis'
                ? '첫 입고일 기준 | 판매율 = 총판매 / 총공급량(초기입고+리오더) × 100'
                : viewTab === 'item_velocity'
                ? '파트너별 SKU 판매속도 | 재고금액 높은 순'
                : `${rangeLabel} 기준 | 판매율 = 판매수량 / (판매수량 + 현재재고) x 100`}
            </div>

            {/* 탭 전환 */}
            <Segmented
              value={viewTab}
              onChange={(v) => {
                const tab = v as ViewTab;
                setViewTab(tab);
                if (tab === 'drop_analysis' && !dropData) loadDropData(categoryFilter);
                if (tab === 'item_velocity' && itemVelocity.length === 0) loadItemVelocity(partnerFilter);
              }}
              options={[
                { label: '종합', value: 'summary' },
                { label: '품번별', value: 'product' },
                { label: '드랍분석', value: 'drop_analysis' },
                { label: '아이템속도', value: 'item_velocity' },
              ]}
              style={{ marginBottom: 16 }}
            />

            {/* ── 종합 탭 ── */}
            {viewTab === 'summary' && (
              <>
                <Table
                  columns={[
                    { title: '연차', dataIndex: 'age_group', key: 'age', width: 100,
                      render: (v: string) => <Tag color={getAgeColor(v).color} style={{ fontWeight: 700 }}>{v}</Tag> },
                    { title: '상품수', dataIndex: 'product_count', key: 'pc', width: 80, align: 'center' as const,
                      render: (v: number) => `${v}종` },
                    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 100, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong> },
                    { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 100, align: 'right' as const,
                      render: (v: number) => fmt(v) },
                    { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 180, align: 'center' as const,
                      render: (v: number) => rateCell(v, 70),
                      sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate) },
                  ]}
                  dataSource={byAge}
                  rowKey="age_group"
                  size="small"
                  pagination={false}
                  style={{ marginBottom: 20 }}
                />

                {/* 카테고리별 컴팩트 카드 */}
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>카테고리별 판매율</div>
                <Row gutter={[8, 8]} style={{ marginBottom: 20 }}>
                  {byCategory.map((c: any) => {
                    const rate = Number(c.sell_through_rate);
                    return (
                      <Col xs={12} sm={8} md={4} key={c.category}>
                        <div style={{
                          background: rateBg(rate), borderRadius: 8, padding: '10px 12px',
                          border: `1px solid ${rateColor(rate)}33`, textAlign: 'center',
                        }}>
                          <Tag style={CAT_COLORS[c.category] ? {
                            color: CAT_COLORS[c.category], borderColor: CAT_COLORS[c.category],
                            fontWeight: 600, marginBottom: 4,
                          } : { marginBottom: 4 }}>{c.category}</Tag>
                          <div style={{ fontSize: 20, fontWeight: 800, color: rateColor(rate), lineHeight: 1.2 }}>
                            {rate}%
                          </div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            {c.product_count}종 · {fmt(Number(c.sold_qty))}판매 / {fmt(Number(c.current_stock))}재고
                          </div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>

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
                      render: (v: number) => rateCell(v, 70),
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

            {/* ── 품번별 탭 ── */}
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
                    render: (v: number) => rateCell(v, 50),
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

            {/* ── 드랍분석 탭 ── */}
            {viewTab === 'drop_analysis' && (
              dropLoading && !dropData ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
                <>
                  {/* 코호트 요약 카드 */}
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

                  {/* 마일스톤 + velocity 병합 테이블 */}
                  <Table
                    columns={[
                      { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                        render: (v: string) => <strong>{v}</strong> },
                      { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                        render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag>,
                        filters: [...new Set(enrichedMilestones.map((p: any) => p.category))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
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
                      { title: '일평균', dataIndex: 'daily_velocity', key: 'vel', width: 80, align: 'right' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          if (n === 0) return <span style={{ color: '#ddd' }}>-</span>;
                          const c = n >= 5 ? '#52c41a' : n >= 2 ? '#1890ff' : n >= 1 ? '#fa8c16' : '#ff4d4f';
                          return <strong style={{ color: c, fontSize: 13 }}>{n.toFixed(1)}</strong>;
                        },
                        sorter: (a: any, b: any) => Number(a.daily_velocity) - Number(b.daily_velocity) },
                      { title: '소진예상', dataIndex: 'est_days_to_sellout', key: 'est', width: 80, align: 'center' as const,
                        render: (v: number | null) => {
                          if (v == null) return <span style={{ color: '#ddd' }}>-</span>;
                          const n = Number(v);
                          const c = n <= 14 ? '#52c41a' : n <= 30 ? '#1890ff' : n <= 60 ? '#fa8c16' : '#ff4d4f';
                          return <Tag color={c} style={{ fontWeight: 600 }}>{n}일</Tag>;
                        },
                        sorter: (a: any, b: any) => (a.est_days_to_sellout ?? 9999) - (b.est_days_to_sellout ?? 9999) },
                      { title: '총판매', dataIndex: 'sold_total', key: 'sold', width: 75, align: 'right' as const,
                        render: (v: number) => <strong style={{ color: '#1890ff' }}>{fmt(v)}</strong>,
                        sorter: (a: any, b: any) => a.sold_total - b.sold_total },
                      { title: '재고', dataIndex: 'current_stock', key: 'stock', width: 70, align: 'right' as const,
                        render: (v: number) => fmt(v),
                        sorter: (a: any, b: any) => a.current_stock - b.current_stock },
                    ]}
                    dataSource={enrichedMilestones}
                    rowKey="product_code"
                    size="small"
                    scroll={{ x: 1400, y: 'calc(100vh - 420px)' }}
                    pagination={{ pageSize: 50, showTotal: (t: number) => `총 ${t}건` }}
                    loading={dropLoading}
                  />
                </>
              )
            )}

            {/* ── 아이템속도 탭 ── */}
            {viewTab === 'item_velocity' && (
              <>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Select value={partnerFilter} onChange={(v) => { setPartnerFilter(v); loadItemVelocity(v); }}
                    style={{ width: 150 }} size="small"
                    options={[{ label: '전체', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} />
                  <Button icon={<ReloadOutlined />} size="small" onClick={() => loadItemVelocity(partnerFilter)}>새로고침</Button>
                  <span style={{ color: '#888', fontSize: 12 }}>
                    <ThunderboltOutlined style={{ marginRight: 4 }} />재고금액 높은 순 · {itemVelocity.length}건
                  </span>
                </Space>
                <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
                  {[
                    { label: '재고금액 합계', value: fmtW(itemVelocity.reduce((s, r) => s + Number(r.stock_value || 0), 0)), color: '#8b5cf6', bg: '#f9f0ff' },
                    { label: '7일 내 소진', value: `${itemVelocity.filter(r => r.days_until_out_30d != null && r.days_until_out_30d <= 7).length}종`, color: '#ff4d4f', bg: '#fff1f0' },
                    { label: '30일 내 소진', value: `${itemVelocity.filter(r => r.days_until_out_30d != null && r.days_until_out_30d <= 30).length}종`, color: '#fa8c16', bg: '#fff7e6' },
                  ].map((c) => (
                    <Col xs={8} key={c.label}>
                      <div style={{ background: c.bg, borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
                      </div>
                    </Col>
                  ))}
                </Row>
                <Table
                  dataSource={itemVelocity}
                  columns={[
                    { title: '상품', key: 'product', width: 150, ellipsis: true,
                      render: (_: any, r: any) => (
                        <><div style={{ fontWeight: 500 }}>{r.product_name}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{r.product_code} | {r.category || ''}</div></>
                      ) },
                    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130, ellipsis: true },
                    { title: '컬러', dataIndex: 'color', key: 'color', width: 50 },
                    { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '단가', dataIndex: 'base_price', key: 'price', width: 85, align: 'right' as const,
                      sorter: (a: any, b: any) => Number(a.base_price) - Number(b.base_price),
                      render: (v: number) => `${fmt(Number(v))}원` },
                    { title: '재고', dataIndex: 'current_qty', key: 'qty', width: 65, align: 'right' as const },
                    { title: '재고금액', dataIndex: 'stock_value', key: 'sv', width: 95, align: 'right' as const,
                      sorter: (a: any, b: any) => Number(a.stock_value) - Number(b.stock_value),
                      defaultSortOrder: 'descend' as const,
                      render: (v: number) => <strong style={{ color: '#8b5cf6' }}>{fmtW(Number(v))}</strong> },
                    { title: '7일', dataIndex: 'sold_7d', key: 's7', width: 60, align: 'right' as const,
                      sorter: (a: any, b: any) => a.sold_7d - b.sold_7d,
                      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 600 }}>{v}</span> : '-' },
                    { title: '30일', dataIndex: 'sold_30d', key: 's30', width: 60, align: 'right' as const,
                      sorter: (a: any, b: any) => a.sold_30d - b.sold_30d,
                      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-' },
                    { title: '소진예상', dataIndex: 'days_until_out_30d', key: 'out', width: 85, align: 'center' as const,
                      sorter: (a: any, b: any) => (a.days_until_out_30d ?? 9999) - (b.days_until_out_30d ?? 9999),
                      render: (v: number | null) => v != null ? <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : v <= 30 ? 'gold' : 'default'}>{v}일</Tag> : '-' },
                  ]}
                  rowKey="variant_id"
                  loading={itemVelLoading}
                  size="small"
                  scroll={{ x: 1100, y: 'calc(100vh - 420px)' }}
                  pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                />
              </>
            )}

            {byProduct.length === 0 && byCategory.length === 0 && !loading && !['drop_analysis', 'item_velocity'].includes(viewTab) && (
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
