import { useState } from 'react';
import { Table, Card, Tag, Row, Col, Statistic, Select, Progress, Space, Button } from 'antd';
import { ShopOutlined, RiseOutlined, DollarOutlined, PercentageOutlined, FileExcelOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const CHANNEL_COLOR: Record<string, string> = { 'ZENSAI몰': '#1890ff', '네이버': '#03c75a', '카카오': '#fee500', '무신사': '#000000', '29CM': '#ff5a5a', 'W컨셉': '#e91e63' };

const mockChannels = [
  { id: 1, name: 'ZENSAI몰', type: '자사몰', status: 'ACTIVE', products: 85, monthly_orders: 120, monthly_sales: 18000000, commission_rate: 0, net_sales: 18000000, avg_order: 150000, return_rate: 3.2, conversion: 4.5 },
  { id: 2, name: '네이버', type: '오픈마켓', status: 'ACTIVE', products: 72, monthly_orders: 95, monthly_sales: 14500000, commission_rate: 5.5, net_sales: 13702500, avg_order: 152632, return_rate: 4.1, conversion: 3.2 },
  { id: 3, name: '무신사', type: '편집샵', status: 'ACTIVE', products: 60, monthly_orders: 85, monthly_sales: 12800000, commission_rate: 25, net_sales: 9600000, avg_order: 150588, return_rate: 5.8, conversion: 2.8 },
  { id: 4, name: '29CM', type: '편집샵', status: 'ACTIVE', products: 45, monthly_orders: 42, monthly_sales: 8200000, commission_rate: 20, net_sales: 6560000, avg_order: 195238, return_rate: 2.5, conversion: 3.5 },
  { id: 5, name: 'W컨셉', type: '편집샵', status: 'ACTIVE', products: 38, monthly_orders: 35, monthly_sales: 7500000, commission_rate: 22, net_sales: 5850000, avg_order: 214286, return_rate: 3.0, conversion: 3.1 },
  { id: 6, name: '카카오', type: '오픈마켓', status: 'ACTIVE', products: 50, monthly_orders: 55, monthly_sales: 6800000, commission_rate: 8, net_sales: 6256000, avg_order: 123636, return_rate: 4.5, conversion: 2.5 },
];

const mockMonthlyTrend = [
  { month: '2025-09', total: 48000000, zensai: 12000000, naver: 10000000, musinsa: 9000000, cm29: 6000000, wconcept: 5500000, kakao: 5500000 },
  { month: '2025-10', total: 52000000, zensai: 13500000, naver: 11000000, musinsa: 10000000, cm29: 6500000, wconcept: 6000000, kakao: 5000000 },
  { month: '2025-11', total: 58000000, zensai: 15000000, naver: 12500000, musinsa: 11000000, cm29: 7500000, wconcept: 6500000, kakao: 5500000 },
  { month: '2025-12', total: 82000000, zensai: 22000000, naver: 18000000, musinsa: 16000000, cm29: 10000000, wconcept: 9000000, kakao: 7000000 },
  { month: '2026-01', total: 62000000, zensai: 16000000, naver: 13000000, musinsa: 12000000, cm29: 8000000, wconcept: 7000000, kakao: 6000000 },
  { month: '2026-02', total: 67800000, zensai: 18000000, naver: 14500000, musinsa: 12800000, cm29: 8200000, wconcept: 7500000, kakao: 6800000 },
];

export default function ChannelManagePage() {
  const totalSales = mockChannels.reduce((s, c) => s + c.monthly_sales, 0);
  const totalNet = mockChannels.reduce((s, c) => s + c.net_sales, 0);
  const totalOrders = mockChannels.reduce((s, c) => s + c.monthly_orders, 0);

  const channelCols = [
    { title: '채널', dataIndex: 'name', width: 120, render: (v: string) => <Tag color={CHANNEL_COLOR[v]} style={{ fontWeight: 600 }}>{v}</Tag> },
    { title: '유형', dataIndex: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '등록상품', dataIndex: 'products', width: 80, align: 'right' as const },
    { title: '월주문수', dataIndex: 'monthly_orders', width: 80, align: 'right' as const },
    { title: '월매출', dataIndex: 'monthly_sales', width: 120, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '수수료율', dataIndex: 'commission_rate', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? v + '%' : '자사' },
    { title: '순매출', dataIndex: 'net_sales', width: 120, align: 'right' as const, render: (v: number) => <strong>{(v / 10000).toLocaleString()}만</strong> },
    { title: '매출비중', width: 110, render: (_: any, r: any) => <Progress percent={Math.round(r.monthly_sales / totalSales * 100)} size="small" /> },
    { title: '평균객단가', dataIndex: 'avg_order', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '반품률', dataIndex: 'return_rate', width: 70, align: 'right' as const, render: (v: number) => <span style={{ color: v > 4 ? '#ff4d4f' : '#52c41a' }}>{v}%</span> },
    { title: '전환율', dataIndex: 'conversion', width: 70, align: 'right' as const, render: (v: number) => v + '%' },
    { title: '상태', dataIndex: 'status', width: 70, render: () => <Tag color="green">운영중</Tag> },
  ];

  const trendCols = [
    { title: '월', dataIndex: 'month', width: 100 },
    { title: '전체', dataIndex: 'total', width: 110, align: 'right' as const, render: (v: number) => <strong>{(v / 10000).toLocaleString()}만</strong> },
    { title: 'ZENSAI몰', dataIndex: 'zensai', width: 100, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '네이버', dataIndex: 'naver', width: 100, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '무신사', dataIndex: 'musinsa', width: 100, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '29CM', dataIndex: 'cm29', width: 100, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: 'W컨셉', dataIndex: 'wconcept', width: 100, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
    { title: '카카오', dataIndex: 'kakao', width: 100, align: 'right' as const, render: (v: number) => (v / 10000).toLocaleString() + '만' },
  ];

  return (
    <div>
      <PageHeader title="온라인 채널 관리" extra={<Button icon={<FileExcelOutlined />}>엑셀 다운로드</Button>} />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="운영 채널" value={mockChannels.length} suffix="개" prefix={<ShopOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 총 매출" value={totalSales} suffix="원" prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="총 주문수" value={totalOrders} suffix="건" prefix={<RiseOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="평균 수수료율" value={(mockChannels.reduce((s, c) => s + c.commission_rate, 0) / mockChannels.length).toFixed(1)} suffix="%" prefix={<PercentageOutlined />} /></Card></Col>
      </Row>

      <Card size="small" title="채널별 실적" style={{ marginBottom: 16 }}>
        <Table dataSource={mockChannels} columns={channelCols} rowKey="id" size="small" pagination={false}
          scroll={{ x: 1200 }} />
      </Card>

      <Card size="small" title="월별 채널 매출 추이">
        <Table dataSource={mockMonthlyTrend} columns={trendCols} rowKey="month" size="small" pagination={false}
          scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}
