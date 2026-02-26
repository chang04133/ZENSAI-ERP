import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Progress, Modal, Descriptions, Tabs, message } from 'antd';
import { ShopOutlined, UserOutlined, DollarOutlined, RiseOutlined, AimOutlined, EnvironmentOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const mockStores = [
  { id: 1, name: '강남점', type: '직영점', address: '서울 강남구 테헤란로 123', manager: '김매니저', phone: '02-1234-5678', staff_count: 5, monthly_target: 60000000, monthly_actual: 45000000, achievement: 75, open_date: '2023-01-15', area: 132, status: 'ACTIVE' },
  { id: 2, name: '대구점', type: '직영점', address: '대구 중구 동성로 456', manager: '이매니저', phone: '053-234-5678', staff_count: 4, monthly_target: 40000000, monthly_actual: 32000000, achievement: 80, open_date: '2023-06-01', area: 99, status: 'ACTIVE' },
  { id: 3, name: '부산점', type: '대리점', address: '부산 해운대구 해운대로 789', manager: '박사장', phone: '051-345-6789', staff_count: 3, monthly_target: 35000000, monthly_actual: 28000000, achievement: 80, open_date: '2024-03-10', area: 82.5, status: 'ACTIVE' },
  { id: 4, name: '현대백화점 판교', type: '백화점', address: '경기 성남시 분당구 판교역로 146', manager: '최점장', phone: '031-456-7890', staff_count: 3, monthly_target: 50000000, monthly_actual: 52000000, achievement: 104, open_date: '2024-09-01', area: 49.5, status: 'ACTIVE' },
  { id: 5, name: '롯데백화점 본점', type: '백화점', address: '서울 중구 남대문로 81', manager: '정점장', phone: '02-567-8901', staff_count: 2, monthly_target: 45000000, monthly_actual: 38000000, achievement: 84, open_date: '2025-01-15', area: 33, status: 'ACTIVE' },
  { id: 6, name: '아울렛 여주', type: '아울렛', address: '경기 여주시 명품로 360', manager: '한매니저', phone: '031-678-9012', staff_count: 3, monthly_target: 25000000, monthly_actual: 22000000, achievement: 88, open_date: '2025-06-01', area: 66, status: 'ACTIVE' },
  { id: 7, name: '제주점', type: '직영점', address: '제주 제주시 중앙로 100', manager: '', phone: '', staff_count: 0, monthly_target: 0, monthly_actual: 0, achievement: 0, open_date: '', area: 82.5, status: 'PREPARING' },
];

const mockStaff = [
  { name: '김직원', role: '매니저', phone: '010-1111-2222', hire_date: '2023-01-15' },
  { name: '박직원', role: '시니어', phone: '010-3333-4444', hire_date: '2023-06-01' },
  { name: '이직원', role: '주니어', phone: '010-5555-6666', hire_date: '2024-03-01' },
  { name: '최직원', role: '파트타임', phone: '010-7777-8888', hire_date: '2025-01-10' },
  { name: '정직원', role: '주니어', phone: '010-9999-0000', hire_date: '2025-06-15' },
];

const mockMonthlySales = [
  { month: '2025-09', target: 55000000, actual: 48000000 },
  { month: '2025-10', target: 55000000, actual: 52000000 },
  { month: '2025-11', target: 60000000, actual: 58000000 },
  { month: '2025-12', target: 70000000, actual: 72000000 },
  { month: '2026-01', target: 60000000, actual: 52000000 },
  { month: '2026-02', target: 60000000, actual: 45000000 },
];

export default function StoreManagePage() {
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const columns = [
    { title: '매장명', dataIndex: 'name', width: 150, render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailModal(true); }}><ShopOutlined /> {v}</a> },
    { title: '유형', dataIndex: 'type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '주소', dataIndex: 'address', width: 250, ellipsis: true },
    { title: '매장장', dataIndex: 'manager', width: 80, render: (v: string) => v || '-' },
    { title: '직원수', dataIndex: 'staff_count', width: 70, align: 'right' as const, render: (v: number) => v + '명' },
    { title: '면적', dataIndex: 'area', width: 80, align: 'right' as const, render: (v: number) => v + '㎡' },
    { title: '월 목표', dataIndex: 'monthly_target', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? (v / 10000).toLocaleString() + '만' : '-' },
    { title: '월 실적', dataIndex: 'monthly_actual', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? (v / 10000).toLocaleString() + '만' : '-' },
    {
      title: '달성률', dataIndex: 'achievement', width: 120, render: (v: number) => v > 0 ? (
        <Progress percent={v} size="small" status={v >= 100 ? 'success' : v >= 80 ? 'normal' : 'exception'} format={p => `${p}%`} />
      ) : '-',
    },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '운영중' : '준비중'}</Tag> },
  ];

  const staffCols = [
    { title: '이름', dataIndex: 'name', width: 80 },
    { title: '직급', dataIndex: 'role', width: 80 },
    { title: '연락처', dataIndex: 'phone', width: 130 },
    { title: '입사일', dataIndex: 'hire_date', width: 110 },
  ];

  const salesCols = [
    { title: '월', dataIndex: 'month', width: 100 },
    { title: '목표', dataIndex: 'target', width: 120, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '실적', dataIndex: 'actual', width: 120, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '달성률', width: 120, render: (_: any, r: any) => { const pct = Math.round(r.actual / r.target * 100); return <Progress percent={pct} size="small" status={pct >= 100 ? 'success' : 'normal'} />; } },
    { title: '차이', width: 120, align: 'right' as const, render: (_: any, r: any) => { const d = r.actual - r.target; return <span style={{ color: d >= 0 ? '#52c41a' : '#ff4d4f' }}>{d >= 0 ? '+' : ''}{d.toLocaleString()}</span>; } },
  ];

  const totalTarget = mockStores.filter(s => s.status === 'ACTIVE').reduce((sum, s) => sum + s.monthly_target, 0);
  const totalActual = mockStores.filter(s => s.status === 'ACTIVE').reduce((sum, s) => sum + s.monthly_actual, 0);
  const totalStaff = mockStores.reduce((sum, s) => sum + s.staff_count, 0);

  return (
    <div>
      <PageHeader title="매장 관리" />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="운영 매장" value={mockStores.filter(s => s.status === 'ACTIVE').length} suffix="개" prefix={<ShopOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="전체 직원" value={totalStaff} suffix="명" prefix={<UserOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="이번달 전체 매출" value={totalActual} suffix="원" prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="전체 달성률" value={Math.round(totalActual / totalTarget * 100)} suffix="%" prefix={<AimOutlined />} valueStyle={{ color: totalActual >= totalTarget ? '#52c41a' : '#fa8c16' }} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={mockStores} columns={columns} rowKey="id" size="small"
          scroll={{ x: 1200, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={`매장 상세 - ${selected?.name || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} width={900} footer={null}>
        {selected && (
          <Tabs items={[
            {
              key: 'info', label: '매장정보', children: (
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="매장명">{selected.name}</Descriptions.Item>
                  <Descriptions.Item label="유형"><Tag>{selected.type}</Tag></Descriptions.Item>
                  <Descriptions.Item label="주소" span={2}><EnvironmentOutlined /> {selected.address}</Descriptions.Item>
                  <Descriptions.Item label="매장장">{selected.manager || '미배정'}</Descriptions.Item>
                  <Descriptions.Item label="연락처">{selected.phone || '-'}</Descriptions.Item>
                  <Descriptions.Item label="면적">{selected.area}㎡</Descriptions.Item>
                  <Descriptions.Item label="개점일">{selected.open_date || '미정'}</Descriptions.Item>
                  <Descriptions.Item label="직원수">{selected.staff_count}명</Descriptions.Item>
                  <Descriptions.Item label="상태"><Tag color={selected.status === 'ACTIVE' ? 'green' : 'default'}>{selected.status === 'ACTIVE' ? '운영중' : '준비중'}</Tag></Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'staff', label: '직원현황', children: (
                <Table dataSource={mockStaff} columns={staffCols} rowKey="name" size="small" pagination={false} />
              ),
            },
            {
              key: 'sales', label: '매출추이', children: (
                <Table dataSource={mockMonthlySales} columns={salesCols} rowKey="month" size="small" pagination={false} />
              ),
            },
          ]} />
        )}
      </Modal>
    </div>
  );
}
