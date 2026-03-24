import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Table, Progress, Typography, Spin, message, Tag } from 'antd';
import {
  ExperimentOutlined, DollarOutlined, RightOutlined,
  ArrowUpOutlined, ArrowDownOutlined, BankOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { productionApi } from '../../modules/production/production.api';
import { codeApi } from '../../modules/code/code.api';
import PendingActionsBanner from '../../components/PendingActionsBanner';

const fmtNum = (v: number) => v.toLocaleString();
const fmtWon = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
  return v.toLocaleString();
};

const CATEGORY_COLORS: Record<string, string> = {
  TOP: '#1890ff', BOTTOM: '#52c41a', OUTER: '#fa8c16', DRESS: '#eb2f96', ACC: '#722ed1',
};

export default function ProductionDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [catLabelMap, setCatLabelMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [dashboard, codes] = await Promise.all([
          productionApi.dashboard(),
          codeApi.getAll(),
        ]);
        setData(dashboard);
        const cats = (codes.CATEGORY || []).filter((c: any) => !c.parent_code && c.is_active);
        const map: Record<string, string> = {};
        for (const c of cats) map[c.code_value] = c.code_label;
        setCatLabelMap(map);
      } catch (e: any) { message.error(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading && !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const fin = data?.financialSummary;
  const pay = data?.paymentSummary;
  const yearlyPlans: any[] = data?.yearlyPlanSummary || [];
  const catProd: any[] = data?.categoryProduction || [];

  const thisYear = fin?.thisYear?.year || new Date().getFullYear();
  const lastYear = fin?.lastYear?.year || thisYear - 1;
  const twoYearsAgo = fin?.twoYearsAgo?.year || thisYear - 2;

  // 연도별 요약 데이터 조합
  const yearMap: Record<number, any> = {};
  for (const yr of [thisYear, lastYear, twoYearsAgo]) {
    const plan = yearlyPlans.find((p: any) => p.yr === yr);
    const f = yr === thisYear ? fin?.thisYear : yr === lastYear ? fin?.lastYear : fin?.twoYearsAgo;
    yearMap[yr] = {
      year: yr,
      plan_count: plan?.plan_count || 0,
      plan_qty: plan?.plan_qty || 0,
      produced_qty: plan?.produced_qty || 0,
      purchase_cost: f?.purchase_cost || 0,
      material_cost: f?.material_cost || 0,
      total_cost: (f?.purchase_cost || 0) + (f?.material_cost || 0),
    };
  }

  const thisYearData = yearMap[thisYear];
  const lastYearData = yearMap[lastYear];
  const pctChange = lastYearData.total_cost > 0
    ? ((thisYearData.total_cost - lastYearData.total_cost) / lastYearData.total_cost * 100)
    : 0;

  // 카테고리별 데이터: 올해/작년 비교
  const allCategories = new Set(catProd.map((r: any) => r.category).filter(Boolean));
  const catRows = Array.from(allCategories).map(cat => {
    const thisYearCat = catProd.find((r: any) => r.yr === thisYear && r.category === cat);
    const lastYearCat = catProd.find((r: any) => r.yr === lastYear && r.category === cat);
    const tyQty = thisYearCat?.plan_qty || 0;
    const lyQty = lastYearCat?.plan_qty || 0;
    const qtyChange = lyQty > 0 ? ((tyQty - lyQty) / lyQty * 100) : tyQty > 0 ? 100 : 0;
    return {
      key: cat,
      category: cat,
      label: catLabelMap[cat] || cat,
      ty_count: thisYearCat?.plan_count || 0,
      ty_qty: tyQty,
      ty_cost: Number(thisYearCat?.total_cost || 0),
      ly_count: lastYearCat?.plan_count || 0,
      ly_qty: lyQty,
      ly_cost: Number(lastYearCat?.total_cost || 0),
      qty_change: qtyChange,
    };
  }).sort((a, b) => b.ty_cost - a.ty_cost);

  const YEAR_CARDS = [
    { yr: thisYear, label: '올해', data: thisYearData, color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff', highlight: true },
    { yr: lastYear, label: '작년', data: lastYearData, color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9', highlight: false },
    { yr: twoYearsAgo, label: '재작년', data: yearMap[twoYearsAgo], color: '#bfbfbf', bg: '#fafafa', border: '#e8e8e8', highlight: false },
  ];

  return (
    <div>
      <PendingActionsBanner />
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />생산기획 대시보드
        </Typography.Title>
      </div>

      {/* 섹션 1: 연도별 생산 비교 (3개년) */}
      <Card title="연도별 생산 비교" size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          {YEAR_CARDS.map(({ yr, label, data: d, color, bg, border, highlight }) => (
            <Col xs={24} sm={8} key={yr}>
              <div style={{
                borderRadius: 10, background: bg, border: `2px solid ${border}`,
                padding: 16, position: 'relative',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 12 }}>
                  {label} ({yr})
                  {highlight && lastYearData.total_cost > 0 && (
                    <Tag
                      color={pctChange >= 0 ? 'red' : 'green'}
                      style={{ marginLeft: 8, fontSize: 11 }}
                    >
                      {pctChange >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      {' '}{Math.abs(pctChange).toFixed(0)}%
                    </Tag>
                  )}
                </div>
                {[
                  { label: '생산 건수', value: `${fmtNum(d.plan_count)}건` },
                  { label: '계획 수량', value: `${fmtNum(d.plan_qty)}개` },
                  { label: '매입비용', value: `${fmtWon(d.purchase_cost)}원` },
                  { label: '부자재비용', value: `${fmtWon(d.material_cost)}원` },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                    <span style={{ color: '#666' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: '#333' }}>{loading ? '-' : row.value}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #e8e8e8', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ fontWeight: 700, color }}>총 비용</span>
                  <span style={{ fontWeight: 700, color, fontSize: 16 }}>{loading ? '-' : `${fmtWon(d.total_cost)}원`}</span>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 섹션 2: 카테고리별 생산 실적 */}
      <Card title="카테고리별 생산 실적" size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Table
          columns={[
            { title: '카테고리', dataIndex: 'label', key: 'cat', width: 120,
              render: (v: string, r: any) => (
                <Tag color={CATEGORY_COLORS[r.category] || 'default'} style={{ fontWeight: 600 }}>{v}</Tag>
              ),
            },
            { title: `${thisYear} 건수`, dataIndex: 'ty_count', key: 'ty_cnt', width: 90, align: 'right' as const,
              render: (v: number) => `${v}건` },
            { title: `${thisYear} 수량`, dataIndex: 'ty_qty', key: 'ty_qty', width: 100, align: 'right' as const,
              render: (v: number) => <strong>{fmtNum(v)}개</strong> },
            { title: `${thisYear} 비용`, dataIndex: 'ty_cost', key: 'ty_cost', width: 120, align: 'right' as const,
              render: (v: number) => v > 0 ? `${fmtWon(v)}원` : '-' },
            { title: `${lastYear} 수량`, dataIndex: 'ly_qty', key: 'ly_qty', width: 100, align: 'right' as const,
              render: (v: number) => <span style={{ color: '#999' }}>{fmtNum(v)}개</span> },
            { title: `${lastYear} 비용`, dataIndex: 'ly_cost', key: 'ly_cost', width: 120, align: 'right' as const,
              render: (v: number) => v > 0 ? <span style={{ color: '#999' }}>{fmtWon(v)}원</span> : '-' },
            { title: '증감', dataIndex: 'qty_change', key: 'change', width: 90, align: 'right' as const,
              render: (v: number) => {
                if (v === 0) return <span style={{ color: '#ccc' }}>-</span>;
                return (
                  <span style={{ color: v > 0 ? '#cf1322' : '#3f8600', fontWeight: 600 }}>
                    {v > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(v).toFixed(0)}%
                  </span>
                );
              },
            },
          ]}
          dataSource={catRows}
          rowKey="key"
          pagination={false}
          size="small"
          locale={{ emptyText: '생산 실적이 없습니다' }}
        />
      </Card>

      {/* 섹션 3: 생산정산 */}
      <Card title="생산정산" size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
      <Row gutter={[12, 12]}>
        {[
          { label: '선지급 대기', count: pay?.advance_pending_count || 0, amount: Number(pay?.advance_pending_amount || 0),
            color: '#cf1322', bg: '#fff1f0', border: '#ffa39e', icon: <DollarOutlined /> },
          { label: '선지급 완료', count: pay?.advance_paid_count || 0, amount: Number(pay?.advance_paid_amount || 0),
            color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', icon: <DollarOutlined /> },
          { label: '잔금 대기', count: pay?.balance_pending_count || 0, amount: Number(pay?.balance_pending_amount || 0),
            color: '#fa8c16', bg: '#fff7e6', border: '#ffd591', icon: <BankOutlined /> },
          { label: '정산 완료', count: pay?.settled_count || 0, amount: Number(pay?.settled_amount || 0),
            color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', icon: <FileDoneOutlined /> },
        ].map(card => (
          <Col xs={12} sm={6} key={card.label}>
            <div style={{
              borderRadius: 8, background: card.bg, border: `1px solid ${card.border}`,
              padding: '12px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: card.color, opacity: 0.8, marginBottom: 2 }}>
                {card.icon} {card.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: card.color }}>
                {loading ? '-' : `${fmtWon(card.amount)}원`}
              </div>
              <div style={{ fontSize: 11, color: card.color, opacity: 0.6 }}>
                {card.count}건
              </div>
            </div>
          </Col>
        ))}
      </Row>
      </Card>

      {/* 섹션 4: 생산 미완료 품목 */}
      <Card title="생산 미완료 품목 (생산중)" size="small" style={{ borderRadius: 10 }}
        extra={<Button type="link" style={{ padding: 0 }} onClick={() => navigate('/production/plans')}>전체보기 <RightOutlined /></Button>}>
        {(data?.progressItems || []).length > 0 ? (
          <Table
            columns={[
              { title: '계획', dataIndex: 'plan_no', key: 'plan', width: 110 },
              { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                render: (v: string) => <Tag color={CATEGORY_COLORS[v] || 'blue'}>{catLabelMap[v] || v}</Tag> },
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
    </div>
  );
}
