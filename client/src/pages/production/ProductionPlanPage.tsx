import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Space, Popconfirm, Progress, message, Typography } from 'antd';
import { PlusOutlined, EyeOutlined, CheckOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { productionApi } from '../../modules/production/production.api';
import { apiFetch } from '../../core/api.client';
import type { ProductionPlan } from '../../../../shared/types/production';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', CONFIRMED: 'blue', IN_PRODUCTION: 'orange', COMPLETED: 'green', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', CONFIRMED: '확정', IN_PRODUCTION: '생산중', COMPLETED: '완료', CANCELLED: '취소',
};

export default function ProductionPlanPage() {
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ProductionPlan | null>(null);
  const [form] = Form.useForm();
  const [items, setItems] = useState<any[]>([{ product_code: '', variant_id: null, plan_qty: 1, unit_cost: null }]);
  const [products, setProducts] = useState<any[]>([]);
  const [variants, setVariants] = useState<Record<string, any[]>>({});
  const [partners, setPartners] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const result = await productionApi.list(params);
      setPlans(result.data); setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, ptRes] = await Promise.all([
          apiFetch('/api/products?limit=500').then(r => r.json()),
          apiFetch('/api/partners?limit=100').then(r => r.json()),
        ]);
        if (pRes.success) setProducts(pRes.data.data || pRes.data);
        if (ptRes.success) setPartners(ptRes.data.data || ptRes.data);
      } catch (e: any) { console.error('상품/거래처 로드 실패:', e); }
    })();
  }, []);

  const loadVariants = async (productCode: string) => {
    if (variants[productCode]) return;
    try {
      const res = await apiFetch(`/api/products/${productCode}`).then(r => r.json());
      if (res.success && res.data.variants) {
        setVariants(prev => ({ ...prev, [productCode]: res.data.variants }));
      }
    } catch (e: any) { console.error('바리언트 로드 실패:', e); }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const validItems = items.filter(i => i.product_code && i.plan_qty > 0);
      if (validItems.length === 0) { message.error('품목을 추가해주세요.'); return; }
      await productionApi.create({
        plan_name: values.plan_name,
        season: values.season,
        target_date: values.target_date?.format('YYYY-MM-DD'),
        partner_code: values.partner_code,
        memo: values.memo,
        items: validItems,
      });
      message.success('생산계획이 등록되었습니다.');
      setCreateOpen(false); form.resetFields();
      setItems([{ product_code: '', variant_id: null, plan_qty: 1, unit_cost: null }]);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await productionApi.updateStatus(id, status);
      message.success(`상태가 ${STATUS_LABELS[status]}(으)로 변경되었습니다.`);
      load();
      if (detail?.plan_id === id) {
        const updated = await productionApi.get(id);
        setDetail(updated);
      }
    } catch (e: any) { message.error(e.message); }
  };

  const viewDetail = async (id: number) => {
    try {
      const d = await productionApi.get(id);
      setDetail(d); setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '계획번호', dataIndex: 'plan_no', key: 'no', width: 120 },
    { title: '계획명', dataIndex: 'plan_name', key: 'name', ellipsis: true },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 100, render: (v: string) => v || '-' },
    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
    { title: '계획수량', dataIndex: 'total_plan_qty', key: 'plan', width: 80, render: (v: number) => Number(v).toLocaleString() },
    { title: '진행률', key: 'pct', width: 120, render: (_: any, r: any) => {
      const pct = r.total_plan_qty > 0 ? Math.round((r.total_produced_qty / r.total_plan_qty) * 100) : 0;
      return <Progress percent={pct} size="small" />;
    }},
    { title: '목표일', dataIndex: 'target_date', key: 'target', width: 100, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
    { title: '관리', key: 'action', width: 200, render: (_: any, r: ProductionPlan) => (
      <Space size="small">
        <Button size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r.plan_id)}>상세</Button>
        {r.status === 'DRAFT' && (
          <Popconfirm title="확정하시겠습니까?" onConfirm={() => handleStatusChange(r.plan_id, 'CONFIRMED')}>
            <Button size="small" type="primary" icon={<CheckOutlined />}>확정</Button>
          </Popconfirm>
        )}
        {r.status === 'CONFIRMED' && (
          <Popconfirm title="생산을 시작하시겠습니까?" onConfirm={() => handleStatusChange(r.plan_id, 'IN_PRODUCTION')}>
            <Button size="small" style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }} icon={<PlayCircleOutlined />}>생산시작</Button>
          </Popconfirm>
        )}
        {r.status === 'IN_PRODUCTION' && (
          <Popconfirm title="생산 완료 처리하시겠습니까?" onConfirm={() => handleStatusChange(r.plan_id, 'COMPLETED')}>
            <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}>완료</Button>
          </Popconfirm>
        )}
        {(r.status === 'DRAFT' || r.status === 'CONFIRMED') && (
          <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(r.plan_id, 'CANCELLED')}>
            <Button size="small" danger icon={<StopOutlined />}>취소</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div style={{ maxWidth: 1200 }}>
      <Card title="생산계획 관리" extra={
        <Space>
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }} allowClear placeholder="상태">
            {Object.entries(STATUS_LABELS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
          </Select>
          <Input.Search placeholder="검색" onSearch={setSearch} allowClear style={{ width: 180 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>생산계획 등록</Button>
        </Space>
      }>
        <Table columns={columns} dataSource={plans} rowKey="plan_id" loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
          size="small" scroll={{ x: 1100 }} />
      </Card>

      {/* 등록 모달 */}
      <Modal title="생산계획 등록" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={handleCreate} width={800} okText="등록">
        <Form form={form} layout="vertical">
          <Form.Item name="plan_name" label="계획명" rules={[{ required: true }]}>
            <Input placeholder="예: 26SA 상의 1차 생산" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="season" label="시즌" style={{ width: 150 }}>
              <Select allowClear placeholder="시즌">
                {[
                  { value: '2026SA', label: '26 봄/가을' },
                  { value: '2026SM', label: '26 여름' },
                  { value: '2026WN', label: '26 겨울' },
                  { value: '2025SA', label: '25 봄/가을' },
                  { value: '2025WN', label: '25 겨울' },
                ].map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="target_date" label="목표일">
              <DatePicker />
            </Form.Item>
            <Form.Item name="partner_code" label="생산 거래처">
              <Select allowClear placeholder="거래처" style={{ width: 160 }}>
                {partners.map((p: any) => <Select.Option key={p.partner_code} value={p.partner_code}>{p.partner_name}</Select.Option>)}
              </Select>
            </Form.Item>
          </Space>
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>

        <Typography.Text strong>품목 목록</Typography.Text>
        <Table
          columns={[
            { title: '상품', key: 'product', width: 200, render: (_: any, __: any, idx: number) => (
              <Select value={items[idx]?.product_code || undefined} onChange={(v) => {
                const next = [...items]; next[idx] = { ...next[idx], product_code: v, variant_id: null };
                setItems(next); loadVariants(v);
              }} style={{ width: '100%' }} placeholder="상품 선택" showSearch optionFilterProp="children">
                {products.map((p: any) => <Select.Option key={p.product_code} value={p.product_code}>{p.product_name}</Select.Option>)}
              </Select>
            )},
            { title: '옵션(SKU)', key: 'variant', width: 200, render: (_: any, __: any, idx: number) => {
              const pc = items[idx]?.product_code;
              const vList = variants[pc] || [];
              return (
                <Select value={items[idx]?.variant_id || undefined} onChange={(v) => {
                  const next = [...items]; next[idx] = { ...next[idx], variant_id: v }; setItems(next);
                }} style={{ width: '100%' }} placeholder="전체 또는 선택" allowClear>
                  {vList.map((v: any) => <Select.Option key={v.variant_id} value={v.variant_id}>{v.sku} ({v.color}/{v.size})</Select.Option>)}
                </Select>
              );
            }},
            { title: '수량', key: 'qty', width: 100, render: (_: any, __: any, idx: number) => (
              <InputNumber min={1} value={items[idx]?.plan_qty} onChange={(v) => {
                const next = [...items]; next[idx] = { ...next[idx], plan_qty: v || 1 }; setItems(next);
              }} style={{ width: '100%' }} />
            )},
            { title: '단가', key: 'cost', width: 100, render: (_: any, __: any, idx: number) => (
              <InputNumber min={0} value={items[idx]?.unit_cost} onChange={(v) => {
                const next = [...items]; next[idx] = { ...next[idx], unit_cost: v }; setItems(next);
              }} style={{ width: '100%' }} />
            )},
            { title: '', key: 'del', width: 40, render: (_: any, __: any, idx: number) => (
              items.length > 1 ? <Button size="small" danger onClick={() => setItems(items.filter((_, i) => i !== idx))}>X</Button> : null
            )},
          ]}
          dataSource={items}
          rowKey={(_, i) => String(i)}
          pagination={false}
          size="small"
          footer={() => <Button type="dashed" block onClick={() => setItems([...items, { product_code: '', variant_id: null, plan_qty: 1, unit_cost: null }])}>+ 품목 추가</Button>}
        />
      </Modal>

      {/* 상세 모달 */}
      <Modal title={`생산계획 상세 - ${detail?.plan_no || ''}`} open={detailOpen}
        onCancel={() => setDetailOpen(false)} footer={null} width={800}>
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag>
              <span><strong>계획명:</strong> {detail.plan_name}</span>
              <span><strong>시즌:</strong> {detail.season || '-'}</span>
              <span><strong>거래처:</strong> {detail.partner_name || '-'}</span>
              <span><strong>목표일:</strong> {detail.target_date ? new Date(detail.target_date).toLocaleDateString('ko-KR') : '-'}</span>
              <span><strong>등록자:</strong> {detail.created_by_name}</span>
              {detail.start_date && <span><strong>시작일:</strong> {new Date(detail.start_date).toLocaleDateString('ko-KR')}</span>}
              {detail.end_date && <span><strong>종료일:</strong> {new Date(detail.end_date).toLocaleDateString('ko-KR')}</span>}
            </div>
            {detail.memo && <div style={{ marginBottom: 16, color: '#666' }}>{detail.memo}</div>}

            <Typography.Text strong>품목 목록</Typography.Text>
            <Table
              columns={[
                { title: '상품', dataIndex: 'product_name', key: 'name', ellipsis: true },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, render: (v: string) => v || '(전체)' },
                { title: '옵션', key: 'opt', width: 100, render: (_: any, r: any) => r.color ? `${r.color}/${r.size}` : '-' },
                { title: '계획', dataIndex: 'plan_qty', key: 'plan', width: 70 },
                { title: '생산', dataIndex: 'produced_qty', key: 'prod', width: 70 },
                { title: '진행률', key: 'pct', width: 120, render: (_: any, r: any) => {
                  const pct = r.plan_qty > 0 ? Math.round((r.produced_qty / r.plan_qty) * 100) : 0;
                  return <Progress percent={pct} size="small" />;
                }},
              ]}
              dataSource={detail.items || []}
              rowKey="item_id"
              pagination={false}
              size="small"
            />

            {(detail.materials || []).length > 0 && (
              <>
                <Typography.Text strong style={{ display: 'block', marginTop: 16 }}>소요 자재</Typography.Text>
                <Table
                  columns={[
                    { title: '자재명', dataIndex: 'material_name', key: 'name' },
                    { title: '유형', dataIndex: 'material_type', key: 'type', width: 70 },
                    { title: '필요량', key: 'req', width: 100, render: (_: any, r: any) => `${r.required_qty} ${r.unit}` },
                    { title: '사용량', key: 'used', width: 100, render: (_: any, r: any) => `${r.used_qty} ${r.unit}` },
                    { title: '재고', key: 'stock', width: 100, render: (_: any, r: any) => (
                      <span style={{ color: r.stock_qty < r.required_qty ? '#ef4444' : '#52c41a' }}>
                        {r.stock_qty} {r.unit}
                      </span>
                    )},
                  ]}
                  dataSource={detail.materials}
                  rowKey="usage_id"
                  pagination={false}
                  size="small"
                />
              </>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {detail.status === 'DRAFT' && (
                <Popconfirm title="확정하시겠습니까?" onConfirm={() => handleStatusChange(detail.plan_id, 'CONFIRMED')}>
                  <Button type="primary" icon={<CheckOutlined />}>확정</Button>
                </Popconfirm>
              )}
              {detail.status === 'CONFIRMED' && (
                <Popconfirm title="생산 시작?" onConfirm={() => handleStatusChange(detail.plan_id, 'IN_PRODUCTION')}>
                  <Button style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }} icon={<PlayCircleOutlined />}>생산시작</Button>
                </Popconfirm>
              )}
              {detail.status === 'IN_PRODUCTION' && (
                <Popconfirm title="완료 처리?" onConfirm={() => handleStatusChange(detail.plan_id, 'COMPLETED')}>
                  <Button type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}>완료처리</Button>
                </Popconfirm>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
