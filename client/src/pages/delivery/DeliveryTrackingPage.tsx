import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Select, Modal, Descriptions, Steps, message } from 'antd';
import { TruckOutlined, CheckCircleOutlined, ClockCircleOutlined, EnvironmentOutlined, SyncOutlined, PrinterOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { READY: 'default', PICKED: 'blue', IN_TRANSIT: 'orange', OUT_FOR_DELIVERY: 'cyan', DELIVERED: 'green', FAILED: 'red' };
const STATUS_LABEL: Record<string, string> = { READY: '배송준비', PICKED: '집하', IN_TRANSIT: '배송중', OUT_FOR_DELIVERY: '배달중', DELIVERED: '배송완료', FAILED: '배송실패' };

const CARRIER_COLOR: Record<string, string> = { 'CJ대한통운': '#d32f2f', '한진택배': '#1976d2', '롯데택배': '#e64a19', '로젠택배': '#388e3c', '우체국': '#f57c00' };

const mockDeliveries = [
  { id: 1, tracking_no: 'CJ1234567890', carrier: 'CJ대한통운', order_no: 'ON-2026-00342', customer: '정태우', phone: '010-4567-8901', address: '서울 강남구 역삼동 123-4', product: '실크 블라우스', ship_date: '2026-02-25', status: 'IN_TRANSIT', eta: '2026-02-27' },
  { id: 2, tracking_no: 'HJ0987654321', carrier: '한진택배', order_no: 'ON-2026-00341', customer: '최유진', phone: '010-5678-9012', address: '부산 해운대구 우동 456-7', product: '가죽 토트백', ship_date: '2026-02-25', status: 'OUT_FOR_DELIVERY', eta: '2026-02-26' },
  { id: 3, tracking_no: 'CJ9876543210', carrier: 'CJ대한통운', order_no: 'ON-2026-00340', customer: '한소희', phone: '010-6789-0123', address: '서울 서초구 서초동 789-0', product: '캐시미어 머플러', ship_date: '2026-02-24', status: 'DELIVERED', eta: '2026-02-25' },
  { id: 4, tracking_no: 'LO1122334455', carrier: '롯데택배', order_no: 'ON-2026-00339', customer: '오동욱', phone: '010-7890-1234', address: '경기 수원시 영통구 매탄동', product: '면 티셔츠 3개', ship_date: '2026-02-23', status: 'DELIVERED', eta: '2026-02-24' },
  { id: 5, tracking_no: 'CJ5566778899', carrier: 'CJ대한통운', order_no: 'ON-2026-00337', customer: '강민수', phone: '010-9012-3456', address: '대구 중구 동성로 100', product: '데님 자켓', ship_date: '2026-02-22', status: 'DELIVERED', eta: '2026-02-23' },
  { id: 6, tracking_no: 'RZ3344556677', carrier: '로젠택배', order_no: 'SH-2026-0012', customer: '부산점', phone: '051-345-6789', address: '부산 해운대구 해운대로 789', product: '매장간 이동 (5박스)', ship_date: '2026-02-26', status: 'PICKED', eta: '2026-02-27' },
  { id: 7, tracking_no: 'POST8899001122', carrier: '우체국', order_no: 'ON-2026-00335', customer: '서예린', phone: '010-0123-4567', address: '제주 제주시 연동 200', product: '울 블렌드 니트', ship_date: '2026-02-26', status: 'READY', eta: '2026-02-28' },
  { id: 8, tracking_no: 'HJ6677889900', carrier: '한진택배', order_no: 'ON-2026-00333', customer: '윤채원', phone: '010-8901-2345', address: '서울 마포구 서교동 350', product: '린넨 블라우스', ship_date: '2026-02-21', status: 'FAILED', eta: '2026-02-22' },
];

const mockTrackingDetail = [
  { time: '2026-02-25 18:00', location: '서울 강남 HUB', status: '상품 인수' },
  { time: '2026-02-25 22:30', location: '옥천 HUB', status: '간선 상차' },
  { time: '2026-02-26 04:00', location: '옥천 HUB', status: '간선 하차' },
  { time: '2026-02-26 06:30', location: '대전 배송센터', status: '배송 출발' },
  { time: '2026-02-26 14:00', location: '대전 유성구', status: '배달중' },
];

export default function DeliveryTrackingPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockDeliveries.filter(d => {
    const matchSearch = d.tracking_no.includes(search) || d.customer.includes(search) || d.order_no.includes(search);
    const matchStatus = !statusFilter || d.status === statusFilter;
    const matchCarrier = !carrierFilter || d.carrier === carrierFilter;
    return matchSearch && matchStatus && matchCarrier;
  });

  const statusToStep = (status: string) => {
    const map: Record<string, number> = { READY: 0, PICKED: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4 };
    return map[status] ?? 0;
  };

  const columns = [
    { title: '송장번호', dataIndex: 'tracking_no', width: 150, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '택배사', dataIndex: 'carrier', width: 100, render: (v: string) => <Tag color={CARRIER_COLOR[v]}>{v}</Tag> },
    { title: '주문번호', dataIndex: 'order_no', width: 140 },
    { title: '수취인', dataIndex: 'customer', width: 80 },
    { title: '상품', dataIndex: 'product', width: 160, ellipsis: true },
    { title: '발송일', dataIndex: 'ship_date', width: 110 },
    { title: '도착예정', dataIndex: 'eta', width: 110 },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '주소', dataIndex: 'address', ellipsis: true },
  ];

  const inTransit = mockDeliveries.filter(d => ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED'].includes(d.status)).length;
  const delivered = mockDeliveries.filter(d => d.status === 'DELIVERED').length;
  const failed = mockDeliveries.filter(d => d.status === 'FAILED').length;

  return (
    <div>
      <PageHeader title="배송 추적" extra={
        <Space>
          <Select placeholder="택배사" allowClear style={{ width: 120 }} onChange={v => setCarrierFilter(v || '')}
            options={Object.keys(CARRIER_COLOR).map(c => ({ value: c, label: c }))} />
          <Select placeholder="상태" allowClear style={{ width: 110 }} onChange={v => setStatusFilter(v || '')}
            options={Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          <Input.Search placeholder="송장번호/주문번호/수취인 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
          <Button icon={<SyncOutlined />} onClick={() => message.success('배송 상태 갱신 완료')}>새로고침</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="배송중" value={inTransit} suffix="건" prefix={<TruckOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="배송완료" value={delivered} suffix="건" prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="배송실패" value={failed} suffix="건" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="오늘 발송" value={mockDeliveries.filter(d => d.ship_date === '2026-02-26').length} suffix="건" prefix={<ClockCircleOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1300, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`배송 추적 - ${selected?.tracking_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={700} footer={[
        <Button key="print" icon={<PrinterOutlined />}>송장 출력</Button>,
      ]}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="송장번호">{selected.tracking_no}</Descriptions.Item>
              <Descriptions.Item label="택배사"><Tag color={CARRIER_COLOR[selected.carrier]}>{selected.carrier}</Tag></Descriptions.Item>
              <Descriptions.Item label="수취인">{selected.customer}</Descriptions.Item>
              <Descriptions.Item label="연락처">{selected.phone}</Descriptions.Item>
              <Descriptions.Item label="배송지" span={2}><EnvironmentOutlined /> {selected.address}</Descriptions.Item>
              <Descriptions.Item label="상품">{selected.product}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
            </Descriptions>

            <Steps current={statusToStep(selected.status)} size="small" style={{ marginBottom: 24 }}
              items={[
                { title: '배송준비' },
                { title: '집하' },
                { title: '배송중' },
                { title: '배달중' },
                { title: '배송완료' },
              ]} />

            <Card size="small" title="배송 이력">
              <Table dataSource={mockTrackingDetail} rowKey="time" size="small" pagination={false} columns={[
                { title: '일시', dataIndex: 'time', width: 160 },
                { title: '위치', dataIndex: 'location', width: 180 },
                { title: '상태', dataIndex: 'status' },
              ]} />
            </Card>
          </>
        )}
      </Modal>
    </div>
  );
}
