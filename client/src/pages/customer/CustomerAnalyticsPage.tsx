import { useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Select, DatePicker, Space, Progress } from 'antd';
import { UserOutlined, CrownOutlined, RiseOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const gradeData = [
  { grade: 'VVIP', count: 2, ratio: 20, avgPurchase: 14150000, avgVisit: 48.5, retention: 98 },
  { grade: 'VIP', count: 3, ratio: 30, avgPurchase: 8366667, avgVisit: 31.7, retention: 92 },
  { grade: 'GOLD', count: 3, ratio: 30, avgPurchase: 5200000, avgVisit: 21, retention: 85 },
  { grade: 'SILVER', count: 1, ratio: 10, avgPurchase: 2100000, avgVisit: 9, retention: 70 },
  { grade: 'NORMAL', count: 1, ratio: 10, avgPurchase: 890000, avgVisit: 4, retention: 45 },
];

const GRADE_COLOR: Record<string, string> = { VVIP: '#722ed1', VIP: '#faad14', GOLD: '#fa8c16', SILVER: '#8c8c8c', NORMAL: '#d9d9d9' };

const monthlyNewCustomers = [
  { month: '2025-09', new: 3, churned: 0, net: 3 },
  { month: '2025-10', new: 5, churned: 1, net: 4 },
  { month: '2025-11', new: 4, churned: 0, net: 4 },
  { month: '2025-12', new: 6, churned: 1, net: 5 },
  { month: '2026-01', new: 8, churned: 2, net: 6 },
  { month: '2026-02', new: 5, churned: 0, net: 5 },
];

const topProducts = [
  { rank: 1, product: '26SS 캐시미어 코트', category: '아우터', purchases: 28, amount: 12600000 },
  { rank: 2, product: '울 블렌드 니트', category: '상의', purchases: 45, amount: 8505000 },
  { rank: 3, product: '가죽 토트백', category: '가방', purchases: 15, amount: 4800000 },
  { rank: 4, product: '실크 블라우스', category: '상의', purchases: 22, amount: 4620000 },
  { rank: 5, product: '와이드 슬랙스', category: '하의', purchases: 35, amount: 4200000 },
];

const ageGroupData = [
  { group: '20대', count: 2, ratio: 20, avgPurchase: 1495000 },
  { group: '30대', count: 4, ratio: 40, avgPurchase: 7350000 },
  { group: '40대', count: 3, ratio: 30, avgPurchase: 9033333 },
  { group: '50대 이상', count: 1, ratio: 10, avgPurchase: 5100000 },
];

export default function CustomerAnalyticsPage() {
  const [period, setPeriod] = useState('month');

  const gradeCols = [
    { title: '등급', dataIndex: 'grade', width: 80, render: (v: string) => <Tag color={GRADE_COLOR[v]} style={{ fontWeight: 600 }}>{v}</Tag> },
    { title: '고객수', dataIndex: 'count', width: 80, align: 'right' as const },
    { title: '비율', dataIndex: 'ratio', width: 80, render: (v: number) => <Progress percent={v} size="small" strokeColor={v > 20 ? '#722ed1' : undefined} /> },
    { title: '평균 구매액', dataIndex: 'avgPurchase', width: 130, align: 'right' as const, render: (v: number) => v.toLocaleString() + '원' },
    { title: '평균 방문', dataIndex: 'avgVisit', width: 90, align: 'right' as const, render: (v: number) => v + '회' },
    { title: '재구매율', dataIndex: 'retention', width: 90, render: (v: number) => <span style={{ color: v >= 90 ? '#52c41a' : v >= 70 ? '#faad14' : '#ff4d4f' }}>{v}%</span> },
  ];

  const newCustCols = [
    { title: '월', dataIndex: 'month', width: 100 },
    { title: '신규', dataIndex: 'new', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: '#1890ff' }}>{v}</span> },
    { title: '이탈', dataIndex: 'churned', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0' },
    { title: '순증', dataIndex: 'net', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600 }}>+{v}</span> },
  ];

  const topCols = [
    { title: '순위', dataIndex: 'rank', width: 60 },
    { title: '상품', dataIndex: 'product', width: 200 },
    { title: '카테고리', dataIndex: 'category', width: 80 },
    { title: '구매건수', dataIndex: 'purchases', width: 90, align: 'right' as const },
    { title: '구매금액', dataIndex: 'amount', width: 130, align: 'right' as const, render: (v: number) => v.toLocaleString() + '원' },
  ];

  const ageCols = [
    { title: '연령대', dataIndex: 'group', width: 100 },
    { title: '고객수', dataIndex: 'count', width: 80, align: 'right' as const },
    { title: '비율', dataIndex: 'ratio', width: 120, render: (v: number) => <Progress percent={v} size="small" /> },
    { title: '평균 구매액', dataIndex: 'avgPurchase', width: 130, align: 'right' as const, render: (v: number) => v.toLocaleString() + '원' },
  ];

  return (
    <div>
      <PageHeader title="고객 분석" />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="전체 고객" value={10} suffix="명" prefix={<UserOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="VIP 이상" value={5} suffix="명" prefix={<CrownOutlined />} valueStyle={{ color: '#722ed1' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 신규" value={5} suffix="명" prefix={<RiseOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="평균 객단가" value={7209000} suffix="원" prefix={<ShoppingCartOutlined />} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="등급별 분석">
            <Table dataSource={gradeData} columns={gradeCols} rowKey="grade" size="small" pagination={false} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="연령대별 분석">
            <Table dataSource={ageGroupData} columns={ageCols} rowKey="group" size="small" pagination={false} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title="월별 고객 증감">
            <Table dataSource={monthlyNewCustomers} columns={newCustCols} rowKey="month" size="small" pagination={false} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="인기 상품 TOP 5">
            <Table dataSource={topProducts} columns={topCols} rowKey="rank" size="small" pagination={false} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
