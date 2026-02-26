import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Select, Modal, Descriptions, message, Badge } from 'antd';
import { ShoppingCartOutlined, TruckOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, PrinterOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { NEW: 'orange', CONFIRMED: 'blue', PREPARING: 'cyan', SHIPPED: 'green', DELIVERED: '#87d068', CANCELLED: 'red', RETURN: 'purple' };
const STATUS_LABEL: Record<string, string> = { NEW: '신규주문', CONFIRMED: '확인', PREPARING: '상품준비', SHIPPED: '배송중', DELIVERED: '배송완료', CANCELLED: '취소', RETURN: '반품' };

const CHANNEL_COLOR: Record<string, string> = { 'ZENSAI몰': 'blue', '네이버': 'green', '카카오': '#faad14', '무신사': 'purple', '29CM': 'cyan', 'W컨셉': 'magenta' };

const mockOrders = [
  { id: 1, order_no: 'ON-2026-00345', channel: 'ZENSAI몰', customer: '김서연', phone: '010-1234-5678', product: '26SS 캐시미어 코트', color: '블랙', size: 'M', qty: 1, amount: 450000, status: 'NEW', order_date: '2026-02-26 14:30', tracking: '' },
  { id: 2, order_no: 'ON-2026-00344', channel: '네이버', customer: '이준호', phone: '010-2345-6789', product: '울 블렌드 니트', color: '그레이', size: 'L', qty: 2, amount: 378000, status: 'CONFIRMED', order_date: '2026-02-26 12:15', tracking: '' },
  { id: 3, order_no: 'ON-2026-00343', channel: '무신사', customer: '박민지', phone: '010-3456-7890', product: '와이드 슬랙스', color: '네이비', size: 'S', qty: 1, amount: 120000, status: 'PREPARING', order_date: '2026-02-26 10:00', tracking: '' },
  { id: 4, order_no: 'ON-2026-00342', channel: '카카오', customer: '정태우', phone: '010-4567-8901', product: '실크 블라우스', color: '아이보리', size: 'M', qty: 1, amount: 210000, status: 'SHIPPED', order_date: '2026-02-25 18:20', tracking: 'CJ1234567890' },
  { id: 5, order_no: 'ON-2026-00341', channel: '29CM', customer: '최유진', phone: '010-5678-9012', product: '가죽 토트백', color: '브라운', size: 'F', qty: 1, amount: 320000, status: 'SHIPPED', order_date: '2026-02-25 15:10', tracking: 'HJ0987654321' },
  { id: 6, order_no: 'ON-2026-00340', channel: 'ZENSAI몰', customer: '한소희', phone: '010-6789-0123', product: '캐시미어 머플러', color: '베이지', size: 'F', qty: 1, amount: 150000, status: 'DELIVERED', order_date: '2026-02-24 09:30', tracking: 'CJ9876543210' },
  { id: 7, order_no: 'ON-2026-00339', channel: '네이버', customer: '오동욱', phone: '010-7890-1234', product: '면 티셔츠', color: '화이트', size: 'XL', qty: 3, amount: 147000, status: 'DELIVERED', order_date: '2026-02-23 16:45', tracking: 'LO1122334455' },
  { id: 8, order_no: 'ON-2026-00338', channel: 'W컨셉', customer: '윤채원', phone: '010-8901-2345', product: '린넨 원피스', color: '크림', size: 'S', qty: 1, amount: 280000, status: 'CANCELLED', order_date: '2026-02-23 11:00', tracking: '' },
  { id: 9, order_no: 'ON-2026-00337', channel: '무신사', customer: '강민수', phone: '010-9012-3456', product: '데님 자켓', color: '인디고', size: 'L', qty: 1, amount: 189000, status: 'RETURN', order_date: '2026-02-22 14:20', tracking: 'CJ5566778899' },
];

export default function OnlineOrderPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockOrders.filter(o => {
    const matchSearch = o.order_no.includes(search) || o.customer.includes(search) || o.product.includes(search);
    const matchStatus = !statusFilter || o.status === statusFilter;
    const matchChannel = !channelFilter || o.channel === channelFilter;
    return matchSearch && matchStatus && matchChannel;
  });

  const columns = [
    { title: '주문번호', dataIndex: 'order_no', width: 150, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '채널', dataIndex: 'channel', width: 90, render: (v: string) => <Tag color={CHANNEL_COLOR[v]}>{v}</Tag> },
    { title: '주문자', dataIndex: 'customer', width: 80 },
    { title: '상품', dataIndex: 'product', width: 160 },
    { title: '옵션', width: 100, render: (_: any, r: any) => `${r.color}/${r.size}` },
    { title: '수량', dataIndex: 'qty', width: 60, align: 'right' as const },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '주문일시', dataIndex: 'order_date', width: 140 },
    { title: '송장번호', dataIndex: 'tracking', width: 130, render: (v: string) => v || '-' },
    {
      title: '', width: 100, render: (_: any, r: any) => {
        if (r.status === 'NEW') return <Button size="small" type="primary" onClick={() => message.success('주문 확인')}>확인</Button>;
        if (r.status === 'CONFIRMED') return <Button size="small" onClick={() => message.success('상품 준비 시작')}>준비</Button>;
        if (r.status === 'PREPARING') return <Button size="small" type="primary" icon={<TruckOutlined />} onClick={() => message.success('배송 처리')}>발송</Button>;
        return null;
      },
    },
  ];

  const newOrders = mockOrders.filter(o => o.status === 'NEW').length;
  const todayAmount = mockOrders.filter(o => o.order_date.startsWith('2026-02-26')).reduce((s, o) => s + o.amount, 0);

  return (
    <div>
      <PageHeader title="온라인 주문 관리" extra={
        <Space>
          <Select placeholder="채널" allowClear style={{ width: 120 }} onChange={v => setChannelFilter(v || '')}
            options={Object.keys(CHANNEL_COLOR).map(c => ({ value: c, label: c }))} />
          <Select placeholder="상태" allowClear style={{ width: 110 }} onChange={v => setStatusFilter(v || '')}
            options={Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          <Input.Search placeholder="주문번호/고객/상품 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} />
          <Button icon={<SyncOutlined />} onClick={() => message.success('주문 동기화 완료')}>동기화</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="신규 주문" value={newOrders} suffix="건" prefix={<Badge status="processing" />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="오늘 주문액" value={todayAmount} suffix="원" prefix={<ShoppingCartOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="배송중" value={mockOrders.filter(o => o.status === 'SHIPPED').length} suffix="건" prefix={<TruckOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="배송완료" value={mockOrders.filter(o => o.status === 'DELIVERED').length} suffix="건" prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1400, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`주문 상세 - ${selected?.order_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={700} footer={[
        <Button key="print" icon={<PrinterOutlined />}>송장 출력</Button>,
      ]}>
        {selected && (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="주문번호">{selected.order_no}</Descriptions.Item>
            <Descriptions.Item label="채널"><Tag color={CHANNEL_COLOR[selected.channel]}>{selected.channel}</Tag></Descriptions.Item>
            <Descriptions.Item label="주문자">{selected.customer}</Descriptions.Item>
            <Descriptions.Item label="연락처">{selected.phone}</Descriptions.Item>
            <Descriptions.Item label="상품">{selected.product}</Descriptions.Item>
            <Descriptions.Item label="옵션">{selected.color} / {selected.size}</Descriptions.Item>
            <Descriptions.Item label="수량">{selected.qty}개</Descriptions.Item>
            <Descriptions.Item label="금액">{selected.amount.toLocaleString()}원</Descriptions.Item>
            <Descriptions.Item label="주문일시">{selected.order_date}</Descriptions.Item>
            <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="송장번호" span={2}>{selected.tracking || '미등록'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
