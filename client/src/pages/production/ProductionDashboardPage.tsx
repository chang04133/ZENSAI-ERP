import { useEffect, useState } from 'react';
import { Card, Col, Row, Table, Progress, Typography, Spin, message, Tag, Modal } from 'antd';
import {
  ExperimentOutlined, BarChartOutlined, RightOutlined,
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
    try {
      const stats = await productionApi.categorySubStats(category);
      setSubStats(stats);
    } catch (e: any) { message.error(e.message); }
    finally { setSubLoading(false); }
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
              title={<><BarChartOutlined style={{ marginRight: 8 }} />카테고리별 재고 현황 <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>(90일 판매 기준, 클릭시 세부카테고리)</span></>}
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

      {/* 세부 카테고리 모달 */}
      <Modal
        title={<><BarChartOutlined style={{ marginRight: 8 }} />{CAT_LABELS[subCategory] || subCategory} - 세부 카테고리별 재고 현황</>}
        open={subModalOpen}
        onCancel={() => { setSubModalOpen(false); setSubStats([]); }}
        footer={null}
        width={900}
      >
        {subLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : subStats.length > 0 ? (
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
                        <div>30일 수요: <strong>{Number(sub.predicted_30d_demand).toLocaleString()}</strong></div>
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
                { title: '30일 수요', dataIndex: 'predicted_30d_demand', key: 'demand', width: 90, align: 'right' as const,
                  render: (v: number) => Number(v).toLocaleString() },
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
              scroll={{ x: 800 }}
            />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            세부 카테고리 데이터가 없습니다.
          </div>
        )}
      </Modal>

      {/* 생산 미완료 품목 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="생산 미완료 품목 (생산중)" size="small" style={{ borderRadius: 10 }}
            extra={<a onClick={() => navigate('/production/plans')}>전체보기</a>}>
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
                pagination={{ pageSize: 20, size: 'small', showTotal: (t: number) => `총 ${t}건` }}
                size="small"
                scroll={{ x: 800 }}
              />
            ) : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>생산중 품목이 없습니다</div>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
