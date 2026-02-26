import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Select, DatePicker, Tabs, message } from 'antd';
import { DollarOutlined, ArrowUpOutlined, ArrowDownOutlined, FileExcelOutlined, SwapOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const mockLedger = [
  { id: 1, date: '2026-02-26', type: '매출', account: '상품매출', partner: '강남점', description: '일일매출', debit: 0, credit: 3261000, balance: 3261000 },
  { id: 2, date: '2026-02-26', type: '매출', account: '상품매출', partner: '대구점', description: '일일매출', debit: 0, credit: 2100000, balance: 5361000 },
  { id: 3, date: '2026-02-25', type: '매입', account: '상품매입', partner: '(주)삼성섬유', description: '원단 매입', debit: 8500000, credit: 0, balance: -3139000 },
  { id: 4, date: '2026-02-25', type: '매출', account: '상품매출', partner: '강남점', description: '일일매출', debit: 0, credit: 3850000, balance: 711000 },
  { id: 5, date: '2026-02-24', type: '매출', account: '상품매출', partner: '강남점', description: '일일매출', debit: 0, credit: 5100000, balance: 5811000 },
  { id: 6, date: '2026-02-24', type: '매입', account: '외주가공비', partner: '대한봉제', description: '봉제 가공비', debit: 3200000, credit: 0, balance: 2611000 },
  { id: 7, date: '2026-02-23', type: '비용', account: '임차료', partner: '강남점', description: '2월 매장 임차료', debit: 8000000, credit: 0, balance: -5389000 },
  { id: 8, date: '2026-02-23', type: '비용', account: '인건비', partner: '', description: '2월 급여', debit: 15000000, credit: 0, balance: -20389000 },
  { id: 9, date: '2026-02-22', type: '매출', account: '상품매출', partner: '온라인몰', description: '온라인 매출', debit: 0, credit: 2200000, balance: -18189000 },
  { id: 10, date: '2026-02-22', type: '매입', account: '부자재매입', partner: '한국단추', description: '단추/지퍼 매입', debit: 1200000, credit: 0, balance: -19389000 },
];

const monthlySummary = [
  { month: '2026-02', sales: 77000000, purchases: 45500000, expenses: 28000000, profit: 3500000 },
  { month: '2026-01', sales: 80000000, purchases: 42000000, expenses: 27500000, profit: 10500000 },
  { month: '2025-12', sales: 117000000, purchases: 52000000, expenses: 30000000, profit: 35000000 },
  { month: '2025-11', sales: 68000000, purchases: 38000000, expenses: 26000000, profit: 4000000 },
  { month: '2025-10', sales: 62000000, purchases: 35000000, expenses: 25500000, profit: 1500000 },
];

export default function AccountingLedgerPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [tab, setTab] = useState('ledger');

  const filtered = mockLedger.filter(l => !typeFilter || l.type === typeFilter);

  const ledgerCols = [
    { title: '일자', dataIndex: 'date', width: 110 },
    { title: '구분', dataIndex: 'type', width: 70, render: (v: string) => <Tag color={v === '매출' ? 'green' : v === '매입' ? 'blue' : 'orange'}>{v}</Tag> },
    { title: '계정과목', dataIndex: 'account', width: 120 },
    { title: '거래처', dataIndex: 'partner', width: 120, render: (v: string) => v || '-' },
    { title: '적요', dataIndex: 'description', ellipsis: true },
    { title: '차변(지출)', dataIndex: 'debit', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v.toLocaleString()}</span> : '' },
    { title: '대변(수입)', dataIndex: 'credit', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#52c41a' }}>{v.toLocaleString()}</span> : '' },
    { title: '잔액', dataIndex: 'balance', width: 130, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#333' : '#ff4d4f', fontWeight: 600 }}>{v.toLocaleString()}</span> },
  ];

  const summaryCols = [
    { title: '월', dataIndex: 'month', width: 100 },
    { title: '매출', dataIndex: 'sales', width: 130, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a' }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '매입', dataIndex: 'purchases', width: 130, align: 'right' as const, render: (v: number) => <span style={{ color: '#1890ff' }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '경비', dataIndex: 'expenses', width: 130, align: 'right' as const, render: (v: number) => <span style={{ color: '#fa8c16' }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '영업이익', dataIndex: 'profit', width: 130, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '이익률', width: 100, render: (_: any, r: any) => { const m = (r.profit / r.sales * 100).toFixed(1); return <span style={{ color: Number(m) >= 0 ? '#52c41a' : '#ff4d4f' }}>{m}%</span>; } },
  ];

  const totalSales = mockLedger.filter(l => l.type === '매출').reduce((s, l) => s + l.credit, 0);
  const totalPurchases = mockLedger.filter(l => l.type === '매입').reduce((s, l) => s + l.debit, 0);
  const totalExpenses = mockLedger.filter(l => l.type === '비용').reduce((s, l) => s + l.debit, 0);

  return (
    <div>
      <PageHeader title="매입/매출 장부" extra={
        <Space>
          <Select placeholder="구분" allowClear style={{ width: 100 }} onChange={v => setTypeFilter(v || '')}
            options={[{ value: '매출', label: '매출' }, { value: '매입', label: '매입' }, { value: '비용', label: '비용' }]} />
          <DatePicker.RangePicker />
          <Button icon={<FileExcelOutlined />}>엑셀 다운로드</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="이번달 매출" value={totalSales} suffix="원" prefix={<ArrowUpOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 매입" value={totalPurchases} suffix="원" prefix={<ArrowDownOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 경비" value={totalExpenses} suffix="원" prefix={<DollarOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="차액" value={totalSales - totalPurchases - totalExpenses} suffix="원" prefix={<SwapOutlined />} valueStyle={{ color: (totalSales - totalPurchases - totalExpenses) >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
      </Row>

      <Card size="small">
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'ledger', label: '거래장부', children: (
              <Table dataSource={filtered} columns={ledgerCols} rowKey="id" size="small"
                scroll={{ x: 1100, y: 'calc(100vh - 400px)' }}
                pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
            ),
          },
          {
            key: 'summary', label: '월별 요약', children: (
              <Table dataSource={monthlySummary} columns={summaryCols} rowKey="month" size="small" pagination={false} />
            ),
          },
        ]} />
      </Card>
    </div>
  );
}
