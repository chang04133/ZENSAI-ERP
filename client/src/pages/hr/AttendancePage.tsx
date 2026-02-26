import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Select, DatePicker, Modal, Descriptions, message, Alert } from 'antd';
import { ClockCircleOutlined, UserOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CalendarOutlined, FileExcelOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import dayjs from 'dayjs';

const STATUS_COLOR: Record<string, string> = { NORMAL: 'green', LATE: 'orange', EARLY: 'blue', ABSENT: 'red', LEAVE: 'purple', HALF: 'cyan' };
const STATUS_LABEL: Record<string, string> = { NORMAL: '정상', LATE: '지각', EARLY: '조퇴', ABSENT: '결근', LEAVE: '휴가', HALF: '반차' };

const mockAttendance = [
  { id: 1, date: '2026-02-26', name: '김매니저', store: '강남점', role: '매니저', check_in: '09:00', check_out: '', work_hours: '-', status: 'NORMAL', memo: '' },
  { id: 2, date: '2026-02-26', name: '박직원', store: '강남점', role: '시니어', check_in: '09:05', check_out: '', work_hours: '-', status: 'NORMAL', memo: '' },
  { id: 3, date: '2026-02-26', name: '이직원', store: '강남점', role: '주니어', check_in: '09:32', check_out: '', work_hours: '-', status: 'LATE', memo: '교통체증' },
  { id: 4, date: '2026-02-26', name: '최직원', store: '강남점', role: '파트타임', check_in: '13:00', check_out: '', work_hours: '-', status: 'NORMAL', memo: '오후근무' },
  { id: 5, date: '2026-02-26', name: '이매니저', store: '대구점', role: '매니저', check_in: '08:55', check_out: '', work_hours: '-', status: 'NORMAL', memo: '' },
  { id: 6, date: '2026-02-26', name: '한직원', store: '대구점', role: '주니어', check_in: '', check_out: '', work_hours: '-', status: 'LEAVE', memo: '연차휴가' },
  { id: 7, date: '2026-02-25', name: '김매니저', store: '강남점', role: '매니저', check_in: '08:58', check_out: '21:30', work_hours: '12.5h', status: 'NORMAL', memo: '' },
  { id: 8, date: '2026-02-25', name: '박직원', store: '강남점', role: '시니어', check_in: '09:00', check_out: '18:05', work_hours: '9.1h', status: 'NORMAL', memo: '' },
  { id: 9, date: '2026-02-25', name: '이직원', store: '강남점', role: '주니어', check_in: '09:00', check_out: '18:00', work_hours: '9h', status: 'NORMAL', memo: '' },
  { id: 10, date: '2026-02-25', name: '이매니저', store: '대구점', role: '매니저', check_in: '09:00', check_out: '21:15', work_hours: '12.3h', status: 'NORMAL', memo: '' },
];

const mockMonthlySummary = [
  { name: '김매니저', store: '강남점', work_days: 18, normal: 17, late: 0, early: 0, absent: 0, leave: 1, overtime: 45, total_hours: 207 },
  { name: '박직원', store: '강남점', work_days: 18, normal: 18, late: 0, early: 0, absent: 0, leave: 0, overtime: 10, total_hours: 172 },
  { name: '이직원', store: '강남점', work_days: 18, normal: 16, late: 2, early: 0, absent: 0, leave: 0, overtime: 5, total_hours: 167 },
  { name: '최직원', store: '강남점', work_days: 15, normal: 15, late: 0, early: 0, absent: 0, leave: 0, overtime: 0, total_hours: 90 },
  { name: '이매니저', store: '대구점', work_days: 18, normal: 18, late: 0, early: 0, absent: 0, leave: 0, overtime: 40, total_hours: 202 },
  { name: '한직원', store: '대구점', work_days: 16, normal: 15, late: 0, early: 1, absent: 0, leave: 2, overtime: 3, total_hours: 147 },
];

export default function AttendancePage() {
  const [storeFilter, setStoreFilter] = useState('');
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');

  const filteredDaily = mockAttendance.filter(a => !storeFilter || a.store === storeFilter);
  const filteredMonthly = mockMonthlySummary.filter(s => !storeFilter || s.store === storeFilter);

  const dailyCols = [
    { title: '일자', dataIndex: 'date', width: 110 },
    { title: '이름', dataIndex: 'name', width: 90 },
    { title: '매장', dataIndex: 'store', width: 80 },
    { title: '직급', dataIndex: 'role', width: 80 },
    { title: '출근', dataIndex: 'check_in', width: 70, render: (v: string) => v || '-' },
    { title: '퇴근', dataIndex: 'check_out', width: 70, render: (v: string) => v || '-' },
    { title: '근무시간', dataIndex: 'work_hours', width: 80 },
    { title: '상태', dataIndex: 'status', width: 70, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: '비고', dataIndex: 'memo', ellipsis: true },
  ];

  const monthlyCols = [
    { title: '이름', dataIndex: 'name', width: 90 },
    { title: '매장', dataIndex: 'store', width: 80 },
    { title: '근무일', dataIndex: 'work_days', width: 70, align: 'right' as const },
    { title: '정상', dataIndex: 'normal', width: 60, align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a' }}>{v}</span> },
    { title: '지각', dataIndex: 'late', width: 60, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#fa8c16' }}>{v}</span> : '0' },
    { title: '조퇴', dataIndex: 'early', width: 60, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#1890ff' }}>{v}</span> : '0' },
    { title: '결근', dataIndex: 'absent', width: 60, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0' },
    { title: '휴가', dataIndex: 'leave', width: 60, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#722ed1' }}>{v}</span> : '0' },
    { title: '초과근무(h)', dataIndex: 'overtime', width: 90, align: 'right' as const, render: (v: number) => v > 30 ? <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{v}</span> : v },
    { title: '총 근무(h)', dataIndex: 'total_hours', width: 90, align: 'right' as const, render: (v: number) => <strong>{v}</strong> },
  ];

  const todayPresent = mockAttendance.filter(a => a.date === '2026-02-26' && a.status !== 'LEAVE' && a.status !== 'ABSENT').length;
  const todayLate = mockAttendance.filter(a => a.date === '2026-02-26' && a.status === 'LATE').length;

  return (
    <div>
      <PageHeader title="근태 관리" extra={
        <Space>
          <Select placeholder="매장" allowClear style={{ width: 120 }} onChange={v => setStoreFilter(v || '')}
            options={[{ value: '강남점', label: '강남점' }, { value: '대구점', label: '대구점' }]} />
          <Button type={tab === 'daily' ? 'primary' : 'default'} onClick={() => setTab('daily')}>일별</Button>
          <Button type={tab === 'monthly' ? 'primary' : 'default'} onClick={() => setTab('monthly')}>월별 요약</Button>
          <Button icon={<FileExcelOutlined />}>엑셀</Button>
        </Space>
      } />

      {todayLate > 0 && <Alert type="warning" message={`오늘 지각자 ${todayLate}명이 있습니다.`} showIcon style={{ marginBottom: 16 }} />}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="오늘 출근" value={todayPresent} suffix={`/ ${mockAttendance.filter(a => a.date === '2026-02-26').length}명`} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="지각" value={todayLate} suffix="명" prefix={<ClockCircleOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="휴가" value={mockAttendance.filter(a => a.date === '2026-02-26' && a.status === 'LEAVE').length} suffix="명" prefix={<CalendarOutlined />} valueStyle={{ color: '#722ed1' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="전체 직원" value={mockMonthlySummary.length} suffix="명" prefix={<UserOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        {tab === 'daily' ? (
          <Table dataSource={filteredDaily} columns={dailyCols} rowKey="id" size="small"
            scroll={{ x: 900, y: 'calc(100vh - 380px)' }}
            pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
        ) : (
          <Table dataSource={filteredMonthly} columns={monthlyCols} rowKey="name" size="small"
            scroll={{ x: 900, y: 'calc(100vh - 380px)' }}
            pagination={false} />
        )}
      </Card>
    </div>
  );
}
