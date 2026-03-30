import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Table, Progress, Typography, Spin, message, Tag, Modal, Tabs } from 'antd';
import {
  ExperimentOutlined, BarChartOutlined, RightOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { productionApi } from '../../modules/production/production.api';
import PendingActionsBanner from '../../components/PendingActionsBanner';

const CAT_LABELS: Record<string, string> = {
  TOP: '상의', BOTTOM: '하의', OUTER: '아우터', DRESS: '원피스', ACC: '악세서리',
};

export default function ProductionDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 세부 카테고리 드릴다운
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subCategory, setSubCategory] = useState<string>('');
  const [subStats, setSubStats] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // 상세 분석 데이터
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('stock');

  const statusColor = (s: string) =>
    s === 'CRITICAL' ? '#ff4d4f' : s === 'WARNING' ? '#fa8c16' : '#52c41a';
  const statusBg = (s: string) =>
    s === 'CRITICAL' ? '#fff1f0' : s === 'WARNING' ? '#fff7e6' : '#f6ffed';
  const statusLabel = (s: string) =>
    s === 'CRITICAL' ? '긴급' : s === 'WARNING' ? '주의' : '양호';

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashboard, cats] = await Promise.all([
        productionApi.dashboard(),
        productionApi.categoryStats(),
      ]);
      setData(dashboard);
      setCategoryStats(cats);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const handleCategoryClick = async (category: string) => {
    setSubCategory(category);
    setSubModalOpen(true);
    setSubLoading(true);
    setDetailedStats(null);
    setActiveTab('stock');
    try {
      const [stats, detailed] = await Promise.all([
        productionApi.categorySubStats(category),
        productionApi.categoryDetailedStats(category),
      ]);
      setSubStats(stats);
      setDetailedStats(detailed);
    } catch (e: any) { message.error(e.message); }
    finally { setSubLoading(false); }
  };

  // 월별 판매 데이터를 테이블 형태로 변환 (합계 행만 사용)
  const getMonthlyTotalData = () => {
    if (!detailedStats?.monthlySales) return [];
    return detailedStats.monthlySales
      .filter((r: any) => r.sub_category === '합계')
      .map((r: any) => ({ ...r, key: r.month }));
  };

  // 트렌드 아이콘
  const trendIcon = (pct: number) => {
    if (pct > 5) return <ArrowUpOutlined style={{ color: '#52c41a', fontSize: 11 }} />;
    if (pct < -5) return <ArrowDownOutlined style={{ color: '#ff4d4f', fontSize: 11 }} />;
    return <MinusOutlined style={{ color: '#999', fontSize: 11 }} />;
  };

  if (loading && !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <PendingActionsBanner />
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />생산기획 대시보드
        </Typography.Title>
      </div>

      {/* 카테고리별 재고 현황 */}
      {categoryStats.length > 0 && (
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card
              title={<><BarChartOutlined style={{ marginRight: 8 }} />카테고리별 재고 현황 <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>(90일 판매 기준, 클릭시 상세분석)</span></>}
              size="small" style={{ borderRadius: 10 }}
            >
              <Row gutter={[12, 12]}>
                {categoryStats.map((cat: any) => {
                  const sc = statusColor(cat.stock_status);
                  const sb = statusBg(cat.stock_status);
                  return (
                    <Col xs={24} sm={12} md={8} lg={6} key={cat.category}>
                      <div
                        style={{
                          borderRadius: 8, background: sb, border: `1px solid ${sc}33`,
                          padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow 0.2s',
                        }}
                        onClick={() => handleCategoryClick(cat.category)}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 8px ${sc}44`; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            {CAT_LABELS[cat.category] || cat.category}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Tag color={cat.stock_status === 'CRITICAL' ? 'red' : cat.stock_status === 'WARNING' ? 'orange' : 'green'}>
                              {statusLabel(cat.stock_status)}
                            </Tag>
                            <RightOutlined style={{ fontSize: 10, color: '#aaa' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                          <div>현재고: <strong>{Number(cat.current_stock).toLocaleString()}</strong>
                            {Number(cat.in_production_qty) > 0 && <span> + 생산중 <strong>{Number(cat.in_production_qty).toLocaleString()}</strong></span>}
                          </div>
                          <div>완판예상: <strong>{cat.sellout_date ? cat.sellout_date.slice(5) : '-'}</strong></div>
                          <div style={{ color: sc, fontWeight: 600 }}>
                            재고 커버리지: {cat.stock_coverage_days >= 9999 ? '충분' : `${cat.stock_coverage_days}일`}
                          </div>
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          </Col>
        </Row>
      )}

      {/* 세부 카테고리 모달 */}
      <Modal
        title={<><BarChartOutlined style={{ marginRight: 8 }} />{CAT_LABELS[subCategory] || subCategory} - 상세 분석</>}
        open={subModalOpen}
        onCancel={() => { setSubModalOpen(false); setSubStats([]); setDetailedStats(null); }}
        footer={null}
        width={1000}
      >
        {subLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : (
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
              key: 'stock',
              label: '재고 현황',
              children: subStats.length > 0 ? (
                <>
                  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    {subStats.map((sub: any) => {
                      const sc = statusColor(sub.stock_status);
                      const sb = statusBg(sub.stock_status);
                      return (
                        <Col xs={24} sm={12} md={8} key={sub.sub_category}>
                          <div style={{
                            borderRadius: 8, background: sb, border: `1px solid ${sc}33`,
                            padding: '10px 12px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 13 }}>
                                {sub.sub_category_label || sub.sub_category}
                              </span>
                              <Tag color={sub.stock_status === 'CRITICAL' ? 'red' : sub.stock_status === 'WARNING' ? 'orange' : 'green'} style={{ fontSize: 11 }}>
                                {statusLabel(sub.stock_status)}
                              </Tag>
                            </div>
                            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                              <div>상품수: <strong>{sub.product_count}</strong></div>
                              <div>현재고: <strong>{Number(sub.current_stock).toLocaleString()}</strong>
                                {Number(sub.in_production_qty) > 0 && <span> + 생산중 <strong>{Number(sub.in_production_qty).toLocaleString()}</strong></span>}
                              </div>
                              <div>완판예상: <strong>{sub.sellout_date ? sub.sellout_date.slice(5) : '-'}</strong></div>
                              <div style={{ color: sc, fontWeight: 600 }}>
                                커버리지: {sub.stock_coverage_days >= 9999 ? '충분' : `${sub.stock_coverage_days}일`}
                              </div>
                            </div>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                  <Table
                    columns={[
                      { title: '세부카테고리', dataIndex: 'sub_category_label', key: 'sub', width: 120,
                        render: (v: string, r: any) => <Tag color="cyan">{v || r.sub_category}</Tag> },
                      { title: '상품수', dataIndex: 'product_count', key: 'cnt', width: 70, align: 'center' as const },
                      { title: '90일 판매', dataIndex: 'total_sold_90d', key: 'sold', width: 90, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '일평균', dataIndex: 'avg_daily_sales', key: 'daily', width: 70, align: 'right' as const,
                        render: (v: number) => Number(v).toFixed(1) },
                      { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '생산중', dataIndex: 'in_production_qty', key: 'prod', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v) > 0 ? <Tag color="orange">{Number(v).toLocaleString()}</Tag> : '-' },
                      { title: '완판예상', dataIndex: 'sellout_date', key: 'sellout', width: 90, align: 'center' as const,
                        render: (v: string) => v ? <span style={{ fontSize: 12 }}>{v.slice(5)}</span> : '-' },
                      { title: '커버리지', dataIndex: 'stock_coverage_days', key: 'cover', width: 90, align: 'center' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          if (n >= 9999) return <Tag color="green">충분</Tag>;
                          const c = n < 7 ? 'red' : n < 15 ? 'orange' : 'green';
                          return <Tag color={c}>{n}일</Tag>;
                        }},
                      { title: '상태', dataIndex: 'stock_status', key: 'status', width: 70, align: 'center' as const,
                        render: (v: string) => (
                          <Tag color={v === 'CRITICAL' ? 'red' : v === 'WARNING' ? 'orange' : 'green'}>
                            {statusLabel(v)}
                          </Tag>
                        )},
                    ]}
                    dataSource={subStats}
                    rowKey="sub_category"
                    pagination={false}
                    size="small"
                    scroll={{ x: 900 }}
                  />
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                  세부 카테고리 데이터가 없습니다.
                </div>
              ),
            },
            {
              key: 'yearly',
              label: '1년 판매 분석',
              children: detailedStats ? (
                <>
                  {/* 세부카테고리별 1년 요약 카드 */}
                  {detailedStats.yearSummary.length > 0 && (
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                      {detailedStats.yearSummary.map((ys: any) => (
                        <Col xs={24} sm={12} md={8} key={ys.sub_category}>
                          <div style={{
                            borderRadius: 8, background: '#f5f5f5', border: '1px solid #e8e8e8',
                            padding: '10px 12px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 13 }}>
                                {ys.sub_category_label}
                              </span>
                              <span style={{ fontSize: 11, color: Number(ys.trend_pct) > 0 ? '#52c41a' : Number(ys.trend_pct) < 0 ? '#ff4d4f' : '#999' }}>
                                {trendIcon(Number(ys.trend_pct))} {Number(ys.trend_pct) > 0 ? '+' : ''}{Number(ys.trend_pct).toFixed(1)}%
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                              <div>연간 판매: <strong>{Number(ys.total_sold_1y).toLocaleString()}</strong>개</div>
                              <div>월평균: <strong>{Number(ys.avg_monthly_sales).toLocaleString()}</strong>개</div>
                              <div>최근 30일: <strong>{Number(ys.total_sold_30d).toLocaleString()}</strong>개</div>
                              <div>매출액: <strong>{(Number(ys.total_revenue) / 10000).toFixed(0)}만원</strong></div>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  )}
                  <Table
                    columns={[
                      { title: '세부카테고리', dataIndex: 'sub_category_label', key: 'sub', width: 120,
                        render: (v: string) => <Tag color="blue">{v}</Tag> },
                      { title: '연간 판매', dataIndex: 'total_sold_1y', key: 'y', width: 100, align: 'right' as const,
                        render: (v: number) => <strong>{Number(v).toLocaleString()}</strong> },
                      { title: '월평균', dataIndex: 'avg_monthly_sales', key: 'avg', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '90일', dataIndex: 'total_sold_90d', key: 's90', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '30일', dataIndex: 'total_sold_30d', key: 's30', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '매출액(만)', dataIndex: 'total_revenue', key: 'rev', width: 100, align: 'right' as const,
                        render: (v: number) => `${(Number(v) / 10000).toFixed(0)}` },
                      { title: '추세', dataIndex: 'trend_pct', key: 'trend', width: 90, align: 'center' as const,
                        render: (v: number) => {
                          const n = Number(v);
                          const color = n > 5 ? '#52c41a' : n < -5 ? '#ff4d4f' : '#666';
                          return <span style={{ color, fontWeight: 600 }}>{trendIcon(n)} {n > 0 ? '+' : ''}{n.toFixed(1)}%</span>;
                        }},
                    ]}
                    dataSource={detailedStats.yearSummary}
                    rowKey="sub_category"
                    pagination={false}
                    size="small"
                    scroll={{ x: 700 }}
                    summary={(data) => {
                      const rows = data as unknown as any[];
                      const total1y = rows.reduce((s: number, r: any) => s + Number(r.total_sold_1y), 0);
                      const totalAvg = rows.reduce((s: number, r: any) => s + Number(r.avg_monthly_sales), 0);
                      const total90 = rows.reduce((s: number, r: any) => s + Number(r.total_sold_90d), 0);
                      const total30 = rows.reduce((s: number, r: any) => s + Number(r.total_sold_30d), 0);
                      const totalRev = rows.reduce((s: number, r: any) => s + Number(r.total_revenue), 0);
                      return (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right"><strong>{total1y.toLocaleString()}</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right"><strong>{totalAvg.toLocaleString()}</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={3} align="right"><strong>{total90.toLocaleString()}</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={4} align="right"><strong>{total30.toLocaleString()}</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={5} align="right"><strong>{(totalRev / 10000).toFixed(0)}</strong></Table.Summary.Cell>
                          <Table.Summary.Cell index={6} />
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </>
              ) : <Spin style={{ display: 'block', margin: '40px auto' }} />,
            },
            {
              key: 'monthly',
              label: '월별 추이',
              children: detailedStats ? (
                <>
                  {/* 간단 바 차트 형태 (CSS 기반) */}
                  {(() => {
                    const monthlyData = getMonthlyTotalData();
                    const maxQty = Math.max(...monthlyData.map((m: any) => Number(m.sold_qty)), 1);
                    return monthlyData.length > 0 ? (
                      <>
                        <div style={{ marginBottom: 16 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>최근 12개월 판매 추이</Typography.Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, marginBottom: 16, padding: '0 8px' }}>
                          {monthlyData.map((m: any) => {
                            const pct = (Number(m.sold_qty) / maxQty) * 100;
                            return (
                              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{Number(m.sold_qty).toLocaleString()}</span>
                                <div style={{
                                  width: '100%', maxWidth: 48,
                                  height: `${Math.max(pct, 3)}%`,
                                  background: 'linear-gradient(180deg, #1890ff 0%, #69c0ff 100%)',
                                  borderRadius: '4px 4px 0 0',
                                  minHeight: 4,
                                }} />
                                <span style={{ fontSize: 9, color: '#999', marginTop: 4 }}>{m.month.slice(5)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <Table
                          columns={[
                            { title: '월', dataIndex: 'month', key: 'month', width: 100 },
                            { title: '판매수량', dataIndex: 'sold_qty', key: 'qty', width: 100, align: 'right' as const,
                              render: (v: number) => Number(v).toLocaleString() },
                            { title: '매출액', dataIndex: 'sold_amount', key: 'amt', width: 120, align: 'right' as const,
                              render: (v: number) => `${(Number(v) / 10000).toFixed(0)}만원` },
                          ]}
                          dataSource={monthlyData}
                          rowKey="month"
                          pagination={false}
                          size="small"
                          summary={(data) => {
                            const rows = data as unknown as any[];
                            const totalQty = rows.reduce((s: number, r: any) => s + Number(r.sold_qty), 0);
                            const totalAmt = rows.reduce((s: number, r: any) => s + Number(r.sold_amount), 0);
                            return (
                              <Table.Summary.Row>
                                <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><strong>{totalQty.toLocaleString()}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right"><strong>{(totalAmt / 10000).toFixed(0)}만원</strong></Table.Summary.Cell>
                              </Table.Summary.Row>
                            );
                          }}
                        />
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>월별 판매 데이터가 없습니다.</div>
                    );
                  })()}
                </>
              ) : <Spin style={{ display: 'block', margin: '40px auto' }} />,
            },
            {
              key: 'top',
              label: '인기 상품',
              children: detailedStats ? (
                detailedStats.topProducts.length > 0 ? (
                  <Table
                    columns={[
                      { title: '#', key: 'rank', width: 40, align: 'center' as const,
                        render: (_: any, __: any, idx: number) => <strong>{idx + 1}</strong> },
                      { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110 },
                      { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true },
                      { title: '세부카테고리', dataIndex: 'sub_category', key: 'sub', width: 100,
                        render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                      { title: '연간 판매', dataIndex: 'total_sold_1y', key: 'sold', width: 90, align: 'right' as const,
                        render: (v: number) => <strong>{Number(v).toLocaleString()}</strong> },
                      { title: '월평균', dataIndex: 'avg_monthly_sales', key: 'avg', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 80, align: 'right' as const,
                        render: (v: number) => Number(v).toLocaleString() },
                      { title: '매출액(만)', dataIndex: 'total_revenue', key: 'rev', width: 100, align: 'right' as const,
                        render: (v: number) => `${(Number(v) / 10000).toFixed(0)}` },
                    ]}
                    dataSource={detailedStats.topProducts}
                    rowKey="product_code"
                    pagination={false}
                    size="small"
                    scroll={{ x: 800 }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>판매 데이터가 없습니다.</div>
                )
              ) : <Spin style={{ display: 'block', margin: '40px auto' }} />,
            },
          ]} />
        )}
      </Modal>

      {/* 생산 미완료 품목 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="생산 미완료 품목 (생산중)" size="small" style={{ borderRadius: 10 }}
            extra={<Button type="link" style={{ padding: 0 }} onClick={() => navigate('/production/plans')}>전체보기</Button>}>
            {(data?.progressItems || []).length > 0 ? (
              <Table
                columns={[
                  { title: '계획', dataIndex: 'plan_no', key: 'plan', width: 110 },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 80, render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                  { title: '핏', dataIndex: 'fit', key: 'fit', width: 80, render: (v: string) => v || '-' },
                  { title: '기장', dataIndex: 'length', key: 'len', width: 80, render: (v: string) => v || '-' },
                  { title: '계획', dataIndex: 'plan_qty', key: 'plan_qty', width: 60 },
                  { title: '생산', dataIndex: 'produced_qty', key: 'prod_qty', width: 60 },
                  { title: '진행률', key: 'pct', width: 100, render: (_: any, r: any) => {
                    const pct = r.plan_qty > 0 ? Math.round((r.produced_qty / r.plan_qty) * 100) : 0;
                    return <Progress percent={pct} size="small" status={pct >= 100 ? 'success' : 'active'} />;
                  }},
                ]}
                dataSource={data?.progressItems || []}
                rowKey="item_id"
                pagination={{ pageSize: 50, size: 'small', showTotal: (t: number) => `총 ${t}건` }}
                size="small"
                scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              />
            ) : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>생산중 품목이 없습니다</div>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
