import { useEffect, useState, useRef } from 'react';
import {
  Table, Tag, Input, Spin, Button, AutoComplete, DatePicker,
  InputNumber, Select, Modal, Form, Segmented, message,
} from 'antd';
import { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';
import {
  InboxOutlined, SearchOutlined,
  PlusOutlined, EditOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { TX_TYPE_LABELS, TX_TYPE_COLORS, CAT_TAG_COLORS } from './InventoryStatusPage';

type AdjustViewMode = 'inventory' | 'history';

export function InventoryAdjust() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const [viewMode, setViewMode] = useState<AdjustViewMode>('inventory');
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();

  const [modalOpen, setModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [form] = Form.useForm();

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm] = Form.useForm();
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [txCache, setTxCache] = useState<Record<string, any[]>>({});
  const [txLoadingKeys, setTxLoadingKeys] = useState<string[]>([]);

  const [txData, setTxData] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txPartnerFilter, setTxPartnerFilter] = useState('');

  const handleAdjustCategoryChange = (value: string[]) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter.length) params.partner_code = partnerFilter.join(',');
      if (categoryFilter.length) params.category = categoryFilter.join(',');
      if (seasonFilter.length) params.season = seasonFilter.join(',');
      if (colorFilter.length) params.color = colorFilter.join(',');
      if (sizeFilter.length) params.size = sizeFilter.join(',');
      if (statusFilter.length) params.sale_status = statusFilter.join(',');
      if (yearFromFilter) params.year_from = yearFromFilter;
      if (yearToFilter) params.year_to = yearToFilter;
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadTx = async (p?: number) => {
    const currentPage = p ?? txPage;
    setTxLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (txSearch) params.search = txSearch;
      if (txTypeFilter) params.tx_type = txTypeFilter;
      if (txPartnerFilter) params.partner_code = txPartnerFilter;
      const result = await inventoryApi.transactions(params);
      setTxData(result.data);
      setTxTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setTxLoading(false); }
  };

  const loadItemTx = async (record: any) => {
    const key = `${record.partner_code}_${record.variant_id}`;
    if (txCache[key]) return;
    setTxLoadingKeys(prev => [...prev, key]);
    try {
      const result = await inventoryApi.transactions({
        partner_code: record.partner_code,
        variant_id: String(record.variant_id),
        limit: '5',
      });
      setTxCache(prev => ({ ...prev, [key]: result.data }));
    } catch (e: any) { message.error(e.message); }
    finally { setTxLoadingKeys(prev => prev.filter(k => k !== key)); }
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!value.trim()) { setSearchSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await productApi.searchSuggest(value);
        setSearchSuggestions(Array.isArray(data) ? data : []);
      } catch { setSearchSuggestions([]); }
    }, 300);
  };
  const onSearchSelect = (value: string) => { setSearch(value); setPage(1); load(1); };
  useEffect(() => () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); }, []);

  const loadPartners = async () => {
    try {
      const result = await partnerApi.list({ limit: '1000' });
      setPartners(result.data);
    } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
  };

  useEffect(() => { load(); }, [page, partnerFilter, categoryFilter, yearFromFilter, yearToFilter, seasonFilter, colorFilter, sizeFilter, statusFilter, dateRange]);
  useEffect(() => {
    loadPartners();
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('YEAR').then((data: any[]) => {
      setYearOptions(data.filter((c: any) => c.is_active).sort((a: any, b: any) => b.code_value.localeCompare(a.code_value)).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('SEASON').then((data: any[]) => {
      setSeasonOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
  }, []);
  useEffect(() => { if (viewMode === 'history') loadTx(); }, [viewMode, txPage, txTypeFilter, txPartnerFilter]);

  const openAdjust = (record: any) => {
    setAdjustTarget(record);
    form.resetFields();
    setModalOpen(true);
  };

  const handleAdjust = async (values: any) => {
    if (values.qty_change === 0) { message.warning('조정 수량은 0이 아니어야 합니다.'); return; }
    try {
      const result = await inventoryApi.adjust({
        partner_code: adjustTarget.partner_code,
        variant_id: adjustTarget.variant_id,
        qty_change: values.qty_change,
        memo: values.memo,
      });
      if (result.warning) { message.warning(result.warning); }
      else { message.success(`재고가 조정되었습니다. (변경: ${values.qty_change > 0 ? '+' : ''}${values.qty_change} → 현재: ${result.qty}개)`); }
      setModalOpen(false);
      const key = `${adjustTarget.partner_code}_${adjustTarget.variant_id}`;
      setTxCache(prev => { const next = { ...prev }; delete next[key]; return next; });
      if (expandedKeys.includes(adjustTarget.inventory_id)) loadItemTx(adjustTarget);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) {
      try {
        const results = await productApi.searchVariants(value);
        setVariantOptions(results);
      } catch (e: any) { message.error('품목 검색 실패: ' + e.message); }
    }
  };

  const handleNewInventory = async (values: any) => {
    try {
      const result = await inventoryApi.adjust({
        partner_code: values.partner_code,
        variant_id: values.variant_id,
        qty_change: values.qty,
        memo: values.memo || '신규 재고 등록',
      });
      message.success(`신규 재고가 등록되었습니다. (${result.qty}개)`);
      setNewModalOpen(false);
      newForm.resetFields();
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  const expandedRowRender = (record: any) => {
    const key = `${record.partner_code}_${record.variant_id}`;
    const items = txCache[key];
    const isLoading = txLoadingKeys.includes(key);
    if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '12px auto' }} />;
    if (!items || items.length === 0) {
      return (
        <div style={{ padding: '12px 16px', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>조정 이력이 없습니다.</span>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdjust(record)}>재고 조정</Button>
        </div>
      );
    }
    return (
      <div style={{ padding: '8px 0 8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}><HistoryOutlined /> 최근 조정이력</span>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdjust(record)}>재고 조정</Button>
        </div>
        <Table columns={[
          { title: '일시', dataIndex: 'created_at', key: 'time', width: 140, render: (v: string) => <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString('ko-KR')}</span> },
          { title: '유형', dataIndex: 'tx_type', key: 'type', width: 80, render: (v: string) => <Tag color={TX_TYPE_COLORS[v]}>{TX_TYPE_LABELS[v] || v}</Tag> },
          { title: '변동', dataIndex: 'qty_change', key: 'change', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>{v > 0 ? '+' : ''}{v}</span> },
          { title: '조정후', dataIndex: 'qty_after', key: 'after', width: 70, align: 'right' as const, render: (v: number) => <strong>{v}</strong> },
          { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true, render: (v: string) => <span style={{ fontSize: 12, color: '#666' }}>{v || '-'}</span> },
          { title: '작업자', dataIndex: 'created_by', key: 'user', width: 90, render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
        ]} dataSource={items} rowKey="tx_id" size="small" pagination={false} showHeader={true} />
      </div>
    );
  };

  const invColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 110, ellipsis: true,
      filters: [...new Set(data.map((d: any) => d.partner_name))] .map((v: any) => ({ text: v, value: v })),
      onFilter: (v: any, r: any) => r.partner_name === v },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => v || '-' },
    { title: '현재수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      render: (v: number) => { const qty = Number(v); const color = qty === 0 ? '#ff4d4f' : qty <= 5 ? '#faad14' : '#333'; return <strong style={{ color, fontSize: 14 }}>{qty.toLocaleString()}</strong>; },
      sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty) },
    { title: '조정', key: 'action', width: 70, align: 'center' as const,
      render: (_: any, record: any) => <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openAdjust(record); }}>조정</Button> },
  ];

  const txColumns = [
    { title: '일시', dataIndex: 'created_at', key: 'time', width: 155, render: (v: string) => new Date(v).toLocaleString('ko-KR'),
      sorter: (a: any, b: any) => a.created_at.localeCompare(b.created_at) },
    { title: '유형', dataIndex: 'tx_type', key: 'type', width: 85, render: (v: string) => <Tag color={TX_TYPE_COLORS[v]}>{TX_TYPE_LABELS[v] || v}</Tag> },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 110, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 140, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => v || '-' },
    { title: '변동', dataIndex: 'qty_change', key: 'change', width: 75, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>{v > 0 ? '+' : ''}{v}</span> },
    { title: '조정후', dataIndex: 'qty_after', key: 'after', width: 70, align: 'right' as const },
    { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true, render: (v: string) => v || '-' },
    { title: '작업자', dataIndex: 'created_by', key: 'user', width: 90 },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        {viewMode === 'inventory' && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간(등록일)</div>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(v) => { setDateRange(v as [Dayjs, Dayjs] | null); setPage(1); }}
              presets={datePresets}
              format="YYYY-MM-DD"
              allowClear
              style={{ width: 300 }}
            /></div>
        )}
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          {viewMode === 'inventory' ? (
            <AutoComplete value={search} onChange={onSearchChange} onSelect={onSearchSelect}
              style={{ width: '100%' }}
              options={searchSuggestions.map(s => ({
                value: s.product_code,
                label: <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</span>
                  <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>{s.product_code} · {s.category || '-'}</span>
                </div>,
              }))}>
              <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={() => { setPage(1); load(1); }} />
            </AutoComplete>
          ) : (
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />}
              value={txSearch} onChange={(e) => setTxSearch(e.target.value)}
              onPressEnter={() => { setTxPage(1); loadTx(1); }} style={{ width: '100%' }} />
          )}</div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          {viewMode === 'inventory' ? (
            <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
              value={partnerFilter} onChange={(v: string[]) => { setPartnerFilter(v); setPage(1); }}
              style={{ width: 180 }} placeholder="전체" options={partnerOptions} />
          ) : (
            <Select showSearch optionFilterProp="label" allowClear
              value={txPartnerFilter} onChange={(v) => { setTxPartnerFilter(v || ''); setTxPage(1); }}
              style={{ width: 180 }} placeholder="전체" options={partnerOptions} />
          )}</div>
        {viewMode === 'inventory' && (
          <>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
              <Select mode="multiple" maxTagCount="responsive" allowClear style={{ width: 140 }} value={categoryFilter}
                onChange={handleAdjustCategoryChange}
                placeholder="전체" options={categoryOptions} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
              <Select allowClear value={yearFromFilter} onChange={(v) => { setYearFromFilter(v || ''); setPage(1); }} style={{ width: 90 }}
                placeholder="전체" options={yearOptions} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
              <Select allowClear value={yearToFilter} onChange={(v) => { setYearToFilter(v || ''); setPage(1); }} style={{ width: 90 }}
                placeholder="전체" options={yearOptions} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
              <Select mode="multiple" maxTagCount="responsive" allowClear
                value={seasonFilter} onChange={(v: string[]) => { setSeasonFilter(v); setPage(1); }} style={{ width: 130 }}
                placeholder="전체" options={seasonOptions} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
              <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
                value={colorFilter} onChange={(v: string[]) => { setColorFilter(v); setPage(1); }} style={{ width: 140 }}
                placeholder="전체" options={colorOptions} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
              <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
                value={sizeFilter} onChange={(v: string[]) => { setSizeFilter(v); setPage(1); }} style={{ width: 130 }}
                placeholder="전체" options={sizeOptions} /></div>
            <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
              <Select mode="multiple" maxTagCount="responsive" allowClear
                value={statusFilter} onChange={(v: string[]) => { setStatusFilter(v); setPage(1); }} style={{ width: 140 }}
                placeholder="전체" options={[{ label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} /></div>
          </>
        )}
        {viewMode === 'history' && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
            <Select style={{ width: 120 }} value={txTypeFilter}
              onChange={(v) => { setTxTypeFilter(v); setTxPage(1); }}
              options={[{ label: '전체 보기', value: '' }, ...Object.entries(TX_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))]} /></div>
        )}
        <Button onClick={() => {
          if (viewMode === 'inventory') { setPage(1); load(1); }
          else { setTxPage(1); loadTx(1); }
        }}>조회</Button>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => {
            newForm.resetFields();
            setVariantOptions([]);
            if (isStore && user?.partnerCode) newForm.setFieldsValue({ partner_code: user.partnerCode });
            setNewModalOpen(true);
          }}>
          신규 재고 등록
        </Button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented value={viewMode} onChange={(v) => setViewMode(v as AdjustViewMode)}
          options={[
            { label: '재고현황', value: 'inventory', icon: <InboxOutlined /> },
            { label: '조정이력', value: 'history', icon: <HistoryOutlined /> },
          ]} size="small" />
      </div>

      {viewMode === 'inventory' && (
        <Table columns={invColumns} dataSource={data} rowKey="inventory_id" loading={loading} size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
          pagination={{ current: page, total, pageSize: 50, onChange: (p) => setPage(p), showTotal: (t) => `총 ${t}건`, size: 'small' }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpand: (expanded, record) => {
              if (expanded) { setExpandedKeys(prev => [...prev, record.inventory_id]); loadItemTx(record); }
              else { setExpandedKeys(prev => prev.filter(k => k !== record.inventory_id)); }
            },
            expandedRowRender,
          }} />
      )}
      {viewMode === 'history' && (
        <Table columns={txColumns} dataSource={txData} rowKey="tx_id" loading={txLoading} size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
          pagination={{ current: txPage, total: txTotal, pageSize: 50, onChange: (p) => setTxPage(p), showTotal: (t) => `총 ${t}건`, size: 'small' }} />
      )}

      {/* 조정 모달 */}
      <Modal title="재고 조정" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="조정" cancelText="취소">
        {adjustTarget && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ marginBottom: 4 }}><strong>거래처:</strong> {adjustTarget.partner_name}</div>
            <div style={{ marginBottom: 4 }}><strong>상품:</strong> {adjustTarget.product_name} ({adjustTarget.sku})</div>
            <div style={{ marginBottom: 4 }}><strong>색상/사이즈:</strong> {adjustTarget.color || '-'} / {adjustTarget.size || '-'}</div>
            <div><strong>현재수량:</strong> <span style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>{Number(adjustTarget.qty).toLocaleString()}</span></div>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleAdjust}>
          <Form.Item name="qty_change" label="조정 수량 (+ 증가 / - 감소)"
            rules={[
              { required: true, message: '수량을 입력해주세요' },
              { type: 'number', validator: (_, v) => v === 0 ? Promise.reject('0은 입력할 수 없습니다') : Promise.resolve() },
            ]}>
            <InputNumber style={{ width: '100%' }} placeholder="예: +10 또는 -5" />
          </Form.Item>
          <Form.Item name="memo" label="조정 사유">
            <Input.TextArea rows={2} placeholder="예: 재고실사 차이 보정, 파손 폐기 등" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 신규 재고 등록 모달 */}
      <Modal title="신규 재고 등록" open={newModalOpen} onCancel={() => setNewModalOpen(false)} onOk={() => newForm.submit()} okText="등록" cancelText="취소" width={600}>
        <Form form={newForm} layout="vertical" onFinish={handleNewInventory}>
          <Form.Item name="partner_code" label="거래처" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} disabled={isStore} />
          </Form.Item>
          <Form.Item name="variant_id" label="품목" rules={[{ required: true, message: '품목을 선택해주세요' }]}>
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} notFoundContent="2자 이상 입력해주세요">
              {variantOptions.map(v => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="qty" label="초기 수량" rules={[{ required: true, message: '수량을 입력해주세요' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="초기 재고 수량" />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="예: 초기입고, 매장이전 등" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
