import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Table, Tag, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Space, Popconfirm, Progress, Collapse, Divider, message, Typography } from 'antd';
import {
  PlusOutlined, EyeOutlined, CheckOutlined, PlayCircleOutlined,
  StopOutlined, DeleteOutlined, MinusCircleOutlined, AppstoreOutlined,
  FileTextOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { productionApi } from '../../modules/production/production.api';
import { codeApi } from '../../modules/code/code.api';
import { apiFetch } from '../../core/api.client';
import type { ProductionPlan } from '../../../../shared/types/production';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', CONFIRMED: 'blue', IN_PRODUCTION: 'orange', COMPLETED: 'green', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', CONFIRMED: '확정', IN_PRODUCTION: '생산중', COMPLETED: '완료', CANCELLED: '취소',
};
const CATEGORY_COLORS: Record<string, string> = {
  TOP: '#1890ff', BOTTOM: '#52c41a', OUTER: '#fa8c16', DRESS: '#eb2f96', ACC: '#722ed1',
};

const STEPS = [
  { key: '', label: '전체', color: '#1890ff', bg: '#e6f7ff', icon: <AppstoreOutlined /> },
  { key: 'DRAFT', label: '초안', color: '#8c8c8c', bg: '#fafafa', icon: <FileTextOutlined /> },
  { key: 'CONFIRMED', label: '확정', color: '#1677ff', bg: '#e6f4ff', icon: <CheckCircleOutlined /> },
  { key: 'IN_PRODUCTION', label: '생산중', color: '#fa8c16', bg: '#fff7e6', icon: <PlayCircleOutlined /> },
  { key: 'COMPLETED', label: '완료', color: '#52c41a', bg: '#f6ffed', icon: <CheckOutlined /> },
  { key: 'CANCELLED', label: '취소', color: '#ff4d4f', bg: '#fff2f0', icon: <StopOutlined /> },
];

const fmtNum = (v: number) => v.toLocaleString();

interface SubItem {
  key: number;
  sub_category: string | null;
  fit: string | null;
  length: string | null;
  plan_qty: number;
  unit_cost: number | null;
  memo: string | null;
}

interface CategoryGroup {
  key: number;
  category: string;
  items: SubItem[];
}

