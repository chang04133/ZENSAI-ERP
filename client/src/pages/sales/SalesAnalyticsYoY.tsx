import { useEffect, useState, useMemo } from 'react';
import { Card, Select, Space, Tag, Table, Row, Col, Statistic, Progress, Spin, Tabs, message } from 'antd';
import {
  RiseOutlined, FallOutlined, LineChartOutlined, FireOutlined,
  SkinOutlined, ColumnHeightOutlined, TagOutlined, BgColorsOutlined,
} from '@ant-design/icons';
import { salesApi } from '../../modules/sales/sales.api';
import {
  fmt, fmtW, ML, CAT_COLORS, COLORS, growthTag, growthPct, barStyle, capArr,
} from './SalesAnalyticsPage';

const MAX_CHART = 7;

export function SalesAnalyticsYoY() {
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
                    .sort((a: any, b: any) => Number(b.cur_amount) - Number(b.prev_amount) - (Number(a.cur_amount) - Number(a.prev_amount))).slice(0, MAX_CHART)}
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
                    .sort((a: any, b: any) => (Number(a.cur_amount) - Number(a.prev_amount)) - (Number(b.cur_amount) - Number(b.prev_amount))).slice(0, MAX_CHART)}
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
                    const sizeData = capArr(data?.bySize || [], MAX_CHART, 'size', ['total_qty', 'total_amount']);
                    const totalQty = sizeData.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                    return sizeData.map((r: any) => {
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
                <Card size="small" title="컬러별 판매 TOP">
                  {(() => {
                    const colorData = capArr(data?.byColor || [], MAX_CHART, 'color', ['total_qty', 'total_amount']);
                    const totalQty = colorData.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                    const colors: Record<string, string> = {
                      BK: '#000', WH: '#ccc', NV: '#001f6b', GR: '#52c41a', BE: '#d4b896',
                      RD: '#ff4d4f', BL: '#1890ff', BR: '#8b4513', PK: '#ff69b4', GY: '#999',
                      CR: '#fffdd0', IV: '#fffff0', KH: '#546b3e', WN: '#722f37',
                    };
                    return colorData.map((r: any) => {
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
