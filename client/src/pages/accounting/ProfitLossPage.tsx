import { useState } from 'react';
import { Card, Row, Col, Statistic, Select, Table, Tag, Divider, Space, Button } from 'antd';
import { DollarOutlined, RiseOutlined, FallOutlined, FileExcelOutlined, BarChartOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const mockPL = {
  period: '2026-02',
  revenue: {
    product_sales: 77000000,
    other_income: 500000,
    total: 77500000,
  },
  cost: {
    product_cost: 33500000,
    material_cost: 5200000,
    outsource_cost: 3800000,
    total: 42500000,
  },
  grossProfit: 35000000,
  expenses: {
    salary: 15000000,
    rent: 8000000,
    utilities: 1200000,
    marketing: 2500000,
    logistics: 1800000,
    depreciation: 500000,
    insurance: 300000,
    misc: 700000,
    total: 30000000,
  },
  operatingProfit: 5000000,
  nonOperating: {
    interest_income: 120000,
    interest_expense: -350000,
    total: -230000,
  },
  netProfit: 4770000,
};

const monthlyPL = [
  { month: '2025-09', revenue: 62000000, cost: 27000000, grossProfit: 35000000, expenses: 28000000, operatingProfit: 7000000, netProfit: 6500000 },
  { month: '2025-10', revenue: 65000000, cost: 28500000, grossProfit: 36500000, expenses: 28500000, operatingProfit: 8000000, netProfit: 7400000 },
  { month: '2025-11', revenue: 68000000, cost: 29500000, grossProfit: 38500000, expenses: 29000000, operatingProfit: 9500000, netProfit: 8900000 },
  { month: '2025-12', revenue: 117000000, cost: 48400000, grossProfit: 68600000, expenses: 32000000, operatingProfit: 36600000, netProfit: 35200000 },
  { month: '2026-01', revenue: 80000000, cost: 35000000, grossProfit: 45000000, expenses: 29500000, operatingProfit: 15500000, netProfit: 14800000 },
  { month: '2026-02', revenue: 77500000, cost: 42500000, grossProfit: 35000000, expenses: 30000000, operatingProfit: 5000000, netProfit: 4770000 },
];

interface PLLine { label: string; amount: number; indent?: boolean; bold?: boolean; color?: string; }

export default function ProfitLossPage() {
  const [year, setYear] = useState(2026);

  const plLines: PLLine[] = [
    { label: 'I. 매출액', amount: mockPL.revenue.total, bold: true },
    { label: '  상품매출', amount: mockPL.revenue.product_sales, indent: true },
    { label: '  기타수입', amount: mockPL.revenue.other_income, indent: true },
    { label: 'II. 매출원가', amount: mockPL.cost.total, bold: true },
    { label: '  상품원가', amount: mockPL.cost.product_cost, indent: true },
    { label: '  원부자재비', amount: mockPL.cost.material_cost, indent: true },
    { label: '  외주가공비', amount: mockPL.cost.outsource_cost, indent: true },
    { label: 'III. 매출총이익', amount: mockPL.grossProfit, bold: true, color: '#52c41a' },
    { label: 'IV. 판매비와관리비', amount: mockPL.expenses.total, bold: true },
    { label: '  급여', amount: mockPL.expenses.salary, indent: true },
    { label: '  임차료', amount: mockPL.expenses.rent, indent: true },
    { label: '  수도광열비', amount: mockPL.expenses.utilities, indent: true },
    { label: '  광고선전비', amount: mockPL.expenses.marketing, indent: true },
    { label: '  물류비', amount: mockPL.expenses.logistics, indent: true },
    { label: '  감가상각비', amount: mockPL.expenses.depreciation, indent: true },
    { label: '  보험료', amount: mockPL.expenses.insurance, indent: true },
    { label: '  기타', amount: mockPL.expenses.misc, indent: true },
    { label: 'V. 영업이익', amount: mockPL.operatingProfit, bold: true, color: '#1890ff' },
    { label: 'VI. 영업외손익', amount: mockPL.nonOperating.total, bold: true },
    { label: '  이자수입', amount: mockPL.nonOperating.interest_income, indent: true },
    { label: '  이자비용', amount: mockPL.nonOperating.interest_expense, indent: true },
    { label: 'VII. 당기순이익', amount: mockPL.netProfit, bold: true, color: mockPL.netProfit >= 0 ? '#52c41a' : '#ff4d4f' },
  ];

  const plCols = [
    {
      title: '계정과목', dataIndex: 'label', width: 250,
      render: (v: string, r: PLLine) => (
        <span style={{ fontWeight: r.bold ? 700 : 400, paddingLeft: r.indent ? 16 : 0, color: r.color || undefined }}>
          {v}
        </span>
      ),
    },
    {
      title: '금액', dataIndex: 'amount', width: 180, align: 'right' as const,
      render: (v: number, r: PLLine) => (
        <span style={{ fontWeight: r.bold ? 700 : 400, color: r.color || (v < 0 ? '#ff4d4f' : undefined) }}>
          {v.toLocaleString()}원
        </span>
      ),
    },
    {
      title: '비율', width: 100, align: 'right' as const,
      render: (_: any, r: PLLine) => {
        if (!r.bold || r.label.includes('매출액')) return '';
        const pct = (r.amount / mockPL.revenue.total * 100).toFixed(1);
        return <span style={{ color: '#888' }}>{pct}%</span>;
      },
    },
  ];

  const monthlyCols = [
    { title: '월', dataIndex: 'month', width: 100 },
    { title: '매출', dataIndex: 'revenue', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '원가', dataIndex: 'cost', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '매출총이익', dataIndex: 'grossProfit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a' }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '판관비', dataIndex: 'expenses', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '영업이익', dataIndex: 'operatingProfit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: '#1890ff', fontWeight: 600 }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '순이익', dataIndex: 'netProfit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '순이익률', width: 80, align: 'right' as const, render: (_: any, r: any) => ((r.netProfit / r.revenue) * 100).toFixed(1) + '%' },
  ];

  const grossMargin = (mockPL.grossProfit / mockPL.revenue.total * 100).toFixed(1);
  const opMargin = (mockPL.operatingProfit / mockPL.revenue.total * 100).toFixed(1);
  const netMargin = (mockPL.netProfit / mockPL.revenue.total * 100).toFixed(1);

  return (
    <div>
      <PageHeader title="손익계산서" extra={
        <Space>
          <Select value={year} onChange={setYear} style={{ width: 100 }} options={[{ value: 2026, label: '2026년' }, { value: 2025, label: '2025년' }]} />
          <Button icon={<FileExcelOutlined />}>엑셀 다운로드</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="매출총이익률" value={grossMargin} suffix="%" prefix={<BarChartOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="영업이익률" value={opMargin} suffix="%" prefix={<RiseOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="순이익률" value={netMargin} suffix="%" prefix={<DollarOutlined />} valueStyle={{ color: Number(netMargin) >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="당기순이익" value={mockPL.netProfit} suffix="원" valueStyle={{ color: mockPL.netProfit >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title={`손익계산서 (${mockPL.period})`}>
            <Table dataSource={plLines} columns={plCols} rowKey="label" size="small" pagination={false} showHeader={true} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="월별 손익 추이">
            <Table dataSource={monthlyPL} columns={monthlyCols} rowKey="month" size="small" pagination={false} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
