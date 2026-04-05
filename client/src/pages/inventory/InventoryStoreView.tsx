import { useEffect, useState, useRef } from 'react';
import {
  Table, Tag, Input, Spin, Button, AutoComplete, DatePicker,
  Select, message,
} from 'antd';
import { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { useProductStore } from '../../modules/product/product.store';
import { useCodeLabels } from '../../hooks/useCodeLabels';
import { SALE_STATUS_COLORS } from '../../utils/constants';

export function InventoryStoreView() {
  const navigate = useNavigate();
  const { data: products, total, loading, fetchList: fetchProducts } = useProductStore();
  const user = useAuthStore((s) => s.user);
  const { formatCode } = useCodeLabels();
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [sortValue, setSortValue] = useState('created_at_DESC');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [variantsMap, setVariantsMap] = useState<Record<string, any[]>>({});
  const [variantsLoading, setVariantsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
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
    partnerApi.list({ limit: '1000' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
  }, []);

  const load = (searchOverride?: string) => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    const s = searchOverride !== undefined ? searchOverride : search;
    if (s) params.search = s;
    if (categoryFilter) params.category = categoryFilter;
    if (yearFromFilter) params.year_from = yearFromFilter;
    if (yearToFilter) params.year_to = yearToFilter;
    if (seasonFilter) params.season = seasonFilter;
    if (statusFilter) params.sale_status = statusFilter;
    if (colorFilter) params.color = colorFilter;
    if (sizeFilter) params.size = sizeFilter;
    if (partnerFilter) params.partner_code = partnerFilter;
    if (dateRange) {
      params.date_from = dateRange[0].format('YYYY-MM-DD');
      params.date_to = dateRange[1].format('YYYY-MM-DD');
    }
    const lastUnderscore = sortValue.lastIndexOf('_');
    params.orderBy = sortValue.substring(0, lastUnderscore);
    params.orderDir = sortValue.substring(lastUnderscore + 1);
    fetchProducts(params);
  };

  useEffect(() => { load(); }, [page, categoryFilter, yearFromFilter, yearToFilter, seasonFilter, statusFilter, colorFilter, sizeFilter, sortValue, partnerFilter, dateRange]);

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
  const onSearchSelect = (value: string) => { setSearch(value); setPage(1); load(value); };
  useEffect(() => () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); }, []);

  const handleExpand = async (expanded: boolean, record: any) => {
    if (!expanded || variantsMap[record.product_code]) return;
    setVariantsLoading((prev) => ({ ...prev, [record.product_code]: true }));
    try {
      const data = await productApi.get(record.product_code);
      setVariantsMap((prev) => ({ ...prev, [record.product_code]: (data as any).variants || [] }));
    } catch { message.error('변형 정보 로드 실패'); }
    finally { setVariantsLoading((prev) => ({ ...prev, [record.product_code]: false })); }
  };

  const expandedRowRender = (record: any) => {
    const variants = variantsMap[record.product_code];
    if (variantsLoading[record.product_code]) return <Spin size="small" style={{ padding: 16 }} />;
    if (!variants || variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    return (
      <Table
        columns={[
          { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
          { title: 'Color', dataIndex: 'color', key: 'color', width: 80 },
          { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
          { title: '재고수량', dataIndex: 'stock_qty', key: 'stock_qty', width: 90,
            render: (v: number) => { const qty = v ?? 0; return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>; },
          },
          { title: '바코드', dataIndex: 'barcode', key: 'barcode', width: 150, render: (v: string) => v || '-' },
        ]}
        dataSource={variants}
        rowKey="variant_id"
        pagination={false}
        size="small"
        style={{ margin: 0 }}
      />
    );
  };

  const columns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image_url', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 150, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '브랜드', dataIndex: 'brand', key: 'brand', width: 80 },
    { title: '연도', dataIndex: 'year', key: 'year', width: 60, render: (v: string) => v ? formatCode('YEAR', v) : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    ...(!isStore ? [{ title: '매입가', dataIndex: 'cost_price', key: 'cost_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    }] : []),
    { title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 90,
      render: (v: number) => v ? <span style={{ color: '#f5222d' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '상태', dataIndex: 'sale_status', key: 'sale_status', width: 75,
      render: (v: string) => <Tag color={SALE_STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    { title: '재고', dataIndex: 'total_inv_qty', key: 'total_inv_qty', width: 80,
      render: (v: number) => {
        const qty = Number(v || 0);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간(등록일)</div>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) => { setDateRange(v as [Dayjs, Dayjs] | null); setPage(1); }}
            presets={datePresets}
            format="YYYY-MM-DD"
            allowClear
            style={{ width: 300 }}
          /></div>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete value={search} onChange={onSearchChange} onSelect={onSearchSelect}
            style={{ width: '100%' }}
            options={searchSuggestions.map(s => ({
              value: s.product_code,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</span>
                  <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>{s.product_code} · {s.category || '-'}</span>
                </div>
              ),
            }))}>
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={() => load()} />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          <Select showSearch optionFilterProp="label" value={partnerFilter}
            onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 160 }}
            options={[{ label: '전체 보기', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
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
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, { label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>정렬</div>
          <Select value={sortValue} onChange={(v) => { setSortValue(v); setPage(1); }} style={{ width: 150 }}
            options={[
              { label: '등록순(최신)', value: 'created_at_DESC' },
              { label: '등록순(오래된)', value: 'created_at_ASC' },
              { label: '재고 많은순', value: 'total_inv_qty_DESC' },
              { label: '재고 적은순', value: 'total_inv_qty_ASC' },
              { label: '연도 최신순', value: 'year_DESC' },
              { label: '연도 오래된순', value: 'year_ASC' },
              { label: '가격 높은순', value: 'base_price_DESC' },
              { label: '가격 낮은순', value: 'base_price_ASC' },
              { label: '상품명순', value: 'product_name_ASC' },
            ]} /></div>
        <Button onClick={() => load()}>조회</Button>
      </div>
      <Table
        columns={columns}
        dataSource={products}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        expandable={{ expandedRowRender, onExpand: handleExpand }}
      />
    </>
  );
}
