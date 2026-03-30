import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Tag, Input, Select, message, Row, Col, Steps,
  Modal, Form, InputNumber, DatePicker, Popconfirm, Space,
} from 'antd';
import {
  SearchOutlined, DollarOutlined, CheckCircleOutlined,
  BankOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { productionApi } from '../../modules/production/production.api';
import type { ProductionPlan } from '../../../../shared/types/production';
import { fmtNum } from '../../utils/format';
import dayjs from 'dayjs';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', IN_PRODUCTION: '생산중', COMPLETED: '완료', CANCELLED: '취소',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', IN_PRODUCTION: 'orange', COMPLETED: 'green', CANCELLED: 'red',
};

const SETTLE_LABELS: Record<string, { text: string; color: string }> = {
  PENDING: { text: '미정산', color: 'default' },
  SETTLED: { text: '정산완료', color: 'green' },
};

interface Summary {
  advance_pending_count: number;
  advance_pending_amount: number;
  advance_paid_count: number;
  advance_paid_amount: number;
  inspect_pending_count: number;
  balance_pending_count: number;
  balance_pending_amount: number;
  settled_count: number;
  settled_amount: number;
}

const CARD_CONFIGS = [
  { key: 'advance_pending', label: '선지급 대기', icon: <DollarOutlined />, bg: '#fff7e6', text: '#fa8c16', border: '#ffd591' },
  { key: 'balance_pending', label: '잔금 대기', icon: <DollarOutlined />, bg: '#fff1f0', text: '#cf1322', border: '#ffa39e' },
  { key: 'settled', label: '정산 완료', icon: <FileDoneOutlined />, bg: '#f6ffed', text: '#52c41a', border: '#b7eb8f' },
];

type FilterStep = '' | 'advance_pending' | 'balance_pending' | 'settled';

