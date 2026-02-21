import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Card, Select, InputNumber, Button, Space, Statistic, Row, Col, Tag,
  Modal, Input, Popconfirm, Switch, message, Tooltip,
} from 'antd';
import {
  SaveOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  CaretRightOutlined, CaretDownOutlined, FundOutlined, CopyOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { fundApi } from '../../modules/fund/fund.api';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const ML = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

interface Category {
  category_id: number; category_name: string; plan_type: string;
  sort_order: number; parent_id: number | null; is_active: boolean;
}
interface PlanEntry {
  fund_plan_id?: number; plan_year: number; plan_month: number; category_id: number;
  plan_amount: number; actual_amount: number; memo?: string;
  category_name?: string; parent_id?: number | null;
}

const cellKey = (catId: number, month: number) => `${catId}-${month}`;
const fmt = (v: number) => v.toLocaleString();

export default function FundPlanPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [categories, setCategories] = useState<Category[]>([]);
  const [planMap, setPlanMap] = useState<Record<string, PlanEntry>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showActual, setShowActual] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catParent, setCatParent] = useState<number | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId] = useState<number>(0);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, plans] = await Promise.all([fundApi.categories(), fundApi.list(year)]);
      setCategories(cats);
      const map: Record<string, PlanEntry> = {};
      for (const p of plans) map[cellKey(p.category_id, p.plan_month)] = p;
      setPlanMap(map);
      setDirty(false);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // 최상위(루트) 카테고리
  const rootCats = useMemo(() => categories.filter(c => !c.parent_id), [categories]);

  // 특정 부모의 자식들
  const childrenOf = useCallback(
    (pid: number) => categories.filter(c => c.parent_id === pid),
    [categories],
  );

  // 리프 노드 판별 (자식이 없는 항목)
  const isLeaf = useCallback(
    (catId: number) => !categories.some(c => c.parent_id === catId),
    [categories],
  );

  const toggle = (catId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const field: 'plan_amount' | 'actual_amount' = showActual ? 'actual_amount' : 'plan_amount';

  // 셀 수정
  const updateCell = (catId: number, month: number, f: 'plan_amount' | 'actual_amount', value: number) => {
    const key = cellKey(catId, month);
    setPlanMap(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        plan_year: year, plan_month: month, category_id: catId,
        plan_amount: prev[key]?.plan_amount || 0,
        actual_amount: prev[key]?.actual_amount || 0,
        [f]: value,
      },
    }));
    setDirty(true);
  };

  // 1월 값으로 12개월 전부 채우기
  const fillAllMonths = (catId: number) => {
    const val = planMap[cellKey(catId, 1)]?.[field] || 0;
    setPlanMap(prev => {
      const next = { ...prev };
      for (const m of MONTHS) {
        const key = cellKey(catId, m);
        next[key] = {
          ...next[key],
          plan_year: year, plan_month: m, category_id: catId,
          plan_amount: next[key]?.plan_amount || 0,
          actual_amount: next[key]?.actual_amount || 0,
          [field]: val,
        };
      }
      return next;
    });
    setDirty(true);
    message.success(`${fmt(val)} 으로 12개월 채움`);
  };

  // 재귀: 서브트리 월별 합계 (리프면 자기 값, 아니면 자식 합)
  const subtreeMonthTotal = useCallback(
    (catId: number, month: number, f: 'plan_amount' | 'actual_amount'): number => {
      if (isLeaf(catId)) return planMap[cellKey(catId, month)]?.[f] || 0;
      return childrenOf(catId).reduce((sum, c) => sum + subtreeMonthTotal(c.category_id, month, f), 0);
    },
    [planMap, isLeaf, childrenOf],
  );

  // 재귀: 서브트리 연간 합계
  const subtreeYearTotal = useCallback(
    (catId: number, f: 'plan_amount' | 'actual_amount'): number => {
      return MONTHS.reduce((sum, m) => sum + subtreeMonthTotal(catId, m, f), 0);
    },
    [subtreeMonthTotal],
  );

  // 전체 합계
  const grandTotal = useMemo(() => {
    let plan = 0, actual = 0;
    for (const cat of rootCats) {
      plan += subtreeYearTotal(cat.category_id, 'plan_amount');
      actual += subtreeYearTotal(cat.category_id, 'actual_amount');
    }
    return { plan, actual };
  }, [rootCats, subtreeYearTotal]);

  // 저장
  const handleSave = async () => {
    const items = Object.values(planMap).filter(p => p.plan_amount || p.actual_amount);
    if (items.length === 0) { message.warning('저장할 데이터가 없습니다.'); return; }
    setSaving(true);
    try {
      await fundApi.saveBatch(items.map(p => ({
        plan_year: p.plan_year || year, plan_month: p.plan_month,
        category_id: p.category_id, plan_amount: p.plan_amount || 0,
        actual_amount: p.actual_amount || 0, memo: p.memo,
      })));
      message.success('저장되었습니다.');
      setDirty(false); load();
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  const handleAddCategory = async () => {
    if (!catName.trim()) { message.warning('항목명을 입력하세요.'); return; }
    try {
      await fundApi.addCategory({ category_name: catName.trim(), parent_id: catParent });
      message.success('항목이 추가되었습니다.');
      setCatModal(false); setCatName(''); setCatParent(null);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleEditCategory = async () => {
    if (!editName.trim()) return;
    try {
      await fundApi.updateCategory(editId, { category_name: editName.trim() });
      message.success('수정되었습니다.');
      setEditModal(false); load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await fundApi.removeCategory(id);
      message.success('삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const openEdit = (cat: Category) => {
    setEditId(cat.category_id); setEditName(cat.category_name); setEditModal(true);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
    .map(y => ({ label: `${y}년`, value: y }));

  // 스타일
  const thS: React.CSSProperties = {
    padding: '6px 4px', fontSize: 11, fontWeight: 600, textAlign: 'center',
    borderBottom: '2px solid #1a3a6a', color: '#1a3a6a', background: '#e8edf5',
    whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  };
  const tdS: React.CSSProperties = {
    padding: '3px 2px', fontSize: 12, textAlign: 'right',
    borderBottom: '1px solid #eee', whiteSpace: 'nowrap',
  };

  // 아이콘 버튼 3개: 수정 / 채우기 / 삭제
  const renderActions = (cat: Category, depth: number, leaf: boolean) => (
    <span style={{ marginLeft: 6 }}>
      <EditOutlined style={{ fontSize: depth === 0 ? 11 : 10, color: '#999', cursor: 'pointer', marginRight: 3 }}
        onClick={(e) => { e.stopPropagation(); openEdit(cat); }} />
      {leaf && (
        <Tooltip title="1월 값으로 전체 채우기">
          <CopyOutlined style={{ fontSize: depth === 0 ? 11 : 10, color: '#1890ff', cursor: 'pointer', marginRight: 3 }}
            onClick={(e) => { e.stopPropagation(); fillAllMonths(cat.category_id); }} />
        </Tooltip>
      )}
      <Popconfirm title={`삭제하시겠습니까?${!leaf ? ' (하위 항목도 모두 삭제)' : ''}`}
        onConfirm={() => handleDeleteCategory(cat.category_id)}>
        <DeleteOutlined style={{ fontSize: depth === 0 ? 11 : 10, color: '#ff4d4f', cursor: 'pointer' }}
          onClick={(e) => e.stopPropagation()} />
      </Popconfirm>
    </span>
  );

  // 재귀 렌더: 한 노드 + 자식들
  const renderNode = (cat: Category, depth: number): React.ReactNode[] => {
    const kids = childrenOf(cat.category_id);
    const leaf = kids.length === 0;
    const isOpen = expanded.has(cat.category_id);
    const indent = 12 + depth * 20;
    const rowBg = depth === 0 ? '#f5f7fa' : depth % 2 === 0 ? '#f8f9fc' : '#fafbfe';
    const stickyBg = rowBg;

    const rows: React.ReactNode[] = [];

    // 이 노드의 행
    rows.push(
      <tr key={`n-${cat.category_id}`} style={{ background: rowBg }}>
        <td
          style={{
            ...tdS, textAlign: 'left', fontWeight: leaf ? 400 : 600,
            cursor: leaf ? 'default' : 'pointer', padding: `5px 8px 5px ${indent}px`,
            position: 'sticky', left: 0, background: stickyBg, zIndex: 1,
          }}
          onClick={leaf ? undefined : () => toggle(cat.category_id)}
        >
          {!leaf && (
            <span style={{ marginRight: 5, color: '#999', fontSize: 10 }}>
              {isOpen ? <CaretDownOutlined /> : <CaretRightOutlined />}
            </span>
          )}
          {leaf && depth > 0 && <span style={{ color: '#bbb', marginRight: 4 }}>&#8226;</span>}
          {cat.category_name}
          {renderActions(cat, depth, leaf)}
        </td>

        {/* 월별 셀 */}
        {MONTHS.map(m => {
          if (leaf) {
            return (
              <td key={m} style={tdS}>
                <InputNumber size="small" style={{ width: 90 }} controls={false}
                  value={planMap[cellKey(cat.category_id, m)]?.[field] || 0}
                  onChange={(v) => updateCell(cat.category_id, m, field, v || 0)}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number((v || '').replace(/,/g, ''))} />
              </td>
            );
          }
          const total = subtreeMonthTotal(cat.category_id, m, field);
          return (
            <td key={m} style={tdS}>
              <span style={{ fontWeight: 600, color: total > 0 ? '#333' : '#ccc' }}>{fmt(total)}</span>
            </td>
          );
        })}

        {/* 합계 */}
        <td style={{ ...tdS, fontWeight: leaf ? 500 : 700, background: '#f0f2f5', padding: '5px 8px' }}>
          {fmt(subtreeYearTotal(cat.category_id, field))}
        </td>
      </tr>,
    );

    // 펼쳤을 때 자식들 재귀 렌더
    if (!leaf && isOpen) {
      for (const kid of kids) {
        rows.push(...renderNode(kid, depth + 1));
      }
      // 하위 항목 추가 버튼
      rows.push(
        <tr key={`add-${cat.category_id}`} style={{ background: rowBg }}>
          <td colSpan={14} style={{ padding: `3px 8px 3px ${indent + 20}px`, borderBottom: '1px solid #eee' }}>
            <Button type="link" size="small" icon={<PlusOutlined />} style={{ fontSize: 11, color: '#999', padding: 0 }}
              onClick={() => { setCatParent(cat.category_id); setCatName(''); setCatModal(true); }}>
              하위항목 추가
            </Button>
          </td>
        </tr>,
      );
    }

    return rows;
  };

  // 합계 행
  const renderTotalRow = () => (
    <tr style={{ background: '#e8edf5' }}>
      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, padding: '6px 8px', position: 'sticky', left: 0, background: '#e8edf5', zIndex: 1 }}>
        합계
      </td>
      {MONTHS.map(m => {
        const total = rootCats.reduce((sum, cat) => sum + subtreeMonthTotal(cat.category_id, m, field), 0);
        return <td key={m} style={{ ...tdS, fontWeight: 700, color: '#1a3a6a' }}>{fmt(total)}</td>;
      })}
      <td style={{ ...tdS, fontWeight: 700, color: '#1a3a6a', background: '#dde3ee', padding: '6px 8px' }}>
        {fmt(field === 'plan_amount' ? grandTotal.plan : grandTotal.actual)}
      </td>
    </tr>
  );

  const rate = grandTotal.plan > 0 ? Math.round((grandTotal.actual / grandTotal.plan) * 100) : 0;

  return (
    <div>
      <PageHeader title="자금계획" extra={
        <Space>
          <Select value={year} options={yearOptions} onChange={setYear} style={{ width: 100 }} />
          <Switch checkedChildren="실적" unCheckedChildren="계획" checked={showActual} onChange={setShowActual} />
          <Button icon={<PlusOutlined />} onClick={() => { setCatParent(null); setCatName(''); setCatModal(true); }}>
            항목추가
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={!dirty}>
            저장
          </Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="지출 계획" value={grandTotal.plan} formatter={(v) => `${fmt(Number(v))}원`} prefix={<FundOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="지출 실적" value={grandTotal.actual} formatter={(v) => `${fmt(Number(v))}원`} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="달성률" value={rate} suffix="%" valueStyle={{ color: rate > 100 ? '#cf1322' : rate >= 80 ? '#fa8c16' : '#389e0d' }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              {grandTotal.actual > grandTotal.plan
                ? <Tag color="red">초과 {fmt(grandTotal.actual - grandTotal.plan)}원</Tag>
                : <Tag color="green">잔여 {fmt(grandTotal.plan - grandTotal.actual)}원</Tag>}
            </div>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300 }}>
            <thead>
              <tr>
                <th style={{ ...thS, textAlign: 'left', minWidth: 180, position: 'sticky', left: 0, background: '#e8edf5', zIndex: 2 }}>
                  지출 항목
                </th>
                {MONTHS.map(m => <th key={m} style={{ ...thS, minWidth: 95 }}>{ML[m - 1]}</th>)}
                <th style={thS}>합계</th>
              </tr>
            </thead>
            <tbody>
              {renderTotalRow()}
              {rootCats.map(cat => renderNode(cat, 0))}
              {rootCats.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                  지출 항목이 없습니다. 위의 "항목추가" 버튼으로 추가하세요.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal title={catParent ? '하위 항목 추가' : '지출 항목 추가'} open={catModal}
        onOk={handleAddCategory} onCancel={() => setCatModal(false)} okText="추가" cancelText="취소">
        <div style={{ marginBottom: 12 }}>
          {catParent && (
            <Tag color="blue" style={{ marginBottom: 8 }}>
              상위: {categories.find(c => c.category_id === catParent)?.category_name}
            </Tag>
          )}
          <Input placeholder="항목명 입력" value={catName} onChange={(e) => setCatName(e.target.value)}
            onPressEnter={handleAddCategory} autoFocus />
        </div>
      </Modal>

      <Modal title="항목명 수정" open={editModal}
        onOk={handleEditCategory} onCancel={() => setEditModal(false)} okText="저장" cancelText="취소">
        <Input value={editName} onChange={(e) => setEditName(e.target.value)}
          onPressEnter={handleEditCategory} autoFocus />
      </Modal>
    </div>
  );
}
