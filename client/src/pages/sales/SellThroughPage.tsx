import { useEffect, useState, useMemo } from 'react';
import {
  Table, Button, Select, Space, DatePicker, Card, Row, Col, Statistic, Tag, Progress, Modal, message,
} from 'antd';
import { SearchOutlined, BarChartOutlined, ShoppingOutlined, InboxOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { codeApi } from '../../modules/code/code.api';
import { useCodeLabels } from '../../hooks/useCodeLabels';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

const rateColor = (rate: number) =>
  rate >= 70 ? '#f5222d' : rate >= 50 ? '#fa8c16' : rate >= 30 ? '#1890ff' : '#999';

const fmt = (v: number) => v?.toLocaleString() ?? '0';

export default function SellThroughPage() {
  const { formatCode } = useCodeLabels();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  // 세부 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [detailVariants, setDetailVariants] = useState<any[]>([]);
  const [detailDaily, setDetailDaily] = useState<any[]>([]);

  // 카테고리별 모달
  const [catDetailOpen, setCatDetailOpen] = useState(false);
  const [catDetailCategory, setCatDetailCategory] = useState('');
  const [catDetailProducts, setCatDetailProducts] = useState<any[]>([]);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) => {
      setCategoryOptions(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
  }, []);

  const load = async (from: Dayjs, to: Dayjs, category?: string) => {
    setLoading(true);
    try {
      const result = await salesApi.sellThrough(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), category || undefined);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(range[0], range[1], categoryFilter); }, []);

  const handleSearch = () => load(range[0], range[1], categoryFilter);
  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    load(from, to, categoryFilter);
  };
  const today = dayjs();

  // 상품 % 클릭 → 세부 모달
  const openDetail = (record: any) => {
    setDetailProduct(record);
    // byVariant에서 해당 상품 필터
    const variants = (data?.byVariant || []).filter((v: any) => v.product_code === record.product_code);
    setDetailVariants(variants);
    // dailyByProduct에서 해당 상품 필터
    const daily = (data?.dailyByProduct || []).filter((d: any) => d.product_code === record.product_code);
    setDetailDaily(daily);
    setDetailOpen(true);
  };

  // 카테고리 % 클릭 → 해당 카테고리 상품 목록
  const openCatDetail = (category: string) => {
    setCatDetailCategory(category);
    const products = (data?.byProduct || []).filter((p: any) => p.category === category);
    setCatDetailProducts(products);
    setCatDetailOpen(true);
  };

  // 상품별 테이블 컬럼
  const productColumns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'pc', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'pn', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 90, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
    { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const, render: (v: number) => fmt(v) },
    {
      title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 120, align: 'center' as const,
      sorter: (a: any, b: any) => a.sell_through_rate - b.sell_through_rate,
      defaultSortOrder: 'descend' as const,
      render: (rate: number, record: any) => {
        const color = rateColor(rate);
        return (
          <div style={{ cursor: 'pointer' }} onClick={() => openDetail(record)}>
            <span style={{ fontWeight: 700, color, fontSize: 14 }}>{rate}%</span>
            <Progress percent={rate} showInfo={false} size="small" strokeColor={color} style={{ marginTop: 2 }} />
          </div>
        );
      },
    },
  ];

  // 카테고리별 요약
  const categoryData = useMemo(() => data?.byCategory || [], [data]);
  const seasonData = useMemo(() => data?.bySeason || [], [data]);
  const ageData = useMemo(() => data?.byAge || [], [data]);
  const totals = data?.totals || { total_sold: 0, total_stock: 0, overall_rate: 0, product_count: 0 };

  return (
    <div>
      <PageHeader title="판매율 분석" />

      {/* 필터 바 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 300 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={categoryFilter} onChange={setCategoryFilter} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...categoryOptions]} /></div>
        <Space size={4} wrap style={{ alignSelf: 'flex-end' }}>
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(89, 'day'), today)}>90일</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('year'), today)}>올해</Button>
        </Space>
        <Button onClick={handleSearch} icon={<SearchOutlined />}>조회</Button>
      </div>

      {/* 요약 카드 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="전체 판매율" value={totals.overall_rate} suffix="%" valueStyle={{ color: rateColor(totals.overall_rate), fontWeight: 700 }} prefix={<BarChartOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="총 판매수량" value={totals.total_sold} suffix="개" prefix={<ShoppingOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="현재 총재고" value={totals.total_stock} suffix="개" prefix={<InboxOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="분석 상품" value={totals.product_count} suffix="개" /></Card>
        </Col>
      </Row>

      {/* 카테고리별 판매율 (클릭 가능) */}
      {categoryData.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>카테고리별 판매율 <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>(클릭하면 해당 상품 목록)</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categoryData.map((c: any) => {
              const color = rateColor(c.sell_through_rate);
              return (
                <Card key={c.category} size="small" hoverable style={{ width: 130, textAlign: 'center', cursor: 'pointer' }} onClick={() => openCatDetail(c.category)}>
                  <Tag style={{ marginBottom: 4, fontWeight: 600 }}>{c.category}</Tag>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>{c.sell_through_rate}%</div>
                  <Progress percent={c.sell_through_rate} showInfo={false} size="small" strokeColor={color} />
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>판매 {fmt(c.sold_qty)} / 재고 {fmt(c.current_stock)}</div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 시즌별 + 연차별 */}
      {(seasonData.length > 0 || ageData.length > 0) && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {seasonData.length > 0 && (
            <Col span={12}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>시즌별 판매율</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {seasonData.map((s: any) => (
                  <Tag key={s.season} style={{ padding: '4px 10px' }}>
                    {formatCode('SEASON', s.season) || s.season}
                    <span style={{ fontWeight: 700, color: rateColor(s.sell_through_rate), marginLeft: 6 }}>{s.sell_through_rate}%</span>
                    <span style={{ color: '#999', marginLeft: 4, fontSize: 11 }}>({fmt(s.sold_qty)}개)</span>
                  </Tag>
                ))}
              </div>
            </Col>
          )}
          {ageData.length > 0 && (
            <Col span={12}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>입고 연차별 판매율</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ageData.map((a: any) => (
                  <Tag key={a.age_group} style={{ padding: '4px 10px' }}>
                    {a.age_group}
                    <span style={{ fontWeight: 700, color: rateColor(a.sell_through_rate), marginLeft: 6 }}>{a.sell_through_rate}%</span>
                    <span style={{ color: '#999', marginLeft: 4, fontSize: 11 }}>({fmt(a.sold_qty)}개)</span>
                  </Tag>
                ))}
              </div>
            </Col>
          )}
        </Row>
      )}

      {/* 상품별 판매율 테이블 */}
      <Table
        columns={productColumns}
        dataSource={data?.byProduct || []}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 900, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />

      {/* 상품 세부 모달 (판매율 % 클릭) */}
      <Modal
        title={detailProduct ? `${detailProduct.product_name} 판매율 상세` : ''}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={800}
      >
        {detailProduct && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 상품 요약 */}
            <div style={{ background: '#f5f7fa', padding: 14, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{detailProduct.product_name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {detailProduct.product_code} | {detailProduct.category} | {detailProduct.season ? formatCode('SEASON', detailProduct.season) : '-'} | {detailProduct.fit || '-'}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: rateColor(detailProduct.sell_through_rate) }}>
                  {detailProduct.sell_through_rate}%
                </div>
                <Progress percent={detailProduct.sell_through_rate} showInfo={false} strokeColor={rateColor(detailProduct.sell_through_rate)} style={{ width: 120 }} />
                <div style={{ fontSize: 11, color: '#888' }}>판매 {fmt(detailProduct.sold_qty)}개 / 재고 {fmt(detailProduct.current_stock)}개</div>
              </div>
            </div>

            {/* 색상/사이즈별 판매율 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>색상/사이즈별 판매율</div>
              <Table
                columns={[
                  { title: '색상', dataIndex: 'color', key: 'color', width: 70 },
                  { title: '사이즈', dataIndex: 'size', key: 'size', width: 70 },
                  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, ellipsis: true },
                  { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
                  { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const, render: (v: number) => fmt(v) },
                  {
                    title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 130, align: 'center' as const,
                    sorter: (a: any, b: any) => a.sell_through_rate - b.sell_through_rate,
                    defaultSortOrder: 'descend' as const,
                    render: (rate: number) => (
                      <div>
                        <span style={{ fontWeight: 700, color: rateColor(rate) }}>{rate}%</span>
                        <Progress percent={rate} showInfo={false} size="small" strokeColor={rateColor(rate)} style={{ marginTop: 2 }} />
                      </div>
                    ),
                  },
                ]}
                dataSource={detailVariants}
                rowKey={(r) => `${r.product_code}_${r.color}_${r.size}`}
                size="small"
                pagination={false}
                scroll={{ y: 250 }}
              />
            </div>

            {/* 일자별 판매 추이 */}
            {detailDaily.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>일자별 판매 추이</div>
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #eee' }}>날짜</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #eee' }}>판매수량</th>
                        <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #eee', width: '50%' }}>비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailDaily.map((d: any) => {
                        const maxQty = Math.max(...detailDaily.map((x: any) => x.daily_sold_qty), 1);
                        const pct = (d.daily_sold_qty / maxQty) * 100;
                        return (
                          <tr key={d.date} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '3px 8px' }}>{dayjs(d.date).format('MM/DD (ddd)')}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>{d.daily_sold_qty}</td>
                            <td style={{ padding: '3px 8px' }}>
                              <div style={{ background: '#e6f7ff', borderRadius: 3, height: 16, width: `${pct}%`, minWidth: d.daily_sold_qty > 0 ? 4 : 0, display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
                                <span style={{ fontSize: 10, color: '#1890ff' }}>{d.daily_sold_qty > 0 ? d.daily_sold_qty : ''}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 카테고리 세부 모달 */}
      <Modal
        title={`${catDetailCategory} 카테고리 상품 판매율`}
        open={catDetailOpen}
        onCancel={() => setCatDetailOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={[
            { title: '상품코드', dataIndex: 'product_code', key: 'pc', width: 130 },
            { title: '상품명', dataIndex: 'product_name', key: 'pn', ellipsis: true },
            { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
            { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
            { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const, render: (v: number) => fmt(v) },
            {
              title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 130, align: 'center' as const,
              sorter: (a: any, b: any) => a.sell_through_rate - b.sell_through_rate,
              defaultSortOrder: 'descend' as const,
              render: (rate: number, record: any) => (
                <div style={{ cursor: 'pointer' }} onClick={() => { setCatDetailOpen(false); openDetail(record); }}>
                  <span style={{ fontWeight: 700, color: rateColor(rate) }}>{rate}%</span>
                  <Progress percent={rate} showInfo={false} size="small" strokeColor={rateColor(rate)} style={{ marginTop: 2 }} />
                </div>
              ),
            },
          ]}
          dataSource={catDetailProducts}
          rowKey="product_code"
          size="small"
          scroll={{ y: 400 }}
          pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        />
      </Modal>
    </div>
  );
}
