import { useEffect, useState, useMemo } from 'react';
import {
  Table, Button, Select, Space, DatePicker, Card, Row, Col, Statistic, Tag, Progress, Modal, message,
} from 'antd';
import {
  SearchOutlined, BarChartOutlined, ShoppingOutlined, InboxOutlined,
  RiseOutlined, FallOutlined, FireOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { codeApi } from '../../modules/code/code.api';
import { useCodeLabels } from '../../hooks/useCodeLabels';
import { datePresets } from '../../utils/date-presets';
import { CAT_TAG_COLORS as CAT_COLORS } from '../../utils/constants';

const { RangePicker } = DatePicker;

const rateColor = (rate: number) =>
  rate >= 70 ? '#f5222d' : rate >= 50 ? '#fa8c16' : rate >= 30 ? '#1890ff' : '#999';

const fmt = (v: number) => v?.toLocaleString() ?? '0';

/* ── 증감 표시 헬퍼 ── */
function Change({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev;
  const pct = prev > 0 ? ((diff / prev) * 100).toFixed(0) : cur > 0 ? '∞' : '0';
  const color = diff > 0 ? '#f5222d' : diff < 0 ? '#1890ff' : '#999';
  return (
    <span style={{ color, fontSize: 11, fontWeight: 500 }}>
      {diff > 0 ? '+' : ''}{fmt(diff)}
      <span style={{ marginLeft: 2 }}>({diff > 0 ? '+' : ''}{pct}%)</span>
    </span>
  );
}

function DeltaRate({ v }: { v: number }) {
  if (Math.abs(v) < 0.1) return <span style={{ color: '#999', fontSize: 11 }}>-</span>;
  return (
    <Tag color={v > 0 ? 'red' : 'blue'} style={{ fontSize: 11, margin: 0 }}>
      {v > 0 ? <RiseOutlined /> : <FallOutlined />} {v > 0 ? '+' : ''}{v.toFixed(1)}%p
    </Tag>
  );
}

function DeltaSold({ v }: { v: number }) {
  if (v === 0) return <span style={{ color: '#999' }}>-</span>;
  const color = v > 0 ? '#f5222d' : '#1890ff';
  return (
    <span style={{ color, fontWeight: 500, fontSize: 12 }}>
      {v > 0 ? <RiseOutlined /> : <FallOutlined />} {v > 0 ? '+' : ''}{fmt(v)}
    </span>
  );
}

/* ── 일별 트렌드 차트 ── */
function DailyTrendChart({ current, previous }: { current: any[]; previous: any[] }) {
  if (!current.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const allMax = Math.max(...current.map(d => d.daily_sold_qty), ...previous.map(d => d.daily_sold_qty), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150, padding: '0 4px' }}>
      {current.map((d, i) => {
        const hCur = Math.max((d.daily_sold_qty / allMax) * 120, d.daily_sold_qty > 0 ? 4 : 0);
        const prevDay = previous[i];
        const hPrev = prevDay ? Math.max((prevDay.daily_sold_qty / allMax) * 120, prevDay.daily_sold_qty > 0 ? 4 : 0) : 0;
        const day = d.date.slice(5);
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}
            title={`${d.date}: ${d.daily_sold_qty}개${prevDay ? ` (전기간: ${prevDay.daily_sold_qty}개)` : ''}`}>
            <div style={{ fontSize: 9, color: '#555', fontWeight: d.daily_sold_qty > 0 ? 600 : 400 }}>
              {d.daily_sold_qty > 0 ? d.daily_sold_qty : ''}
            </div>
            <div style={{ position: 'relative', width: '100%', maxWidth: 22, height: Math.max(hCur, hPrev) }}>
              {hPrev > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '5%', right: '5%',
                  height: hPrev, background: '#e8e8e8', borderRadius: 2,
                }} />
              )}
              <div style={{
                position: 'absolute', bottom: 0, left: '15%', right: '15%',
                height: hCur,
                background: 'linear-gradient(180deg, #6366f1, #818cf8)',
                borderRadius: 3, zIndex: 1,
              }} />
            </div>
            <div style={{ fontSize: 7, color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden' }}>{day}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function SellThroughPage() {
  const { formatCode } = useCodeLabels();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);

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

  /* ── 비교기간 자동 계산 ── */
  const prevRange = useMemo(() => {
    const days = range[1].diff(range[0], 'day') + 1;
    return [range[0].subtract(days, 'day'), range[0].subtract(1, 'day')] as [Dayjs, Dayjs];
  }, [range]);

  const load = async (from: Dayjs, to: Dayjs, category?: string[]) => {
    setLoading(true);
    const days = to.diff(from, 'day') + 1;
    const pFrom = from.subtract(days, 'day');
    const pTo = from.subtract(1, 'day');
    const catParam = category?.length ? category.join(',') : undefined;
    try {
      const [cur, prev] = await Promise.all([
        salesApi.sellThrough(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), catParam),
        salesApi.sellThrough(pFrom.format('YYYY-MM-DD'), pTo.format('YYYY-MM-DD'), catParam),
      ]);
      setData(cur);
      setPrevData(prev);
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

  /* ── 증감 계산 ── */
  const totals = data?.totals || { total_sold: 0, total_stock: 0, overall_rate: 0, product_count: 0 };
  const prevTotals = prevData?.totals || { total_sold: 0, total_stock: 0, overall_rate: 0, product_count: 0 };

  const mergedProducts = useMemo(() => {
    if (!data?.byProduct) return [];
    const prevMap: Record<string, any> = {};
    for (const p of (prevData?.byProduct || [])) prevMap[p.product_code] = p;
    return data.byProduct.map((p: any) => {
      const prev = prevMap[p.product_code];
      return {
        ...p,
        prev_sold_qty: prev?.sold_qty ?? 0,
        prev_rate: prev?.sell_through_rate ?? 0,
        delta_sold: p.sold_qty - (prev?.sold_qty ?? 0),
        delta_rate: Number((p.sell_through_rate - (prev?.sell_through_rate ?? 0)).toFixed(1)),
      };
    }).sort((a: any, b: any) => b.sold_qty - a.sold_qty);
  }, [data, prevData]);

  const mergedCategories = useMemo(() => {
    if (!data?.byCategory) return [];
    const prevMap: Record<string, any> = {};
    for (const c of (prevData?.byCategory || [])) prevMap[c.category] = c;
    return data.byCategory.map((c: any) => {
      const prev = prevMap[c.category];
      return {
        ...c,
        prev_sold_qty: prev?.sold_qty ?? 0,
        delta_sold: c.sold_qty - (prev?.sold_qty ?? 0),
        delta_rate: Number((c.sell_through_rate - (prev?.sell_through_rate ?? 0)).toFixed(1)),
      };
    });
  }, [data, prevData]);

  const { surging, dropping } = useMemo(() => {
    const withPrev = mergedProducts.filter((p: any) => p.prev_sold_qty > 0 || p.sold_qty > 0);
    const sorted = [...withPrev].sort((a: any, b: any) => b.delta_rate - a.delta_rate);
    return {
      surging: sorted.filter((p: any) => p.delta_rate > 0).slice(0, 5),
      dropping: [...sorted].reverse().filter((p: any) => p.delta_rate < 0).slice(0, 5),
    };
  }, [mergedProducts]);

  const seasonData = useMemo(() => data?.bySeason || [], [data]);
  const ageData = useMemo(() => data?.byAge || [], [data]);

  /* ── 모달 핸들러 ── */
  const openDetail = (record: any) => {
    setDetailProduct(record);
    setDetailVariants((data?.byVariant || []).filter((v: any) => v.product_code === record.product_code));
    setDetailDaily((data?.dailyByProduct || []).filter((d: any) => d.product_code === record.product_code));
    setDetailOpen(true);
  };

  const openCatDetail = (category: string) => {
    setCatDetailCategory(category);
    setCatDetailProducts(mergedProducts.filter((p: any) => p.category === category));
    setCatDetailOpen(true);
  };

  /* ── 랭킹 테이블 컬럼 ── */
  const rankingColumns: any[] = [
    {
      title: '#', key: 'rank', width: 50, align: 'center' as const,
      render: (_: any, __: any, i: number) => {
        if (i < 3) return <Tag color="gold" style={{ fontWeight: 700, margin: 0 }}>{i + 1}</Tag>;
        return <span style={{ color: '#aaa' }}>{i + 1}</span>;
      },
    },
    {
      title: '상품명', dataIndex: 'product_name', key: 'pn', ellipsis: true,
      render: (v: string, r: any) => (
        <div>
          <div style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => openDetail(r)}>{v}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{r.product_code}</div>
        </div>
      ),
    },
    {
      title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
      render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
      filters: categoryOptions.map(c => ({ text: c.label, value: c.value })),
      onFilter: (val: any, r: any) => r.category === val,
    },
    {
      title: '시즌', dataIndex: 'season', key: 'season', width: 80,
      render: (v: string) => v ? formatCode('SEASON', v) : '-',
    },
    {
      title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 90, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 700 }}>{fmt(v)}</span>,
      sorter: (a: any, b: any) => a.sold_qty - b.sold_qty,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '△판매', dataIndex: 'delta_sold', key: 'ds', width: 85, align: 'right' as const,
      sorter: (a: any, b: any) => a.delta_sold - b.delta_sold,
      render: (v: number) => <DeltaSold v={v} />,
    },
    {
      title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const,
      render: (v: number) => fmt(v),
      sorter: (a: any, b: any) => a.current_stock - b.current_stock,
    },
    {
      title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 120, align: 'center' as const,
      sorter: (a: any, b: any) => a.sell_through_rate - b.sell_through_rate,
      render: (rate: number, record: any) => (
        <div style={{ cursor: 'pointer' }} onClick={() => openDetail(record)}>
          <span style={{ fontWeight: 700, color: rateColor(rate), fontSize: 14 }}>{rate}%</span>
          <Progress percent={rate} showInfo={false} size="small" strokeColor={rateColor(rate)} style={{ marginTop: 2 }} />
        </div>
      ),
    },
    {
      title: '△율', dataIndex: 'delta_rate', key: 'dr', width: 85, align: 'center' as const,
      sorter: (a: any, b: any) => a.delta_rate - b.delta_rate,
      render: (v: number) => <DeltaRate v={v} />,
    },
  ];

  return (
    <div>
      <PageHeader title="판매율 분석" />

      {/* ── 필터 바 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 300 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select mode="multiple" maxTagCount="responsive" value={categoryFilter} onChange={setCategoryFilter} style={{ width: 180 }}
            placeholder="전체" allowClear options={categoryOptions} /></div>
        <Space size={4} wrap style={{ alignSelf: 'flex-end' }}>
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(89, 'day'), today)}>90일</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('year'), today)}>올해</Button>
        </Space>
        <Button onClick={handleSearch} icon={<SearchOutlined />}>조회</Button>
        {prevData && (
          <span style={{ fontSize: 11, color: '#999', alignSelf: 'flex-end', paddingBottom: 6 }}>
            비교: {prevRange[0].format('M/D')} ~ {prevRange[1].format('M/D')}
          </span>
        )}
      </div>

      {/* ── 요약 카드 (증감 포함) ── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="전체 판매율" value={totals.overall_rate} suffix="%" valueStyle={{ color: rateColor(totals.overall_rate), fontWeight: 700 }} prefix={<BarChartOutlined />} />
            {prevTotals.overall_rate > 0 && (
              <div style={{ marginTop: 4 }}>
                <DeltaRate v={Number((totals.overall_rate - prevTotals.overall_rate).toFixed(1))} />
              </div>
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="총 판매수량" value={totals.total_sold} suffix="개" prefix={<ShoppingOutlined />} />
            <div style={{ marginTop: 4 }}><Change cur={totals.total_sold} prev={prevTotals.total_sold} /></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="현재 총재고" value={totals.total_stock} suffix="개" prefix={<InboxOutlined />} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>전기간 재고: {fmt(prevTotals.total_stock)}개</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="분석 상품" value={totals.product_count} suffix="개" />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>전기간: {fmt(prevTotals.product_count)}개</div>
          </Card>
        </Col>
      </Row>

      {/* ── 카테고리별 판매율 (증감 태그) ── */}
      {mergedCategories.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>
            카테고리별 판매율 <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>(클릭하면 해당 상품 목록)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {mergedCategories.slice(0, 7).map((c: any) => {
              const color = rateColor(c.sell_through_rate);
              return (
                <Card key={c.category} size="small" hoverable style={{ width: 145, textAlign: 'center', cursor: 'pointer' }} onClick={() => openCatDetail(c.category)}>
                  <Tag color={CAT_COLORS[c.category] || 'default'} style={{ marginBottom: 4, fontWeight: 600 }}>{c.category}</Tag>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>{c.sell_through_rate}%</div>
                  <Progress percent={c.sell_through_rate} showInfo={false} size="small" strokeColor={color} />
                  {c.delta_rate !== 0 && (
                    <div style={{ marginTop: 4 }}><DeltaRate v={c.delta_rate} /></div>
                  )}
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    판매 {fmt(c.sold_qty)}
                    {c.delta_sold !== 0 && (
                      <span style={{ color: c.delta_sold > 0 ? '#f5222d' : '#1890ff', marginLeft: 3 }}>
                        ({c.delta_sold > 0 ? '+' : ''}{fmt(c.delta_sold)})
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 시즌별 + 연차별 ── */}
      {(seasonData.length > 0 || ageData.length > 0) && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {seasonData.length > 0 && (
            <Col span={12}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>시즌별 판매율</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {seasonData.slice(0, 7).map((s: any) => (
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
                {ageData.slice(0, 7).map((a: any) => (
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

      {/* ── 급등/급락 하이라이트 ── */}
      {(surging.length > 0 || dropping.length > 0) && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Card size="small" title={<span style={{ color: '#f5222d', fontSize: 13 }}><FireOutlined /> 판매율 급등 TOP 5</span>} styles={{ body: { padding: '8px 16px' } }}>
              {surging.length === 0 ? <div style={{ color: '#aaa', textAlign: 'center', padding: 8 }}>해당 없음</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {surging.map((p: any, i: number) => (
                    <div key={p.product_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }} onClick={() => openDetail(p)}>
                      <span style={{ fontSize: 12 }}>
                        <span style={{ color: i < 3 ? '#f59e0b' : '#aaa', fontWeight: 700, marginRight: 6, width: 18, display: 'inline-block' }}>{i + 1}</span>
                        <Tag color={CAT_COLORS[p.category] || 'default'} style={{ fontSize: 10 }}>{p.category}</Tag>
                        <span style={{ marginLeft: 2 }}>{p.product_name}</span>
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: rateColor(p.sell_through_rate), marginRight: 6 }}>{p.sell_through_rate}%</span>
                        <Tag color="red" style={{ fontSize: 10, margin: 0 }}>+{p.delta_rate.toFixed(1)}%p</Tag>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title={<span style={{ color: '#1890ff', fontSize: 13 }}><ThunderboltOutlined /> 판매율 급락 TOP 5</span>} styles={{ body: { padding: '8px 16px' } }}>
              {dropping.length === 0 ? <div style={{ color: '#aaa', textAlign: 'center', padding: 8 }}>해당 없음</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dropping.map((p: any, i: number) => (
                    <div key={p.product_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }} onClick={() => openDetail(p)}>
                      <span style={{ fontSize: 12 }}>
                        <span style={{ color: '#aaa', fontWeight: 700, marginRight: 6, width: 18, display: 'inline-block' }}>{i + 1}</span>
                        <Tag color={CAT_COLORS[p.category] || 'default'} style={{ fontSize: 10 }}>{p.category}</Tag>
                        <span style={{ marginLeft: 2 }}>{p.product_name}</span>
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: rateColor(p.sell_through_rate), marginRight: 6 }}>{p.sell_through_rate}%</span>
                        <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{p.delta_rate.toFixed(1)}%p</Tag>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 일별 판매 트렌드 ── */}
      {(data?.daily?.length > 0) && (
        <Card size="small" style={{ marginBottom: 16 }}
          title={<span style={{ fontSize: 13, fontWeight: 600 }}>일별 판매 추이 <span style={{ fontWeight: 400, color: '#999', fontSize: 11, marginLeft: 6 }}>진한색: 현재기간 / 연한색: 비교기간</span></span>}>
          <DailyTrendChart current={data?.daily || []} previous={prevData?.daily || []} />
        </Card>
      )}

      {/* ── 판매 랭킹 테이블 ── */}
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>
        판매 랭킹 <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>가장 많이 팔린 순 (컬럼 클릭으로 정렬 변경)</span>
      </div>
      <Table
        columns={rankingColumns}
        dataSource={mergedProducts}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />

      {/* ══ 상품 세부 모달 ══ */}
      <Modal
        title={detailProduct ? `${detailProduct.product_name} 판매율 상세` : ''}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={800}
      >
        {detailProduct && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f7fa', padding: 14, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{detailProduct.product_name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {detailProduct.product_code} | {detailProduct.category} | {detailProduct.season ? formatCode('SEASON', detailProduct.season) : '-'}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: rateColor(detailProduct.sell_through_rate) }}>
                  {detailProduct.sell_through_rate}%
                </div>
                <Progress percent={detailProduct.sell_through_rate} showInfo={false} strokeColor={rateColor(detailProduct.sell_through_rate)} style={{ width: 120 }} />
                <div style={{ fontSize: 11, color: '#888' }}>판매 {fmt(detailProduct.sold_qty)}개 / 재고 {fmt(detailProduct.current_stock)}개</div>
                {detailProduct.delta_rate !== undefined && detailProduct.delta_rate !== 0 && (
                  <div style={{ marginTop: 4 }}><DeltaRate v={detailProduct.delta_rate} /></div>
                )}
              </div>
            </div>

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

      {/* ══ 카테고리 세부 모달 ══ */}
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
            { title: '판매수량', dataIndex: 'sold_qty', key: 'sold', width: 90, align: 'right' as const, render: (v: number) => <strong>{fmt(v)}</strong>, sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
            { title: '△판매', dataIndex: 'delta_sold', key: 'ds', width: 80, align: 'right' as const, render: (v: number) => <DeltaSold v={v} />, sorter: (a: any, b: any) => (a.delta_sold || 0) - (b.delta_sold || 0) },
            { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const, render: (v: number) => fmt(v) },
            {
              title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 120, align: 'center' as const,
              sorter: (a: any, b: any) => a.sell_through_rate - b.sell_through_rate,
              defaultSortOrder: 'descend' as const,
              render: (rate: number, record: any) => (
                <div style={{ cursor: 'pointer' }} onClick={() => { setCatDetailOpen(false); openDetail(record); }}>
                  <span style={{ fontWeight: 700, color: rateColor(rate) }}>{rate}%</span>
                  <Progress percent={rate} showInfo={false} size="small" strokeColor={rateColor(rate)} style={{ marginTop: 2 }} />
                </div>
              ),
            },
            { title: '△율', dataIndex: 'delta_rate', key: 'dr', width: 80, align: 'center' as const, render: (v: number) => <DeltaRate v={v || 0} />, sorter: (a: any, b: any) => (a.delta_rate || 0) - (b.delta_rate || 0) },
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
