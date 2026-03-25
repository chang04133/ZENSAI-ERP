import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Table, Tag, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Space, Popconfirm, Collapse, Divider, Segmented, message, Typography, Row, Col, Steps } from 'antd';
import {
  PlusOutlined, EyeOutlined, CheckOutlined, PlayCircleOutlined,
  StopOutlined, DeleteOutlined, MinusCircleOutlined, AppstoreOutlined,
  FileTextOutlined, SearchOutlined,
  UploadOutlined, DownloadOutlined, DollarOutlined, BankOutlined,
  AuditOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import { productionApi } from '../../modules/production/production.api';
import { apiFetch } from '../../core/api.client';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { partnerApi } from '../../modules/partner/partner.api';
import type { ProductionPlan } from '../../../../shared/types/production';
import dayjs from 'dayjs';
import { fmtNum } from '../../utils/format';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', IN_PRODUCTION: 'orange', COMPLETED: 'green', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', IN_PRODUCTION: '생산중', COMPLETED: '완료', CANCELLED: '취소',
};
const CATEGORY_COLORS: Record<string, string> = {
  TOP: '#1890ff', BOTTOM: '#52c41a', OUTER: '#fa8c16', DRESS: '#eb2f96', ACC: '#722ed1',
};

const STEPS = [
  { key: '', label: '전체', color: '#1890ff', bg: '#e6f7ff', icon: <AppstoreOutlined /> },
  { key: 'DRAFT', label: '초안', color: '#8c8c8c', bg: '#fafafa', icon: <FileTextOutlined /> },
  { key: 'IN_PRODUCTION', label: '생산중', color: '#fa8c16', bg: '#fff7e6', icon: <PlayCircleOutlined /> },
  { key: 'COMPLETED', label: '완료', color: '#52c41a', bg: '#f6ffed', icon: <CheckOutlined /> },
  { key: 'CANCELLED', label: '취소', color: '#ff4d4f', bg: '#fff2f0', icon: <StopOutlined /> },
];

interface SubItem {
  key: number;
  sub_category: string | null;
  fit: string | null;
  length: string | null;
  plan_qty: number;
  unit_cost: number | null;
  memo: string | null;
  // 재입고에서 prefill 시 표시용
  _sku?: string;
  _product_code?: string;
  _product_name?: string;
  _color?: string;
  _size?: string;
  _current_stock?: number;
}

interface CategoryGroup {
  key: number;
  category: string;
  items: SubItem[];
}

const SEASON_LABELS: Record<string, string> = { SA: '봄/가을', SM: '여름', WN: '겨울' };
const fmtSeason = (v: string | null) => {
  if (!v) return '-';
  const yr = v.substring(0, 4);
  const tp = v.substring(4);
  const label = SEASON_LABELS[tp];
  return label ? `${yr.slice(-2)} ${label}` : v;
};

