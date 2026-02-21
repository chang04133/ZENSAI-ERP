import { useEffect, useState } from 'react';
import { Card, Col, Row, Table, Progress, Typography, Spin, message, Tag, Select } from 'antd';
import {
  ExperimentOutlined, CheckCircleOutlined, SyncOutlined,
  FileDoneOutlined, ClockCircleOutlined, WarningOutlined,
  RocketOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { productionApi } from '../../modules/production/production.api';

const CAT_LABELS: Record<string, string> = {
  TOP: '상의', BOTTOM: '하의', OUTER: '아우터', DRESS: '원피스', ACC: '악세서리',
};

export default function ProductionDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<string | undefined>();

  const loadAll = async (category?: string) => {
    setLoading(true);
    try {
      const [dashboard, recs, cats] = await Promise.all([
        productionApi.dashboard(),
        productionApi.recommendations({ limit: 30, category }),
        productionApi.categoryStats(),
      ]);
      setData(dashboard);
      setRecommendations(recs);
      setCategoryStats(cats);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(catFilter); }, []);

  const handleCatChange = (v: string | undefined) => {
    setCatFilter(v);
    loadAll(v);
  };

  if (loading && !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const statusCounts = data?.statusCounts || [];
  const getCount = (s: string) => statusCounts.find((r: any) => r.status === s)?.count || 0;
  const getQty = (s: string) => statusCounts.find((r: any) => r.status === s)?.total_qty || 0;

  const statusColor = (s: string) =>
    s === 'CRITICAL' ? '#ff4d4f' : s === 'WARNING' ? '#fa8c16' : '#52c41a';
  const statusBg = (s: string) =>
    s === 'CRITICAL' ? '#fff1f0' : s === 'WARNING' ? '#fff7e6' : '#f6ffed';
  const statusLabel = (s: string) =>
    s === 'CRITICAL' ? '긴급' : s === 'WARNING' ? '주의' : '양호';

  return (
    <div style={{ maxWidth: 1400 }}>
      <Typography.Title level={4} style={{ marginBottom: 20 }}>
        <ExperimentOutlined style={{ marginRight: 8 }} />생산기획 대시보드
      </Typography.Title>

      {/* Status Cards */}
      <Row gutter={[16, 16]}>
        {[
          { key: 'DRAFT', label: '초안', icon: <ClockCircleOutlined />, bg: '#f0f0f0', color: '#666' },
          { key: 'CONFIRMED', label: '확정', icon: <CheckCircleOutlined />, bg: '#e6f7ff', color: '#1890ff' },
          { key: 'IN_PRODUCTION', label: '생산중', icon: <SyncOutlined spin />, bg: '#fff7e6', color: '#fa8c16' },
          { key: 'COMPLETED', label: '완료', icon: <FileDoneOutlined />, bg: '#f6ffed', color: '#52c41a' },
        ].map((s) => (
          <Col xs={12} sm={6} key={s.key}>
            <Card size="small" style={{ borderRadius: 10, background: s.bg, border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 28, color: s.color }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{getCount(s.key)}건</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{Number(getQty(s.key)).toLocaleString()}개</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 카테고리별 재고 현황 */}
      {categoryStats.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={<><BarChartOutlined style={{ marginRight: 8 }} />카테고리별 재고 현황 <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>(90일 판매 기준)</span></>}
              size="small" style={{ borderRadius: 10 }}
            >
              <Row gutter={[12, 12]}>
                {categoryStats.map((cat: any) => {
                  const sc = statusColor(cat.stock_status);
                  const sb = statusBg(cat.stock_status);
                  return (
                    <Col xs={24} sm={12} md={8} lg={6} key={cat.category}>
                      <div style={{
                        borderRadius: 8, background: sb, border: `1px solid ${sc}33`,
                        padding: '12px 14px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            {CAT_LABELS[cat.category] || cat.category}
                          </span>
                          <Tag color={cat.stock_status === 'CRITICAL' ? 'red' : cat.stock_status === 'WARNING' ? 'orange' : 'green'}>
                            {statusLabel(cat.stock_status)}
                          </Tag>
                        </div>
                        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                          <div>현재고: <strong>{Number(cat.current_stock).toLocaleString()}</strong>
                            {Number(cat.in_production_qty) > 0 && <span> + 생산중 <strong>{Number(cat.in_production_qty).toLocaleString()}</strong></span>}
                          </div>
                          <div>30일 예상 수요: <strong>{Number(cat.predicted_30d_demand).toLocaleString()}</strong></div>
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

      {/* 생산 권장 품목 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={<><RocketOutlined style={{ marginRight: 8 }} />생산 권장 품목 <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>(30일 수요 대비 부족)</span></>}
            size="small" style={{ borderRadius: 10 }}
            extra={
              <Select
                placeholder="카테고리"
                allowClear
                size="small"
                style={{ width: 110 }}
                value={catFilter}
                onChange={handleCatChange}
                options={[
                  { label: 'TOP', value: 'TOP' },
                  { label: 'BOTTOM', value: 'BOTTOM' },
                  { label: 'OUTER', value: 'OUTER' },
                  { label: 'DRESS', value: 'DRESS' },
                  { label: 'ACC', value: 'ACC' },
                ]}
              />
            }
          >
            {recommendations.length > 0 ? (
              <Table
                columns={[
                  { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110 },
                  { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                    render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: '90일 판매', dataIndex: 'total_sold_90d', key: 'sold', width: 85, align: 'right' as const,
                    render: (v: number) => Number(v).toLocaleString() },
                  { title: '일평균', dataIndex: 'avg_daily_sales', key: 'daily', width: 70, align: 'right' as const,
                    render: (v: number) => Number(v).toFixed(1) },
                  { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 70, align: 'right' as const,
                    render: (v: number) => Number(v).toLocaleString() },
                  { title: '생산중', dataIndex: 'in_production_qty', key: 'prod', width: 70, align: 'right' as const,
                    render: (v: number) => Number(v) > 0 ? <Tag color="orange">{Number(v).toLocaleString()}</Tag> : '-' },
                  { title: '재고일수', dataIndex: 'days_of_stock', key: 'days', width: 80, align: 'center' as const,
                    render: (v: number) => {
                      const n = Number(v);
                      const c = n < 7 ? 'red' : n < 15 ? 'orange' : 'green';
                      return <Tag color={c}>{n}일</Tag>;
                    } },
                  { title: '부족', dataIndex: 'shortage_qty', key: 'short', width: 70, align: 'right' as const,
                    render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{Number(v).toLocaleString()}</span> },
                  { title: '권장생산', dataIndex: 'recommended_qty', key: 'rec', width: 85, align: 'right' as const,
                    render: (v: number) => <strong style={{ color: '#1890ff' }}>{Number(v).toLocaleString()}</strong> },
                  { title: '', key: 'urgency', width: 40, align: 'center' as const,
                    render: (_: any, r: any) => {
                      const d = Number(r.days_of_stock);
                      if (d < 7) return <WarningOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
                      if (d < 15) return <WarningOutlined style={{ color: '#fa8c16', fontSize: 16 }} />;
                      return null;
                    } },
                ]}
                dataSource={recommendations}
                rowKey="product_code"
                pagination={{ pageSize: 10, size: 'small' }}
                size="small"
                loading={loading}
                scroll={{ x: 900 }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 30, color: '#52c41a' }}>
                <CheckCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                <div>현재 생산이 권장되는 품목이 없습니다</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 생산 미완료 품목 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="생산 미완료 품목 (생산중)" size="small" style={{ borderRadius: 10 }}
            extra={<a onClick={() => navigate('/production/plans')}>전체보기</a>}>
            {(data?.progressItems || []).length > 0 ? (
              <Table
                columns={[
                  { title: '계획', dataIndex: 'plan_no', key: 'plan', width: 110 },
                  { title: '상품', dataIndex: 'product_name', key: 'product', ellipsis: true },
                  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, render: (v: string) => v || '-' },
                  { title: '계획', dataIndex: 'plan_qty', key: 'plan_qty', width: 60 },
                  { title: '생산', dataIndex: 'produced_qty', key: 'prod_qty', width: 60 },
                  { title: '진행률', key: 'pct', width: 100, render: (_: any, r: any) => {
                    const pct = r.plan_qty > 0 ? Math.round((r.produced_qty / r.plan_qty) * 100) : 0;
                    return <Progress percent={pct} size="small" status={pct >= 100 ? 'success' : 'active'} />;
                  }},
                ]}
                dataSource={data?.progressItems || []}
                rowKey="item_id"
                pagination={false}
                size="small"
              />
            ) : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>생산중 품목이 없습니다</div>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
