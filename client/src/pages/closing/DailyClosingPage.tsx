import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, DatePicker, Select, Modal, Descriptions, Divider, Alert, message } from 'antd';
import { CheckCircleOutlined, LockOutlined, UnlockOutlined, PrinterOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import dayjs from 'dayjs';

const STATUS_COLOR: Record<string, string> = { OPEN: 'blue', CLOSED: 'green', LOCKED: 'default' };
const STATUS_LABEL: Record<string, string> = { OPEN: '진행중', CLOSED: '마감완료', LOCKED: '확정' };

const mockClosings = [
  { id: 1, date: '2026-02-26', store: '강남점', status: 'OPEN', sales_count: 12, sales_amount: 3450000, return_count: 1, return_amount: 189000, net_sales: 3261000, cash: 850000, card: 2100000, transfer: 311000, closed_by: '', closed_at: '' },
  { id: 2, date: '2026-02-26', store: '대구점', status: 'OPEN', sales_count: 8, sales_amount: 2100000, return_count: 0, return_amount: 0, net_sales: 2100000, cash: 420000, card: 1500000, transfer: 180000, closed_by: '', closed_at: '' },
  { id: 3, date: '2026-02-25', store: '강남점', status: 'CLOSED', sales_count: 15, sales_amount: 4200000, return_count: 2, return_amount: 350000, net_sales: 3850000, cash: 1200000, card: 2350000, transfer: 300000, closed_by: '김매니저', closed_at: '2026-02-25 21:30' },
  { id: 4, date: '2026-02-25', store: '대구점', status: 'CLOSED', sales_count: 10, sales_amount: 2800000, return_count: 1, return_amount: 120000, net_sales: 2680000, cash: 560000, card: 1920000, transfer: 200000, closed_by: '이매니저', closed_at: '2026-02-25 21:15' },
  { id: 5, date: '2026-02-24', store: '강남점', status: 'LOCKED', sales_count: 18, sales_amount: 5100000, return_count: 0, return_amount: 0, net_sales: 5100000, cash: 1530000, card: 3060000, transfer: 510000, closed_by: '김매니저', closed_at: '2026-02-24 21:45' },
  { id: 6, date: '2026-02-24', store: '대구점', status: 'LOCKED', sales_count: 11, sales_amount: 3200000, return_count: 1, return_amount: 210000, net_sales: 2990000, cash: 640000, card: 2050000, transfer: 300000, closed_by: '이매니저', closed_at: '2026-02-24 21:20' },
  { id: 7, date: '2026-02-23', store: '강남점', status: 'LOCKED', sales_count: 14, sales_amount: 3800000, return_count: 1, return_amount: 150000, net_sales: 3650000, cash: 1100000, card: 2200000, transfer: 350000, closed_by: '김매니저', closed_at: '2026-02-23 21:30' },
];

const mockSalesDetail = [
  { time: '10:30', receipt_no: 'S-0001', customer: '김서연', items: 2, amount: 639000, payment: '카드' },
  { time: '11:15', receipt_no: 'S-0002', customer: '일반고객', items: 1, amount: 189000, payment: '현금' },
  { time: '13:20', receipt_no: 'S-0003', customer: '이준호', items: 3, amount: 870000, payment: '카드' },
  { time: '14:45', receipt_no: 'S-0004', customer: '일반고객', items: 1, amount: 320000, payment: '카드' },
  { time: '15:30', receipt_no: 'S-0005', customer: '박민지', items: 2, amount: 450000, payment: '계좌이체' },
];

export default function DailyClosingPage() {
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [storeFilter, setStoreFilter] = useState('');

  const filtered = mockClosings.filter(c => !storeFilter || c.store === storeFilter);

  const columns = [
    { title: '일자', dataIndex: 'date', width: 110, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '매장', dataIndex: 'store', width: 100 },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]} icon={v === 'LOCKED' ? <LockOutlined /> : v === 'CLOSED' ? <CheckCircleOutlined /> : <UnlockOutlined />}>{STATUS_LABEL[v]}</Tag> },
    { title: '판매건수', dataIndex: 'sales_count', width: 80, align: 'right' as const },
    { title: '매출액', dataIndex: 'sales_amount', width: 120, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '반품', dataIndex: 'return_amount', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>-{v.toLocaleString()}</span> : '0' },
    { title: '순매출', dataIndex: 'net_sales', width: 120, align: 'right' as const, render: (v: number) => <strong>{v.toLocaleString()}</strong> },
    { title: '현금', dataIndex: 'cash', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '카드', dataIndex: 'card', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '이체', dataIndex: 'transfer', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '마감자', dataIndex: 'closed_by', width: 80, render: (v: string) => v || '-' },
    {
      title: '', width: 80, render: (_: any, r: any) => r.status === 'OPEN' ? (
        <Button size="small" type="primary" icon={<LockOutlined />} onClick={() => message.success(`${r.store} ${r.date} 마감 완료`)}>마감</Button>
      ) : r.status === 'CLOSED' ? (
        <Button size="small" icon={<PrinterOutlined />} />
      ) : null,
    },
  ];

  const detailCols = [
    { title: '시간', dataIndex: 'time', width: 70 },
    { title: '영수증번호', dataIndex: 'receipt_no', width: 100 },
    { title: '고객', dataIndex: 'customer', width: 100 },
    { title: '품목수', dataIndex: 'items', width: 70, align: 'right' as const },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '결제', dataIndex: 'payment', width: 80 },
  ];

  const todaySales = mockClosings.filter(c => c.date === '2026-02-26').reduce((s, c) => s + c.net_sales, 0);

  return (
    <div>
      <PageHeader title="일마감 관리" extra={
        <Space>
          <Select placeholder="매장" allowClear style={{ width: 120 }} onChange={v => setStoreFilter(v || '')}
            options={[{ value: '강남점', label: '강남점' }, { value: '대구점', label: '대구점' }]} />
          <DatePicker defaultValue={dayjs('2026-02-26')} />
        </Space>
      } />

      {mockClosings.some(c => c.status === 'OPEN') && (
        <Alert type="warning" message="오늘 마감이 완료되지 않은 매장이 있습니다." icon={<ExclamationCircleOutlined />} showIcon style={{ marginBottom: 16 }} />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="오늘 전체 매출" value={todaySales} suffix="원" /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="마감 완료" value={mockClosings.filter(c => c.date === '2026-02-26' && c.status !== 'OPEN').length} suffix={`/ ${mockClosings.filter(c => c.date === '2026-02-26').length} 매장`} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="오늘 판매건수" value={mockClosings.filter(c => c.date === '2026-02-26').reduce((s, c) => s + c.sales_count, 0)} suffix="건" /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="오늘 반품" value={mockClosings.filter(c => c.date === '2026-02-26').reduce((s, c) => s + c.return_count, 0)} suffix="건" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1300, y: 'calc(100vh - 380px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`마감 상세 - ${selected?.store} ${selected?.date || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={800} footer={null}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="매장">{selected.store}</Descriptions.Item>
              <Descriptions.Item label="일자">{selected.date}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="판매건수">{selected.sales_count}건</Descriptions.Item>
              <Descriptions.Item label="반품건수">{selected.return_count}건</Descriptions.Item>
              <Descriptions.Item label="순매출"><strong>{selected.net_sales.toLocaleString()}원</strong></Descriptions.Item>
              <Descriptions.Item label="현금">{selected.cash.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="카드">{selected.card.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="이체">{selected.transfer.toLocaleString()}원</Descriptions.Item>
            </Descriptions>
            <Divider>판매 내역</Divider>
            <Table dataSource={mockSalesDetail} columns={detailCols} rowKey="receipt_no" size="small" pagination={false} />
          </>
        )}
      </Modal>
    </div>
  );
}