export default function ProductionPlanPage() {
  const location = useLocation();
  const keySeqRef = useRef(0);
  const newSubItem = (): SubItem => ({ key: ++keySeqRef.current, sub_category: null, fit: null, length: null, plan_qty: 1, unit_cost: null, memo: null });
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [statusCounts, setStatusCounts] = useState<Record<string, { count: number; qty: number }>>({});
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<string>('');
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ProductionPlan | null>(null);
  const [form] = Form.useForm();

  // 생산수량 입력
  const [editItems, setEditItems] = useState<Array<{ item_id: number; produced_qty: number }>>([]);
  const [qtySubmitting, setQtySubmitting] = useState(false);

  // 선지급 모달
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advancePlanId, setAdvancePlanId] = useState<number | null>(null);
  const [advanceForm] = Form.useForm();
  const [advanceLoading, setAdvanceLoading] = useState(false);

  // 잔금+완료 모달
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balancePlan, setBalancePlan] = useState<ProductionPlan | null>(null);
  const [balanceForm] = Form.useForm();
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 카테고리별 그룹
  const [catGroups, setCatGroups] = useState<CategoryGroup[]>([]);

  // 거래처 목록
  const [partners, setPartners] = useState<{ label: string; value: string }[]>([]);

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
      if (yearFilter) params.year = yearFilter;
      if (seasonTypeFilter) params.season_type = seasonTypeFilter;
      const result = await productionApi.list(params);
      setPlans(result.data); setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, statusFilter, search, yearFilter, seasonTypeFilter]);

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
      for (const s of ['DRAFT', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED']) {
        if (!counts[s]) counts[s] = { count: 0, qty: 0 };
      }
      setStatusCounts(counts);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  useEffect(() => {
    (async () => {
      try {
        const codes = await codeApi.getAll();
        const toOpts = (arr: any[]) => (arr || []).filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value }));
        const allCats = codes.CATEGORY || [];
        const parents = allCats.filter((c: any) => !c.parent_code && c.is_active);
        setCategoryOptions(parents.map((c: any) => ({ label: c.code_label, value: c.code_value })));
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
        // 연도/시즌 코드 로드
        const yearCodes = (codes.YEAR || []).filter((c: any) => c.is_active).sort((a: any, b: any) => b.code_value.localeCompare(a.code_value));
        setYearOptions(yearCodes.map((c: any) => ({ label: c.code_label || c.code_value, value: c.code_value })));
        const seasonCodes = (codes.SEASON || []).filter((c: any) => c.is_active);
        setSeasonOptions(seasonCodes.map((c: any) => ({ label: c.code_label || c.code_value, value: c.code_value })));
      } catch (e: any) { console.error('코드 로드 실패:', e); }
    })();
    (async () => {
      try {
        const result = await partnerApi.list({ limit: '200' });
        setPartners((result.data || []).filter((p: any) => p.is_active).map((p: any) => ({ label: `${p.partner_name} (${p.partner_type})`, value: p.partner_code })));
      } catch { /* ignore */ }
    })();
  }, []);

  // --- 재입고에서 prefill 수신 (variant_id + suggested_qty → API 조회 → 자동 입력) ---
  useEffect(() => {
    const state = location.state as any;
    if (state?.restockItems) {
      const restockItems = state.restockItems as Array<{ variant_id: number; suggested_qty: number }>;
      window.history.replaceState({}, '');

      (async () => {
        try {
          const variantIds = restockItems.map(r => r.variant_id);
          const variants = await productApi.bulkGetVariants(variantIds);

          // suggested_qty 매핑
          const qtyMap = new Map(restockItems.map(r => [r.variant_id, r.suggested_qty]));

          // 카테고리별 그룹핑
          const catMap = new Map<string, typeof variants>();
          for (const v of variants) {
            const cat = v.category || 'ETC';
            if (!catMap.has(cat)) catMap.set(cat, []);
            catMap.get(cat)!.push(v);
          }

          const groups: CategoryGroup[] = Array.from(catMap.entries()).map(([category, items]) => ({
            key: ++keySeqRef.current,
            category,
            items: items.map(v => ({
              key: ++keySeqRef.current,
              sub_category: v.sub_category || null,
              fit: v.fit || null,
              length: v.length || null,
              plan_qty: qtyMap.get(v.variant_id) || 1,
              unit_cost: v.cost_price || null,
              memo: null,
              _sku: v.sku,
              _product_code: v.product_code,
              _product_name: v.product_name,
              _color: v.color,
              _size: v.size,
              _current_stock: v.current_stock,
            })),
          }));

          setCatGroups(groups);
          setCreateOpen(true);
        } catch (e: any) {
          message.error('상품 정보 조회 실패: ' + e.message);
        }
      })();
    }
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

  const [submitting, setSubmitting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const handleExcelDownload = async () => {
    try {
      const res = await apiFetch(productionApi.excelTemplateUrl);
      if (!res.ok) { message.error('템플릿 다운로드 실패'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'production_plan_template.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) { message.error('템플릿 다운로드 실패: ' + e.message); }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      setLoading(true);
      const result = await productionApi.uploadExcel(file);
      const msgs: string[] = [`${result.createdPlans}건 계획 생성 (품목 ${result.createdItems}건)`];
      if (result.errors?.length) msgs.push(`오류 ${result.errors.length}건`);
      message.success(msgs.join(', '));
      if (result.errors?.length) {
        Modal.warning({ title: '일부 오류 발생', width: 520, content: (
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {result.errors.map((err, i) => <div key={i} style={{ color: '#cf1322', fontSize: 12 }}>{err}</div>)}
          </div>
        )});
      }
      load(); loadCounts();
    } catch (err: any) { message.error('엑셀 업로드 실패: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);
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

      const season = values.season_year && values.season_type ? `${values.season_year}${values.season_type}` : values.season_year || null;
      await productionApi.create({
        plan_name: values.plan_name,
        season,
        target_date: values.target_date?.format('YYYY-MM-DD'),
        partner_code: values.partner_code || null,
        memo: values.memo,
        items: flatItems,
      });
      message.success('생산계획이 등록되었습니다.');
      setCreateOpen(false);
      load(); loadCounts();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
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

  const handleSaveQty = async () => {
    if (!detail || qtySubmitting) return;
    setQtySubmitting(true);
    try {
      const updated = await productionApi.updateProducedQty(detail.plan_id, editItems);
      message.success('생산수량이 업데이트되었습니다.');
      setDetail(updated);
      setEditItems((updated.items || []).map((i: any) => ({ item_id: i.item_id, produced_qty: i.produced_qty })));
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setQtySubmitting(false); }
  };

  // ── 선지급 모달 ──
  const openAdvanceModal = (planId: number, totalCost: number) => {
    setAdvancePlanId(planId);
    const rate = 30;
    advanceForm.setFieldsValue({
      total_amount: totalCost || 0,
      advance_rate: rate,
      advance_amount: Math.round((totalCost || 0) * rate / 100),
      advance_date: dayjs(),
    });
    setAdvanceOpen(true);
  };

  const handleAdvanceSubmit = async () => {
    if (!advancePlanId || advanceLoading) return;
    setAdvanceLoading(true);
    try {
      const values = await advanceForm.validateFields();
      await productionApi.startProduction(advancePlanId, {
        total_amount: values.total_amount,
        advance_rate: values.advance_rate,
        advance_amount: values.advance_amount,
        advance_date: values.advance_date.format('YYYY-MM-DD'),
      });
      message.success('생산이 시작되었습니다. 선지급이 처리되었습니다.');
      setAdvanceOpen(false);
      load(); loadCounts();
      if (detail?.plan_id === advancePlanId) {
        try { const updated = await productionApi.get(advancePlanId); setDetail(updated); } catch {}
      }
    } catch (e: any) {
      message.error('생산시작 실패: ' + (e.message || '알 수 없는 오류'));
    } finally {
      setAdvanceLoading(false);
    }
  };

  // ── 잔금 + 완료 모달 ──
  const openBalanceModal = async (planId: number) => {
    try {
      const plan = await productionApi.get(planId);
      setBalancePlan(plan);
      balanceForm.setFieldsValue({ balance_date: dayjs() });
      setBalanceOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleBalanceSubmit = async () => {
    if (!balancePlan || balanceLoading) return;
    const planId = balancePlan.plan_id;
    setBalanceLoading(true);
    try {
      const values = await balanceForm.validateFields();
      await productionApi.completeProduction(planId, {
        balance_date: values.balance_date.format('YYYY-MM-DD'),
      });
      message.success('잔금이 지급되었습니다. 생산이 완료 처리되었습니다.');
      setBalanceOpen(false);
      load(); loadCounts();
      if (detail?.plan_id === planId) {
        try { const updated = await productionApi.get(planId); setDetail(updated); } catch {}
      }
    } catch (e: any) {
      message.error('완료처리 실패: ' + (e.message || '알 수 없는 오류'));
    } finally {
      setBalanceLoading(false);
    }
  };

  // ── 정산 완료 ──
  const handleSettle = async (planId: number) => {
    try {
      await productionApi.updatePayment(planId, { action: 'settle' });
      message.success('정산이 완료되었습니다.');
      load(); loadCounts();
      if (detail?.plan_id === planId) {
        const updated = await productionApi.get(planId);
        setDetail(updated);
      }
    } catch (e: any) { message.error(e.message); }
  };

  const viewDetail = async (id: number) => {
    try {
      const d = await productionApi.get(id);
      setDetail(d); setDetailOpen(true);
      setEditItems((d.items || []).map((i: any) => ({ item_id: i.item_id, produced_qty: i.produced_qty })));
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
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => fmtSeason(v) },
    { title: '품목', dataIndex: 'item_count', key: 'items', width: 60, render: (v: number) => `${v}건` },
    { title: '계획수량', dataIndex: 'total_plan_qty', key: 'plan', width: 80, render: (v: number) => fmtNum(Number(v)) },
    { title: '총 비용', dataIndex: 'total_cost', key: 'cost', width: 110,
      render: (v: number) => v ? `${fmtNum(Number(v))}원` : '-' },
    { title: '결제현황', key: 'payment', width: 160, render: (_: any, r: ProductionPlan) => {
      if (['DRAFT', 'CANCELLED'].includes(r.status)) return <span style={{ color: '#ccc' }}>-</span>;
      if (!r.total_amount) return <span style={{ color: '#ccc', fontSize: 11 }}>미설정</span>;
      if (r.settle_status === 'SETTLED') return <Tag color="green">정산완료</Tag>;
      return (
        <Space size={4} wrap>
          <Tag color={r.advance_status === 'PAID' ? 'blue' : 'default'} style={{ fontSize: 11, margin: 0 }}>
            선지급 {r.advance_status === 'PAID' ? '✓' : '대기'}
          </Tag>
          {r.advance_status === 'PAID' && (
            <Tag color={r.balance_status === 'PAID' ? 'cyan' : 'default'} style={{ fontSize: 11, margin: 0 }}>
              잔금 {r.balance_status === 'PAID' ? '✓' : '대기'}
            </Tag>
          )}
        </Space>
      );
    }},
    { title: '입고처', dataIndex: 'partner_name', key: 'partner', width: 100, ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#aaa' }}>본사</span>,
    },
    { title: '목표일', dataIndex: 'target_date', key: 'target', width: 100, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
    { title: '관리', key: 'action', width: 200, render: (_: any, r: ProductionPlan) => (
      <Space size="small">
        <Button size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r.plan_id)}>상세</Button>
        {r.status === 'DRAFT' && (
          <Button size="small" style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }} icon={<PlayCircleOutlined />}
            onClick={() => openAdvanceModal(r.plan_id, Number(r.total_cost) || 0)}>생산시작</Button>
        )}
        {r.status === 'IN_PRODUCTION' && (
          <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}
            onClick={() => openBalanceModal(r.plan_id)}>완료</Button>
        )}
        {r.status === 'DRAFT' && (
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        {yearOptions.length > 0 && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도별</div>
            <Segmented
              value={yearFilter || '전체'}
              onChange={(v) => { setYearFilter(v === '전체' ? '' : String(v)); setPage(1); }}
              options={[{ label: '전체', value: '전체' }, ...yearOptions.map(o => ({ label: o.label, value: o.value }))]}
            />
          </div>
        )}
        {seasonOptions.length > 0 && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌별</div>
            <Segmented
              value={seasonTypeFilter || '전체'}
              onChange={(v) => { setSeasonTypeFilter(v === '전체' ? '' : String(v)); setPage(1); }}
              options={[{ label: '전체', value: '전체' }, ...seasonOptions.map(o => ({ label: o.label, value: o.value }))]}
            />
          </div>
        )}
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="계획명/상품명 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={() => { setPage(1); }} style={{ width: '100%' }} /></div>
        <Button onClick={() => { setPage(1); }}>조회</Button>
      </div>
      <Card title={`생산계획 관리${statusFilter ? ` - ${STATUS_LABELS[statusFilter]}` : ''}`} extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExcelDownload}>템플릿</Button>
          <Button icon={<UploadOutlined />} onClick={() => excelInputRef.current?.click()}>엑셀 등록</Button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>생산계획 등록</Button>
        </Space>
      }>
        <Table columns={columns} dataSource={plans} rowKey="plan_id" loading={loading}
          size="small" scroll={{ x: 1100, y: 'calc(100vh - 350px)' }}
          pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />
      </Card>

      {/* 등록 모달 */}
      <Modal title="생산계획 등록" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={handleCreate} width={960} okText="등록" confirmLoading={submitting}>
        <Form form={form} layout="vertical">
          <Form.Item name="plan_name" label="계획명" rules={[{ required: true }]}>
            <Input placeholder="예: 26SA 상의 1차 생산" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="season_year" label="연도" style={{ width: 110 }}>
              <Select allowClear placeholder="연도">
                {yearOptions.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="season_type" label="시즌" style={{ width: 120 }}>
              <Select allowClear placeholder="시즌">
                {seasonOptions.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="target_date" label="목표일">
              <DatePicker />
            </Form.Item>
            <Form.Item name="partner_code" label="입고 거래처">
              <Select allowClear placeholder="거래처 선택 (미선택시 본사)" showSearch optionFilterProp="label"
                style={{ width: 220 }} options={partners} />
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

            const isPrefillGroup = group.items.some(i => i._sku);

            return (
              <Card
                key={group.key}
                size="small"
                style={{ borderLeft: `4px solid ${group.category ? catColor : '#d9d9d9'}`, borderRadius: 8 }}
                title={
                  <Space>
                    {isPrefillGroup ? (
                      <Tag color={CATEGORY_COLORS[group.category] || 'default'} style={{ fontWeight: 600, fontSize: 13 }}>
                        {catLabelMap[group.category] || group.category}
                      </Tag>
                    ) : (
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
                    )}
                    <Tag>{groupQty}개</Tag>
                    {groupCost > 0 && <Tag color="gold">{groupCost.toLocaleString()}원</Tag>}
                  </Space>
                }
                extra={
                  !isPrefillGroup && catGroups.length > 1 ? (
                    <Button size="small" danger type="text" icon={<DeleteOutlined />}
                      onClick={() => removeCategoryGroup(group.key)} />
                  ) : null
                }
              >
                {group.items.map((item) => (
                  <div key={item.key} style={{ marginBottom: 8 }}>
                    {item._sku ? (
                      /* ── prefill 아이템: 상품정보 읽기전용, 수량만 수정 가능 ── */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0' }}>
                        <Tag color="blue" style={{ fontSize: 11 }}>{item._sku}</Tag>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{item._product_name}</span>
                        <Tag>{item._color}/{item._size}</Tag>
                        {item.sub_category && <Tag color="cyan">{subCatLabelMap[item.sub_category] || item.sub_category}</Tag>}
                        {item.fit && <Tag>{fitLabelMap[item.fit] || item.fit}</Tag>}
                        {item.length && <Tag>{lenLabelMap[item.length] || item.length}</Tag>}
                        <span style={{ color: '#999', fontSize: 12 }}>현재고: <b style={{ color: (item._current_stock || 0) === 0 ? '#f5222d' : '#333' }}>{item._current_stock || 0}</b></span>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <InputNumber
                            min={1}
                            value={item.plan_qty}
                            onChange={(v) => updateSubItem(group.key, item.key, 'plan_qty', v || 1)}
                            style={{ width: 90 }}
                            addonAfter="개"
                          />
                          {item.unit_cost ? (
                            <span style={{ fontSize: 12, color: '#888', minWidth: 70, textAlign: 'right' }}>@{(item.unit_cost).toLocaleString()}원</span>
                          ) : null}
                          <span style={{ fontWeight: 600, fontSize: 12, color: '#555', minWidth: 80, textAlign: 'right' }}>
                            {((item.plan_qty || 0) * (item.unit_cost || 0)).toLocaleString()}원
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* ── 수동 추가 아이템: 전체 수정 가능 ── */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                          placeholder="원가(원)"
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
                    )}
                  </div>
                ))}
                {!group.items.some(i => i._sku) && (
                  <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ width: '100%', marginTop: 4 }}
                    onClick={() => addSubItem(group.key)}>
                    핏/기장 추가
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {!catGroups.some(g => g.items.some(i => i._sku)) && (
          <Button type="dashed" icon={<PlusOutlined />} style={{ width: '100%', marginTop: 12, height: 40 }}
            onClick={addCategoryGroup}
            disabled={catGroups.length >= categoryOptions.length}>
            + 카테고리 추가
          </Button>
        )}
      </Modal>

      {/* 상세 모달 */}
      <Modal title={`생산계획 상세 - ${detail?.plan_no || ''}`} open={detailOpen}
        onCancel={() => setDetailOpen(false)} footer={null} width={960}>
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag>
              <span><strong>계획명:</strong> {detail.plan_name}</span>
              <span><strong>시즌:</strong> {fmtSeason(detail.season)}</span>
              <span><strong>목표일:</strong> {detail.target_date ? new Date(detail.target_date).toLocaleDateString('ko-KR') : '-'}</span>
              <span><strong>입고처:</strong> {detail.partner_name || '본사'}</span>
              <span><strong>등록자:</strong> {detail.created_by_name}</span>
              {detail.start_date && <span><strong>시작일:</strong> {new Date(detail.start_date).toLocaleDateString('ko-KR')}</span>}
              {detail.end_date && <span><strong>종료일:</strong> {new Date(detail.end_date).toLocaleDateString('ko-KR')}</span>}
            </div>
            {detail.memo && <div style={{ marginBottom: 16, color: '#666' }}>{detail.memo}</div>}

            {/* 결제 정보 섹션 (DRAFT/CANCELLED 제외) */}
            {!['DRAFT', 'CANCELLED'].includes(detail.status) && (
              <div style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Typography.Text strong><DollarOutlined style={{ marginRight: 6 }} />결제 정보</Typography.Text>
                  {detail.total_amount ? (
                    <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>
                      총 계약금액: {fmtNum(Number(detail.total_amount))}원
                    </Tag>
                  ) : (
                    <span style={{ fontSize: 12, color: '#999' }}>생산시작 시 금액이 설정됩니다</span>
                  )}
                </div>
                {detail.total_amount ? (
                  <>
                    <Row gutter={12} style={{ marginBottom: 12 }}>
                      <Col span={6}>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <DollarOutlined /> 선지급
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: detail.advance_status === 'PAID' ? '#1890ff' : '#ccc' }}>
                            {detail.advance_status === 'PAID' ? `${fmtNum(Number(detail.advance_amount || 0))}원` : '대기'}
                          </div>
                          {detail.advance_status === 'PAID' && detail.advance_date && (
                            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                              {new Date(detail.advance_date).toLocaleDateString('ko-KR')}
                            </div>
                          )}
                          {detail.advance_rate != null && detail.advance_status === 'PAID' && (
                            <Tag color="blue" style={{ fontSize: 10, marginTop: 4 }}>{detail.advance_rate}%</Tag>
                          )}
                        </div>
                      </Col>
                      <Col span={6}>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <AuditOutlined /> 검수
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: detail.inspect_status === 'PASS' ? '#52c41a' : detail.inspect_status === 'FAIL' ? '#ff4d4f' : '#ccc' }}>
                            {detail.inspect_status === 'PASS' ? '합격' : detail.inspect_status === 'FAIL' ? '불합격' : '대기'}
                          </div>
                          {detail.inspect_status === 'PASS' && detail.inspect_qty != null && (
                            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{fmtNum(detail.inspect_qty)}개</div>
                          )}
                          {detail.inspect_date && (
                            <div style={{ fontSize: 11, color: '#999' }}>{new Date(detail.inspect_date).toLocaleDateString('ko-KR')}</div>
                          )}
                        </div>
                      </Col>
                      <Col span={6}>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <BankOutlined /> 잔금
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: detail.balance_status === 'PAID' ? '#13c2c2' : '#ccc' }}>
                            {detail.balance_status === 'PAID' ? `${fmtNum(Number(detail.balance_amount || 0))}원` : detail.balance_amount ? `${fmtNum(Number(detail.balance_amount))}원` : '대기'}
                          </div>
                          {detail.balance_status === 'PAID' && detail.balance_date && (
                            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                              {new Date(detail.balance_date).toLocaleDateString('ko-KR')}
                            </div>
                          )}
                          {detail.balance_status !== 'PAID' && detail.balance_amount != null && Number(detail.balance_amount) > 0 && (
                            <Tag color="orange" style={{ fontSize: 10, marginTop: 4 }}>미지급</Tag>
                          )}
                        </div>
                      </Col>
                      <Col span={6}>
                        <div style={{ textAlign: 'center', padding: '8px 4px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <FileDoneOutlined /> 정산
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: detail.settle_status === 'SETTLED' ? '#52c41a' : '#ccc' }}>
                            {detail.settle_status === 'SETTLED' ? '완료' : '미정산'}
                          </div>
                        </div>
                      </Col>
                    </Row>
                    <Steps
                      size="small"
                      current={
                        detail.settle_status === 'SETTLED' ? 4 :
                        detail.balance_status === 'PAID' ? 3 :
                        detail.inspect_status === 'PASS' ? 2 :
                        detail.advance_status === 'PAID' ? 1 : 0
                      }
                      items={[
                        { title: '선지급', icon: <DollarOutlined /> },
                        { title: '검수', icon: <AuditOutlined /> },
                        { title: '잔금', icon: <BankOutlined /> },
                        { title: '정산', icon: <FileDoneOutlined /> },
                      ]}
                    />
                  </>
                ) : null}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Typography.Text strong>품목 목록</Typography.Text>
              <Space>
                <Tag color="blue">총 {(detail.items || []).reduce((s, i) => s + i.plan_qty, 0).toLocaleString()}개</Tag>
                <Tag color="gold">비용 {fmtNum(detailTotalCost)}원</Tag>
                {detail.status === 'IN_PRODUCTION' && (
                  <Button size="small" type="primary" icon={<CheckOutlined />}
                    onClick={handleSaveQty} loading={qtySubmitting}>
                    생산수량 저장
                  </Button>
                )}
              </Space>
            </div>

            {/* 카테고리별 그룹핑 표시 */}
            <Collapse
              defaultActiveKey={detailGrouped.map(g => g.category)}
              style={{ marginBottom: 16 }}
              items={detailGrouped.map(({ category, items }) => {
                const catQty = items.reduce((s: number, i: any) => s + i.plan_qty, 0);
                const catCost = items.reduce((s: number, i: any) => s + (i.plan_qty || 0) * (i.unit_cost || 0), 0);
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
                        { title: '원가(원)', dataIndex: 'unit_cost', key: 'cost', width: 100,
                          render: (v: number) => v ? `${fmtNum(v)}원` : '-' },
                        { title: '금액', key: 'amount', width: 110, render: (_: any, r: any) => {
                          const amt = (r.plan_qty || 0) * (r.unit_cost || 0);
                          return amt > 0 ? <strong>{fmtNum(amt)}원</strong> : '-';
                        }},
                        { title: '생산량', key: 'prod', width: 110, render: (_: any, r: any) => {
                          if (detail?.status === 'IN_PRODUCTION') {
                            const idx = editItems.findIndex(e => e.item_id === r.item_id);
                            return (
                              <InputNumber
                                min={0} max={r.plan_qty}
                                value={idx >= 0 ? editItems[idx].produced_qty : (r.produced_qty || 0)}
                                onChange={(v) => {
                                  setEditItems(prev => {
                                    const next = [...prev];
                                    const i = next.findIndex(e => e.item_id === r.item_id);
                                    if (i >= 0) next[i] = { ...next[i], produced_qty: v || 0 };
                                    return next;
                                  });
                                }}
                                style={{ width: '100%' }}
                                size="small"
                              />
                            );
                          }
                          return fmtNum(r.produced_qty || 0);
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
              {detail.status === 'COMPLETED' && detail.settle_status !== 'SETTLED' && detail.balance_status === 'PAID' && (
                <Popconfirm title="정산 완료 처리하시겠습니까?" onConfirm={() => handleSettle(detail.plan_id)}>
                  <Button icon={<FileDoneOutlined />} type="primary">정산완료</Button>
                </Popconfirm>
              )}
              {detail.status === 'DRAFT' && (
                <Button style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }} icon={<PlayCircleOutlined />}
                  onClick={() => openAdvanceModal(detail.plan_id, detailTotalCost)}>생산시작</Button>
              )}
              {detail.status === 'IN_PRODUCTION' && (
                <Button type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => openBalanceModal(detail.plan_id)}>완료처리</Button>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* 선지급 모달 */}
      <Modal
        title="선지급 처리 (생산시작)"
        open={advanceOpen}
        onCancel={() => setAdvanceOpen(false)}
        onOk={handleAdvanceSubmit}
        confirmLoading={advanceLoading}
        okText="생산시작 + 선지급"
        width={480}
      >
        <Form form={advanceForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="total_amount" label="총 계약금액 (원)" rules={[{ required: true, message: '계약금액을 입력해주세요' }]}>
            <InputNumber style={{ width: '100%' }} min={0}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => Number((v || '').replace(/,/g, ''))}
              onChange={(v) => {
                const rate = advanceForm.getFieldValue('advance_rate') || 30;
                advanceForm.setFieldValue('advance_amount', Math.round((Number(v) || 0) * rate / 100));
              }}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="advance_rate" label="선지급 비율 (%)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%"
                  onChange={(v) => {
                    const total = advanceForm.getFieldValue('total_amount') || 0;
                    advanceForm.setFieldValue('advance_amount', Math.round(total * (Number(v) || 0) / 100));
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="advance_amount" label="선지급 금액 (원)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v: any) => Number((v || '').replace(/,/g, ''))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="advance_date" label="선지급일" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 잔금+완료 모달 */}
      <Modal
        title="잔금 지급 + 완료처리"
        open={balanceOpen}
        onCancel={() => setBalanceOpen(false)}
        onOk={handleBalanceSubmit}
        confirmLoading={balanceLoading}
        okText="잔금지급 + 완료처리"
        width={480}
      >
        {balancePlan && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
              <Row gutter={[12, 8]}>
                <Col span={12}><span style={{ color: '#888', fontSize: 12 }}>계획번호</span><div style={{ fontWeight: 600 }}>{balancePlan.plan_no}</div></Col>
                <Col span={12}><span style={{ color: '#888', fontSize: 12 }}>계획명</span><div style={{ fontWeight: 600 }}>{balancePlan.plan_name}</div></Col>
                <Col span={12}><span style={{ color: '#888', fontSize: 12 }}>총 계약금액</span><div style={{ fontWeight: 600, color: '#1890ff' }}>{fmtNum(Number(balancePlan.total_amount) || 0)}원</div></Col>
                <Col span={12}><span style={{ color: '#888', fontSize: 12 }}>선지급 금액</span><div style={{ fontWeight: 600, color: '#52c41a' }}>{fmtNum(Number(balancePlan.advance_amount) || 0)}원</div></Col>
              </Row>
            </div>
            <div style={{ marginBottom: 16, padding: 12, background: '#e6f7ff', borderRadius: 8, border: '1px solid #91d5ff', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#1890ff', marginBottom: 4 }}>잔금 금액</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1890ff' }}>
                {fmtNum((Number(balancePlan.total_amount) || 0) - (Number(balancePlan.advance_amount) || 0))}원
              </div>
            </div>
            <Form form={balanceForm} layout="vertical">
              <Form.Item name="balance_date" label="잔금 지급일" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}
