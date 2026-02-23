import { useEffect, useState } from 'react';
import { Card, Col, Row, Table, Progress, Typography, Spin, message, Tag, Select, Modal, Popover, Button, Collapse, InputNumber } from 'antd';
import {
  ExperimentOutlined, CheckCircleOutlined, SyncOutlined,
  FileDoneOutlined, ClockCircleOutlined, WarningOutlined,
  RocketOutlined, BarChartOutlined, RightOutlined, LoadingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { productionApi } from '../../modules/production/production.api';
import PendingActionsBanner from '../../components/PendingActionsBanner';

const CAT_LABELS: Record<string, string> = {
  TOP: '상의', BOTTOM: '하의', OUTER: '아우터', DRESS: '원피스', ACC: '악세서리',
};
const SEASON_LABELS: Record<string, string> = { SA: '봄/가을', SM: '여름', WN: '겨울' };
const SEASON_COLORS: Record<string, string> = { SA: 'green', SM: 'orange', WN: 'blue' };

export default function ProductionDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<string>('');

  // 세부 카테고리 드릴다운
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subCategory, setSubCategory] = useState<string>('');
  const [subStats, setSubStats] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // 자동 생산기획
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [autoPreview, setAutoPreview] = useState<any>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoQtyOverrides, setAutoQtyOverrides] = useState<Record<string, number>>({});

  // 상품코드 호버 - 변형 상세
  const [variantCache, setVariantCache] = useState<Record<string, any[]>>({});
  const [variantLoading, setVariantLoading] = useState<Record<string, boolean>>({});

  const loadVariants = async (productCode: string) => {
    if (variantCache[productCode] || variantLoading[productCode]) return;
    setVariantLoading((p) => ({ ...p, [productCode]: true }));
    try {
      const data = await productionApi.productVariantDetail(productCode);
      setVariantCache((p) => ({ ...p, [productCode]: data }));
    } catch { /* ignore */ }
    finally { setVariantLoading((p) => ({ ...p, [productCode]: false })); }
  };

  const rateBg = (rate: number) =>
    rate >= 80 ? '#f6ffed' : rate >= 50 ? '#e6f7ff' : rate >= 30 ? '#fff7e6' : '#fff1f0';
  const rateColor = (rate: number) =>
    rate >= 80 ? '#52c41a' : rate >= 50 ? '#1890ff' : rate >= 30 ? '#fa8c16' : '#ff4d4f';

  const renderVariantPopover = (productCode: string) => {
    const variants = variantCache[productCode];
    const isLoading = variantLoading[productCode];
    if (isLoading || !variants) {
      return <div style={{ padding: '12px 16px' }}><LoadingOutlined spin /> 로딩중...</div>;
    }
    if (variants.length === 0) {
      return <div style={{ padding: '12px 16px', color: '#aaa' }}>변형 정보가 없습니다</div>;
    }
    // 칼라별 그룹핑
    const colorMap: Record<string, any[]> = {};
    variants.forEach((v: any) => {
      const c = v.color || '미지정';
      if (!colorMap[c]) colorMap[c] = [];
      colorMap[c].push(v);
    });
    return (
      <div style={{ maxWidth: 420, maxHeight: 400, overflow: 'auto' }}>
        {Object.entries(colorMap).map(([color, items]) => {
          const colorTotal = items.reduce((s: number, v: any) => s + Number(v.sold_qty), 0);
          const colorStock = items.reduce((s: number, v: any) => s + Number(v.current_stock), 0);
          const colorRate = (colorTotal + colorStock) > 0
            ? Math.round(colorTotal / (colorTotal + colorStock) * 100) : 0;
          return (
            <div key={color} style={{ marginBottom: 10 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '4px 8px', background: '#fafafa', borderRadius: 4, marginBottom: 4,
                borderLeft: `3px solid ${rateColor(colorRate)}`,
              }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{color}</span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  판매 <strong>{colorTotal}</strong> · 재고 <strong>{colorStock}</strong> · <span style={{ color: rateColor(colorRate), fontWeight: 700 }}>{colorRate}%</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 4 }}>
                {items.map((v: any) => {
                  const r = Number(v.sell_through_rate);
                  return (
                    <div key={v.sku || `${color}-${v.size}`} style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11,
                      background: rateBg(r), border: `1px solid ${rateColor(r)}33`,
                      minWidth: 70, textAlign: 'center',
                    }}>
                      <div style={{ fontWeight: 700 }}>{v.size}</div>
                      <div style={{ color: '#555' }}>판매 {v.sold_qty} · 재고 {v.current_stock}</div>
                      <div style={{ color: rateColor(r), fontWeight: 600 }}>{r}%</div>
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

  const GRADE_COLORS: Record<string, string> = { S: 'red', A: 'orange', B: 'blue' };
  const GRADE_LABELS: Record<string, string> = { S: 'S급 (공격적)', A: 'A급 (적정)', B: 'B급 (보수적)' };

  const handleAutoPreview = async () => {
    setAutoModalOpen(true);
    setAutoLoading(true);
    setAutoQtyOverrides({});
    try {
      const data = await productionApi.autoGeneratePreview();
      setAutoPreview(data);
    } catch (e: any) { message.error(e.message); }
    finally { setAutoLoading(false); }
  };

  const handleAutoGenerate = async () => {
    setAutoGenerating(true);
    try {
      const result = await productionApi.autoGenerate();
      if (result.length === 0) {
        message.info('생산 권장 품목이 없습니다.');
      } else {
        message.success(`${result.length}개 카테고리 생산기획이 DRAFT로 생성되었습니다.`);
        setAutoModalOpen(false);
        loadAll(catFilter);
      }
    } catch (e: any) { message.error(e.message); }
    finally { setAutoGenerating(false); }
  };

  const loadAll = async (category?: string | '') => {
    setLoading(true);
    try {
      const [dashboard, recs, cats] = await Promise.all([
        productionApi.dashboard(),
        productionApi.recommendations({ limit: 30, category: category || undefined }),
        productionApi.categoryStats(),
      ]);
      setData(dashboard);
      setRecommendations(recs);
      setCategoryStats(cats);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(catFilter); }, []);

  const handleCatChange = (v: string) => {
    setCatFilter(v);
    loadAll(v);
  };

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
    <div>
      <PendingActionsBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />생산기획 대시보드
        </Typography.Title>
        <Button
          type="primary" icon={<ThunderboltOutlined />}
          onClick={handleAutoPreview}
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
        >
          자동 생산기획 생성
        </Button>
      </div>

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
        onCancel={() => setSubModalOpen(false)}
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
            />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            세부 카테고리 데이터가 없습니다.
          </div>
        )}
      </Modal>

      {/* 생산 권장 품목 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={<><RocketOutlined style={{ marginRight: 8 }} />생산 권장 품목 <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>(판매율 기준, 30일 수요 대비 부족)</span></>}
            size="small" style={{ borderRadius: 10 }}
            extra={
              <Select
                size="small"
                style={{ width: 110 }}
                value={catFilter}
                onChange={handleCatChange}
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
            {recommendations.length > 0 ? (
              <Table
                columns={[
                  { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110,
                    render: (v: string) => (
                      <Popover
                        content={renderVariantPopover(v)}
                        title={<span style={{ fontSize: 13 }}>{v} 칼라/사이즈별 상세</span>}
                        trigger="hover"
                        placement="rightTop"
                        mouseEnterDelay={0.3}
                        onOpenChange={(open) => { if (open) loadVariants(v); }}
                      >
                        <span style={{ color: '#1890ff', cursor: 'pointer', fontWeight: 600, borderBottom: '1px dashed #1890ff' }}>{v}</span>
                      </Popover>
                    ) },
                  { title: '상품명', dataIndex: 'product_name', key: 'name', width: 140, ellipsis: true },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                    render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: '시즌', dataIndex: 'product_season', key: 'season', width: 75, align: 'center' as const,
                    render: (v: string) => <Tag color={SEASON_COLORS[v] || 'default'}>{SEASON_LABELS[v] || v}</Tag> },
                  { title: '가중치', dataIndex: 'season_weight', key: 'weight', width: 65, align: 'center' as const,
                    render: (v: number) => {
                      const n = Number(v);
                      const color = n >= 1 ? '#52c41a' : n >= 0.6 ? '#fa8c16' : '#ff4d4f';
                      return <span style={{ color, fontWeight: 600 }}>{'\u00D7'}{n.toFixed(1)}</span>;
                    } },
                  { title: '판매수량', dataIndex: 'total_sold', key: 'sold', width: 85, align: 'right' as const,
                    render: (v: number) => Number(v).toLocaleString() },
                  { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 80, align: 'center' as const,
                    render: (v: number) => {
                      const n = Number(v);
                      const c = n >= 80 ? 'green' : n >= 50 ? 'blue' : n >= 40 ? 'orange' : 'red';
                      return <Tag color={c} style={{ fontWeight: 700, minWidth: 48, textAlign: 'center' }}>{n}%</Tag>;
                    },
                    sorter: (a: any, b: any) => Number(a.sell_through_rate) - Number(b.sell_through_rate) },
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
                scroll={{ x: 1060 }}
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
                pagination={false}
                size="small"
              />
            ) : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>생산중 품목이 없습니다</div>}
          </Card>
        </Col>
      </Row>

      {/* 자동 생산기획 미리보기 모달 */}
      <Modal
        title={<><ThunderboltOutlined style={{ marginRight: 8, color: '#764ba2' }} />자동 생산기획 미리보기</>}
        open={autoModalOpen}
        onCancel={() => setAutoModalOpen(false)}
        width={900}
        footer={autoPreview && autoPreview.totalProducts > 0 ? [
          <Button key="cancel" onClick={() => setAutoModalOpen(false)}>취소</Button>,
          <Button key="create" type="primary" loading={autoGenerating} onClick={handleAutoGenerate}
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>
            <ThunderboltOutlined /> {Object.keys(autoPreview?.categories || {}).length}개 카테고리 생산기획 생성 (DRAFT)
          </Button>,
        ] : null}
      >
        {autoLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : !autoPreview || autoPreview.totalProducts === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#52c41a' }}>
            <CheckCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 600 }}>현재 자동 생산이 필요한 품목이 없습니다</div>
            <div style={{ color: '#888', marginTop: 8 }}>판매율 기준에 해당하는 부족 재고가 없습니다</div>
          </div>
        ) : (
          <>
            {/* 요약 헤더 */}
            <div style={{
              display: 'flex', gap: 16, marginBottom: 16, padding: '12px 16px',
              background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
              borderRadius: 8,
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>대상 품목</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#764ba2' }}>{autoPreview.totalProducts}건</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>총 생산수량</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#764ba2' }}>{autoPreview.totalQty.toLocaleString()}개</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>카테고리</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#764ba2' }}>{Object.keys(autoPreview.categories).length}개</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: '#888' }}>
                  S급 ×{autoPreview.settings.gradeS.mult} | A급 ×{autoPreview.settings.gradeA.mult} | B급 ×{autoPreview.settings.gradeB.mult} | 안전 ×{autoPreview.settings.safetyBuffer}
                </div>
              </div>
            </div>

            {/* 카테고리별 Collapse */}
            <Collapse
              defaultActiveKey={Object.keys(autoPreview.categories)}
              items={Object.entries(autoPreview.categories).map(([cat, catData]: [string, any]) => ({
                key: cat,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span>
                      <Tag color="blue" style={{ fontWeight: 700 }}>{CAT_LABELS[cat] || cat}</Tag>
                      <span style={{ fontSize: 12, color: '#888' }}>{catData.items.length}개 품목</span>
                      {Object.entries(catData.grades as Record<string, number>).map(([g, c]) => (
                        <Tag key={g} color={GRADE_COLORS[g]} style={{ marginLeft: 4, fontSize: 11 }}>{g}급 {c}건</Tag>
                      ))}
                    </span>
                    <strong style={{ color: '#764ba2' }}>{catData.totalQty.toLocaleString()}개</strong>
                  </div>
                ),
                children: (
                  <Table
                    columns={[
                      { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                        render: (v: string) => <span style={{ fontWeight: 600, color: '#1890ff' }}>{v}</span> },
                      { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
                      { title: '등급', dataIndex: 'grade', key: 'grade', width: 70, align: 'center' as const,
                        render: (v: string) => <Tag color={GRADE_COLORS[v]} style={{ fontWeight: 700 }}>{v}급</Tag> },
                      { title: '판매율', dataIndex: 'sell_through_rate', key: 'rate', width: 75, align: 'center' as const,
                        render: (v: number) => <span style={{ color: rateColor(v), fontWeight: 700 }}>{v}%</span> },
                      { title: '재고일수', dataIndex: 'days_of_stock', key: 'days', width: 75, align: 'center' as const,
                        render: (v: number) => {
                          const c = v < 7 ? 'red' : v < 15 ? 'orange' : 'green';
                          return <Tag color={c}>{v}일</Tag>;
                        } },
                      { title: '현재고', dataIndex: 'current_stock', key: 'stock', width: 70, align: 'right' as const,
                        render: (v: number) => v.toLocaleString() },
                      { title: '부족', dataIndex: 'shortage_qty', key: 'short', width: 70, align: 'right' as const,
                        render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{v.toLocaleString()}</span> },
                      { title: '생산수량', dataIndex: 'final_qty', key: 'qty', width: 90, align: 'right' as const,
                        render: (v: number) => <strong style={{ color: '#764ba2' }}>{v.toLocaleString()}</strong> },
                    ]}
                    dataSource={catData.items}
                    rowKey="product_code"
                    pagination={false}
                    size="small"
                  />
                ),
              }))}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
