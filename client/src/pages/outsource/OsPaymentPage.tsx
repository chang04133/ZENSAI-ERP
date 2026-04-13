import { useEffect, useState, useCallback } from 'react';
import { Button, Card, Table, Tag, message, Select, Space, Statistic, Row, Col, Modal } from 'antd';
import { CheckOutlined, DollarOutlined } from '@ant-design/icons';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsPayment } from '../../../../shared/types/outsource';
import { useAuthStore } from '../../modules/auth/auth.store';
import dayjs from 'dayjs';

const STEP_MAP: Record<string, string> = { P1: '착수금 (30%)', P2: '중간금 (40%)', P3: '잔금 (30%)' };
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '대기', color: 'warning' },
  APPROVED: { label: '승인', color: 'blue' },
  PAID: { label: '지급완료', color: 'success' },
  CANCELLED: { label: '취소', color: 'error' },
};

export default function OsPaymentPage() {
  const user = useAuthStore((s: any) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const [data, setData] = useState<OsPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [stepFilter, setStepFilter] = useState<string>('');
  const [summary, setSummary] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (statusFilter) params.status = statusFilter;
      if (stepFilter) params.payment_step = stepFilter;
      const [res, sum] = await Promise.all([
        outsourceApi.listPayments(params),
        outsourceApi.paymentSummary(),
      ]);
      setData(res.data);
      setTotal(res.total);
      setSummary(sum);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [statusFilter, stepFilter]);

  useEffect(() => { load(); }, [load]);

  const fmtWon = (v: number) => {
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
    if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
    return v.toLocaleString();
  };

  const sumByStatus = (status: string) => summary.filter((s: any) => s.status === status).reduce((acc: number, s: any) => acc + Number(s.total_amount || 0), 0);

  const handleApprove = (id: number) => {
    Modal.confirm({
      title: '결제 승인',
      content: '이 결제를 승인하시겠습니까?',
      okText: '승인',
      onOk: async () => {
        try {
          await outsourceApi.approvePayment(id);
          message.success('결제가 승인되었습니다.');
          load();
        } catch (e: any) { message.error(e.message); }
      },
    });
  };

  const handlePay = (id: number) => {
    Modal.confirm({
      title: '지급 처리',
      content: '지급을 완료 처리하시겠습니까?',
      okText: '지급',
      onOk: async () => {
        try {
          await outsourceApi.payPayment(id);
          message.success('지급이 완료되었습니다.');
          load();
        } catch (e: any) { message.error(e.message); }
      },
    });
  };

  const columns = [
    { title: '작업지시서', dataIndex: 'wo_no', width: 130 },
    { title: '브리프', dataIndex: 'brief_title', ellipsis: true },
    { title: '단계', dataIndex: 'payment_step', width: 130, render: (s: string) => STEP_MAP[s] || s },
    { title: '트리거', dataIndex: 'trigger_type', width: 130 },
    {
      title: '금액', dataIndex: 'amount', width: 120, align: 'right' as const,
      render: (v: number) => `${Number(v).toLocaleString()}원`,
    },
    {
      title: '상태', dataIndex: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag>,
    },
    { title: '승인일', dataIndex: 'approved_at', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '지급일', dataIndex: 'paid_at', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    {
      title: '관리', width: 160, fixed: 'right' as const,
      render: (_: any, r: OsPayment) => isAdmin ? (
        <Space size="small">
          {r.status === 'PENDING' && <Button size="small" icon={<CheckOutlined />} onClick={() => handleApprove(r.payment_id)}>승인</Button>}
          {r.status === 'APPROVED' && <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => handlePay(r.payment_id)}>지급</Button>}
        </Space>
      ) : null,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* 요약 카드 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="대기 금액" value={fmtWon(sumByStatus('PENDING'))} suffix="원" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="승인 금액" value={fmtWon(sumByStatus('APPROVED'))} suffix="원" valueStyle={{ color: '#1890ff' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="지급 완료" value={fmtWon(sumByStatus('PAID'))} suffix="원" valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="전체" value={fmtWon(sumByStatus('PENDING') + sumByStatus('APPROVED') + sumByStatus('PAID'))} suffix="원" /></Card>
        </Col>
      </Row>

      <Card title="결제 현황" size="small">
        <Space style={{ marginBottom: 12 }}>
          <Select placeholder="상태" allowClear style={{ width: 120 }} value={statusFilter || undefined} onChange={(v) => setStatusFilter(v || '')}>
            {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
          </Select>
          <Select placeholder="단계" allowClear style={{ width: 150 }} value={stepFilter || undefined} onChange={(v) => setStepFilter(v || '')}>
            {Object.entries(STEP_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
          </Select>
        </Space>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="payment_id"
          loading={loading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, total, showTotal: (t) => `총 ${t}건` }}
        />
      </Card>
    </div>
  );
}
