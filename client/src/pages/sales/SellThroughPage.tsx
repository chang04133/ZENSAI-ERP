import { useEffect, useState } from 'react';
import { Card, Tag, DatePicker, Space, Spin, message, Row, Col, Table, Segmented, Button, Progress, Select } from 'antd';
import {
  PercentageOutlined, ShoppingCartOutlined, InboxOutlined, SkinOutlined,
  DownOutlined, RightOutlined, CalendarOutlined,
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

type ViewTab = 'product' | 'category' | 'daily';

const QUICK_RANGES: { label: string; from: Dayjs; to: Dayjs }[] = [
  { label: '오늘', from: dayjs(), to: dayjs() },
  { label: '이번주', from: dayjs().startOf('isoWeek'), to: dayjs() },
  { label: '이번달', from: dayjs().startOf('month'), to: dayjs() },
  { label: '최근 7일', from: dayjs().subtract(6, 'day'), to: dayjs() },
  { label: '최근 30일', from: dayjs().subtract(29, 'day'), to: dayjs() },
  { label: '최근 3개월', from: dayjs().subtract(3, 'month').add(1, 'day'), to: dayjs() },
];

export default function SellThroughPage() {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [viewTab, setViewTab] = useState<ViewTab>('product');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [showCustomRange, setShowCustomRange] = useState(false);

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
  };

  const totals = data?.totals || {};
  const byProduct = data?.byProduct || [];
  const byVariant = data?.byVariant || [];
  const byCategory = data?.byCategory || [];
  const daily = data?.daily || [];
  const dailyByCategory = data?.dailyByCategory || [];
  const dailyByProduct = data?.dailyByProduct || [];

  // 제품 클릭 시 인라인 확장
  const toggleExpand = (code: string) => {
    setExpandedKeys((prev) =>
      prev.includes(code) ? prev.filter((k) => k !== code) : [...prev, code],
    );
  };

  const variantsForProduct = (code: string) =>
    byVariant.filter((v: any) => v.product_code === code);

  // 확장 행 렌더
  const expandedRowRender = (record: any) => {
    const variants = variantsForProduct(record.product_code);
    if (variants.length === 0) return <div style={{ padding: 12, color: '#aaa' }}>변형 데이터가 없습니다.</div>;

    // 컬러별 그룹
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

            {/* 요약 카드 */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <div style={{ background: rateBg(totals.overall_rate || 0), borderRadius: 10, padding: '14px 16px', border: `1px solid ${rateColor(totals.overall_rate || 0)}33` }}>
                  <div style={{ fontSize: 11, color: '#888' }}>전체 판매율</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: rateColor(totals.overall_rate || 0), lineHeight: 1.2 }}>
                    {totals.overall_rate || 0}%
                  </div>
                  <Progress percent={totals.overall_rate || 0} showInfo={false} size="small"
                    strokeColor={rateColor(totals.overall_rate || 0)} style={{ marginTop: 4 }} />
                </div>
              </Col>
              {[
                { label: '총 판매수량', value: `${fmt(totals.total_sold || 0)}개`, icon: <ShoppingCartOutlined />,
                  color: '#52c41a', bg: '#f6ffed' },
                { label: '총 현재재고', value: `${fmt(totals.total_stock || 0)}개`, icon: <InboxOutlined />,
                  color: '#fa8c16', bg: '#fff7e6' },
                { label: '판매 상품수', value: `${totals.product_count || 0}종`, icon: <SkinOutlined />,
                  color: '#722ed1', bg: '#f9f0ff' },
              ].map((item) => (
                <Col xs={12} sm={6} key={item.label}>
                  <div style={{ background: item.bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${item.color}22` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 22, color: item.color }}>{item.icon}</div>
                      <div>
                        <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                      </div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>

            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              {rangeLabel} 기준 | 판매율 = 판매수량 / (판매수량 + 현재재고) x 100
            </div>

            {/* 뷰 탭 전환 */}
            <Segmented
              value={viewTab}
              onChange={(v) => setViewTab(v as ViewTab)}
              options={[
                { label: '품번별', value: 'product' },
                { label: '카테고리별', value: 'category' },
                { label: '일자별', value: 'daily' },
              ]}
              style={{ marginBottom: 16 }}
            />

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
                  { title: '핏', dataIndex: 'fit', key: 'fit', width: 65, render: (v: string) => v || '-' },
                  { title: '기장', dataIndex: 'length', key: 'len', width: 65, render: (v: string) => v || '-' },
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
                  onExpand: (expanded, record) => toggleExpand(record.product_code),
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

            {byProduct.length === 0 && byCategory.length === 0 && !loading && (
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
