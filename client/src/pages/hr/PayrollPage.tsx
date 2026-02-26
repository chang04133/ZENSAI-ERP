import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Select, Modal, Descriptions, Divider, message } from 'antd';
import { DollarOutlined, UserOutlined, CheckCircleOutlined, FileExcelOutlined, PrinterOutlined, BankOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { DRAFT: 'default', CONFIRMED: 'blue', PAID: 'green' };
const STATUS_LABEL: Record<string, string> = { DRAFT: '작성중', CONFIRMED: '확정', PAID: '지급완료' };

const mockPayroll = [
  { id: 1, name: '김매니저', store: '강남점', role: '매니저', base_salary: 3500000, overtime_pay: 675000, bonus: 500000, total_pay: 4675000, tax: 420000, insurance: 350000, deductions: 770000, net_pay: 3905000, status: 'CONFIRMED' },
  { id: 2, name: '박직원', store: '강남점', role: '시니어', base_salary: 2800000, overtime_pay: 150000, bonus: 0, total_pay: 2950000, tax: 265000, insurance: 280000, deductions: 545000, net_pay: 2405000, status: 'CONFIRMED' },
  { id: 3, name: '이직원', store: '강남점', role: '주니어', base_salary: 2400000, overtime_pay: 75000, bonus: 0, total_pay: 2475000, tax: 222750, insurance: 240000, deductions: 462750, net_pay: 2012250, status: 'CONFIRMED' },
  { id: 4, name: '최직원', store: '강남점', role: '파트타임', base_salary: 1200000, overtime_pay: 0, bonus: 0, total_pay: 1200000, tax: 0, insurance: 120000, deductions: 120000, net_pay: 1080000, status: 'DRAFT' },
  { id: 5, name: '정직원', store: '강남점', role: '주니어', base_salary: 2400000, overtime_pay: 0, bonus: 0, total_pay: 2400000, tax: 216000, insurance: 240000, deductions: 456000, net_pay: 1944000, status: 'CONFIRMED' },
  { id: 6, name: '이매니저', store: '대구점', role: '매니저', base_salary: 3200000, overtime_pay: 600000, bonus: 300000, total_pay: 4100000, tax: 369000, insurance: 320000, deductions: 689000, net_pay: 3411000, status: 'CONFIRMED' },
  { id: 7, name: '한직원', store: '대구점', role: '주니어', base_salary: 2400000, overtime_pay: 45000, bonus: 0, total_pay: 2445000, tax: 220050, insurance: 240000, deductions: 460050, net_pay: 1984950, status: 'CONFIRMED' },
  { id: 8, name: '송직원', store: '대구점', role: '시니어', base_salary: 2800000, overtime_pay: 120000, bonus: 0, total_pay: 2920000, tax: 262800, insurance: 280000, deductions: 542800, net_pay: 2377200, status: 'DRAFT' },
];

const mockPayslip = {
  earnings: [
    { item: '기본급', amount: 3500000 },
    { item: '초과근무수당', amount: 675000 },
    { item: '성과급', amount: 500000 },
    { item: '식대', amount: 100000 },
    { item: '교통비', amount: 100000 },
  ],
  deductions: [
    { item: '소득세', amount: 420000 },
    { item: '국민연금', amount: 175000 },
    { item: '건강보험', amount: 122500 },
    { item: '고용보험', amount: 37500 },
    { item: '장기요양', amount: 15000 },
  ],
};

export default function PayrollPage() {
  const [storeFilter, setStoreFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [period, setPeriod] = useState('2026-02');

  const filtered = mockPayroll.filter(p => !storeFilter || p.store === storeFilter);

  const columns = [
    { title: '이름', dataIndex: 'name', width: 90, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '매장', dataIndex: 'store', width: 80 },
    { title: '직급', dataIndex: 'role', width: 80 },
    { title: '기본급', dataIndex: 'base_salary', width: 110, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '초과근무', dataIndex: 'overtime_pay', width: 100, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '상여', dataIndex: 'bonus', width: 90, align: 'right' as const, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '총 지급액', dataIndex: 'total_pay', width: 120, align: 'right' as const, render: (v: number) => <strong>{v.toLocaleString()}</strong> },
    { title: '공제합계', dataIndex: 'deductions', width: 110, align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f' }}>{v.toLocaleString()}</span> },
    { title: '실수령액', dataIndex: 'net_pay', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: '#1890ff', fontWeight: 600 }}>{v.toLocaleString()}</span> },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
  ];

  const totalPay = filtered.reduce((s, p) => s + p.total_pay, 0);
  const totalNet = filtered.reduce((s, p) => s + p.net_pay, 0);
  const totalDeductions = filtered.reduce((s, p) => s + p.deductions, 0);

  return (
    <div>
      <PageHeader title="급여 관리" extra={
        <Space>
          <Select value={period} onChange={setPeriod} style={{ width: 120 }} options={[{ value: '2026-02', label: '2026년 2월' }, { value: '2026-01', label: '2026년 1월' }]} />
          <Select placeholder="매장" allowClear style={{ width: 120 }} onChange={v => setStoreFilter(v || '')}
            options={[{ value: '강남점', label: '강남점' }, { value: '대구점', label: '대구점' }]} />
          <Button icon={<FileExcelOutlined />}>엑셀</Button>
          <Button type="primary" icon={<BankOutlined />} onClick={() => message.success('급여 일괄 이체 완료')}>일괄 이체</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="대상 인원" value={filtered.length} suffix="명" prefix={<UserOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="총 지급액" value={totalPay} suffix="원" prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="공제 합계" value={totalDeductions} suffix="원" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="실수령 합계" value={totalNet} suffix="원" valueStyle={{ color: '#1890ff' }} prefix={<CheckCircleOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }}
          summary={() => (
            <Table.Summary.Row style={{ background: '#fafafa' }}>
              <Table.Summary.Cell index={0} colSpan={6} align="right"><strong>합계</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><strong>{totalPay.toLocaleString()}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><span style={{ color: '#ff4d4f' }}>{totalDeductions.toLocaleString()}</span></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><span style={{ color: '#1890ff', fontWeight: 600 }}>{totalNet.toLocaleString()}</span></Table.Summary.Cell>
              <Table.Summary.Cell index={4} />
            </Table.Summary.Row>
          )} />
      </Card>

      <Modal title={`급여명세서 - ${selected?.name || ''} (${period})`} open={detailModal} onCancel={() => setDetailModal(false)} width={650} footer={[
        <Button key="print" icon={<PrinterOutlined />}>명세서 출력</Button>,
      ]}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="이름">{selected.name}</Descriptions.Item>
              <Descriptions.Item label="매장">{selected.store}</Descriptions.Item>
              <Descriptions.Item label="직급">{selected.role}</Descriptions.Item>
              <Descriptions.Item label="지급월">{period}</Descriptions.Item>
            </Descriptions>

            <Row gutter={16}>
              <Col span={12}>
                <Card size="small" title="지급 항목">
                  <Table dataSource={mockPayslip.earnings} rowKey="item" size="small" pagination={false} columns={[
                    { title: '항목', dataIndex: 'item' },
                    { title: '금액', dataIndex: 'amount', align: 'right' as const, render: (v: number) => v.toLocaleString() },
                  ]} summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right"><strong>{mockPayslip.earnings.reduce((s, e) => s + e.amount, 0).toLocaleString()}</strong></Table.Summary.Cell>
                    </Table.Summary.Row>
                  )} />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="공제 항목">
                  <Table dataSource={mockPayslip.deductions} rowKey="item" size="small" pagination={false} columns={[
                    { title: '항목', dataIndex: 'item' },
                    { title: '금액', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f' }}>{v.toLocaleString()}</span> },
                  ]} summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right"><span style={{ color: '#ff4d4f', fontWeight: 600 }}>{mockPayslip.deductions.reduce((s, d) => s + d.amount, 0).toLocaleString()}</span></Table.Summary.Cell>
                    </Table.Summary.Row>
                  )} />
                </Card>
              </Col>
            </Row>

            <Divider />
            <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              실수령액: {selected.net_pay.toLocaleString()}원
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
