import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, DatePicker, Select, Modal, InputNumber, message, Descriptions } from 'antd';
import { CheckOutlined, SearchOutlined, ExclamationCircleOutlined, EyeOutlined } from '@ant-design/icons';

const STATUS_OPTIONS = [
  { label: '전체 보기', value: '' },
  { label: '입고대기', value: 'WAITING' },
  { label: '검수중', value: 'INSPECTING' },
  { label: '검수완료', value: 'PASSED' },
  { label: '불합격', value: 'REJECTED' },
];
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { WAITING: 'orange', INSPECTING: 'blue', PASSED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<string, string> = { WAITING: '입고대기', INSPECTING: '검수중', PASSED: '검수완료', REJECTED: '불합격' };

const mockReceives = [
  { id: 1, receive_no: 'RV-2026-0001', order_no: 'PO-2026-0001', partner_name: '(주)삼성섬유', receive_date: '2026-02-26', status: 'WAITING', total_qty: 350, inspected_qty: 0, pass_qty: 0, reject_qty: 0, memo: '원단 350야드' },
  { id: 2, receive_no: 'RV-2026-0002', order_no: 'PO-2026-0002', partner_name: '대한봉제', receive_date: '2026-02-25', status: 'INSPECTING', total_qty: 200, inspected_qty: 120, pass_qty: 115, reject_qty: 5, memo: '봉제품 1차 입고' },
  { id: 3, receive_no: 'RV-2026-0003', order_no: 'PO-2026-0003', partner_name: '한국단추', receive_date: '2026-02-24', status: 'PASSED', total_qty: 5000, inspected_qty: 5000, pass_qty: 4980, reject_qty: 20, memo: '단추 5000개' },
  { id: 4, receive_no: 'RV-2026-0004', order_no: 'PO-2026-0007', partner_name: '베트남공장A', receive_date: '2026-02-23', status: 'PASSED', total_qty: 1500, inspected_qty: 1500, pass_qty: 1480, reject_qty: 20, memo: '해외 CMT 1차분' },
  { id: 5, receive_no: 'RV-2026-0005', order_no: 'PO-2026-0007', partner_name: '베트남공장A', receive_date: '2026-02-26', status: 'WAITING', total_qty: 800, inspected_qty: 0, pass_qty: 0, reject_qty: 0, memo: '해외 CMT 2차분' },
  { id: 6, receive_no: 'RV-2026-0006', order_no: 'PO-2026-0005', partner_name: '(주)이노팩', receive_date: '2026-02-22', status: 'PASSED', total_qty: 10000, inspected_qty: 10000, pass_qty: 9950, reject_qty: 50, memo: '행택/폴리백' },
  { id: 7, receive_no: 'RV-2026-0007', order_no: 'PO-2026-0006', partner_name: '(주)삼성섬유', receive_date: '2026-02-26', status: 'WAITING', total_qty: 500, inspected_qty: 0, pass_qty: 0, reject_qty: 0, memo: '면혼방 원단' },
];

const mockInspectItems = [
  { id: 1, product_name: '26SS 오버핏 자켓 원단', spec: '폴리혼방 280g', unit: '야드', qty: 200, inspected: 0, pass: 0, reject: 0 },
  { id: 2, product_name: '26SS 와이드 팬츠 원단', spec: '면혼방 220g', unit: '야드', qty: 150, inspected: 0, pass: 0, reject: 0 },
];

export default function PurchaseReceivePage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [inspectModal, setInspectModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockReceives.filter(r => {
    const matchSearch = r.receive_no.includes(search) || r.order_no.includes(search) || r.partner_name.includes(search);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    { title: '입고번호', dataIndex: 'receive_no', width: 140, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setInspectModal(true); }}>{v}</a> },
    { title: '발주번호', dataIndex: 'order_no', width: 140 },
    { title: '거래처', dataIndex: 'partner_name', width: 130 },
    { title: '입고일', dataIndex: 'receive_date', width: 110 },
    { title: '총수량', dataIndex: 'total_qty', width: 80, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '검수수량', dataIndex: 'inspected_qty', width: 90, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '합격', dataIndex: 'pass_qty', width: 70, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a' }}>{v.toLocaleString()}</span> },
    { title: '불합격', dataIndex: 'reject_qty', width: 70, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0' },
    { title: '상태', dataIndex: 'status', width: 100, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '비고', dataIndex: 'memo', ellipsis: true },
    {
      title: '', width: 80, render: (_: any, r: any) => r.status === 'WAITING' ? (
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => { setSelected(r); setInspectModal(true); }}>검수</Button>
      ) : <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelected(r); setInspectModal(true); }} />,
    },
  ];

  const inspectCols = [
    { title: '품명', dataIndex: 'product_name', width: 200 },
    { title: '규격', dataIndex: 'spec', width: 120 },
    { title: '단위', dataIndex: 'unit', width: 60 },
    { title: '입고수량', dataIndex: 'qty', width: 90, align: 'right' as const },
    { title: '검수수량', width: 100, render: () => <InputNumber size="small" min={0} style={{ width: 80 }} /> },
    { title: '합격', width: 100, render: () => <InputNumber size="small" min={0} style={{ width: 80 }} /> },
    { title: '불합격', width: 100, render: () => <InputNumber size="small" min={0} style={{ width: 80 }} /> },
    { title: '불합격사유', width: 150, render: () => <Select size="small" style={{ width: 130 }} placeholder="선택" options={[{ value: '오염', label: '오염' }, { value: '사이즈불량', label: '사이즈불량' }, { value: '봉제불량', label: '봉제불량' }, { value: '원단하자', label: '원단하자' }]} /> },
  ];

  return (
    <div>
      <PageHeader title="입고/검수 관리" />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input placeholder="입고번호/발주번호 검색" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />
        <Select value={statusFilter} onChange={v => setStatusFilter(v)} style={{ width: 120 }} options={STATUS_OPTIONS} />
        <Button onClick={() => {}}>조회</Button>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="입고대기" value={mockReceives.filter(r => r.status === 'WAITING').length} suffix="건" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="검수중" value={mockReceives.filter(r => r.status === 'INSPECTING').length} suffix="건" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="검수완료" value={mockReceives.filter(r => r.status === 'PASSED').length} suffix="건" valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="불합격률" value={1.2} suffix="%" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`검수 - ${selected?.receive_no || ''}`} open={inspectModal} onCancel={() => setInspectModal(false)} width={950}
        footer={selected?.status === 'WAITING' ? [
          <Button key="reject" danger onClick={() => { message.warning('불합격 처리됨'); setInspectModal(false); }}>불합격</Button>,
          <Button key="pass" type="primary" onClick={() => { message.success('검수 완료'); setInspectModal(false); }}>검수 완료</Button>,
        ] : null}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="입고번호">{selected.receive_no}</Descriptions.Item>
              <Descriptions.Item label="발주번호">{selected.order_no}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="거래처">{selected.partner_name}</Descriptions.Item>
              <Descriptions.Item label="입고일">{selected.receive_date}</Descriptions.Item>
              <Descriptions.Item label="비고">{selected.memo}</Descriptions.Item>
            </Descriptions>
            <Table dataSource={mockInspectItems} columns={inspectCols} rowKey="id" size="small" pagination={false} />
          </>
        )}
      </Modal>
    </div>
  );
}
