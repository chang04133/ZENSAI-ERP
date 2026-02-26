import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Select, DatePicker, Modal, Descriptions, Tabs, message } from 'antd';
import { DollarOutlined, CheckCircleOutlined, ClockCircleOutlined, PrinterOutlined, FileExcelOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { PENDING: 'orange', CONFIRMED: 'blue', PAID: 'green', OVERDUE: 'red' };
const STATUS_LABEL: Record<string, string> = { PENDING: '정산대기', CONFIRMED: '확정', PAID: '지급완료', OVERDUE: '연체' };

const mockSettlements = [
  { id: 1, settle_no: 'ST-2026-02-001', partner_name: '강남점', period: '2026-02', type: '매출정산', sales_amount: 45000000, commission_rate: 30, commission: 13500000, net_amount: 31500000, status: 'CONFIRMED', settle_date: '2026-03-05' },
  { id: 2, settle_no: 'ST-2026-02-002', partner_name: '대구점', period: '2026-02', type: '매출정산', sales_amount: 32000000, commission_rate: 30, commission: 9600000, net_amount: 22400000, status: 'PENDING', settle_date: '' },
  { id: 3, settle_no: 'ST-2026-02-003', partner_name: '(주)삼성섬유', period: '2026-02', type: '매입정산', sales_amount: 0, commission_rate: 0, commission: 0, net_amount: 45000000, status: 'CONFIRMED', settle_date: '2026-03-10' },
  { id: 4, settle_no: 'ST-2026-01-001', partner_name: '강남점', period: '2026-01', type: '매출정산', sales_amount: 52000000, commission_rate: 30, commission: 15600000, net_amount: 36400000, status: 'PAID', settle_date: '2026-02-05' },
  { id: 5, settle_no: 'ST-2026-01-002', partner_name: '대구점', period: '2026-01', type: '매출정산', sales_amount: 28000000, commission_rate: 30, commission: 8400000, net_amount: 19600000, status: 'PAID', settle_date: '2026-02-05' },
  { id: 6, settle_no: 'ST-2026-01-003', partner_name: '온라인몰', period: '2026-01', type: '매출정산', sales_amount: 18000000, commission_rate: 12, commission: 2160000, net_amount: 15840000, status: 'PAID', settle_date: '2026-02-10' },
  { id: 7, settle_no: 'ST-2026-02-004', partner_name: '대한봉제', period: '2026-02', type: '매입정산', sales_amount: 0, commission_rate: 0, commission: 0, net_amount: 28500000, status: 'PENDING', settle_date: '' },
  { id: 8, settle_no: 'ST-2026-02-005', partner_name: '온라인몰', period: '2026-02', type: '매출정산', sales_amount: 22000000, commission_rate: 12, commission: 2640000, net_amount: 19360000, status: 'PENDING', settle_date: '' },
];

const mockDetails = [
  { date: '2026-02-01', item: '26SS 캐시미어 코트', qty: 3, unit_price: 450000, amount: 1350000 },
  { date: '2026-02-03', item: '울 블렌드 니트', qty: 5, unit_price: 189000, amount: 945000 },
  { date: '2026-02-05', item: '와이드 슬랙스', qty: 8, unit_price: 120000, amount: 960000 },
  { date: '2026-02-08', item: '실크 블라우스', qty: 4, unit_price: 210000, amount: 840000 },
  { date: '2026-02-10', item: '가죽 토트백', qty: 2, unit_price: 320000, amount: 640000 },
];

export default function SettlementPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockSettlements.filter(s => {
    const matchSearch = s.settle_no.includes(search) || s.partner_name.includes(search);
    const matchType = !typeFilter || s.type === typeFilter;
    return matchSearch && matchType;
  });

  const columns = [
    { title: '정산번호', dataIndex: 'settle_no', width: 150, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '거래처', dataIndex: 'partner_name', width: 120 },
    { title: '정산기간', dataIndex: 'period', width: 100 },
    { title: '유형', dataIndex: 'type', width: 90, render: (v: string) => <Tag color={v === '매출정산' ? 'blue' : 'purple'}>{v}</Tag> },
    { title: '매출액', dataIndex: 'sales_amount', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '수수료율', dataIndex: 'commission_rate', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? v + '%' : '-' },
    { title: '수수료', dataIndex: 'commission', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '정산금액', dataIndex: 'net_amount', width: 130, align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600 }}>{v.toLocaleString()}</span> },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '지급일', dataIndex: 'settle_date', width: 110, render: (v: string) => v || '-' },
    {
      title: '', width: 80, render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" icon={<PrinterOutlined />} />
          {r.status === 'CONFIRMED' && <Button size="small" type="primary" onClick={() => message.success('지급 처리 완료')}>지급</Button>}
        </Space>
      ),
    },
  ];

  const detailCols = [
    { title: '일자', dataIndex: 'date', width: 100 },
    { title: '품목', dataIndex: 'item', width: 200 },
    { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const },
    { title: '단가', dataIndex: 'unit_price', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '금액', dataIndex: 'amount', width: 120, align: 'right' as const, render: (v: number) => v.toLocaleString() },
  ];

  const pendingAmount = mockSettlements.filter(s => s.status === 'PENDING').reduce((sum, s) => sum + s.net_amount, 0);
  const paidAmount = mockSettlements.filter(s => s.status === 'PAID').reduce((sum, s) => sum + s.net_amount, 0);

  return (
    <div>
      <PageHeader title="정산 관리" extra={
        <Space>
          <Select placeholder="유형" allowClear style={{ width: 120 }} onChange={v => setTypeFilter(v || '')}
            options={[{ value: '매출정산', label: '매출정산' }, { value: '매입정산', label: '매입정산' }]} />
          <Input.Search placeholder="정산번호/거래처 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />
          <Button icon={<FileExcelOutlined />}>엑셀 다운로드</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="정산 대기" value={pendingAmount} suffix="원" valueStyle={{ color: '#fa8c16' }} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="확정(미지급)" value={mockSettlements.filter(s => s.status === 'CONFIRMED').reduce((sum, s) => sum + s.net_amount, 0)} suffix="원" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="지급 완료" value={paidAmount} suffix="원" valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 수수료" value={mockSettlements.filter(s => s.period === '2026-02').reduce((sum, s) => sum + s.commission, 0)} suffix="원" prefix={<DollarOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1300, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`정산 상세 - ${selected?.settle_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={800} footer={null}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="정산번호">{selected.settle_no}</Descriptions.Item>
              <Descriptions.Item label="거래처">{selected.partner_name}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="정산기간">{selected.period}</Descriptions.Item>
              <Descriptions.Item label="유형">{selected.type}</Descriptions.Item>
              <Descriptions.Item label="정산금액" style={{ fontWeight: 600 }}>{selected.net_amount.toLocaleString()}원</Descriptions.Item>
            </Descriptions>
            <Table dataSource={mockDetails} columns={detailCols} rowKey="date" size="small" pagination={false}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4} align="right"><strong>합계</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><strong>{mockDetails.reduce((s, d) => s + d.amount, 0).toLocaleString()}</strong></Table.Summary.Cell>
                </Table.Summary.Row>
              )} />
          </>
        )}
      </Modal>
    </div>
  );
}
