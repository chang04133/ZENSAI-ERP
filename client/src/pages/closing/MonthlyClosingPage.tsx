import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Select, Modal, Descriptions, Divider, Alert, message, Progress } from 'antd';
import { CheckCircleOutlined, LockOutlined, FileExcelOutlined, BarChartOutlined, DollarOutlined, ShopOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { OPEN: 'blue', CLOSED: 'green', LOCKED: 'default' };
const STATUS_LABEL: Record<string, string> = { OPEN: '진행중', CLOSED: '마감', LOCKED: '확정' };

const mockMonthly = [
  { id: 1, period: '2026-02', store: '강남점', status: 'OPEN', work_days: 20, sales_days: 18, total_sales: 45000000, total_return: 1250000, net_sales: 43750000, cost: 18500000, gross_profit: 25250000, margin: 57.7, target: 60000000, achievement: 72.9, inventory_value: 125000000 },
  { id: 2, period: '2026-02', store: '대구점', status: 'OPEN', work_days: 20, sales_days: 18, total_sales: 32000000, total_return: 800000, net_sales: 31200000, cost: 13200000, gross_profit: 18000000, margin: 57.7, target: 40000000, achievement: 78, inventory_value: 85000000 },
  { id: 3, period: '2026-01', store: '강남점', status: 'LOCKED', work_days: 22, sales_days: 22, total_sales: 52000000, total_return: 1800000, net_sales: 50200000, cost: 21500000, gross_profit: 28700000, margin: 57.2, target: 60000000, achievement: 83.7, inventory_value: 130000000 },
  { id: 4, period: '2026-01', store: '대구점', status: 'LOCKED', work_days: 22, sales_days: 22, total_sales: 28000000, total_return: 950000, net_sales: 27050000, cost: 11800000, gross_profit: 15250000, margin: 56.4, target: 40000000, achievement: 67.6, inventory_value: 88000000 },
  { id: 5, period: '2025-12', store: '강남점', status: 'LOCKED', work_days: 22, sales_days: 22, total_sales: 72000000, total_return: 2100000, net_sales: 69900000, cost: 29500000, gross_profit: 40400000, margin: 57.8, target: 70000000, achievement: 99.9, inventory_value: 135000000 },
  { id: 6, period: '2025-12', store: '대구점', status: 'LOCKED', work_days: 22, sales_days: 22, total_sales: 45000000, total_return: 1500000, net_sales: 43500000, cost: 18900000, gross_profit: 24600000, margin: 56.6, target: 40000000, achievement: 108.8, inventory_value: 90000000 },
];

const mockCategorySales = [
  { category: '아우터', sales: 18500000, ratio: 35, margin: 62 },
  { category: '상의', sales: 12000000, ratio: 23, margin: 58 },
  { category: '하의', sales: 9500000, ratio: 18, margin: 55 },
  { category: '원피스', sales: 5200000, ratio: 10, margin: 60 },
  { category: '가방/잡화', sales: 4800000, ratio: 9, margin: 65 },
  { category: '기타', sales: 2750000, ratio: 5, margin: 48 },
];

export default function MonthlyClosingPage() {
  const [storeFilter, setStoreFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockMonthly.filter(m => !storeFilter || m.store === storeFilter);

  const columns = [
    { title: '기간', dataIndex: 'period', width: 100, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '매장', dataIndex: 'store', width: 100 },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '영업일', dataIndex: 'sales_days', width: 70, align: 'right' as const },
    { title: '총매출', dataIndex: 'total_sales', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '반품', dataIndex: 'total_return', width: 100, align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f' }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '순매출', dataIndex: 'net_sales', width: 120, align: 'right' as const, render: (v: number) => <strong>{(v / 10000).toLocaleString()}만</strong> },
    { title: '매출원가', dataIndex: 'cost', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '매출총이익', dataIndex: 'gross_profit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a' }}>{(v / 10000).toLocaleString()}만</span> },
    { title: '이익률', dataIndex: 'margin', width: 80, align: 'right' as const, render: (v: number) => v + '%' },
    { title: '달성률', dataIndex: 'achievement', width: 110, render: (v: number) => <Progress percent={v} size="small" status={v >= 100 ? 'success' : v >= 80 ? 'normal' : 'exception'} /> },
    { title: '재고금액', dataIndex: 'inventory_value', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    {
      title: '', width: 80, render: (_: any, r: any) => r.status === 'OPEN' ? (
        <Button size="small" type="primary" icon={<LockOutlined />} onClick={() => message.success(`${r.store} ${r.period} 월마감 완료`)}>마감</Button>
      ) : null,
    },
  ];

  const catCols = [
    { title: '카테고리', dataIndex: 'category', width: 100 },
    { title: '매출', dataIndex: 'sales', width: 120, align: 'right' as const, render: (v: number) => v.toLocaleString() + '원' },
    { title: '비중', dataIndex: 'ratio', width: 120, render: (v: number) => <Progress percent={v} size="small" /> },
    { title: '마진율', dataIndex: 'margin', width: 80, align: 'right' as const, render: (v: number) => v + '%' },
  ];

  const currentMonthSales = mockMonthly.filter(m => m.period === '2026-02').reduce((s, m) => s + m.net_sales, 0);
  const lastMonthSales = mockMonthly.filter(m => m.period === '2026-01').reduce((s, m) => s + m.net_sales, 0);
  const growthRate = ((currentMonthSales - lastMonthSales) / lastMonthSales * 100).toFixed(1);

  return (
    <div>
      <PageHeader title="월마감/결산" extra={
        <Space>
          <Select placeholder="매장" allowClear style={{ width: 120 }} onChange={v => setStoreFilter(v || '')}
            options={[{ value: '강남점', label: '강남점' }, { value: '대구점', label: '대구점' }]} />
          <Button icon={<FileExcelOutlined />}>엑셀 다운로드</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="이번달 순매출" value={currentMonthSales} suffix="원" prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="전월 대비" value={growthRate} suffix="%" valueStyle={{ color: Number(growthRate) >= 0 ? '#52c41a' : '#ff4d4f' }} prefix={<BarChartOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="평균 이익률" value={57.5} suffix="%" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="미마감 매장" value={mockMonthly.filter(m => m.period === '2026-02' && m.status === 'OPEN').length} suffix="개" prefix={<ShopOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1500, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`월결산 상세 - ${selected?.store} ${selected?.period || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={800} footer={null}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="기간">{selected.period}</Descriptions.Item>
              <Descriptions.Item label="매장">{selected.store}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="영업일수">{selected.sales_days}일</Descriptions.Item>
              <Descriptions.Item label="순매출">{selected.net_sales.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="매출총이익"><span style={{ color: '#52c41a', fontWeight: 600 }}>{selected.gross_profit.toLocaleString()}원</span></Descriptions.Item>
              <Descriptions.Item label="목표">{selected.target.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="달성률">{selected.achievement}%</Descriptions.Item>
              <Descriptions.Item label="재고금액">{selected.inventory_value.toLocaleString()}원</Descriptions.Item>
            </Descriptions>
            <Divider>카테고리별 매출</Divider>
            <Table dataSource={mockCategorySales} columns={catCols} rowKey="category" size="small" pagination={false} />
          </>
        )}
      </Modal>
    </div>
  );
}
