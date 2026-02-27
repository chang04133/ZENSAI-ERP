import { useEffect, useState } from 'react';
import { Table, Button, Input, InputNumber, Space, Tag, Modal, Alert, Popconfirm, DatePicker, Tabs, Select, Radio, message, Tooltip } from 'antd';
import { SearchOutlined, FireOutlined, TagsOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { SIZE_ORDER } from '../../utils/size-order';
import dayjs from 'dayjs';

/* ── 사이즈 칩 시각화 ── */
function SizeChips({ sizeDetail }: { sizeDetail?: Array<{ size: string; stock: number }> }) {
  if (!sizeDetail || sizeDetail.length === 0) return <span style={{ color: '#aaa' }}>-</span>;
  const stocked = sizeDetail.filter((s) => s.stock > 0);
  if (stocked.length === 0) return <span style={{ color: '#aaa' }}>전체 품절</span>;
  const minOrder = Math.min(...stocked.map((s) => SIZE_ORDER[s.size] ?? 99));
  const maxOrder = Math.max(...stocked.map((s) => SIZE_ORDER[s.size] ?? 0));

  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {sizeDetail.map((s) => {
        const order = SIZE_ORDER[s.size] ?? 99;
        const isBroken = s.stock === 0 && order > minOrder && order < maxOrder;
        return (
          <Tag
            key={s.size}
            color={s.stock > 0 ? 'green' : isBroken ? 'red' : 'default'}
            style={{ fontSize: 11, margin: 0, lineHeight: '18px', padding: '0 4px' }}
          >
            {s.size}({s.stock})
          </Tag>
        );
      })}
    </div>
  );
}

