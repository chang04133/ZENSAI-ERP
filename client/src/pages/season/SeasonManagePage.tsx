import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Modal, Form, Input, Select, DatePicker, Descriptions, Tabs, Progress, message } from 'antd';
import { PlusOutlined, CalendarOutlined, TagsOutlined, BarChartOutlined, FireOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { PLANNING: 'default', CONFIRMED: 'blue', IN_SEASON: 'green', MARKDOWN: 'orange', CLOSED: 'red' };
const STATUS_LABEL: Record<string, string> = { PLANNING: '기획중', CONFIRMED: '확정', IN_SEASON: '시즌중', MARKDOWN: '마크다운', CLOSED: '종료' };

const mockSeasons = [
  { id: 1, code: '26SS', name: '2026 Spring/Summer', year: 2026, season: 'SS', status: 'IN_SEASON', start_date: '2026-02-01', end_date: '2026-07-31', styles: 85, total_qty: 12000, produced: 9800, sold: 5200, sell_through: 53.1, revenue: 780000000, markdown_rate: 0 },
  { id: 2, code: '25FW', name: '2025 Fall/Winter', year: 2025, season: 'FW', status: 'MARKDOWN', start_date: '2025-08-01', end_date: '2026-01-31', styles: 92, total_qty: 14000, produced: 14000, sold: 11500, sell_through: 82.1, revenue: 1380000000, markdown_rate: 25 },
  { id: 3, code: '26FW', name: '2026 Fall/Winter', year: 2026, season: 'FW', status: 'PLANNING', start_date: '2026-08-01', end_date: '2027-01-31', styles: 45, total_qty: 0, produced: 0, sold: 0, sell_through: 0, revenue: 0, markdown_rate: 0 },
  { id: 4, code: '25SS', name: '2025 Spring/Summer', year: 2025, season: 'SS', status: 'CLOSED', start_date: '2025-02-01', end_date: '2025-07-31', styles: 78, total_qty: 11000, produced: 11000, sold: 9800, sell_through: 89.1, revenue: 1176000000, markdown_rate: 30 },
  { id: 5, code: '24FW', name: '2024 Fall/Winter', year: 2024, season: 'FW', status: 'CLOSED', start_date: '2024-08-01', end_date: '2025-01-31', styles: 70, total_qty: 10000, produced: 10000, sold: 8500, sell_through: 85, revenue: 1020000000, markdown_rate: 28 },
];

const mockCollections = [
  { id: 1, name: 'Essential Line', category: '기본', styles: 25, status: 'IN_SEASON', concept: '데일리 베이직 아이템' },
  { id: 2, name: 'Urban Chic', category: '캐주얼', styles: 20, status: 'IN_SEASON', concept: '도시적 캐주얼 스타일' },
  { id: 3, name: 'Business Premium', category: '포멀', styles: 18, status: 'IN_SEASON', concept: '비즈니스 프리미엄 라인' },
  { id: 4, name: 'Weekend Edition', category: '캐주얼', styles: 12, status: 'CONFIRMED', concept: '주말 나들이 아이템' },
  { id: 5, name: 'Resort Collection', category: '스페셜', styles: 10, status: 'PLANNING', concept: '리조트/여행 컬렉션' },
];

const mockStyleMix = [
  { category: '아우터', styles: 20, ratio: 23.5, qty: 2800, avgPrice: 350000 },
  { category: '상의', styles: 25, ratio: 29.4, qty: 3500, avgPrice: 180000 },
  { category: '하의', styles: 18, ratio: 21.2, qty: 2600, avgPrice: 150000 },
  { category: '원피스', styles: 10, ratio: 11.8, qty: 1500, avgPrice: 250000 },
  { category: '가방/잡화', styles: 12, ratio: 14.1, qty: 1600, avgPrice: 220000 },
];

export default function SeasonManagePage() {
  const [detailModal, setDetailModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const columns = [
    { title: '시즌코드', dataIndex: 'code', width: 90, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}><strong>{v}</strong></a> },
    { title: '시즌명', dataIndex: 'name', width: 180 },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '시작일', dataIndex: 'start_date', width: 110 },
    { title: '종료일', dataIndex: 'end_date', width: 110 },
    { title: '스타일수', dataIndex: 'styles', width: 80, align: 'right' as const },
    { title: '기획수량', dataIndex: 'total_qty', width: 90, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '생산수량', dataIndex: 'produced', width: 90, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '판매수량', dataIndex: 'sold', width: 90, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '판매율', dataIndex: 'sell_through', width: 100, render: (v: number) => v > 0 ? <Progress percent={v} size="small" status={v >= 80 ? 'success' : v >= 60 ? 'normal' : 'exception'} /> : '-' },
    { title: '매출', dataIndex: 'revenue', width: 130, align: 'right' as const, render: (v: number) => v > 0 ? (v / 100000000).toFixed(1) + '억' : '-' },
    { title: 'MD율', dataIndex: 'markdown_rate', width: 70, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}%</span> : '-' },
  ];

  const collectionCols = [
    { title: '컬렉션', dataIndex: 'name', width: 160 },
    { title: '카테고리', dataIndex: 'category', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '스타일수', dataIndex: 'styles', width: 80, align: 'right' as const },
    { title: '컨셉', dataIndex: 'concept', ellipsis: true },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
  ];

  const styleMixCols = [
    { title: '카테고리', dataIndex: 'category', width: 100 },
    { title: '스타일수', dataIndex: 'styles', width: 80, align: 'right' as const },
    { title: '구성비', dataIndex: 'ratio', width: 120, render: (v: number) => <Progress percent={v} size="small" /> },
    { title: '수량', dataIndex: 'qty', width: 90, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '평균단가', dataIndex: 'avgPrice', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() + '원' },
  ];

  const currentSeason = mockSeasons.find(s => s.status === 'IN_SEASON');

  return (
    <div>
      <PageHeader title="시즌/컬렉션 관리" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>신규 시즌</Button>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="현재 시즌" value={currentSeason?.code || '-'} prefix={<CalendarOutlined />} valueStyle={{ color: '#1890ff', fontSize: 24 }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="시즌 스타일" value={currentSeason?.styles || 0} suffix="개" prefix={<TagsOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="현재 판매율" value={currentSeason?.sell_through || 0} suffix="%" prefix={<BarChartOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="시즌 매출" value={currentSeason?.revenue ? (currentSeason.revenue / 100000000).toFixed(1) : '0'} suffix="억" prefix={<FireOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={mockSeasons} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1400, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`시즌 상세 - ${selected?.code || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={900} footer={null}>
        {selected && (
          <Tabs items={[
            {
              key: 'info', label: '시즌정보', children: (
                <Descriptions bordered size="small" column={3}>
                  <Descriptions.Item label="시즌코드">{selected.code}</Descriptions.Item>
                  <Descriptions.Item label="시즌명">{selected.name}</Descriptions.Item>
                  <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
                  <Descriptions.Item label="시작일">{selected.start_date}</Descriptions.Item>
                  <Descriptions.Item label="종료일">{selected.end_date}</Descriptions.Item>
                  <Descriptions.Item label="스타일수">{selected.styles}개</Descriptions.Item>
                  <Descriptions.Item label="기획수량">{selected.total_qty.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="생산수량">{selected.produced.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="판매수량">{selected.sold.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="판매율">{selected.sell_through}%</Descriptions.Item>
                  <Descriptions.Item label="매출">{selected.revenue.toLocaleString()}원</Descriptions.Item>
                  <Descriptions.Item label="마크다운율">{selected.markdown_rate}%</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'collections', label: '컬렉션', children: (
                <Table dataSource={mockCollections} columns={collectionCols} rowKey="id" size="small" pagination={false} />
              ),
            },
            {
              key: 'stylemix', label: '스타일 믹스', children: (
                <Table dataSource={mockStyleMix} columns={styleMixCols} rowKey="category" size="small" pagination={false} />
              ),
            },
          ]} />
        )}
      </Modal>

      <Modal title="신규 시즌 등록" open={createModal} onCancel={() => setCreateModal(false)} onOk={() => { message.success('시즌이 등록되었습니다'); setCreateModal(false); }} okText="등록" width={600}>
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={8}><Form.Item label="연도" required><Select options={[{ value: 2026, label: '2026' }, { value: 2027, label: '2027' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item label="시즌" required><Select options={[{ value: 'SS', label: 'Spring/Summer' }, { value: 'FW', label: 'Fall/Winter' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item label="시즌코드"><Input placeholder="예: 27SS" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item label="시작일"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item label="종료일"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item label="시즌명"><Input placeholder="예: 2027 Spring/Summer" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