export default function ProductionPaymentPage() {
  // Data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [data, setData] = useState<ProductionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  // Filters
  const [stepFilter, setStepFilter] = useState<FilterStep>('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loadTrigger, setLoadTrigger] = useState(0);
  const triggerLoad = () => { setPage(1); setLoadTrigger((p) => p + 1); };

  // Advance modal
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advancePlan, setAdvancePlan] = useState<ProductionPlan | null>(null);
  const [advanceForm] = Form.useForm();
  const [advanceLoading, setAdvanceLoading] = useState(false);

  // Balance modal
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balancePlan, setBalancePlan] = useState<ProductionPlan | null>(null);
  const [balanceForm] = Form.useForm();
  const [balanceLoading, setBalanceLoading] = useState(false);

  // --- Load ---
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try { setSummary(await productionApi.paymentSummary()); }
    catch (e: any) { message.error(e.message); }
    finally { setSummaryLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      // 서버사이드 대금 단계 필터
      params.payment_step = stepFilter || 'active_payment';
      const result = await productionApi.list(params);
      setData(result.data as ProductionPlan[]);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, statusFilter, stepFilter]);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadList();
  }, [loadSummary, loadList]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [page, loadTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Card click ---
  const handleCardClick = (key: string) => {
    setStepFilter((prev) => prev === key ? '' : key as FilterStep);
    triggerLoad();
  };

  // --- Card values ---
  const cardValues = summary ? [
    { count: summary.advance_pending_count, amount: summary.advance_pending_amount },
    { count: summary.balance_pending_count, amount: summary.balance_pending_amount },
    { count: summary.settled_count, amount: summary.settled_amount },
  ] : Array(3).fill({ count: 0, amount: 0 });

  // --- Advance modal ---
  const openAdvance = async (plan: ProductionPlan) => {
    const detail = await productionApi.get(plan.plan_id);
    setAdvancePlan(detail as ProductionPlan);
    const totalCost = Number((detail as any).total_cost) || 0;
    advanceForm.setFieldsValue({
      total_amount: totalCost,
      advance_rate: 30,
      advance_amount: Math.round(totalCost * 0.3),
      advance_date: dayjs(),
    });
    setAdvanceOpen(true);
  };

  const handleAdvanceRateChange = (rate: number | null) => {
    const total = advanceForm.getFieldValue('total_amount') || 0;
    advanceForm.setFieldsValue({ advance_amount: Math.round(total * (rate || 0) / 100) });
  };

  const handleAdvanceTotalChange = (total: number | null) => {
    const rate = advanceForm.getFieldValue('advance_rate') || 30;
    advanceForm.setFieldsValue({ advance_amount: Math.round((total || 0) * rate / 100) });
  };

  const handleAdvanceSubmit = async () => {
    if (!advancePlan) return;
    try {
      await advanceForm.validateFields();
    } catch { return; }
    const values = advanceForm.getFieldsValue();
    setAdvanceLoading(true);
    try {
      await productionApi.updatePayment(advancePlan.plan_id, {
        action: 'advance',
        total_amount: values.total_amount,
        advance_rate: values.advance_rate,
        advance_amount: values.advance_amount,
        advance_date: values.advance_date?.format('YYYY-MM-DD'),
      });
      message.success('선지급 처리 완료');
      setAdvanceOpen(false);
      refreshAll();
    } catch (e: any) { message.error(e.message); }
    finally { setAdvanceLoading(false); }
  };

  // --- Balance modal ---
  const openBalance = (plan: ProductionPlan) => {
    setBalancePlan(plan);
    balanceForm.setFieldsValue({ balance_date: dayjs() });
    setBalanceOpen(true);
  };

  const handleBalanceSubmit = async () => {
    if (!balancePlan) return;
    setBalanceLoading(true);
    try {
      await productionApi.updatePayment(balancePlan.plan_id, {
        action: 'balance',
        balance_date: balanceForm.getFieldValue('balance_date')?.format('YYYY-MM-DD'),
      });
      message.success('잔금 지급 완료');
      setBalanceOpen(false);
      refreshAll();
    } catch (e: any) { message.error(e.message); }
    finally { setBalanceLoading(false); }
  };

  // --- Settle ---
  const handleSettle = async (planId: number) => {
    try {
      await productionApi.updatePayment(planId, { action: 'settle' });
      message.success('정산 완료');
      refreshAll();
    } catch (e: any) { message.error(e.message); }
  };

  // --- Step indicator ---
  const getPaymentStep = (r: ProductionPlan) => {
    if (r.settle_status === 'SETTLED') return 3;
    if (r.balance_status === 'PAID') return 2;
    if (r.advance_status === 'PAID') return 1;
    return 0;
  };

  // --- Columns ---
  const columns = [
    { title: '계획번호', dataIndex: 'plan_no', width: 120 },
    { title: '계획명', dataIndex: 'plan_name', ellipsis: true, width: 180 },
    { title: '공장', dataIndex: 'partner_name', width: 100, ellipsis: true, render: (v: string) => v || '본사' },
    { title: '시즌', dataIndex: 'season', width: 70, render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
    { title: '총금액', dataIndex: 'total_amount', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <strong>{fmtNum(v)}원</strong> : <span style={{ color: '#ccc' }}>미설정</span> },
    { title: '선지급', key: 'advance', width: 110, align: 'right' as const,
      render: (_: unknown, r: ProductionPlan) => {
        if (r.advance_status === 'PAID') return <Tag color="blue">{fmtNum(r.advance_amount || 0)}원</Tag>;
        return <span style={{ color: '#ccc' }}>대기</span>;
      }},
    { title: '잔금', key: 'balance', width: 110, align: 'right' as const,
      render: (_: unknown, r: ProductionPlan) => {
        if (r.balance_status === 'PAID') return <Tag color="cyan">{fmtNum(r.balance_amount || 0)}원</Tag>;
        if (r.balance_amount && r.balance_amount > 0) return <span style={{ color: '#999' }}>{fmtNum(r.balance_amount)}원</span>;
        return <span style={{ color: '#ccc' }}>-</span>;
      }},
    { title: '정산', dataIndex: 'settle_status', width: 80,
      render: (v: string) => {
        const s = SETTLE_LABELS[v] || SETTLE_LABELS.PENDING;
        return <Tag color={s.color}>{s.text}</Tag>;
      }},
    { title: '진행', key: 'progress', width: 170,
      render: (_: unknown, r: ProductionPlan) => (
        <Steps size="small" current={getPaymentStep(r)} style={{ marginTop: -4 }}
          items={[
            { title: '' },
            { title: '' },
            { title: '' },
          ]}
        />
      )},
    { title: '액션', key: 'action', width: 120,
      render: (_: unknown, r: ProductionPlan) => {
        if (r.settle_status === 'SETTLED') return <Tag color="green">완료</Tag>;
        if (r.balance_status === 'PAID') {
          return (
            <Popconfirm title="정산 완료 처리하시겠습니까?" onConfirm={() => handleSettle(r.plan_id)}>
              <Button size="small" icon={<FileDoneOutlined />} type="primary">정산완료</Button>
            </Popconfirm>
          );
        }
        if (r.advance_status === 'PAID' && r.balance_status === 'PENDING') {
          return <Button size="small" icon={<BankOutlined />} onClick={() => openBalance(r)}>잔금지급</Button>;
        }
        if (r.advance_status === 'PENDING') {
          return <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openAdvance(r)}>선지급</Button>;
        }
        return null;
      }},
  ];

  return (
    <div>
      <PageHeader title="생산정산" />

      {/* 요약 카드 */}
      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
        {CARD_CONFIGS.map((cfg, i) => {
          const v = cardValues[i];
          const isActive = stepFilter === cfg.key;
          return (
            <Col xs={12} sm={8} md={4} lg={4} xl={4} key={cfg.key} style={{ minWidth: 140 }}>
              <div
                onClick={() => handleCardClick(cfg.key)}
                style={{
                  background: isActive ? cfg.text : cfg.bg, borderRadius: 8,
                  padding: '10px 12px', textAlign: 'center', cursor: 'pointer',
                  border: `2px solid ${isActive ? cfg.text : cfg.border}`, transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 11, color: isActive ? '#fff' : cfg.text, opacity: 0.8 }}>
                  {cfg.icon} {cfg.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: isActive ? '#fff' : cfg.text }}>
                  {summaryLoading ? '-' : `${v.count}건`}
                </div>
                {v.amount > 0 && (
                  <div style={{ fontSize: 11, color: isActive ? '#ffffffcc' : cfg.text, opacity: 0.7 }}>
                    {fmtNum(v.amount)}원
                  </div>
                )}
              </div>
            </Col>
          );
        })}
      </Row>

      {/* 흐름 시각화 */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
        <Steps size="small" items={[
          { title: '선지급', description: `${summary?.advance_pending_count || 0}건 대기`, icon: <DollarOutlined /> },
          { title: '잔금지급', description: `${summary?.balance_pending_count || 0}건 대기`, icon: <BankOutlined /> },
          { title: '정산완료', description: `${summary?.settled_count || 0}건`, icon: <CheckCircleOutlined /> },
        ]} />
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="계획번호/이름 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={triggerLoad} style={{ width: '100%' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>생산상태</div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); triggerLoad(); }}
            style={{ width: 120 }}
            options={[
              { label: '전체', value: '' },
              { label: '생산중', value: 'IN_PRODUCTION' },
              { label: '완료', value: 'COMPLETED' },
            ]} />
        </div>
        <Button onClick={triggerLoad}>조회</Button>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="plan_id"
        loading={loading}
        size="small"
        scroll={{ x: 1400, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
      />

      {/* 선지급 모달 */}
      <Modal title="선지급 처리" open={advanceOpen} onCancel={() => setAdvanceOpen(false)}
        onOk={handleAdvanceSubmit} okText="선지급 처리" confirmLoading={advanceLoading} width={500}>
        {advancePlan && (
          <div style={{ marginBottom: 16, padding: 10, background: '#f5f5f5', borderRadius: 6 }}>
            <strong>{advancePlan.plan_no}</strong> — {advancePlan.plan_name}
            {advancePlan.partner_name && <span> / {advancePlan.partner_name}</span>}
          </div>
        )}
        <Form form={advanceForm} layout="vertical">
          <Form.Item name="total_amount" label="총 계약금액" rules={[{ required: true, message: '총금액 입력' }]}>
            <InputNumber style={{ width: '100%' }} min={0}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => (v || '').replace(/,/g, '') as any}
              onChange={handleAdvanceTotalChange}
              addonAfter="원" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="advance_rate" label="선지급 비율">
              <InputNumber min={0} max={100} addonAfter="%" style={{ width: 120 }}
                onChange={handleAdvanceRateChange} />
            </Form.Item>
            <Form.Item name="advance_amount" label="선지급 금액">
              <InputNumber style={{ width: 200 }} min={0}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => (v || '').replace(/,/g, '') as any}
                addonAfter="원" />
            </Form.Item>
          </Space>
          <Form.Item name="advance_date" label="선지급일">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>



      {/* 잔금 모달 */}
      <Modal title="잔금 지급" open={balanceOpen} onCancel={() => setBalanceOpen(false)}
        onOk={handleBalanceSubmit} okText="잔금 지급" confirmLoading={balanceLoading} width={400}>
        {balancePlan && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ padding: 10, background: '#f5f5f5', borderRadius: 6, marginBottom: 12 }}>
              <strong>{balancePlan.plan_no}</strong> — {balancePlan.plan_name}
            </div>
            <Row gutter={16}>
              <Col span={8}>
                <div style={{ fontSize: 11, color: '#888' }}>총금액</div>
                <div style={{ fontWeight: 700 }}>{fmtNum(balancePlan.total_amount || 0)}원</div>
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 11, color: '#888' }}>선지급</div>
                <div style={{ fontWeight: 700, color: '#1890ff' }}>{fmtNum(balancePlan.advance_amount || 0)}원</div>
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 11, color: '#888' }}>잔금</div>
                <div style={{ fontWeight: 700, color: '#cf1322', fontSize: 16 }}>{fmtNum(balancePlan.balance_amount || 0)}원</div>
              </Col>
            </Row>
          </div>
        )}
        <Form form={balanceForm} layout="vertical">
          <Form.Item name="balance_date" label="잔금 지급일">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