export default function EventProductsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [activeTab, setActiveTab] = useState('list');

  /* ═══════ 탭1: 행사 상품 목록 ═══════ */
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [fitFilter, setFitFilter] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkPrice, setBulkPrice] = useState<number | null>(null);
  const [editingPrices, setEditingPrices] = useState<Record<string, number | null>>({});

  /* ═══════ 매장 목록 ═══════ */
  const [partners, setPartners] = useState<any[]>([]);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeModalCode, setStoreModalCode] = useState<string>('');
  const [storeModalSelected, setStoreModalSelected] = useState<string[]>([]);
  const [bulkStoreModalOpen, setBulkStoreModalOpen] = useState(false);
  const [bulkStoreCodes, setBulkStoreCodes] = useState<string[]>([]);

  /* ═══════ 탭2: 행사 추천 ═══════ */
  const [recs, setRecs] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recCategory, setRecCategory] = useState<string>('');
  const [selectedRecKeys, setSelectedRecKeys] = useState<React.Key[]>([]);
  const [recApplyOpen, setRecApplyOpen] = useState(false);
  const [applyMode, setApplyMode] = useState<'rate' | 'fixed'>('rate');
  const [applyRate, setApplyRate] = useState<number>(30);
  const [applyFixed, setApplyFixed] = useState<number | null>(null);
  const [recStoreCodes, setRecStoreCodes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  /* ── 마스터 코드 로드 ── */
  useEffect(() => {
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setAllCategoryCodes(data);
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('FIT').then((data: any[]) => {
      setFitOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
  }, []);

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value);
    setSubCategoryFilter('');
    setPage(1);
    if (!value) { setSubCategoryOptions([]); return; }
    const parent = allCategoryCodes.find((c: any) => c.code_value === value && !c.parent_code);
    if (parent) {
      setSubCategoryOptions(
        allCategoryCodes.filter((c: any) => c.parent_code === parent.code_id && c.is_active)
          .map((c: any) => ({ label: c.code_label, value: c.code_value })),
      );
    } else {
      setSubCategoryOptions([]);
    }
  };

  /* ── 행사 상품 로드 ── */
  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (subCategoryFilter) params.sub_category = subCategoryFilter;
      if (seasonFilter) params.season = seasonFilter;
      if (fitFilter) params.fit = fitFilter;
      if (colorFilter) params.color = colorFilter;
      if (sizeFilter) params.size = sizeFilter;
      const result = await productApi.listEventProducts(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, categoryFilter, subCategoryFilter, seasonFilter, fitFilter, colorFilter, sizeFilter]);

  /* ── 매장 목록 로드 ── */
  useEffect(() => {
    partnerApi.list({ limit: '1000' }).then((r) => setPartners(r.data)).catch(() => {});
  }, []);

  /* ── 추천 로드 ── */
  const loadRecs = async () => {
    setRecLoading(true);
    try {
      const result = await productApi.eventRecommendations({
        category: recCategory || undefined,
      });
      setRecs(result);
      // 카테고리 목록 추출
      const cats = [...new Set(result.map((r: any) => r.category).filter(Boolean))] as string[];
      if (cats.length > 0 && categories.length === 0) setCategories(cats);
    } catch (e: any) { message.error(e.message); }
    finally { setRecLoading(false); }
  };

  useEffect(() => { if (activeTab === 'recommend') loadRecs(); }, [activeTab, recCategory]);

  /* ── 기존 행사 기능들 ── */
  const handleSearch = () => { setPage(1); load(1); };

  const handlePriceBlur = async (code: string) => {
    const newPrice = editingPrices[code];
    if (newPrice === undefined) return;
    try {
      await productApi.updateEventPrice(code, newPrice);
      message.success('행사가가 수정되었습니다.');
      setEditingPrices((prev) => { const next = { ...prev }; delete next[code]; return next; });
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDateChange = async (code: string, type: 'start' | 'end', date: any) => {
    try {
      const item = data.find((d: any) => d.product_code === code);
      const startDate = type === 'start' ? (date ? date.format('YYYY-MM-DD') : null) : (item?.event_start_date || null);
      const endDate = type === 'end' ? (date ? date.format('YYYY-MM-DD') : null) : (item?.event_end_date || null);
      await productApi.updateEventPrice(code, item?.event_price, startDate, endDate);
      message.success('행사 기간이 수정되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleClearSingle = async (code: string) => {
    try {
      await productApi.updateEventPrice(code, null);
      message.success('행사가가 해제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleBulkClear = async () => {
    const updates = selectedRowKeys.map((key) => ({ product_code: key as string, event_price: null as number | null }));
    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품의 행사가가 해제되었습니다.`);
      setSelectedRowKeys([]);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleBulkSet = async () => {
    if (!bulkPrice || bulkPrice <= 0) { message.error('행사가를 입력해주세요.'); return; }
    const updates = selectedRowKeys.map((key) => ({ product_code: key as string, event_price: bulkPrice }));
    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품의 행사가가 설정되었습니다.`);
      setSelectedRowKeys([]);
      setBulkModalOpen(false);
      setBulkPrice(null);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 매장 설정 (개별) ── */
  const openStoreModal = (code: string, currentStores?: string[]) => {
    setStoreModalCode(code);
    setStoreModalSelected(currentStores || []);
    setStoreModalOpen(true);
  };

  const handleStoreSave = async () => {
    try {
      const item = data.find((d: any) => d.product_code === storeModalCode);
      await productApi.updateEventPrice(
        storeModalCode, item?.event_price,
        item?.event_start_date || null, item?.event_end_date || null,
        storeModalSelected.length > 0 ? storeModalSelected : null,
      );
      message.success('행사 매장이 설정되었습니다.');
      setStoreModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 매장 일괄 설정 ── */
  const handleBulkStoreSet = async () => {
    try {
      for (const key of selectedRowKeys) {
        const item = data.find((d: any) => d.product_code === key);
        await productApi.updateEventPrice(
          key as string, item?.event_price,
          item?.event_start_date || null, item?.event_end_date || null,
          bulkStoreCodes.length > 0 ? bulkStoreCodes : null,
        );
      }
      message.success(`${selectedRowKeys.length}개 상품의 행사 매장이 설정되었습니다.`);
      setBulkStoreModalOpen(false);
      setBulkStoreCodes([]);
      setSelectedRowKeys([]);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 추천 → 행사가 일괄 적용 ── */
  const handleRecApply = async () => {
    const selected = recs.filter((r) => selectedRecKeys.includes(r.product_code));
    if (selected.length === 0) return;

    let updates: Array<{ product_code: string; event_price: number | null }>;
    if (applyMode === 'rate') {
      if (!applyRate || applyRate <= 0 || applyRate >= 100) { message.error('할인율을 1~99 사이로 입력해주세요.'); return; }
      updates = selected.map((r) => ({
        product_code: r.product_code,
        event_price: Math.round(Number(r.base_price) * (1 - applyRate / 100) / 100) * 100,
      }));
    } else {
      if (!applyFixed || applyFixed <= 0) { message.error('행사가를 입력해주세요.'); return; }
      updates = selected.map((r) => ({ product_code: r.product_code, event_price: applyFixed }));
    }

    try {
      await productApi.bulkUpdateEventPrices(updates, recStoreCodes.length > 0 ? recStoreCodes : null);
      message.success(`${updates.length}개 상품에 행사가가 설정되었습니다.`);
      setSelectedRecKeys([]);
      setRecApplyOpen(false);
      setRecStoreCodes([]);
      loadRecs();
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ═══════ 탭1 컬럼 ═══════ */
  const columns = [
    {
      title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 160,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 100 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90 },
    {
      title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 110,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    {
      title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 110,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    {
      title: '행사가', dataIndex: 'event_price', key: 'event_price', width: 140,
      render: (v: number, record: any) => {
        if (!canWrite) return <span style={{ color: '#fa8c16', fontWeight: 600 }}>{Number(v).toLocaleString()}원</span>;
        const editVal = editingPrices[record.product_code];
        return (
          <InputNumber
            size="small" min={0}
            value={editVal !== undefined ? editVal : Number(v)}
            style={{ width: 120, color: '#fa8c16' }}
            formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
            parser={(val) => Number((val || '').replace(/,/g, ''))}
            onChange={(val) => setEditingPrices((prev) => ({ ...prev, [record.product_code]: val }))}
            onBlur={() => handlePriceBlur(record.product_code)}
            onPressEnter={() => handlePriceBlur(record.product_code)}
          />
        );
      },
    },
    {
      title: '할인율', key: 'discount_rate', width: 80,
      render: (_: any, record: any) => {
        const base = Number(record.base_price);
        const event = Number(record.event_price);
        if (!base || !event) return '-';
        const rate = Math.round((1 - event / base) * 100);
        return <Tag color={rate >= 30 ? 'red' : rate >= 10 ? 'orange' : 'default'}>{rate}%</Tag>;
      },
    },
    {
      title: '시작일', dataIndex: 'event_start_date', key: 'event_start_date', width: 130,
      render: (v: string, record: any) => {
        if (!canWrite) return v ? dayjs(v).format('YYYY-MM-DD') : '-';
        return (
          <DatePicker size="small" value={v ? dayjs(v) : null}
            onChange={(d) => handleDateChange(record.product_code, 'start', d)}
            placeholder="시작일" style={{ width: 120 }} />
        );
      },
    },
    {
      title: '종료일', dataIndex: 'event_end_date', key: 'event_end_date', width: 130,
      render: (v: string, record: any) => {
        const expired = v && dayjs(v).isBefore(dayjs(), 'day');
        if (!canWrite) return v ? <span style={expired ? { color: '#ff4d4f' } : {}}>{dayjs(v).format('YYYY-MM-DD')}{expired ? ' (만료)' : ''}</span> : '-';
        return (
          <DatePicker size="small" value={v ? dayjs(v) : null}
            onChange={(d) => handleDateChange(record.product_code, 'end', d)}
            placeholder="종료일" style={{ width: 120 }} status={expired ? 'error' : undefined} />
        );
      },
    },
    {
      title: '행사 매장', dataIndex: 'event_store_codes', key: 'event_store_codes', width: 160,
      render: (v: string[], record: any) => {
        const codes = v || [];
        const label = codes.length === 0
          ? <Tag color="blue">전체 매장</Tag>
          : (
            <Tooltip title={codes.map((c) => {
              const p = partners.find((pp: any) => pp.partner_code === c);
              return p ? p.partner_name : c;
            }).join(', ')}>
              <span>
                {codes.slice(0, 2).map((c) => {
                  const p = partners.find((pp: any) => pp.partner_code === c);
                  return <Tag key={c} style={{ fontSize: 11, margin: '0 2px 2px 0', padding: '0 4px' }}>{p ? p.partner_name : c}</Tag>;
                })}
                {codes.length > 2 && <Tag style={{ fontSize: 11, margin: 0, padding: '0 4px' }}>+{codes.length - 2}</Tag>}
              </span>
            </Tooltip>
          );
        return canWrite ? (
          <span style={{ cursor: 'pointer' }} onClick={() => openStoreModal(record.product_code, codes)}>
            {label}
          </span>
        ) : label;
      },
    },
    {
      title: '재고', dataIndex: 'total_inv_qty', key: 'total_inv_qty', width: 80,
      render: (v: number) => {
        const qty = Number(v || 0);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 80,
      render: (_: any, record: any) => (
        <Popconfirm title="행사가를 해제하시겠습니까?" onConfirm={() => handleClearSingle(record.product_code)}>
          <Button size="small" danger>해제</Button>
        </Popconfirm>
      ),
    }] : []),
  ];

  /* ═══════ 탭2 컬럼 ═══════ */
  const recColumns = [
    {
      title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 150,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 160, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80 },
    {
      title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 100, align: 'right' as const,
      render: (v: number) => v ? `${Number(v).toLocaleString()}` : '-',
    },
    {
      title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 100, align: 'right' as const,
      render: (v: number) => v ? `${Number(v).toLocaleString()}` : '-',
    },
    {
      title: '총재고', dataIndex: 'total_stock', key: 'total_stock', width: 70, align: 'right' as const,
      render: (v: number) => {
        const n = Number(v || 0);
        return <span style={{ color: n <= 5 ? '#ff4d4f' : n <= 20 ? '#fa8c16' : '#333', fontWeight: 600 }}>{n}</span>;
      },
    },
    {
      title: '판매량', dataIndex: 'total_sold', key: 'total_sold', width: 70, align: 'right' as const,
      render: (v: number) => <span style={{ color: Number(v || 0) === 0 ? '#ff4d4f' : '#333' }}>{Number(v || 0)}</span>,
    },
    {
      title: '사이즈 현황', key: 'size_detail', width: 200,
      render: (_: any, record: any) => <SizeChips sizeDetail={record.size_detail} />,
    },
    {
      title: '깨짐', dataIndex: 'broken_count', key: 'broken_count', width: 55, align: 'center' as const,
      render: (v: number) => {
        const n = Number(v || 0);
        return n > 0 ? <Tag color="red">{n}</Tag> : <span style={{ color: '#ccc' }}>0</span>;
      },
    },
    {
      title: '추천점수', dataIndex: 'recommendation_score', key: 'recommendation_score', width: 85, align: 'center' as const,
      sorter: (a: any, b: any) => Number(a.recommendation_score) - Number(b.recommendation_score),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => {
        const n = Number(v || 0);
        const color = n >= 70 ? '#ff4d4f' : n >= 40 ? '#fa8c16' : '#1890ff';
        return <span style={{ color, fontWeight: 700, fontSize: 14 }}>{n}</span>;
      },
    },
  ];

  /* ═══════ 탭1 콘텐츠 ═══════ */
  const listTab = (
    <>
      {!canWrite && (
        <Alert
          message="현재 행사가가 설정된 상품 목록입니다. 매출등록 시 '행사' 유형을 선택하면 행사가가 자동 적용됩니다."
          type="info" showIcon style={{ marginBottom: 16 }}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />}
            value={search} onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch} style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...categoryOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>세부</div>
          <Select value={subCategoryFilter} onChange={(v) => { setSubCategoryFilter(v); setPage(1); }} style={{ width: 140 }}
            options={[{ label: '전체 보기', value: '' }, ...subCategoryOptions]} disabled={!categoryFilter} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={seasonFilter} onChange={(v) => { setSeasonFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[
              { label: '전체 보기', value: '' },
              { label: '26 봄/가을', value: '2026SA' }, { label: '26 여름', value: '2026SM' }, { label: '26 겨울', value: '2026WN' },
              { label: '25 봄/가을', value: '2025SA' }, { label: '25 여름', value: '2025SM' }, { label: '25 겨울', value: '2025WN' },
            ]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>핏</div>
          <Select value={fitFilter} onChange={(v) => { setFitFilter(v); setPage(1); }} style={{ width: 130 }}
            options={[{ label: '전체 보기', value: '' }, ...fitOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select showSearch optionFilterProp="label" value={colorFilter}
            onChange={(v) => { setColorFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...colorOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select showSearch optionFilterProp="label" value={sizeFilter}
            onChange={(v) => { setSizeFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체 보기', value: '' }, ...sizeOptions]} /></div>
        <Button onClick={handleSearch}>조회</Button>
      </div>

      {canWrite && selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <Popconfirm title={`${selectedRowKeys.length}개 상품의 행사가를 해제하시겠습니까?`} onConfirm={handleBulkClear}>
            <Button danger>선택 행사가 해제 ({selectedRowKeys.length})</Button>
          </Popconfirm>
          <Button type="primary" onClick={() => { setBulkPrice(null); setBulkModalOpen(true); }}>
            선택 행사가 설정 ({selectedRowKeys.length})
          </Button>
          <Button icon={<ShopOutlined />} onClick={() => { setBulkStoreCodes([]); setBulkStoreModalOpen(true); }}>
            선택 매장 설정 ({selectedRowKeys.length})
          </Button>
        </Space>
      )}

      <Table
        rowSelection={canWrite ? { selectedRowKeys, onChange: setSelectedRowKeys } : undefined}
        columns={columns} dataSource={data} rowKey="product_code"
        loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        title={() => (
          <span style={{ color: '#888', fontSize: 12 }}>
            event_price 설정 상품 · 매출등록 시 '행사' 유형 선택 → 행사가 자동 적용 · 기간/매장 지정 가능
          </span>
        )}
      />
    </>
  );

  /* ═══════ 탭2 콘텐츠 ═══════ */
  const recommendTab = (
    <>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Select
          placeholder="카테고리 필터"
          allowClear
          value={recCategory || undefined}
          onChange={(v) => setRecCategory(v || '')}
          style={{ width: 160 }}
          options={categories.map((c) => ({ label: c, value: c }))}
        />
        <Button onClick={loadRecs} loading={recLoading}>새로고침</Button>
        {canWrite && selectedRecKeys.length > 0 && (
          <Button type="primary" icon={<FireOutlined />}
            onClick={() => { setApplyMode('rate'); setApplyRate(30); setApplyFixed(null); setRecStoreCodes([]); setRecApplyOpen(true); }}>
            선택 상품 행사가 설정 ({selectedRecKeys.length})
          </Button>
        )}
        <span style={{ color: '#888', fontSize: 12 }}>
          <Tag color="green" style={{ fontSize: 11 }}>재고있음</Tag>
          <Tag color="red" style={{ fontSize: 11 }}>깨짐(중간품절)</Tag>
          <Tag style={{ fontSize: 11 }}>품절(양끝)</Tag>
        </span>
      </div>

      <Table
        rowSelection={canWrite ? { selectedRowKeys: selectedRecKeys, onChange: setSelectedRecKeys } : undefined}
        columns={recColumns} dataSource={recs} rowKey="product_code"
        loading={recLoading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        title={() => (
          <span style={{ color: '#888', fontSize: 12 }}>
            사이즈 깨짐(60%) + 저판매(40%) 가중 점수 · 365일 판매 기반 · 판매중 & 행사가 미설정 · FREE 사이즈 제외 · 점수 내림차순 · 최대 50건
          </span>
        )}
      />
    </>
  );

  return (
    <div>
      <PageHeader title="행사 상품" />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'list', label: <span><TagsOutlined /> 행사 상품</span>, children: listTab },
          { key: 'recommend', label: <span><FireOutlined /> 행사 추천</span>, children: recommendTab },
        ]}
      />

      {/* 기존 행사가 일괄 설정 모달 */}
      <Modal
        title={`선택 상품 행사가 일괄 설정 (${selectedRowKeys.length}개)`}
        open={bulkModalOpen} onOk={handleBulkSet}
        onCancel={() => setBulkModalOpen(false)} okText="적용" cancelText="취소"
      >
        <div style={{ marginBottom: 12 }}>선택된 {selectedRowKeys.length}개 상품에 동일한 행사가를 설정합니다.</div>
        <InputNumber
          value={bulkPrice} onChange={(v) => setBulkPrice(v)}
          placeholder="행사가 입력" style={{ width: '100%' }} min={0}
          formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
          parser={(val) => Number((val || '').replace(/,/g, ''))}
          addonAfter="원"
        />
      </Modal>

      {/* 개별 매장 선택 모달 */}
      <Modal
        title={`행사 매장 설정 - ${storeModalCode}`}
        open={storeModalOpen}
        onOk={handleStoreSave}
        onCancel={() => setStoreModalOpen(false)}
        okText="저장" cancelText="취소"
        width={480}
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          매장을 선택하지 않으면 전체 매장에 적용됩니다.
        </div>
        <Select
          mode="multiple"
          placeholder="행사 적용 매장 선택 (미선택 시 전체)"
          value={storeModalSelected}
          onChange={setStoreModalSelected}
          style={{ width: '100%' }}
          options={partners.map((p: any) => ({ label: `${p.partner_name} (${p.partner_type})`, value: p.partner_code }))}
          filterOption={(input, option) =>
            (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
          }
          maxTagCount={5}
          allowClear
        />
      </Modal>

      {/* 일괄 매장 설정 모달 */}
      <Modal
        title={`행사 매장 일괄 설정 (${selectedRowKeys.length}개 상품)`}
        open={bulkStoreModalOpen}
        onOk={handleBulkStoreSet}
        onCancel={() => setBulkStoreModalOpen(false)}
        okText="적용" cancelText="취소"
        width={480}
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          선택된 {selectedRowKeys.length}개 상품에 동일한 행사 매장을 설정합니다.<br />
          매장을 선택하지 않으면 전체 매장에 적용됩니다.
        </div>
        <Select
          mode="multiple"
          placeholder="행사 적용 매장 선택 (미선택 시 전체)"
          value={bulkStoreCodes}
          onChange={setBulkStoreCodes}
          style={{ width: '100%' }}
          options={partners.map((p: any) => ({ label: `${p.partner_name} (${p.partner_type})`, value: p.partner_code }))}
          filterOption={(input, option) =>
            (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
          }
          maxTagCount={5}
          allowClear
        />
      </Modal>

      {/* 추천 → 행사가 적용 모달 */}
      <Modal
        title={`추천 상품 행사가 설정 (${selectedRecKeys.length}개)`}
        open={recApplyOpen}
        onOk={handleRecApply}
        onCancel={() => setRecApplyOpen(false)}
        okText="행사가 적용"
        cancelText="취소"
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          선택된 <strong>{selectedRecKeys.length}</strong>개 상품에 행사가를 설정합니다.
        </div>

        <Radio.Group value={applyMode} onChange={(e) => setApplyMode(e.target.value)}
          style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
          <Radio value="rate">할인율 적용</Radio>
          <Radio value="fixed">고정 행사가</Radio>
        </Radio.Group>

        {applyMode === 'rate' ? (
          <div>
            <InputNumber
              min={1} max={99} value={applyRate}
              onChange={(v) => v !== null && setApplyRate(v)}
              addonAfter="% 할인"
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#666' }}>
              <div>각 상품의 기본가 기준 {applyRate}% 할인가 적용 (100원 단위 반올림)</div>
              {selectedRecKeys.length > 0 && selectedRecKeys.length <= 5 && (
                <div style={{ marginTop: 6 }}>
                  {recs.filter((r) => selectedRecKeys.includes(r.product_code)).map((r) => (
                    <div key={r.product_code}>
                      {r.product_code}: {Number(r.base_price).toLocaleString()}원 → <strong>{(Math.round(Number(r.base_price) * (1 - applyRate / 100) / 100) * 100).toLocaleString()}원</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <InputNumber
            min={0} value={applyFixed}
            onChange={(v) => setApplyFixed(v)}
            placeholder="행사가 입력"
            style={{ width: '100%' }}
            formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
            parser={(val) => Number((val || '').replace(/,/g, ''))}
            addonAfter="원"
          />
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}><ShopOutlined /> 행사 매장 지정</div>
          <Select
            mode="multiple"
            placeholder="행사 적용 매장 선택 (미선택 시 전체)"
            value={recStoreCodes}
            onChange={setRecStoreCodes}
            style={{ width: '100%' }}
            options={partners.map((p: any) => ({ label: `${p.partner_name} (${p.partner_type})`, value: p.partner_code }))}
            filterOption={(input, option) =>
              (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
            }
            maxTagCount={3}
            allowClear
          />
          <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>미선택 시 전체 매장에 적용됩니다.</div>
        </div>
      </Modal>
    </div>
  );
}
