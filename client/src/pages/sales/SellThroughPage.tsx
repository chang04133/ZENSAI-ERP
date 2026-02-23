import { useEffect, useState } from 'react';
import { Card, Tag, DatePicker, Space, Spin, message, Row, Col, Table, Segmented, Button, Progress, Select, Modal } from 'antd';
import {
  PercentageOutlined, LeftOutlined, RightOutlined, TagOutlined,
  ShoppingCartOutlined, InboxOutlined, SkinOutlined, FilterOutlined,
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

const rateColor = (rate: number) => {
  if (rate >= 80) return '#52c41a';
  if (rate >= 50) return '#1890ff';
  if (rate >= 30) return '#fa8c16';
  return '#ff4d4f';
};
const rateTag = (rate: number) => (
  <Tag color={rate >= 80 ? 'green' : rate >= 50 ? 'blue' : rate >= 30 ? 'orange' : 'red'}
    style={{ fontWeight: 700, minWidth: 52, textAlign: 'center' }}>{rate}%</Tag>
);

type PeriodMode = 'daily' | 'weekly' | 'monthly';
type ViewTab = 'product' | 'category' | 'daily';

function getRange(mode: PeriodMode, ref: Dayjs): { from: string; to: string; label: string } {
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

function moveRef(mode: PeriodMode, ref: Dayjs, dir: number): Dayjs {
  if (mode === 'daily') return ref.add(dir, 'day');
  if (mode === 'weekly') return ref.add(dir, 'week');
  return ref.add(dir, 'month');
}

export default function SellThroughPage() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [refDate, setRefDate] = useState<Dayjs>(dayjs());
  const [viewTab, setViewTab] = useState<ViewTab>('product');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 사이즈별 모달
  const [sizeModal, setSizeModal] = useState<{ open: boolean; code: string; name: string }>({ open: false, code: '', name: '' });

  const range = getRange(periodMode, refDate);

  const load = async (pm: PeriodMode, ref: Dayjs, cat?: string | '') => {
    setLoading(true);
    try {
      const r = getRange(pm, ref);
      const result = await salesApi.sellThrough(r.from, r.to, cat || undefined);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(periodMode, refDate, categoryFilter); }, []);

  const handlePeriodChange = (v: string) => {
    const m = v as PeriodMode;
    setPeriodMode(m);
    load(m, refDate, categoryFilter);
  };
  const handleMove = (dir: number) => {
    const next = moveRef(periodMode, refDate, dir);
    setRefDate(next);
    load(periodMode, next, categoryFilter);
  };
  const handleDatePick = (d: Dayjs | null) => {
    if (d) { setRefDate(d); load(periodMode, d, categoryFilter); }
  };
  const handleCategoryChange = (v: string) => {
    setCategoryFilter(v);
    load(periodMode, refDate, v);
  };
  const isForwardDisabled = () => {
    const next = moveRef(periodMode, refDate, 1);
    const nextRange = getRange(periodMode, next);
    return nextRange.from > dayjs().format('YYYY-MM-DD');
  };

  const totals = data?.totals || {};
  const byProduct = data?.byProduct || [];
  const bySize = data?.bySize || [];
  const byCategory = data?.byCategory || [];
  const daily = data?.daily || [];
  const dailyByCategory = data?.dailyByCategory || [];
  const dailyByProduct = data?.dailyByProduct || [];

  const pickerType = periodMode === 'monthly' ? 'month' : periodMode === 'weekly' ? 'week' : undefined;

  // 사이즈 모달용 필터
  const sizeDataForProduct = bySize.filter((r: any) => r.product_code === sizeModal.code);

  return (
    <div>
      <Card
        title={<Space><PercentageOutlined /><span>판매율 분석</span></Space>}
        extra={
          <Space wrap>
            <Segmented value={periodMode} onChange={handlePeriodChange} size="small"
              options={[
                { label: '일별', value: 'daily' },
                { label: '주별', value: 'weekly' },
                { label: '월별', value: 'monthly' },
              ]} />
            <Button size="small" icon={<LeftOutlined />} onClick={() => handleMove(-1)} />
            <DatePicker value={refDate} onChange={handleDatePick} picker={pickerType}
              allowClear={false} style={{ width: periodMode === 'monthly' ? 130 : 150 }} size="small" />
            <Button size="small" icon={<RightOutlined />} onClick={() => handleMove(1)} disabled={isForwardDisabled()} />
            <Tag color="blue" style={{ fontSize: 12, padding: '1px 8px', margin: 0 }}>{range.label}</Tag>
            <Select
              value={categoryFilter} onChange={handleCategoryChange}
              style={{ width: 130 }} size="small"
              options={[
                { label: '전체', value: '' },
                { label: 'TOP', value: 'TOP' },
                { label: 'BOTTOM', value: 'BOTTOM' },
                { label: 'OUTER', value: 'OUTER' },
                { label: 'DRESS', value: 'DRESS' },
                { label: 'ACC', value: 'ACC' },
              ]}
            />
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
                { label: '전체 판매율', value: `${totals.overall_rate || 0}%`, icon: <PercentageOutlined />,
                  color: rateColor(totals.overall_rate || 0), bg: '#f0f5ff' },
                { label: '총 판매수량', value: `${fmt(totals.total_sold || 0)}개`, icon: <ShoppingCartOutlined />,
                  color: '#52c41a', bg: '#f6ffed' },
                { label: '총 현재재고', value: `${fmt(totals.total_stock || 0)}개`, icon: <InboxOutlined />,
                  color: '#fa8c16', bg: '#fff7e6' },
                { label: '판매 상품수', value: `${totals.product_count || 0}종`, icon: <SkinOutlined />,
                  color: '#722ed1', bg: '#f9f0ff' },
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
                  { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                    render: (v: string, record: any) => (
                      <a onClick={() => setSizeModal({ open: true, code: v, name: record.product_name })}>{v}</a>
                    ) },
                  { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                    render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v || '-'}</Tag>,
                    filters: [...new Set(byProduct.map((p: any) => p.category))].filter(Boolean).map((v: any) => ({ text: v, value: v })),
                    onFilter: (v: any, r: any) => r.category === v },
                  { title: '핏', dataIndex: 'fit', key: 'fit', width: 80, render: (v: string) => v || '-' },
                  { title: '기장', dataIndex: 'length', key: 'len', width: 65, render: (v: string) => v || '-' },
                  { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 85, align: 'right' as const,
                    render: (v: number) => <strong>{fmt(v)}</strong>,
                    sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
                  { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 85, align: 'right' as const,
                    render: (v: number) => fmt(v),
                    sorter: (a: any, b: any) => a.current_stock - b.current_stock },
                  { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 130, align: 'center' as const,
                    render: (v: number) => (
                      <Space size={4}>
                        {rateTag(Number(v))}
                        <Progress percent={Number(v)} showInfo={false} size="small"
                          strokeColor={rateColor(Number(v))} style={{ width: 50 }} />
                      </Space>
                    ),
                    sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate),
                    defaultSortOrder: 'descend' as const },
                ]}
                dataSource={byProduct}
                rowKey="product_code"
                size="small"
                scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
                pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
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
                        <Card size="small" style={{ textAlign: 'center' }}>
                          <Tag color={CAT_COLORS[c.category] ? undefined : 'default'}
                            style={CAT_COLORS[c.category] ? { color: CAT_COLORS[c.category], borderColor: CAT_COLORS[c.category], marginBottom: 8 } : { marginBottom: 8 }}>
                            {c.category}
                          </Tag>
                          <Progress type="circle" percent={rate} size={80}
                            strokeColor={rateColor(rate)}
                            format={(p) => <span style={{ fontSize: 16, fontWeight: 700 }}>{p}%</span>} />
                          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                            판매 {fmt(Number(c.sold_qty))}개 / 재고 {fmt(Number(c.current_stock))}개
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
                      render: (v: string) => <Tag style={CAT_COLORS[v] ? { color: CAT_COLORS[v], borderColor: CAT_COLORS[v] } : {}}>{v}</Tag> },
                    { title: '상품수', dataIndex: 'product_count', key: 'pc', width: 80, align: 'center' as const,
                      render: (v: number) => `${v}종` },
                    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 100, align: 'right' as const,
                      render: (v: number) => <strong>{fmt(Number(v))}</strong> },
                    { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 100, align: 'right' as const,
                      render: (v: number) => fmt(Number(v)) },
                    { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 150, align: 'center' as const,
                      render: (v: number) => (
                        <Space size={4}>
                          {rateTag(Number(v))}
                          <Progress percent={Number(v)} showInfo={false} size="small"
                            strokeColor={rateColor(Number(v))} style={{ width: 70 }} />
                        </Space>
                      ),
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
                {/* 일자별 요약 */}
                <Card size="small" title="일자별 판매 추이" style={{ marginBottom: 16 }}>
                  <Table
                    columns={[
                      { title: '날짜', dataIndex: 'date', key: 'date', width: 120,
                        render: (v: string) => <strong>{v}</strong> },
                      { title: '판매수량', dataIndex: 'daily_sold_qty', key: 'qty', width: 100, align: 'right' as const,
                        render: (v: number) => <strong>{fmt(v)}</strong>,
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

                {/* 일자별 카테고리별 */}
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
                    scroll={{ x: 1100, y: 'calc(100vh - 480px)' }}
                    pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                  />
                </Card>

                {/* 일자별 아이템별 */}
                <Card size="small" title="일자별 아이템별 판매">
                  <Table
                    columns={[
                      { title: '날짜', dataIndex: 'date', key: 'date', width: 110 },
                      { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120 },
                      { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
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
                    scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
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

      {/* 사이즈별 판매율 모달 */}
      <Modal
        title={`${sizeModal.name} (${sizeModal.code}) - 사이즈별 판매율`}
        open={sizeModal.open}
        onCancel={() => setSizeModal({ open: false, code: '', name: '' })}
        footer={<Button onClick={() => setSizeModal({ open: false, code: '', name: '' })}>닫기</Button>}
        width={550}
      >
        {sizeDataForProduct.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터가 없습니다.</div>
        ) : (
          <Table
            columns={[
              { title: '사이즈', dataIndex: 'size', key: 'size', width: 80,
                render: (v: string) => <Tag>{v}</Tag> },
              { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 90, align: 'right' as const,
                render: (v: number) => <strong>{fmt(v)}</strong> },
              { title: '현재재고', dataIndex: 'current_stock', key: 'stock', width: 90, align: 'right' as const,
                render: (v: number) => fmt(Number(v)) },
              { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 130, align: 'center' as const,
                render: (v: number) => (
                  <Space size={4}>
                    {rateTag(Number(v))}
                    <Progress percent={Number(v)} showInfo={false} size="small"
                      strokeColor={rateColor(Number(v))} style={{ width: 50 }} />
                  </Space>
                ) },
            ]}
            dataSource={sizeDataForProduct}
            rowKey="size"
            pagination={false}
            size="small"
            summary={(rows) => {
              const totalSold = rows.reduce((s: number, r: any) => s + Number(r.sold_qty), 0);
              const totalStock = rows.reduce((s: number, r: any) => s + Number(r.current_stock), 0);
              const totalRate = (totalSold + totalStock) > 0
                ? Math.round(totalSold / (totalSold + totalStock) * 1000) / 10 : 0;
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} align="right"><strong>합계</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><strong>{fmt(totalSold)}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><strong>{fmt(totalStock)}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="center">{rateTag(totalRate)}</Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
}
