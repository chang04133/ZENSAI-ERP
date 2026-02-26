import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Select, DatePicker, Modal, Descriptions, message } from 'antd';
import { PlusOutlined, PrinterOutlined, FileExcelOutlined, CheckCircleOutlined, MailOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { DRAFT: 'default', ISSUED: 'blue', SENT: 'green', CANCELLED: 'red' };
const STATUS_LABEL: Record<string, string> = { DRAFT: '작성중', ISSUED: '발행', SENT: '전송완료', CANCELLED: '취소' };

const mockInvoices = [
  { id: 1, invoice_no: 'TI-2026-0001', type: '매출', partner_name: '강남점', partner_biz_no: '123-45-67890', issue_date: '2026-02-25', supply_amount: 40909091, tax_amount: 4090909, total_amount: 45000000, status: 'SENT', items_count: 15 },
  { id: 2, invoice_no: 'TI-2026-0002', type: '매출', partner_name: '대구점', partner_biz_no: '234-56-78901', issue_date: '2026-02-25', supply_amount: 29090909, tax_amount: 2909091, total_amount: 32000000, status: 'ISSUED', items_count: 10 },
  { id: 3, invoice_no: 'TI-2026-0003', type: '매입', partner_name: '(주)삼성섬유', partner_biz_no: '345-67-89012', issue_date: '2026-02-20', supply_amount: 40909091, tax_amount: 4090909, total_amount: 45000000, status: 'SENT', items_count: 8 },
  { id: 4, invoice_no: 'TI-2026-0004', type: '매입', partner_name: '대한봉제', partner_biz_no: '456-78-90123', issue_date: '2026-02-18', supply_amount: 25909091, tax_amount: 2590909, total_amount: 28500000, status: 'SENT', items_count: 5 },
  { id: 5, invoice_no: 'TI-2026-0005', type: '매출', partner_name: '현대백화점 판교', partner_biz_no: '567-89-01234', issue_date: '2026-02-25', supply_amount: 47272727, tax_amount: 4727273, total_amount: 52000000, status: 'DRAFT', items_count: 18 },
  { id: 6, invoice_no: 'TI-2026-0006', type: '매입', partner_name: '(주)이노팩', partner_biz_no: '678-90-12345', issue_date: '2026-02-22', supply_amount: 5272727, tax_amount: 527273, total_amount: 5800000, status: 'SENT', items_count: 3 },
  { id: 7, invoice_no: 'TI-2026-0007', type: '매출', partner_name: '온라인몰', partner_biz_no: '789-01-23456', issue_date: '2026-02-25', supply_amount: 20000000, tax_amount: 2000000, total_amount: 22000000, status: 'ISSUED', items_count: 12 },
];

const mockItems = [
  { id: 1, date: '2026-02-01', product: '26SS 캐시미어 코트', spec: '블랙/M', qty: 5, unit_price: 409091, supply: 2045455, tax: 204545 },
  { id: 2, date: '2026-02-05', product: '울 블렌드 니트', spec: '그레이/F', qty: 10, unit_price: 171818, supply: 1718182, tax: 171818 },
  { id: 3, date: '2026-02-10', product: '와이드 슬랙스', spec: '네이비/M', qty: 8, unit_price: 109091, supply: 872727, tax: 87273 },
];

export default function TaxInvoicePage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockInvoices.filter(i => {
    const matchSearch = i.invoice_no.includes(search) || i.partner_name.includes(search);
    const matchType = !typeFilter || i.type === typeFilter;
    return matchSearch && matchType;
  });

  const columns = [
    { title: '계산서번호', dataIndex: 'invoice_no', width: 140, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '구분', dataIndex: 'type', width: 70, render: (v: string) => <Tag color={v === '매출' ? 'green' : 'blue'}>{v}</Tag> },
    { title: '거래처', dataIndex: 'partner_name', width: 140 },
    { title: '사업자번호', dataIndex: 'partner_biz_no', width: 130 },
    { title: '발행일', dataIndex: 'issue_date', width: 110 },
    { title: '공급가액', dataIndex: 'supply_amount', width: 130, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '세액', dataIndex: 'tax_amount', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '합계', dataIndex: 'total_amount', width: 130, align: 'right' as const, render: (v: number) => <strong>{v.toLocaleString()}</strong> },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    {
      title: '', width: 100, render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" icon={<PrinterOutlined />} />
          {r.status === 'ISSUED' && <Button size="small" type="primary" icon={<MailOutlined />} onClick={() => message.success('전자세금계산서 전송 완료')}>전송</Button>}
        </Space>
      ),
    },
  ];

  const itemCols = [
    { title: '일자', dataIndex: 'date', width: 100 },
    { title: '품목', dataIndex: 'product', width: 180 },
    { title: '규격', dataIndex: 'spec', width: 100 },
    { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const },
    { title: '단가', dataIndex: 'unit_price', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '공급가액', dataIndex: 'supply', width: 120, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '세액', dataIndex: 'tax', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
  ];

  const salesTax = mockInvoices.filter(i => i.type === '매출').reduce((s, i) => s + i.tax_amount, 0);
  const purchaseTax = mockInvoices.filter(i => i.type === '매입').reduce((s, i) => s + i.tax_amount, 0);

  return (
    <div>
      <PageHeader title="세금계산서 관리" extra={
        <Space>
          <Select placeholder="구분" allowClear style={{ width: 100 }} onChange={v => setTypeFilter(v || '')}
            options={[{ value: '매출', label: '매출' }, { value: '매입', label: '매입' }]} />
          <Input.Search placeholder="계산서번호/거래처 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />
          <Button icon={<FileExcelOutlined />}>엑셀</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('세금계산서 발행')}>발행</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="매출세액" value={salesTax} suffix="원" valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="매입세액" value={purchaseTax} suffix="원" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="납부세액" value={salesTax - purchaseTax} suffix="원" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="미전송" value={mockInvoices.filter(i => i.status !== 'SENT' && i.status !== 'CANCELLED').length} suffix="건" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1300, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`세금계산서 - ${selected?.invoice_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={850} footer={[
        <Button key="print" icon={<PrinterOutlined />}>인쇄</Button>,
      ]}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="계산서번호">{selected.invoice_no}</Descriptions.Item>
              <Descriptions.Item label="구분"><Tag color={selected.type === '매출' ? 'green' : 'blue'}>{selected.type}</Tag></Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="거래처">{selected.partner_name}</Descriptions.Item>
              <Descriptions.Item label="사업자번호">{selected.partner_biz_no}</Descriptions.Item>
              <Descriptions.Item label="발행일">{selected.issue_date}</Descriptions.Item>
              <Descriptions.Item label="공급가액">{selected.supply_amount.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="세액">{selected.tax_amount.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="합계"><strong>{selected.total_amount.toLocaleString()}원</strong></Descriptions.Item>
            </Descriptions>
            <Table dataSource={mockItems} columns={itemCols} rowKey="id" size="small" pagination={false} />
          </>
        )}
      </Modal>
    </div>
  );
}
