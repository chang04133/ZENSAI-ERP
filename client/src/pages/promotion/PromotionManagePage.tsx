import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Modal, Form, Select, DatePicker, InputNumber, Descriptions, Progress, message } from 'antd';
import { PlusOutlined, FireOutlined, GiftOutlined, PercentageOutlined, CalendarOutlined, TagOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { SCHEDULED: 'default', ACTIVE: 'green', ENDED: 'blue', CANCELLED: 'red' };
const STATUS_LABEL: Record<string, string> = { SCHEDULED: '예정', ACTIVE: '진행중', ENDED: '종료', CANCELLED: '취소' };
const TYPE_COLOR: Record<string, string> = { DISCOUNT: 'blue', BUNDLE: 'purple', COUPON: 'orange', FREEBIE: 'green', SEASONAL: 'red' };
const TYPE_LABEL: Record<string, string> = { DISCOUNT: '할인', BUNDLE: '묶음', COUPON: '쿠폰', FREEBIE: '사은품', SEASONAL: '시즌' };

const mockPromotions = [
  { id: 1, promo_code: 'PR-2026-001', name: '봄맞이 신상 10% OFF', type: 'DISCOUNT', discount_rate: 10, start_date: '2026-03-01', end_date: '2026-03-15', target: '26SS 전체', status: 'SCHEDULED', budget: 5000000, used: 0, orders: 0, revenue: 0 },
  { id: 2, promo_code: 'PR-2026-002', name: '25FW 이월 클리어런스', type: 'SEASONAL', discount_rate: 40, start_date: '2026-02-15', end_date: '2026-02-28', target: '25FW 이월상품', status: 'ACTIVE', budget: 10000000, used: 6500000, orders: 85, revenue: 12800000 },
  { id: 3, promo_code: 'PR-2026-003', name: '2+1 니트 기획전', type: 'BUNDLE', discount_rate: 33, start_date: '2026-02-20', end_date: '2026-03-05', target: '니트 카테고리', status: 'ACTIVE', budget: 3000000, used: 1200000, orders: 32, revenue: 4500000 },
  { id: 4, promo_code: 'PR-2026-004', name: 'VIP 전용 쿠폰 15%', type: 'COUPON', discount_rate: 15, start_date: '2026-02-10', end_date: '2026-02-28', target: 'VIP 이상 고객', status: 'ACTIVE', budget: 8000000, used: 3800000, orders: 45, revenue: 18500000 },
  { id: 5, promo_code: 'PR-2026-005', name: '10만원 이상 구매 시 머플러 증정', type: 'FREEBIE', discount_rate: 0, start_date: '2026-02-01', end_date: '2026-02-14', target: '전체', status: 'ENDED', budget: 2000000, used: 1850000, orders: 62, revenue: 9200000 },
  { id: 6, promo_code: 'PR-2026-006', name: '신규 회원 20% 쿠폰', type: 'COUPON', discount_rate: 20, start_date: '2026-01-01', end_date: '2026-12-31', target: '신규 회원', status: 'ACTIVE', budget: 12000000, used: 2800000, orders: 55, revenue: 8200000 },
  { id: 7, promo_code: 'PR-2026-007', name: '설날 특별 할인전', type: 'SEASONAL', discount_rate: 20, start_date: '2026-01-25', end_date: '2026-02-05', target: '전체', status: 'ENDED', budget: 15000000, used: 14200000, orders: 210, revenue: 52000000 },
];

export default function PromotionManagePage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockPromotions.filter(p => {
    const matchSearch = p.name.includes(search) || p.promo_code.includes(search);
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    { title: '코드', dataIndex: 'promo_code', width: 120, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '프로모션명', dataIndex: 'name', width: 200 },
    { title: '유형', dataIndex: 'type', width: 70, render: (v: string) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v]}</Tag> },
    { title: '할인율', dataIndex: 'discount_rate', width: 70, align: 'right' as const, render: (v: number) => v > 0 ? v + '%' : '-' },
    { title: '기간', width: 190, render: (_: any, r: any) => `${r.start_date} ~ ${r.end_date}` },
    { title: '대상', dataIndex: 'target', width: 120, ellipsis: true },
    { title: '주문수', dataIndex: 'orders', width: 70, align: 'right' as const },
    { title: '매출', dataIndex: 'revenue', width: 110, align: 'right' as const, render: (v: number) => v > 0 ? (v / 10000).toLocaleString() + '만' : '-' },
    { title: '예산소진', width: 120, render: (_: any, r: any) => r.budget > 0 ? <Progress percent={Math.round(r.used / r.budget * 100)} size="small" /> : '-' },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
  ];

  const activePromos = mockPromotions.filter(p => p.status === 'ACTIVE');
  const totalRevenue = activePromos.reduce((s, p) => s + p.revenue, 0);

  return (
    <div>
      <PageHeader title="할인/프로모션 관리" extra={
        <Space>
          <Select placeholder="상태" allowClear style={{ width: 100 }} onChange={v => setStatusFilter(v || '')}
            options={Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          <Input.Search placeholder="프로모션명/코드 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>프로모션 등록</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="진행중 프로모션" value={activePromos.length} suffix="건" prefix={<FireOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="프로모션 매출" value={totalRevenue} suffix="원" prefix={<TagOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="프로모션 주문수" value={activePromos.reduce((s, p) => s + p.orders, 0)} suffix="건" prefix={<GiftOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="예정 프로모션" value={mockPromotions.filter(p => p.status === 'SCHEDULED').length} suffix="건" prefix={<CalendarOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1300, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`프로모션 상세 - ${selected?.name || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={700} footer={null}>
        {selected && (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="프로모션 코드">{selected.promo_code}</Descriptions.Item>
            <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="프로모션명" span={2}>{selected.name}</Descriptions.Item>
            <Descriptions.Item label="유형"><Tag color={TYPE_COLOR[selected.type]}>{TYPE_LABEL[selected.type]}</Tag></Descriptions.Item>
            <Descriptions.Item label="할인율">{selected.discount_rate > 0 ? selected.discount_rate + '%' : '-'}</Descriptions.Item>
            <Descriptions.Item label="시작일">{selected.start_date}</Descriptions.Item>
            <Descriptions.Item label="종료일">{selected.end_date}</Descriptions.Item>
            <Descriptions.Item label="대상">{selected.target}</Descriptions.Item>
            <Descriptions.Item label="주문수">{selected.orders}건</Descriptions.Item>
            <Descriptions.Item label="예산">{selected.budget.toLocaleString()}원</Descriptions.Item>
            <Descriptions.Item label="사용액">{selected.used.toLocaleString()}원 ({Math.round(selected.used / selected.budget * 100)}%)</Descriptions.Item>
            <Descriptions.Item label="프로모션 매출" span={2}><strong style={{ color: '#1890ff' }}>{selected.revenue.toLocaleString()}원</strong></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal title="프로모션 등록" open={createModal} onCancel={() => setCreateModal(false)} onOk={() => { message.success('프로모션이 등록되었습니다'); setCreateModal(false); }} okText="등록" width={700}>
        <Form layout="vertical">
          <Form.Item label="프로모션명" required><Input placeholder="예: 봄맞이 신상 10% OFF" /></Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item label="유형" required><Select options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></Form.Item></Col>
            <Col span={8}><Form.Item label="할인율"><InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item label="예산"><InputNumber min={0} addonAfter="원" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item label="시작일"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item label="종료일"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item label="대상"><Input placeholder="예: 26SS 전체, VIP 이상 고객" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