export default function ProductionPlanPage() {
  const keySeqRef = useRef(0);
  const newSubItem = (): SubItem => ({ key: ++keySeqRef.current, sub_category: null, fit: null, length: null, plan_qty: 1, unit_cost: null, memo: null });
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [statusCounts, setStatusCounts] = useState<Record<string, { count: number; qty: number }>>({});
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ProductionPlan | null>(null);
  const [form] = Form.useForm();
  const [partners, setPartners] = useState<any[]>([]);

  // 카테고리별 그룹
  const [catGroups, setCatGroups] = useState<CategoryGroup[]>([]);

  // 코드 옵션
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [subCategoryMap, setSubCategoryMap] = useState<Record<string, { label: string; value: string }[]>>({});
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [lengthOptions, setLengthOptions] = useState<{ label: string; value: string }[]>([]);
  const catLabelMap = Object.fromEntries(categoryOptions.map(o => [o.value, o.label]));
  const subCatLabelMap: Record<string, string> = {};
  Object.values(subCategoryMap).flat().forEach(o => { subCatLabelMap[o.value] = o.label; });
  const fitLabelMap = Object.fromEntries(fitOptions.map(o => [o.value, o.label]));
  const lenLabelMap = Object.fromEntries(lengthOptions.map(o => [o.value, o.label]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const result = await productionApi.list(params);
      setPlans(result.data); setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const loadCounts = useCallback(async () => {
    try {
      const dashboard = await productionApi.dashboard();
      const sc = dashboard.statusCounts || [];
      const counts: Record<string, { count: number; qty: number }> = {};
      let totalCount = 0, totalQty = 0;
      for (const r of sc) {
        counts[r.status] = { count: Number(r.count), qty: Number(r.total_qty) };
        totalCount += Number(r.count);
        totalQty += Number(r.total_qty);
      }
      counts[''] = { count: totalCount, qty: totalQty };
      // 빠진 상태는 0으로 초기화
      for (const s of ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED']) {
        if (!counts[s]) counts[s] = { count: 0, qty: 0 };
      }
      setStatusCounts(counts);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  useEffect(() => {
    (async () => {
      try {
        const [ptRes, codes] = await Promise.all([
          apiFetch('/api/partners?limit=100').then(r => r.json()),
          codeApi.getAll(),
        ]);
        if (ptRes.success) setPartners(ptRes.data.data || ptRes.data);
        const toOpts = (arr: any[]) => (arr || []).filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value }));
        const allCats = codes.CATEGORY || [];
        const parents = allCats.filter((c: any) => !c.parent_code && c.is_active);
        setCategoryOptions(parents.map((c: any) => ({ label: c.code_label, value: c.code_value })));
        // 세부 카테고리: parent_code별로 그룹핑
        const subMap: Record<string, { label: string; value: string }[]> = {};
        for (const parent of parents) {
          const children = allCats.filter((c: any) => c.parent_code === parent.code_id && c.is_active);
          if (children.length > 0) {
            subMap[parent.code_value] = children.map((c: any) => ({ label: c.code_label, value: c.code_value }));
          }
        }
        setSubCategoryMap(subMap);
        setFitOptions(toOpts(codes.FIT));
        setLengthOptions(toOpts(codes.LENGTH));
      } catch (e: any) { console.error('코드/거래처 로드 실패:', e); }
    })();
  }, []);

  // --- 카테고리 그룹 조작 ---
  const addCategoryGroup = () => {
    setCatGroups(prev => [...prev, { key: ++keySeqRef.current, category: '', items: [newSubItem()] }]);
  };

  const removeCategoryGroup = (gKey: number) => {
    setCatGroups(prev => prev.filter(g => g.key !== gKey));
  };

  const updateGroupCategory = (gKey: number, cat: string) => {
    setCatGroups(prev => prev.map(g => g.key === gKey ? { ...g, category: cat } : g));
  };

  const addSubItem = (gKey: number) => {
    setCatGroups(prev => prev.map(g => g.key === gKey ? { ...g, items: [...g.items, newSubItem()] } : g));
  };

  const removeSubItem = (gKey: number, iKey: number) => {
    setCatGroups(prev => prev.map(g => {
      if (g.key !== gKey) return g;
      const next = g.items.filter(i => i.key !== iKey);
      return { ...g, items: next.length > 0 ? next : [newSubItem()] };
    }));
  };

  const updateSubItem = (gKey: number, iKey: number, field: keyof SubItem, value: any) => {
    setCatGroups(prev => prev.map(g => {
      if (g.key !== gKey) return g;
      return { ...g, items: g.items.map(i => i.key === iKey ? { ...i, [field]: value } : i) };
    }));
  };

  // 전체 합계
  const grandTotalQty = catGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + (i.plan_qty || 0), 0), 0);
  const grandTotalCost = catGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + (i.plan_qty || 0) * (i.unit_cost || 0), 0), 0);

  const openCreateModal = () => {
    keySeqRef.current = 0;
    form.resetFields();
    setCatGroups([{ key: ++keySeqRef.current, category: '', items: [newSubItem()] }]);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const flatItems: Array<{ category: string; sub_category: string | null; fit: string | null; length: string | null; plan_qty: number; unit_cost: number | null; memo: string | null }> = [];
      for (const g of catGroups) {
        if (!g.category) { message.error('모든 카테고리를 선택해주세요.'); return; }
        for (const i of g.items) {
          if (i.plan_qty > 0) {
            flatItems.push({ category: g.category, sub_category: i.sub_category, fit: i.fit, length: i.length, plan_qty: i.plan_qty, unit_cost: i.unit_cost, memo: i.memo });
          }
        }
      }
      if (flatItems.length === 0) { message.error('품목을 1개 이상 추가해주세요.'); return; }

      await productionApi.create({
        plan_name: values.plan_name,
        season: values.season,
        target_date: values.target_date?.format('YYYY-MM-DD'),
        partner_code: values.partner_code,
        memo: values.memo,
        items: flatItems,
      });
      message.success('생산계획이 등록되었습니다.');
      setCreateOpen(false);
      load(); loadCounts();
    } catch (e: any) { message.error(e.message); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await productionApi.updateStatus(id, status);
      message.success(`상태가 ${STATUS_LABELS[status]}(으)로 변경되었습니다.`);
      load(); loadCounts();
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

  // 상세 모달: 카테고리별 그룹핑
  const detailGrouped = (() => {
    if (!detail?.items) return [];
    const map = new Map<string, any[]>();
    for (const item of detail.items) {
      const cat = item.category || '미분류';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).map(([cat, items]) => ({ category: cat, items }));
  })();

  const detailTotalCost = (detail?.items || []).reduce((sum, i) => sum + (i.plan_qty || 0) * (i.unit_cost || 0), 0);

  const columns = [
    { title: '계획번호', dataIndex: 'plan_no', key: 'no', width: 120 },
    { title: '계획명', dataIndex: 'plan_name', key: 'name', ellipsis: true },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 100, render: (v: string) => v || '-' },
    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
    { title: '계획수량', dataIndex: 'total_plan_qty', key: 'plan', width: 80, render: (v: number) => fmtNum(Number(v)) },
    { title: '총 비용', dataIndex: 'total_cost', key: 'cost', width: 110,
      render: (v: number) => v ? `${fmtNum(Number(v))}원` : '-' },
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

  // 사용 가능한 카테고리 (이미 추가된 카테고리 제외)
  const usedCategories = new Set(catGroups.map(g => g.category).filter(Boolean));

  return (
    <div>
      {/* 상태 대시보드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
        {STEPS.map(step => {
          const active = statusFilter === step.key;
          const info = statusCounts[step.key];
          return (
            <div
              key={step.key || 'ALL'}
              onClick={() => { setStatusFilter(step.key); setPage(1); }}
              style={{
                padding: '16px 12px',
                borderRadius: 10,
                border: active ? `2px solid ${step.color}` : '2px solid #f0f0f0',
                background: active ? step.bg : '#fff',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                boxShadow: active ? `0 2px 8px ${step.color}33` : '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ fontSize: 28, color: step.color, marginBottom: 4 }}>{step.icon}</div>
              <div style={{ fontSize: 13, color: active ? step.color : '#666', fontWeight: active ? 600 : 400, marginBottom: 2 }}>{step.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: step.color }}>{info?.count ?? '-'}건</div>
              <div style={{ fontSize: 12, color: '#999' }}>{info ? `${info.qty.toLocaleString()}개` : '-'}</div>
            </div>
          );
        })}
      </div>

      <Card title={`생산계획 관리${statusFilter ? ` - ${STATUS_LABELS[statusFilter]}` : ''}`} extra={
        <Space>
          <Input.Search placeholder="검색" onSearch={setSearch} allowClear style={{ width: 180 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>생산계획 등록</Button>
        </Space>
      }>
        <Table columns={columns} dataSource={plans} rowKey="plan_id" loading={loading}
          size="small" scroll={{ x: 1100, y: 'calc(100vh - 350px)' }}
          pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />
      </Card>

      {/* 등록 모달 */}
      <Modal title="생산계획 등록" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={handleCreate} width={960} okText="등록">
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
                  { value: '2025SM', label: '25 여름' },
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

        <Divider style={{ margin: '8px 0 16px' }} />

        {/* 요약 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            <AppstoreOutlined style={{ marginRight: 6 }} />카테고리별 품목 등록
          </Typography.Text>
          <Space>
            <Tag color="blue">총 {grandTotalQty.toLocaleString()}개</Tag>
            <Tag color="gold">합계 {grandTotalCost.toLocaleString()}원</Tag>
          </Space>
        </div>

        {/* 카테고리 그룹들 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
          {catGroups.map((group) => {
            const groupQty = group.items.reduce((s, i) => s + (i.plan_qty || 0), 0);
            const groupCost = group.items.reduce((s, i) => s + (i.plan_qty || 0) * (i.unit_cost || 0), 0);
            const catColor = CATEGORY_COLORS[group.category] || '#666';

            return (
              <Card
                key={group.key}
                size="small"
                style={{ borderLeft: `4px solid ${group.category ? catColor : '#d9d9d9'}`, borderRadius: 8 }}
                title={
                  <Space>
                    <Select
                      value={group.category || undefined}
                      onChange={(v) => updateGroupCategory(group.key, v)}
                      placeholder="카테고리 선택"
                      style={{ width: 160 }}
                      showSearch optionFilterProp="label"
                    >
                      {categoryOptions
                        .filter(o => o.value === group.category || !usedCategories.has(o.value))
                        .map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                    </Select>
                    <Tag>{groupQty}개</Tag>
                    {groupCost > 0 && <Tag color="gold">{groupCost.toLocaleString()}원</Tag>}
                  </Space>
                }
                extra={
                  catGroups.length > 1 ? (
                    <Button size="small" danger type="text" icon={<DeleteOutlined />}
                      onClick={() => removeCategoryGroup(group.key)} />
                  ) : null
                }
              >
                {group.items.map((item) => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {subCategoryMap[group.category]?.length > 0 && (
                      <Select
                        value={item.sub_category || undefined}
                        onChange={(v) => updateSubItem(group.key, item.key, 'sub_category', v || null)}
                        placeholder="세부카테고리"
                        allowClear showSearch optionFilterProp="label"
                        style={{ width: 140 }}
                        options={subCategoryMap[group.category]}
                      />
                    )}
                    <Select
                      value={item.fit || undefined}
                      onChange={(v) => updateSubItem(group.key, item.key, 'fit', v || null)}
                      placeholder="핏"
                      allowClear showSearch optionFilterProp="label"
                      style={{ width: 130 }}
                      options={fitOptions}
                    />
                    <Select
                      value={item.length || undefined}
                      onChange={(v) => updateSubItem(group.key, item.key, 'length', v || null)}
                      placeholder="기장"
                      allowClear showSearch optionFilterProp="label"
                      style={{ width: 110 }}
                      options={lengthOptions}
                    />
                    <InputNumber
                      min={1}
                      value={item.plan_qty}
                      onChange={(v) => updateSubItem(group.key, item.key, 'plan_qty', v || 1)}
                      style={{ width: 80 }}
                      placeholder="수량"
                      addonAfter="개"
                    />
                    <InputNumber
                      min={0}
                      value={item.unit_cost}
                      onChange={(v) => updateSubItem(group.key, item.key, 'unit_cost', v)}
                      style={{ width: 120 }}
                      placeholder="단가"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(v) => Number((v || '').replace(/,/g, ''))}
                    />
                    <span style={{ width: 90, textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#555', flexShrink: 0 }}>
                      {((item.plan_qty || 0) * (item.unit_cost || 0)).toLocaleString()}원
                    </span>
                    {group.items.length > 1 ? (
                      <Button size="small" type="text" danger icon={<MinusCircleOutlined />}
                        onClick={() => removeSubItem(group.key, item.key)} />
                    ) : <div style={{ width: 32 }} />}
                  </div>
                ))}
                <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ width: '100%', marginTop: 4 }}
                  onClick={() => addSubItem(group.key)}>
                  핏/기장 추가
                </Button>
              </Card>
            );
          })}
        </div>

        <Button type="dashed" icon={<PlusOutlined />} style={{ width: '100%', marginTop: 12, height: 40 }}
          onClick={addCategoryGroup}
          disabled={catGroups.length >= categoryOptions.length}>
          + 카테고리 추가
        </Button>
      </Modal>

      {/* 상세 모달 */}
      <Modal title={`생산계획 상세 - ${detail?.plan_no || ''}`} open={detailOpen}
        onCancel={() => setDetailOpen(false)} footer={null} width={960}>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Typography.Text strong>품목 목록</Typography.Text>
              <Space>
                <Tag color="blue">총 {(detail.items || []).reduce((s, i) => s + i.plan_qty, 0).toLocaleString()}개</Tag>
                <Tag color="gold">비용 {fmtNum(detailTotalCost)}원</Tag>
              </Space>
            </div>

            {/* 카테고리별 그룹핑 표시 */}
            <Collapse
              defaultActiveKey={detailGrouped.map(g => g.category)}
              style={{ marginBottom: 16 }}
              items={detailGrouped.map(({ category, items }) => {
                const catQty = items.reduce((s: number, i: any) => s + i.plan_qty, 0);
                const catProduced = items.reduce((s: number, i: any) => s + (i.produced_qty || 0), 0);
                const catCost = items.reduce((s: number, i: any) => s + (i.plan_qty || 0) * (i.unit_cost || 0), 0);
                const catPct = catQty > 0 ? Math.round((catProduced / catQty) * 100) : 0;
                return {
                  key: category,
                  label: (
                    <Space>
                      <Tag color={CATEGORY_COLORS[category] || 'default'} style={{ fontWeight: 600 }}>
                        {catLabelMap[category] || category}
                      </Tag>
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {items.length}건 | {catQty.toLocaleString()}개
                        {catCost > 0 && ` | ${catCost.toLocaleString()}원`}
                      </span>
                      <Progress percent={catPct} size="small" style={{ width: 100 }} />
                    </Space>
                  ),
                  children: (
                    <Table
                      columns={[
                        { title: '세부카테고리', dataIndex: 'sub_category', key: 'sub', width: 120,
                          render: (v: string) => v ? <Tag color="cyan">{subCatLabelMap[v] || v}</Tag> : <span style={{ color: '#aaa' }}>-</span> },
                        { title: '핏', dataIndex: 'fit', key: 'fit', width: 120,
                          render: (v: string) => v ? <Tag>{fitLabelMap[v] || v}</Tag> : <span style={{ color: '#aaa' }}>전체</span> },
                        { title: '기장', dataIndex: 'length', key: 'len', width: 100,
                          render: (v: string) => v ? <Tag>{lenLabelMap[v] || v}</Tag> : <span style={{ color: '#aaa' }}>전체</span> },
                        { title: '계획수량', dataIndex: 'plan_qty', key: 'plan', width: 90, render: (v: number) => fmtNum(v) },
                        { title: '단가', dataIndex: 'unit_cost', key: 'cost', width: 100,
                          render: (v: number) => v ? `${fmtNum(v)}원` : '-' },
                        { title: '금액', key: 'amount', width: 110, render: (_: any, r: any) => {
                          const amt = (r.plan_qty || 0) * (r.unit_cost || 0);
                          return amt > 0 ? <strong>{fmtNum(amt)}원</strong> : '-';
                        }},
                        { title: '생산량', dataIndex: 'produced_qty', key: 'prod', width: 80, render: (v: number) => fmtNum(v || 0) },
                        { title: '진행률', key: 'pct', width: 130, render: (_: any, r: any) => {
                          const pct = r.plan_qty > 0 ? Math.round(((r.produced_qty || 0) / r.plan_qty) * 100) : 0;
                          return <Progress percent={pct} size="small" status={pct >= 100 ? 'success' : 'active'} />;
                        }},
                      ]}
                      dataSource={items}
                      rowKey="item_id"
                      pagination={false}
                      size="small"
                    />
                  ),
                };
              })}
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
