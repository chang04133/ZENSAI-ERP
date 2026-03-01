import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Modal, InputNumber, Progress, Space, Select, message, Typography } from 'antd';
import { SyncOutlined, SaveOutlined } from '@ant-design/icons';
import { productionApi } from '../../modules/production/production.api';
import type { ProductionPlan, ProductionPlanItem } from '../../../../shared/types/production';
import { fmtNum } from '../../utils/format';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', CONFIRMED: 'blue', IN_PRODUCTION: 'orange', COMPLETED: 'green', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', CONFIRMED: '확정', IN_PRODUCTION: '생산중', COMPLETED: '완료', CANCELLED: '취소',
};

export default function ProductionProgressPage() {
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('IN_PRODUCTION');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<ProductionPlan | null>(null);
  const [editItems, setEditItems] = useState<Array<{ item_id: number; produced_qty: number }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      const result = await productionApi.list(params);
      setPlans(result.data); setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openUpdate = async (planId: number) => {
    try {
      const plan = await productionApi.get(planId);
      setActivePlan(plan);
      setEditItems((plan.items || []).map((i: ProductionPlanItem) => ({
        item_id: i.item_id, produced_qty: i.produced_qty,
      })));
      setUpdateOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleSaveQty = async () => {
    if (!activePlan) return;
    try {
      const updated = await productionApi.updateProducedQty(activePlan.plan_id, editItems);
      message.success('생산수량이 업데이트되었습니다.');
      setActivePlan(updated);
      setEditItems((updated.items || []).map((i: ProductionPlanItem) => ({
        item_id: i.item_id, produced_qty: i.produced_qty,
      })));
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '계획번호', dataIndex: 'plan_no', key: 'no', width: 120 },
    { title: '계획명', dataIndex: 'plan_name', key: 'name', ellipsis: true },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 100, render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
    { title: '계획수량', dataIndex: 'total_plan_qty', key: 'plan', width: 80,
      render: (v: number) => fmtNum(Number(v)) },
    { title: '생산수량', dataIndex: 'total_produced_qty', key: 'prod', width: 80,
      render: (v: number) => fmtNum(Number(v)) },
    { title: '진행률', key: 'pct', width: 140, render: (_: any, r: any) => {
      const pct = r.total_plan_qty > 0 ? Math.round((r.total_produced_qty / r.total_plan_qty) * 100) : 0;
      return <Progress percent={pct} size="small" status={pct >= 100 ? 'success' : 'active'}
        format={(p) => `${p}%`} />;
    }},
    { title: '목표일', dataIndex: 'target_date', key: 'target', width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '관리', key: 'action', width: 120, render: (_: any, r: ProductionPlan) => (
      r.status === 'IN_PRODUCTION' ? (
        <Button size="small" type="primary" icon={<SyncOutlined />}
          onClick={() => openUpdate(r.plan_id)}>수량 입력</Button>
      ) : (
        <Button size="small" onClick={() => openUpdate(r.plan_id)}>상세</Button>
      )
    )},
  ];

  const itemLabel = (item: ProductionPlanItem) => {
    const parts = [item.category];
    if (item.fit) parts.push(item.fit);
    if (item.length) parts.push(item.length);
    return parts.join(' / ');
  };

  return (
    <div>
      <Card title="생산진행 현황" extra={
        <Space>
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 140 }} allowClear placeholder="상태">
            {Object.entries(STATUS_LABELS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
          </Select>
        </Space>
      }>
        <Table columns={columns} dataSource={plans} rowKey="plan_id" loading={loading}
          size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
          pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />
      </Card>

      {/* 생산수량 입력 모달 */}
      <Modal title={`생산수량 입력 - ${activePlan?.plan_no || ''} ${activePlan?.plan_name || ''}`}
        open={updateOpen} onCancel={() => setUpdateOpen(false)}
        footer={activePlan?.status === 'IN_PRODUCTION' ? [
          <Button key="cancel" onClick={() => setUpdateOpen(false)}>닫기</Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleSaveQty}>저장</Button>,
        ] : [<Button key="close" onClick={() => setUpdateOpen(false)}>닫기</Button>]}
        width={750}>
        {activePlan && (
          <>
            <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Tag color={STATUS_COLORS[activePlan.status]}>{STATUS_LABELS[activePlan.status]}</Tag>
              <span><strong>시즌:</strong> {activePlan.season || '-'}</span>
              <span><strong>거래처:</strong> {activePlan.partner_name || '-'}</span>
              <span><strong>목표일:</strong> {activePlan.target_date ? new Date(activePlan.target_date).toLocaleDateString('ko-KR') : '-'}</span>
            </div>

            <Table
              columns={[
                { title: '카테고리 / 핏 / 기장', key: 'name', ellipsis: true,
                  render: (_: any, r: ProductionPlanItem) => itemLabel(r) },
                { title: '단가', dataIndex: 'unit_cost', key: 'cost', width: 90,
                  render: (v: number) => v ? `${fmtNum(v)}원` : '-' },
                { title: '계획', dataIndex: 'plan_qty', key: 'plan', width: 70,
                  render: (v: number) => fmtNum(v) },
                { title: '생산수량', key: 'prod', width: 110, render: (_: any, r: ProductionPlanItem, idx: number) => (
                  activePlan.status === 'IN_PRODUCTION' ? (
                    <InputNumber min={0} max={r.plan_qty} value={editItems[idx]?.produced_qty}
                      onChange={(v) => {
                        const next = [...editItems]; next[idx] = { ...next[idx], produced_qty: v || 0 };
                        setEditItems(next);
                      }} style={{ width: '100%' }} />
                  ) : <span>{r.produced_qty}</span>
                )},
                { title: '진행률', key: 'pct', width: 100, render: (_: any, r: ProductionPlanItem, idx: number) => {
                  const qty = activePlan.status === 'IN_PRODUCTION' ? (editItems[idx]?.produced_qty || 0) : r.produced_qty;
                  const pct = r.plan_qty > 0 ? Math.round((qty / r.plan_qty) * 100) : 0;
                  return <Progress percent={pct} size="small" />;
                }},
              ]}
              dataSource={activePlan.items || []}
              rowKey="item_id"
              pagination={false}
              size="small"
            />
          </>
        )}
      </Modal>
    </div>
  );
}
