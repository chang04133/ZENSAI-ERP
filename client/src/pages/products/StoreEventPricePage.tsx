import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Table, Button, Select, Space, DatePicker, InputNumber, message,
  Modal, Tag, Switch, Input, Empty, AutoComplete, Divider,
} from 'antd';
import {
  SearchOutlined, CalendarOutlined,
  BulbOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { codeApi } from '../../modules/code/code.api';
import { useCodeLabels } from '../../hooks/useCodeLabels';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface PartnerPriceRow {
  partner_code: string;
  event_price: number;
  event_start_date: string | null;
  event_end_date: string | null;
}

export default function StoreEventPricePage() {
  const { formatCode } = useCodeLabels();

  // ── 필터 ──
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [sortValue, setSortValue] = useState('created_at_DESC');

  // 필터 옵션
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);

  // 데이터
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);

  // 선택 상태
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [selectedProductsCache, setSelectedProductsCache] = useState<Record<string, any>>({});

  // 일괄 날짜 변경 모달
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [bulkDateRange, setBulkDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [dateSubmitting, setDateSubmitting] = useState(false);

  // 행사추천 모달
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recData, setRecData] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recCategory, setRecCategory] = useState('');

  // 단건 행사가 수정 모달
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [singleRecord, setSingleRecord] = useState<any>(null);
  const [singlePrice, setSinglePrice] = useState<number>(0);
  const [singleDateRange, setSingleDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [singleStores, setSingleStores] = useState<string[]>([]);
  const [singleAllStores, setSingleAllStores] = useState(true);
  const [singleSubmitting, setSingleSubmitting] = useState(false);

  // 거래처별 행사가 상태
  const [singlePriceMode, setSinglePriceMode] = useState<'uniform' | 'partner'>('uniform');
  const [partnerPrices, setPartnerPrices] = useState<PartnerPriceRow[]>([]);
  const [partnerPricesLoading, setPartnerPricesLoading] = useState(false);

  // 초기 로드
  useEffect(() => {
    partnerApi.list({ limit: '1000' }).then(r => {
      setPartners((r.data || []).filter((p: any) => p.partner_type !== '본사' && p.is_active));
    }).catch(() => {});
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('YEAR').then((data: any[]) => {
      setYearOptions(data.filter((c: any) => c.is_active).sort((a: any, b: any) => b.code_value.localeCompare(a.code_value)).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('SEASON').then((data: any[]) => {
      setSeasonOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((d: any) => {
      setColorOptions((d.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((d.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, []);

  const storeOptions = useMemo(() =>
    partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code })),
    [partners],
  );

  // 검색 자동완성
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

  const onSearchSelect = (value: string) => {
    setSearch(value);
    setPage(1);
    loadAll(1, value);
  };

  // 데이터 로드 (전체 상품)
  const loadAll = useCallback(async (p?: number, searchOverride?: string) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      const s = searchOverride !== undefined ? searchOverride : search;
      if (s.trim()) params.search = s.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (yearFromFilter) params.year_from = yearFromFilter;
      if (yearToFilter) params.year_to = yearToFilter;
      if (seasonFilter) params.season = seasonFilter;
      if (colorFilter) params.color = colorFilter;
      if (sizeFilter) params.size = sizeFilter;
      if (partnerFilter) params.partner_code = partnerFilter;
      const lastUnderscore = sortValue.lastIndexOf('_');
      params.orderBy = sortValue.substring(0, lastUnderscore);
      params.orderDir = sortValue.substring(lastUnderscore + 1);
      const result = await productApi.list(params);
      setData(result.data || []);
      setTotal(result.total || 0);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, categoryFilter, yearFromFilter, yearToFilter, seasonFilter, colorFilter, sizeFilter, partnerFilter, sortValue]);

  useEffect(() => { loadAll(); }, [page, categoryFilter, yearFromFilter, yearToFilter, seasonFilter, colorFilter, sizeFilter, partnerFilter, sortValue]);

  // 선택 캐시
  const handleRowSelect = (keys: string[]) => {
    setSelectedRowKeys(keys);
    setSelectedProductsCache(prev => {
      const next = { ...prev };
      data.forEach(d => { if (keys.includes(d.product_code)) next[d.product_code] = d; });
      Object.keys(next).forEach(k => { if (!keys.includes(k)) delete next[k]; });
      return next;
    });
  };

  const selectedProducts = useMemo(() =>
    selectedRowKeys.map(k => selectedProductsCache[k]).filter(Boolean),
    [selectedRowKeys, selectedProductsCache],
  );

  // ── 행사 ON/OFF 토글 ──
  const handleToggleEvent = async (record: any, checked: boolean) => {
    try {
      if (checked) {
        const price = record.discount_price || record.base_price || 0;
        await productApi.updateEventPrice(record.product_code, price);
        message.success(`${record.product_name} 행사 등록 (${Number(price).toLocaleString()}원)`);
      } else {
        await productApi.updateEventPrice(record.product_code, null, null, null, null);
        // 거래처별 행사가도 함께 삭제
        await productApi.saveEventPartnerPrices(record.product_code, []);
        message.success(`${record.product_name} 행사 해제`);
      }
      loadAll();
    } catch (e: any) { message.error(e.message); }
  };

  // ── 일괄 날짜 변경 ──
  const openDateModal = () => {
    const eventProducts = selectedProducts.filter(p => p.event_price);
    if (eventProducts.length === 0) { message.warning('행사중인 상품을 선택해주세요'); return; }
    setBulkDateRange([null, null]);
    setDateModalOpen(true);
  };

  const handleBulkDateChange = async () => {
    if (!bulkDateRange[0] || !bulkDateRange[1]) { message.error('행사기간을 선택해주세요'); return; }
    setDateSubmitting(true);
    try {
      const codes = selectedProducts.filter(p => p.event_price).map(p => p.product_code);
      await productApi.bulkUpdateEventDates(codes, bulkDateRange[0].format('YYYY-MM-DD'), bulkDateRange[1].format('YYYY-MM-DD'));
      message.success(`${codes.length}개 상품의 행사기간이 변경되었습니다.`);
      setDateModalOpen(false);
      setSelectedRowKeys([]);
      loadAll();
    } catch (e: any) { message.error(e.message); }
    finally { setDateSubmitting(false); }
  };

  // ── 행사추천 ──
  const loadRecommendations = async (cat?: string) => {
    setRecLoading(true);
    try {
      const data = await productApi.eventRecommendations(cat || undefined);
      setRecData(data);
    } catch (e: any) { message.error(e.message); }
    finally { setRecLoading(false); }
  };

  const openRecModal = () => {
    setRecCategory('');
    setRecData([]);
    setRecModalOpen(true);
    loadRecommendations();
  };

  const handleRecToggle = async (rec: any) => {
    try {
      const price = rec.base_price || 0;
      await productApi.updateEventPrice(rec.product_code, price);
      message.success(`${rec.product_name} 행사 등록`);
      setRecData(prev => prev.filter(r => r.product_code !== rec.product_code));
      loadAll();
    } catch (e: any) { message.error(e.message); }
  };

  // ── 단건 행사가 수정 모달 ──
  const openSingleModal = async (record: any) => {
    setSingleRecord(record);
    setSinglePrice(record.event_price || record.discount_price || record.base_price || 0);
    setSingleDateRange([
      record.event_start_date ? dayjs(record.event_start_date) : null,
      record.event_end_date ? dayjs(record.event_end_date) : null,
    ]);
    const codes = record.event_store_codes || [];
    setSingleStores(codes);
    setSingleAllStores(codes.length === 0);
    setSingleModalOpen(true);

    // 거래처별 행사가 로드
    setPartnerPricesLoading(true);
    try {
      const pp = await productApi.getEventPartnerPrices(record.product_code);
      if (pp.length > 0) {
        setSinglePriceMode('partner');
        setPartnerPrices(pp.map((p: any) => ({
          partner_code: p.partner_code,
          event_price: Number(p.event_price),
          event_start_date: p.event_start_date || null,
          event_end_date: p.event_end_date || null,
        })));
      } else {
        setSinglePriceMode('uniform');
        setPartnerPrices([]);
      }
    } catch {
      setSinglePriceMode('uniform');
      setPartnerPrices([]);
    } finally {
      setPartnerPricesLoading(false);
    }
  };

  const handleSingleSave = async () => {
    if (!singleRecord) return;
    setSingleSubmitting(true);
    try {
      if (singlePriceMode === 'partner') {
        // 거래처별 개별가 모드
        const validEntries = partnerPrices.filter(p => p.partner_code && p.event_price > 0);
        if (validEntries.length === 0) {
          message.error('거래처별 행사가를 1개 이상 입력해주세요');
          setSingleSubmitting(false);
          return;
        }
        // 기본 행사가 설정 (products 테이블 - 첫 번째 거래처 가격으로 표시용)
        const minPrice = Math.min(...validEntries.map(e => e.event_price));
        const allStartDates = validEntries.map(e => e.event_start_date).filter(Boolean);
        const allEndDates = validEntries.map(e => e.event_end_date).filter(Boolean);
        const earliestStart = allStartDates.length > 0 ? allStartDates.sort()[0] : null;
        const latestEnd = allEndDates.length > 0 ? allEndDates.sort().reverse()[0] : null;
        const partnerCodes = validEntries.map(e => e.partner_code);

        await productApi.updateEventPrice(
          singleRecord.product_code, minPrice,
          earliestStart, latestEnd, partnerCodes,
        );
        // 거래처별 행사가 저장
        await productApi.saveEventPartnerPrices(singleRecord.product_code, validEntries);
        message.success(`${singleRecord.product_name} 거래처별 행사가가 설정되었습니다.`);
      } else {
        // 전체 동일가 모드
        if (singlePrice <= 0) { message.error('행사가를 입력해주세요'); setSingleSubmitting(false); return; }
        if (!singleAllStores && singleStores.length === 0) { message.error('대상 매장을 선택해주세요'); setSingleSubmitting(false); return; }
        await productApi.updateEventPrice(
          singleRecord.product_code, singlePrice,
          singleDateRange[0]?.format('YYYY-MM-DD') || null,
          singleDateRange[1]?.format('YYYY-MM-DD') || null,
          singleAllStores ? null : singleStores,
        );
        // 거래처별 행사가 초기화
        await productApi.saveEventPartnerPrices(singleRecord.product_code, []);
        message.success(`${singleRecord.product_name} 행사가가 설정되었습니다.`);
      }
      setSingleModalOpen(false);
      loadAll();
    } catch (e: any) { message.error(e.message); }
    finally { setSingleSubmitting(false); }
  };

  const handleSingleClear = async () => {
    if (!singleRecord) return;
    setSingleSubmitting(true);
    try {
      await productApi.updateEventPrice(singleRecord.product_code, null, null, null, null);
      await productApi.saveEventPartnerPrices(singleRecord.product_code, []);
      message.success(`${singleRecord.product_name} 행사가가 해제되었습니다.`);
      setSingleModalOpen(false);
      loadAll();
    } catch (e: any) { message.error(e.message); }
    finally { setSingleSubmitting(false); }
  };

  // 거래처별 행사가 행 관리
  const addPartnerRow = () => {
    setPartnerPrices(prev => [...prev, {
      partner_code: '', event_price: singleRecord?.discount_price || singleRecord?.base_price || 0,
      event_start_date: singleDateRange[0]?.format('YYYY-MM-DD') || null,
      event_end_date: singleDateRange[1]?.format('YYYY-MM-DD') || null,
    }]);
  };

  const removePartnerRow = (idx: number) => {
    setPartnerPrices(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePartnerRow = (idx: number, field: keyof PartnerPriceRow, value: any) => {
    setPartnerPrices(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  // 선택 가능한 거래처 (이미 선택된 것 제외)
  const availablePartners = useCallback((currentIdx: number) => {
    const usedCodes = partnerPrices.filter((_, i) => i !== currentIdx).map(p => p.partner_code);
    return storeOptions.filter(o => !usedCodes.includes(o.value));
  }, [partnerPrices, storeOptions]);

  // ── 테이블 컬럼 ──
  const columns = [
    {
      title: '행사', key: 'event_toggle', width: 60, fixed: 'left' as const,
      render: (_: any, record: any) => (
        <Switch
          size="small"
          checked={!!record.event_price}
          onChange={(checked) => handleToggleEvent(record, checked)}
        />
      ),
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 160, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '연도', dataIndex: 'year', key: 'year', width: 60, render: (v: string) => v ? formatCode('YEAR', v) : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
    {
      title: '정상가', dataIndex: 'base_price', key: 'base_price', width: 90,
      render: (v: number) => v ? Number(v).toLocaleString() : '-',
    },
    {
      title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 90,
      render: (v: number) => v ? <span style={{ color: '#cf1322' }}>{Number(v).toLocaleString()}</span> : '-',
    },
    {
      title: '행사가', dataIndex: 'event_price', key: 'event_price', width: 90,
      render: (v: number) => v
        ? <span style={{ fontWeight: 600, color: '#fa8c16' }}>{Number(v).toLocaleString()}</span>
        : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '', key: 'edit_action', width: 60,
      render: (_: any, record: any) => record.event_price
        ? <Button size="small" onClick={() => openSingleModal(record)}>수정</Button>
        : null,
    },
    {
      title: '적용매장', key: 'event_stores', width: 130, ellipsis: true,
      render: (_: any, record: any) => {
        if (!record.event_price) return '-';
        const codes: string[] = record.event_store_codes || [];
        if (codes.length === 0) return <Tag color="blue">전체</Tag>;
        return (
          <span>
            {codes.map((code: string) => {
              const name = partners.find(p => p.partner_code === code)?.partner_name || code;
              return <Tag key={code} color="orange" style={{ marginBottom: 2 }}>{name}</Tag>;
            })}
          </span>
        );
      },
    },
    {
      title: '행사기간', key: 'event_period', width: 160,
      render: (_: any, record: any) => {
        if (!record.event_price) return '-';
        const start = record.event_start_date;
        const end = record.event_end_date;
        if (!start && !end) return <span style={{ color: '#999' }}>무기한</span>;
        const s = start ? dayjs(start).format('YY.MM.DD') : '~';
        const e = end ? dayjs(end).format('YY.MM.DD') : '~';
        const isExpired = end && dayjs(end).isBefore(dayjs(), 'day');
        return <span style={{ color: isExpired ? '#cf1322' : '#389e0d', fontSize: 12 }}>{s} ~ {e}{isExpired ? ' (종료)' : ''}</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="행사관리" extra={
        <Space>
          <Button icon={<BulbOutlined />} onClick={openRecModal}>
            행사추천
          </Button>
          <Button icon={<CalendarOutlined />} onClick={openDateModal} disabled={selectedRowKeys.length === 0}>
            날짜 변경 ({selectedRowKeys.length})
          </Button>
        </Space>
      } />

      {/* 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete
            value={search} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map(s => ({
              value: s.product_code,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</span>
                  <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>{s.product_code} · {s.category || '-'}</span>
                </div>
              ),
            }))}
          >
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={() => { setPage(1); loadAll(1); }} />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          <Select showSearch optionFilterProp="label" value={partnerFilter}
            onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 130 }}
            options={[{ label: '전체 거래처', value: '' }, ...storeOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...categoryOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
          <Select allowClear value={yearFromFilter} onChange={(v) => { setYearFromFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
          <Select allowClear value={yearToFilter} onChange={(v) => { setYearToFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={seasonFilter} onChange={(v) => { setSeasonFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체', value: '' }, ...seasonOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select showSearch optionFilterProp="label" value={colorFilter}
            onChange={(v) => { setColorFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...colorOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select showSearch optionFilterProp="label" value={sizeFilter}
            onChange={(v) => { setSizeFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체 보기', value: '' }, ...sizeOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>정렬</div>
          <Select value={sortValue} onChange={(v) => { setSortValue(v); setPage(1); }} style={{ width: 150 }}
            options={[
              { label: '등록순(최신)', value: 'created_at_DESC' },
              { label: '등록순(오래된)', value: 'created_at_ASC' },
              { label: '가격 높은순', value: 'base_price_DESC' },
              { label: '가격 낮은순', value: 'base_price_ASC' },
              { label: '상품명순', value: 'product_name_ASC' },
            ]} /></div>
        <Button onClick={() => { setPage(1); loadAll(1); }}>조회</Button>
      </div>

      {/* 메인 테이블 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => handleRowSelect(keys as string[]),
        }}
        locale={{ emptyText: <Empty description="조회 결과가 없습니다" /> }}
      />

      {/* 일괄 날짜 변경 모달 */}
      <Modal
        title={`행사기간 일괄 변경 (${selectedProducts.filter(p => p.event_price).length}개 상품)`}
        open={dateModalOpen}
        onCancel={() => setDateModalOpen(false)}
        onOk={handleBulkDateChange}
        confirmLoading={dateSubmitting}
        okText="날짜 변경"
        cancelText="취소"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              <CalendarOutlined style={{ marginRight: 4 }} />새 행사기간
            </div>
            <RangePicker
              value={bulkDateRange as any}
              onChange={(v) => setBulkDateRange(v ? [v[0], v[1]] : [null, null])}
              style={{ width: '100%' }}
              placeholder={['시작일', '종료일']}
            />
          </div>
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>상품코드</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>상품명</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>행사가</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>현재 기간</th>
                </tr>
              </thead>
              <tbody>
                {selectedProducts.filter(p => p.event_price).map(p => (
                  <tr key={p.product_code} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '4px 8px', color: '#666', fontSize: 12 }}>{p.product_code}</td>
                    <td style={{ padding: '4px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#fa8c16', fontWeight: 600 }}>{Number(p.event_price).toLocaleString()}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 12, color: '#999' }}>
                      {p.event_start_date || p.event_end_date
                        ? `${p.event_start_date ? dayjs(p.event_start_date).format('YY.MM.DD') : '~'} ~ ${p.event_end_date ? dayjs(p.event_end_date).format('YY.MM.DD') : '~'}`
                        : '무기한'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* 단건 행사가 수정 모달 */}
      <Modal
        title="행사가 수정"
        open={singleModalOpen}
        onCancel={() => setSingleModalOpen(false)}
        width={600}
        footer={[
          singleRecord?.event_price && (
            <Button key="clear" danger onClick={handleSingleClear} loading={singleSubmitting}>행사 해제</Button>
          ),
          <Button key="cancel" onClick={() => setSingleModalOpen(false)}>취소</Button>,
          <Button key="ok" type="primary" onClick={handleSingleSave} loading={singleSubmitting || partnerPricesLoading}>저장</Button>,
        ].filter(Boolean)}
      >
        {singleRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div style={{ fontWeight: 600 }}>{singleRecord.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {singleRecord.product_code} | {singleRecord.category} | {singleRecord.season}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                정상가: {Number(singleRecord.base_price || 0).toLocaleString()}원
                {singleRecord.discount_price && ` | 할인가: ${Number(singleRecord.discount_price).toLocaleString()}원`}
              </div>
            </div>

            {/* 모드 선택 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type={singlePriceMode === 'uniform' ? 'primary' : 'default'}
                size="small"
                onClick={() => setSinglePriceMode('uniform')}
              >
                전체 동일가
              </Button>
              <Button
                type={singlePriceMode === 'partner' ? 'primary' : 'default'}
                size="small"
                onClick={() => {
                  setSinglePriceMode('partner');
                  if (partnerPrices.length === 0) addPartnerRow();
                }}
              >
                거래처별 개별가
              </Button>
            </div>

            {singlePriceMode === 'uniform' ? (
              <>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>행사가격 *</div>
                  <InputNumber
                    min={0} value={singlePrice} style={{ width: '100%' }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    onChange={(v) => setSinglePrice(v || 0)}
                    addonAfter="원"
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    <CalendarOutlined style={{ marginRight: 4 }} />행사기간
                  </div>
                  <RangePicker
                    value={singleDateRange as any}
                    onChange={(v) => setSingleDateRange(v ? [v[0], v[1]] : [null, null])}
                    style={{ width: '100%' }}
                    placeholder={['시작일', '종료일']}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    대상 매장
                    <Switch
                      size="small" style={{ marginLeft: 12 }}
                      checked={singleAllStores}
                      onChange={(v) => { setSingleAllStores(v); if (v) setSingleStores([]); }}
                      checkedChildren="전체" unCheckedChildren="선택"
                    />
                  </div>
                  {!singleAllStores && (
                    <Select
                      mode="multiple"
                      placeholder="행사 적용 매장 선택"
                      options={storeOptions}
                      value={singleStores}
                      onChange={setSingleStores}
                      style={{ width: '100%' }}
                      optionFilterProp="label"
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <Divider style={{ margin: '4px 0' }} />
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>거래처별 행사가 설정</div>
                <div style={{ maxHeight: 280, overflow: 'auto' }}>
                  {partnerPrices.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <Select
                        showSearch optionFilterProp="label"
                        placeholder="거래처"
                        options={availablePartners(idx)}
                        value={row.partner_code || undefined}
                        onChange={(v) => updatePartnerRow(idx, 'partner_code', v)}
                        style={{ width: 130 }}
                        size="small"
                      />
                      <InputNumber
                        min={0} value={row.event_price} size="small"
                        style={{ width: 110 }}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        onChange={(v) => updatePartnerRow(idx, 'event_price', v || 0)}
                        addonAfter="원"
                      />
                      <RangePicker
                        size="small"
                        value={[
                          row.event_start_date ? dayjs(row.event_start_date) : null,
                          row.event_end_date ? dayjs(row.event_end_date) : null,
                        ] as any}
                        onChange={(v) => {
                          updatePartnerRow(idx, 'event_start_date', v?.[0]?.format('YYYY-MM-DD') || null);
                          updatePartnerRow(idx, 'event_end_date', v?.[1]?.format('YYYY-MM-DD') || null);
                        }}
                        placeholder={['시작', '종료']}
                        style={{ flex: 1 }}
                      />
                      <Button
                        size="small" type="text" danger
                        icon={<DeleteOutlined />}
                        onClick={() => removePartnerRow(idx)}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="dashed" size="small" icon={<PlusOutlined />}
                  onClick={addPartnerRow}
                  disabled={partnerPrices.length >= storeOptions.length}
                  style={{ width: '100%' }}
                >
                  거래처 추가
                </Button>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 행사추천 모달 */}
      <Modal
        title="행사추천"
        open={recModalOpen}
        onCancel={() => setRecModalOpen(false)}
        footer={<Button onClick={() => setRecModalOpen(false)}>닫기</Button>}
        width={900}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Select
              value={recCategory} onChange={(v) => { setRecCategory(v); loadRecommendations(v); }}
              style={{ width: 140 }}
              options={[{ label: '전체 카테고리', value: '' }, ...categoryOptions]}
            />
            <span style={{ fontSize: 12, color: '#888' }}>
              깨진사이즈 + 저판매 기반 행사 추천 (마스터관리 &gt; 시스템설정에서 가중치 조정)
            </span>
          </div>
          <Table
            dataSource={recData}
            rowKey="product_code"
            loading={recLoading}
            size="small"
            scroll={{ y: 420 }}
            pagination={false}
            locale={{ emptyText: <Empty description="추천 상품이 없습니다" /> }}
            columns={[
              { title: '상품코드', dataIndex: 'product_code', width: 110 },
              { title: '상품명', dataIndex: 'product_name', ellipsis: true },
              { title: '카테고리', dataIndex: 'category', width: 75 },
              { title: '시즌', dataIndex: 'season', width: 80, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
              { title: '정상가', dataIndex: 'base_price', width: 85, render: (v: number) => Number(v).toLocaleString() },
              { title: '재고', dataIndex: 'total_stock', width: 55, render: (v: number) => <span style={{ color: v > 0 ? undefined : '#ccc' }}>{v}</span> },
              {
                title: '사이즈', dataIndex: 'size_detail', width: 150,
                render: (sizes: any[]) => sizes ? (
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {sizes.map((s: any) => (
                      <Tag key={s.size} color={s.stock > 0 ? 'default' : 'red'} style={{ fontSize: 11, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                        {s.size}:{s.stock}
                      </Tag>
                    ))}
                  </div>
                ) : '-',
              },
              {
                title: '추천점수', dataIndex: 'recommendation_score', width: 80, sorter: (a: any, b: any) => a.recommendation_score - b.recommendation_score,
                render: (v: number) => <span style={{ fontWeight: 600, color: v >= 60 ? '#cf1322' : v >= 30 ? '#fa8c16' : '#999' }}>{v}점</span>,
              },
              {
                title: '사유', key: 'reason', width: 110,
                render: (_: any, r: any) => (
                  <span style={{ fontSize: 11 }}>
                    {r.broken_count > 0 && <Tag color="volcano" style={{ fontSize: 11, margin: 0 }}>깨진사이즈 {r.broken_count}</Tag>}
                    {r.low_sales_score > 0 && <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>저판매</Tag>}
                  </span>
                ),
              },
              {
                title: '', key: 'action', width: 70,
                render: (_: any, r: any) => (
                  <Button size="small" type="primary" onClick={() => handleRecToggle(r)}>행사등록</Button>
                ),
              },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
