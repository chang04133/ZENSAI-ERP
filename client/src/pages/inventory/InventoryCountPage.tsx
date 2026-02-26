import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Select, Modal, DatePicker, InputNumber, Alert, Descriptions, message } from 'antd';
import { PlusOutlined, CheckCircleOutlined, WarningOutlined, FileExcelOutlined, ScanOutlined, CalculatorOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { DRAFT: 'default', IN_PROGRESS: 'blue', COMPLETED: 'green', ADJUSTED: 'purple' };
const STATUS_LABEL: Record<string, string> = { DRAFT: '작성중', IN_PROGRESS: '실사중', COMPLETED: '실사완료', ADJUSTED: '조정완료' };

const mockCounts = [
  { id: 1, count_no: 'IC-2026-02-001', store: '강남점', count_date: '2026-02-26', status: 'IN_PROGRESS', total_items: 350, counted_items: 210, match_items: 195, diff_items: 15, diff_amount: -450000, handler: '김매니저' },
  { id: 2, count_no: 'IC-2026-02-002', store: '대구점', count_date: '2026-02-26', status: 'DRAFT', total_items: 280, counted_items: 0, match_items: 0, diff_items: 0, diff_amount: 0, handler: '이매니저' },
  { id: 3, count_no: 'IC-2026-01-001', store: '강남점', count_date: '2026-01-31', status: 'ADJUSTED', total_items: 340, counted_items: 340, match_items: 325, diff_items: 15, diff_amount: -380000, handler: '김매니저' },
  { id: 4, count_no: 'IC-2026-01-002', store: '대구점', count_date: '2026-01-31', status: 'ADJUSTED', total_items: 275, counted_items: 275, match_items: 268, diff_items: 7, diff_amount: -120000, handler: '이매니저' },
  { id: 5, count_no: 'IC-2025-12-001', store: '강남점', count_date: '2025-12-31', status: 'ADJUSTED', total_items: 380, counted_items: 380, match_items: 370, diff_items: 10, diff_amount: -280000, handler: '김매니저' },
];

const mockItems = [
  { id: 1, product_code: 'JK-001', product_name: '26SS 오버핏 자켓', color: '블랙', size: 'M', system_qty: 12, count_qty: 12, diff: 0, status: 'match' },
  { id: 2, product_code: 'JK-001', product_name: '26SS 오버핏 자켓', color: '블랙', size: 'L', system_qty: 8, count_qty: 7, diff: -1, status: 'short' },
  { id: 3, product_code: 'PT-002', product_name: '와이드 슬랙스', color: '네이비', size: 'S', system_qty: 15, count_qty: 15, diff: 0, status: 'match' },
  { id: 4, product_code: 'PT-002', product_name: '와이드 슬랙스', color: '네이비', size: 'M', system_qty: 20, count_qty: 18, diff: -2, status: 'short' },
  { id: 5, product_code: 'KN-003', product_name: '울 블렌드 니트', color: '그레이', size: 'F', system_qty: 6, count_qty: 7, diff: 1, status: 'over' },
  { id: 6, product_code: 'BG-004', product_name: '가죽 토트백', color: '브라운', size: 'F', system_qty: 4, count_qty: 4, diff: 0, status: 'match' },
  { id: 7, product_code: 'BL-005', product_name: '실크 블라우스', color: '아이보리', size: 'S', system_qty: 10, count_qty: 10, diff: 0, status: 'match' },
  { id: 8, product_code: 'BL-005', product_name: '실크 블라우스', color: '아이보리', size: 'M', system_qty: 8, count_qty: 6, diff: -2, status: 'short' },
];

export default function InventoryCountPage() {
  const [search, setSearch] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const columns = [
    { title: '실사번호', dataIndex: 'count_no', width: 150, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '매장', dataIndex: 'store', width: 100 },
    { title: '실사일', dataIndex: 'count_date', width: 110 },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '총품목', dataIndex: 'total_items', width: 80, align: 'right' as const },
    { title: '실사완료', dataIndex: 'counted_items', width: 90, align: 'right' as const },
    { title: '일치', dataIndex: 'match_items', width: 70, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a' }}>{v}</span> },
    { title: '차이', dataIndex: 'diff_items', width: 70, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0' },
    { title: '차이금액', dataIndex: 'diff_amount', width: 120, align: 'right' as const, render: (v: number) => v !== 0 ? <span style={{ color: '#ff4d4f' }}>{v.toLocaleString()}</span> : '0' },
    { title: '담당자', dataIndex: 'handler', width: 80 },
    {
      title: '', width: 100, render: (_: any, r: any) => (
        <Space size="small">
          {r.status === 'IN_PROGRESS' && <Button size="small" type="primary" onClick={() => message.success('실사 완료 처리')}>완료</Button>}
          {r.status === 'COMPLETED' && <Button size="small" onClick={() => message.success('재고 조정 반영')}>조정반영</Button>}
        </Space>
      ),
    },
  ];

  const itemCols = [
    { title: '상품코드', dataIndex: 'product_code', width: 100 },
    { title: '상품명', dataIndex: 'product_name', width: 160 },
    { title: '컬러', dataIndex: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '시스템재고', dataIndex: 'system_qty', width: 90, align: 'right' as const },
    { title: '실사수량', width: 100, render: (_: any, r: any) => <InputNumber size="small" defaultValue={r.count_qty} min={0} style={{ width: 70 }} /> },
    { title: '차이', dataIndex: 'diff', width: 70, align: 'right' as const, render: (v: number) => v === 0 ? <span style={{ color: '#52c41a' }}>0</span> : <span style={{ color: v > 0 ? '#1890ff' : '#ff4d4f' }}>{v > 0 ? '+' : ''}{v}</span> },
    {
      title: '상태', dataIndex: 'status', width: 80, render: (v: string) => {
        if (v === 'match') return <Tag color="green">일치</Tag>;
        if (v === 'short') return <Tag color="red">부족</Tag>;
        return <Tag color="blue">초과</Tag>;
      },
    },
  ];

  const displayItems = showDiffOnly ? mockItems.filter(i => i.diff !== 0) : mockItems;

  return (
    <div>
      <PageHeader title="재고 실사" extra={
        <Space>
          <Button icon={<FileExcelOutlined />}>엑셀 다운로드</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('신규 실사가 생성되었습니다')}>실사 시작</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="진행중 실사" value={mockCounts.filter(c => c.status === 'IN_PROGRESS').length} suffix="건" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="실사 정확도" value={96.2} suffix="%" prefix={<CalculatorOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 차이금액" value={-450000} suffix="원" valueStyle={{ color: '#ff4d4f' }} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="누적 실사 횟수" value={mockCounts.length} suffix="회" /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={mockCounts} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1200, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`실사 상세 - ${selected?.count_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={950}
        footer={selected?.status === 'IN_PROGRESS' ? [
          <Button key="scan" icon={<ScanOutlined />}>바코드 스캔</Button>,
          <Button key="save" type="primary" onClick={() => message.success('저장 완료')}>저장</Button>,
        ] : null}>
        {selected && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="실사번호">{selected.count_no}</Descriptions.Item>
              <Descriptions.Item label="매장">{selected.store}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="총품목">{selected.total_items}</Descriptions.Item>
              <Descriptions.Item label="실사완료">{selected.counted_items}</Descriptions.Item>
              <Descriptions.Item label="차이 품목">{selected.diff_items}건</Descriptions.Item>
            </Descriptions>
            <div style={{ marginBottom: 8 }}>
              <Button size="small" type={showDiffOnly ? 'primary' : 'default'} onClick={() => setShowDiffOnly(!showDiffOnly)}>
                {showDiffOnly ? '전체 보기' : '차이 항목만'}
              </Button>
            </div>
            <Table dataSource={displayItems} columns={itemCols} rowKey="id" size="small" pagination={false}
              scroll={{ y: 400 }} />
          </>
        )}
      </Modal>
    </div>
  );
}
