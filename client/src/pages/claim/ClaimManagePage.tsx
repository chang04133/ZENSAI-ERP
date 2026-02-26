import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Row, Col, Statistic, Select, Modal, Form, DatePicker, Descriptions, Tabs, Timeline, message } from 'antd';
import { PlusOutlined, ToolOutlined, ExclamationCircleOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const STATUS_COLOR: Record<string, string> = { RECEIVED: 'orange', PROCESSING: 'blue', COMPLETED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<string, string> = { RECEIVED: '접수', PROCESSING: '처리중', COMPLETED: '처리완료', REJECTED: '반려' };
const TYPE_COLOR: Record<string, string> = { DEFECT: 'red', EXCHANGE: 'blue', AS: 'purple', COMPLAINT: 'orange' };
const TYPE_LABEL: Record<string, string> = { DEFECT: '불량', EXCHANGE: '교환', AS: 'A/S', COMPLAINT: '컴플레인' };

const mockClaims = [
  { id: 1, claim_no: 'CL-2026-0001', customer_name: '김서연', phone: '010-1234-5678', type: 'DEFECT', product_name: '26SS 캐시미어 코트', color: '블랙', size: 'M', store: '강남점', claim_date: '2026-02-25', status: 'RECEIVED', description: '봉제 불량 - 어깨 이음새 풀림', handler: '' },
  { id: 2, claim_no: 'CL-2026-0002', customer_name: '이준호', phone: '010-2345-6789', type: 'EXCHANGE', product_name: '울 블렌드 니트', color: '그레이', size: 'L', store: '강남점', claim_date: '2026-02-24', status: 'PROCESSING', description: '사이즈 교환 (L→XL)', handler: '박직원' },
  { id: 3, claim_no: 'CL-2026-0003', customer_name: '박민지', phone: '010-3456-7890', type: 'AS', product_name: '가죽 토트백', color: '브라운', size: 'F', store: '대구점', claim_date: '2026-02-23', status: 'COMPLETED', description: '지퍼 고장 수리', handler: '김매니저' },
  { id: 4, claim_no: 'CL-2026-0004', customer_name: '정태우', phone: '010-4567-8901', type: 'DEFECT', product_name: '실크 블라우스', color: '아이보리', size: 'S', store: '강남점', claim_date: '2026-02-22', status: 'COMPLETED', description: '원단 탈색', handler: '김매니저' },
  { id: 5, claim_no: 'CL-2026-0005', customer_name: '최유진', phone: '010-5678-9012', type: 'COMPLAINT', product_name: '와이드 슬랙스', color: '네이비', size: 'M', store: '대구점', claim_date: '2026-02-20', status: 'REJECTED', description: '착용 후 핏 불만', handler: '이직원' },
  { id: 6, claim_no: 'CL-2026-0006', customer_name: '한소희', phone: '010-6789-0123', type: 'AS', product_name: '캐시미어 머플러', color: '베이지', size: 'F', store: '강남점', claim_date: '2026-02-26', status: 'RECEIVED', description: '프린지 올풀림 수선', handler: '' },
  { id: 7, claim_no: 'CL-2026-0007', customer_name: '오동욱', phone: '010-7890-1234', type: 'EXCHANGE', product_name: '면 티셔츠', color: '화이트', size: 'XL', store: '대구점', claim_date: '2026-02-26', status: 'RECEIVED', description: '컬러 교환 (화이트→블랙)', handler: '' },
];

const mockTimeline = [
  { time: '2026-02-25 14:30', action: '접수', detail: '고객 방문 접수', user: '박직원' },
  { time: '2026-02-25 15:00', action: '검수', detail: '상품 상태 확인 - 봉제 불량 확인', user: '김매니저' },
  { time: '2026-02-25 16:00', action: '처리방침 결정', detail: '무상 수선 처리 결정', user: '김매니저' },
];

export default function ClaimManagePage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockClaims.filter(c => {
    const matchSearch = c.claim_no.includes(search) || c.customer_name.includes(search) || c.product_name.includes(search);
    const matchType = !typeFilter || c.type === typeFilter;
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const columns = [
    { title: '클레임번호', dataIndex: 'claim_no', width: 140, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}>{v}</a> },
    { title: '고객명', dataIndex: 'customer_name', width: 80 },
    { title: '유형', dataIndex: 'type', width: 70, render: (v: string) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v]}</Tag> },
    { title: '상품', dataIndex: 'product_name', width: 160 },
    { title: '컬러/사이즈', width: 100, render: (_: any, r: any) => `${r.color}/${r.size}` },
    { title: '매장', dataIndex: 'store', width: 80 },
    { title: '접수일', dataIndex: 'claim_date', width: 110 },
    { title: '내용', dataIndex: 'description', ellipsis: true },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '담당자', dataIndex: 'handler', width: 80, render: (v: string) => v || '-' },
  ];

  return (
    <div>
      <PageHeader title="클레임/AS 관리" extra={
        <Space>
          <Select placeholder="유형" allowClear style={{ width: 100 }} onChange={v => setTypeFilter(v || '')}
            options={[{ value: 'DEFECT', label: '불량' }, { value: 'EXCHANGE', label: '교환' }, { value: 'AS', label: 'A/S' }, { value: 'COMPLAINT', label: '컴플레인' }]} />
          <Select placeholder="상태" allowClear style={{ width: 100 }} onChange={v => setStatusFilter(v || '')}
            options={[{ value: 'RECEIVED', label: '접수' }, { value: 'PROCESSING', label: '처리중' }, { value: 'COMPLETED', label: '완료' }]} />
          <Input.Search placeholder="클레임번호/고객명/상품 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>클레임 접수</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="미처리 건" value={mockClaims.filter(c => c.status === 'RECEIVED').length} suffix="건" valueStyle={{ color: '#fa8c16' }} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="처리중" value={mockClaims.filter(c => c.status === 'PROCESSING').length} suffix="건" valueStyle={{ color: '#1890ff' }} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 처리완료" value={mockClaims.filter(c => c.status === 'COMPLETED').length} suffix="건" valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="불량률" value={0.8} suffix="%" prefix={<ToolOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1200, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`클레임 상세 - ${selected?.claim_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={800} footer={
        selected?.status === 'RECEIVED' ? [
          <Button key="assign" onClick={() => message.info('담당자 배정')}>담당자 배정</Button>,
          <Button key="process" type="primary" onClick={() => message.success('처리 시작')}>처리 시작</Button>,
        ] : selected?.status === 'PROCESSING' ? [
          <Button key="complete" type="primary" onClick={() => message.success('처리 완료')}>처리 완료</Button>,
        ] : null
      }>
        {selected && (
          <Tabs items={[
            {
              key: 'info', label: '접수정보', children: (
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="클레임번호">{selected.claim_no}</Descriptions.Item>
                  <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
                  <Descriptions.Item label="고객">{selected.customer_name} ({selected.phone})</Descriptions.Item>
                  <Descriptions.Item label="유형"><Tag color={TYPE_COLOR[selected.type]}>{TYPE_LABEL[selected.type]}</Tag></Descriptions.Item>
                  <Descriptions.Item label="상품">{selected.product_name}</Descriptions.Item>
                  <Descriptions.Item label="컬러/사이즈">{selected.color} / {selected.size}</Descriptions.Item>
                  <Descriptions.Item label="매장">{selected.store}</Descriptions.Item>
                  <Descriptions.Item label="접수일">{selected.claim_date}</Descriptions.Item>
                  <Descriptions.Item label="내용" span={2}>{selected.description}</Descriptions.Item>
                  <Descriptions.Item label="담당자">{selected.handler || '미배정'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'timeline', label: '처리이력', children: (
                <Timeline items={mockTimeline.map(t => ({
                  children: (
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.action}</div>
                      <div style={{ color: '#666' }}>{t.detail}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{t.time} | {t.user}</div>
                    </div>
                  ),
                }))} />
              ),
            },
          ]} />
        )}
      </Modal>

      <Modal title="클레임 접수" open={createModal} onCancel={() => setCreateModal(false)} onOk={() => { message.success('클레임이 접수되었습니다'); setCreateModal(false); }} okText="접수" width={700}>
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item label="고객명" required><Input /></Form.Item></Col>
            <Col span={12}><Form.Item label="연락처" required><Input placeholder="010-0000-0000" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label="유형" required><Select options={[{ value: 'DEFECT', label: '불량' }, { value: 'EXCHANGE', label: '교환' }, { value: 'AS', label: 'A/S' }, { value: 'COMPLAINT', label: '컴플레인' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item label="상품"><Input placeholder="상품명 입력" /></Form.Item></Col>
            <Col span={8}><Form.Item label="매장"><Select options={[{ value: '강남점', label: '강남점' }, { value: '대구점', label: '대구점' }]} /></Form.Item></Col>
          </Row>
          <Form.Item label="클레임 내용" required><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
