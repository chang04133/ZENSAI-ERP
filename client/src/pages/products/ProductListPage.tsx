import { useEffect, useState, useRef } from 'react';
import { Table, Button, Input, Select, Space, Tag, Popconfirm, Upload, Modal, Switch, AutoComplete, DatePicker, message, Alert, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { useProductStore } from '../../modules/product/product.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { getToken, apiFetch } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import { SALE_STATUS_COLORS } from '../../utils/constants';
import { exportToExcel } from '../../utils/export-excel';
import { useCodeLabels } from '../../hooks/useCodeLabels';

export default function ProductListPage() {
  const navigate = useNavigate();
  const { data: products, total, loading, fetchList: fetchProducts } = useProductStore();
  const user = useAuthStore((s) => s.user);
  const { formatCode } = useCodeLabels();
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string; season: string; brand: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [yearFromFilter, setYearFromFilter] = useState('');
  const [yearToFilter, setYearToFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fitFilter, setFitFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [sortValue, setSortValue] = useState('created_at_DESC');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadPartners, setUploadPartners] = useState<any[]>([]);
  const [uploadPartnerCode, setUploadPartnerCode] = useState<string>('');
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [variantsMap, setVariantsMap] = useState<Record<string, any[]>>({});
  const [variantsLoading, setVariantsLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | undefined>();
  const [issueFilter, setIssueFilter] = useState('');
  const [lengthFilter, setLengthFilter] = useState('');
  const [lengthOptions, setLengthOptions] = useState<{ label: string; value: string }[]>([]);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [partners, setPartners] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isHQ = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setAllCategoryCodes(data);
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch((e: any) => { message.error('카테고리 로드 실패: ' + e.message); });
    codeApi.getByType('FIT').then((data: any[]) => {
      setFitOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch((e: any) => { message.error('핏 옵션 로드 실패: ' + e.message); });
    codeApi.getByType('YEAR').then((data: any[]) => {
      setYearOptions(data.filter((c: any) => c.is_active).sort((a: any, b: any) => b.code_value.localeCompare(a.code_value)).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('SEASON').then((data: any[]) => {
      setSeasonOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('LENGTH').then((data: any[]) => {
      setLengthOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    if (isHQ) {
      partnerApi.list({ limit: '1000' }).then((r: any) => {
        setPartners(r.data || []);
      }).catch(() => {});
    }
  }, []);

  const load = (searchOverride?: string) => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    const s = searchOverride !== undefined ? searchOverride : search;
    if (s) params.search = s;
    if (categoryFilter) params.category = categoryFilter;
    if (subCategoryFilter) params.sub_category = subCategoryFilter;
    if (yearFromFilter) params.year_from = yearFromFilter;
    if (yearToFilter) params.year_to = yearToFilter;
    if (seasonFilter) params.season = seasonFilter;
    if (statusFilter) params.sale_status = statusFilter;
    if (fitFilter) params.fit = fitFilter;
    if (lengthFilter) params.length = lengthFilter;
    if (colorFilter) params.color = colorFilter;
    if (sizeFilter) params.size = sizeFilter;
    if (issueFilter) params.issue = issueFilter;
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

  useEffect(() => { load(); }, [page, categoryFilter, subCategoryFilter, yearFromFilter, yearToFilter, seasonFilter, statusFilter, fitFilter, lengthFilter, colorFilter, sizeFilter, sortValue, issueFilter, partnerFilter, dateRange]);

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
    load(value);
  };

  useEffect(() => {
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
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

  const handleDelete = async (code: string) => {
    try {
      await productApi.remove(code);
      message.success('상품이 비활성화되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    try {
      let success = 0;
      for (const code of selectedRowKeys) {
        await productApi.update(code as string, { sale_status: bulkStatus });
        success++;
      }
      message.success(`${success}개 상품의 상태가 "${bulkStatus}"(으)로 변경되었습니다.`);
      setSelectedRowKeys([]);
      setBulkStatusModalOpen(false);
      setBulkStatus(undefined);
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleVariantAlert = async (variantId: number, checked: boolean, productCode: string) => {
    try {
      await productApi.toggleVariantAlert(variantId, checked);
      // variantsMap 캐시 업데이트
      setVariantsMap((prev) => {
        const variants = prev[productCode];
        if (!variants) return prev;
        return { ...prev, [productCode]: variants.map((v: any) => v.variant_id === variantId ? { ...v, low_stock_alert: checked } : v) };
      });
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleToggleEvent = async (productCode: string, checked: boolean, record: any) => {
    try {
      if (checked) {
        const price = record.discount_price || record.base_price || 0;
        await productApi.updateEventPrice(productCode, price);
        message.success(`${record.product_name} 행사 등록 (${Number(price).toLocaleString()}원)`);
      } else {
        await productApi.updateEventPrice(productCode, null);
        message.success(`${record.product_name} 행사 해제`);
      }
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDownloadTemplate = () => {
    const token = getToken();
    fetch('/api/products/excel/template', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'product_template.xlsx';
        link.click();
        URL.revokeObjectURL(url);
      });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', file);
    if (uploadPartnerCode) formData.append('partner_code', uploadPartnerCode);

    try {
      const token = getToken();
      const res = await fetch('/api/products/excel/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (!data.success) {
        message.error(data.error);
        setUploadResult({ error: data.error });
      } else {
        setUploadResult(data.data);
        const msgs: string[] = [];
        if (data.data.created > 0) msgs.push(`${data.data.created}개 상품 등록`);
        if (data.data.stockCreated > 0) msgs.push(`${data.data.stockCreated}건 재고 등록`);
        if (msgs.length > 0) { message.success(msgs.join(', ')); load(); }
      }
    } catch (e: any) {
      message.error('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }

    return false;
  };

  const [excelLoading, setExcelLoading] = useState(false);

  const handleExcelDownload = async () => {
    setExcelLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (subCategoryFilter) params.sub_category = subCategoryFilter;
      if (yearFromFilter) params.year_from = yearFromFilter;
      if (yearToFilter) params.year_to = yearToFilter;
      if (seasonFilter) params.season = seasonFilter;
      if (fitFilter) params.fit = fitFilter;
      if (statusFilter) params.sale_status = statusFilter;
      if (colorFilter) params.color = colorFilter;
      if (sizeFilter) params.size = sizeFilter;
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }
      const rows = await productApi.exportVariants(params);
      const excelCols = [
        { title: '상품코드', key: 'product_code' },
        { title: 'SKU', key: 'sku' },
        { title: '상품명', key: 'product_name' },
        { title: '카테고리', key: 'category' },
        { title: '세부카테고리', key: 'sub_category' },
        { title: '브랜드', key: 'brand' },
        { title: '시즌', key: 'season' },
        { title: '핏', key: 'fit' },
        { title: '기장', key: 'length' },
        { title: '색상', key: 'color' },
        { title: '사이즈', key: 'size' },
        { title: '바코드(SKU)', key: 'barcode' },
        { title: '별도 바코드', key: 'custom_barcode' },
        { title: '기본가', key: 'base_price' },
        ...(!isStore ? [{ title: '매입가', key: 'cost_price' }] : []),
        { title: '할인가', key: 'discount_price' },
        { title: '행사가', key: 'event_price' },
        { title: '행사여부', key: 'event_yn' },
        { title: '판매상태', key: 'sale_status' },
        { title: '수량', key: 'stock_qty' },
      ];
      const excelRows = rows.map((r: any) => ({ ...r, event_yn: r.event_price ? 'ON' : 'OFF' }));
      exportToExcel(excelRows, excelCols, `상품목록_${new Date().toISOString().slice(0, 10)}`);
      message.success(`${rows.length}건 엑셀 다운로드 완료`);
    } catch (e: any) {
      message.error('엑셀 다운로드 실패: ' + e.message);
    } finally {
      setExcelLoading(false);
    }
  };

  const handleExpand = async (expanded: boolean, record: any) => {
    if (!expanded || variantsMap[record.product_code]) return;
    setVariantsLoading((prev) => ({ ...prev, [record.product_code]: true }));
    try {
      const data = await productApi.get(record.product_code);
      setVariantsMap((prev) => ({ ...prev, [record.product_code]: (data as any).variants || [] }));
    } catch (e: any) {
      message.error('변형 정보 로드 실패');
    } finally {
      setVariantsLoading((prev) => ({ ...prev, [record.product_code]: false }));
    }
  };

  const expandedRowRender = (record: any) => {
    const variants = variantsMap[record.product_code];
    if (variantsLoading[record.product_code]) return <Spin size="small" style={{ padding: 16 }} />;
    if (!variants || variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const variantCols = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: 'Color', dataIndex: 'color', key: 'color', width: 80 },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고수량', dataIndex: 'stock_qty', key: 'stock_qty', width: 90,
        render: (v: number) => { const qty = v ?? 0; return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>; },
      },
      { title: '바코드', dataIndex: 'barcode', key: 'barcode', width: 150, render: (v: string) => v || '-' },
      { title: '재입고 알림', dataIndex: 'low_stock_alert', key: 'low_stock_alert', width: 90,
        render: (v: boolean, row: any) => (
          <Switch size="small" checked={v !== false} onChange={(checked) => handleToggleVariantAlert(row.variant_id, checked, record.product_code)} />
        ),
      },
    ];
    return (
      <Table
        columns={variantCols}
        dataSource={variants}
        rowKey="variant_id"
        pagination={false}
        size="small"
        style={{ margin: 0 }}
      />
    );
  };


  const columns = [
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
    { title: '세부', dataIndex: 'sub_category', key: 'sub_category', width: 90, ellipsis: true, render: (v: string) => v || '-' },
    { title: '브랜드', dataIndex: 'brand', key: 'brand', width: 80 },
    { title: '연도', dataIndex: 'year', key: 'year', width: 60, render: (v: string) => v ? formatCode('YEAR', v) : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90, render: (v: string) => v ? formatCode('SEASON', v) : '-' },
    { title: '핏', dataIndex: 'fit', key: 'fit', width: 70, render: (v: string) => v ? <Tag color="geekblue">{formatCode('FIT', v)}</Tag> : '-' },
    { title: '기장', dataIndex: 'length', key: 'length', width: 65, render: (v: string) => v ? <Tag color="volcano">{formatCode('LENGTH', v)}</Tag> : '-' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    ...(!isStore ? [{ title: '매입가', dataIndex: 'cost_price', key: 'cost_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    }] : []),
    { title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 90,
      render: (v: number) => v ? <span style={{ color: '#f5222d' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '행사가', dataIndex: 'event_price', key: 'event_price', width: 90,
      render: (v: number) => v ? <span style={{ color: '#fa8c16' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '행사', dataIndex: 'event_price', key: 'event_on', width: 60, align: 'center' as const,
      filters: [{ text: '행사중', value: 'on' }, { text: '일반', value: 'off' }],
      onFilter: (v: any, r: any) => v === 'on' ? !!r.event_price : !r.event_price,
      render: (_v: number, record: any) => (
        <Switch size="small" checked={!!record.event_price}
          onChange={(checked) => handleToggleEvent(record.product_code, checked, record)} />
      ),
    },
    { title: '상태', dataIndex: 'sale_status', key: 'sale_status', width: 75,
      render: (v: string) => <Tag color={SALE_STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    ...(!isStore ? [{ title: '부자재', dataIndex: 'material_count', key: 'material_count', width: 70,
      render: (v: number) => {
        const cnt = Number(v || 0);
        return cnt > 0 ? <Tag color="blue">{cnt}</Tag> : <Tag color="red">미등록</Tag>;
      },
    }] : []),
    { title: '재고', dataIndex: 'total_inv_qty', key: 'total_inv_qty', width: 80,
      render: (v: number) => {
        const qty = Number(v || 0);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
    { title: '리오더', dataIndex: 'is_reorder', key: 'is_reorder', width: 65, align: 'center' as const,
      filters: [{ text: 'O', value: true }, { text: 'X', value: false }],
      onFilter: (v: any, r: any) => r.is_reorder === v,
      render: (v: boolean) => v
        ? <Tag color="blue" style={{ fontWeight: 700 }}>O</Tag>
        : <Tag color="default" style={{ fontWeight: 700 }}>X</Tag>,
    },
    { title: '생산중', dataIndex: 'in_production_qty', key: 'in_production_qty', width: 70, align: 'center' as const,
      filters: [{ text: '생산중', value: 'yes' }, { text: '-', value: 'no' }],
      onFilter: (v: any, r: any) => v === 'yes' ? Number(r.in_production_qty) > 0 : Number(r.in_production_qty) === 0,
      render: (v: number) => {
        const qty = Number(v || 0);
        return qty > 0
          ? <Tag color="purple" style={{ fontWeight: 700 }}>{qty}</Tag>
          : <span style={{ color: '#ccc' }}>-</span>;
      },
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/products/${record.product_code}/edit`)}>수정</Button>
          <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(record.product_code)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="상품 관리"
        extra={
          <Space>
            {canWrite && <Button icon={<DownloadOutlined />} onClick={handleExcelDownload} loading={excelLoading}>
              엑셀 다운로드
            </Button>}
            {canWrite && <Button icon={<UploadOutlined />} onClick={() => {
              setUploadModalOpen(true); setUploadResult(null);
              if (uploadPartners.length === 0) {
                apiFetch('/api/partners?limit=1000').then(r => r.json()).then(d => {
                  if (d.success) setUploadPartners(d.data?.data || d.data || []);
                }).catch(() => {});
              }
            }}>
              엑셀 업로드
            </Button>}
            {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>
              상품 등록
            </Button>}
          </Space>
        }
      />
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
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={() => load()} />
          </AutoComplete></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...categoryOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>세부</div>
          <Select value={subCategoryFilter} onChange={(v) => { setSubCategoryFilter(v); setPage(1); }} style={{ width: 140 }}
            options={[{ label: '전체 보기', value: '' }, ...subCategoryOptions]} disabled={!categoryFilter} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
          <Select allowClear value={yearFromFilter} onChange={(v) => { setYearFromFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
          <Select allowClear value={yearToFilter} onChange={(v) => { setYearToFilter(v || ''); setPage(1); }} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={seasonFilter} onChange={(v) => { setSeasonFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체', value: '' }, ...seasonOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>핏</div>
          <Select value={fitFilter} onChange={(v) => { setFitFilter(v); setPage(1); }} style={{ width: 130 }}
            options={[{ label: '전체 보기', value: '' }, ...fitOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기장</div>
          <Select value={lengthFilter} onChange={(v) => { setLengthFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...lengthOptions]} /></div>
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
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>하자</div>
          <Select value={issueFilter} onChange={(v) => { setIssueFilter(v); setPage(1); }} style={{ width: 150 }}
            options={[
              { label: '전체 보기', value: '' },
              { label: '사이즈 1개 깨짐', value: 'broken1' },
              { label: '사이즈 2개+ 깨짐', value: 'broken2' },
              { label: '총수량 10개 미만', value: 'low10' },
            ]} /></div>
        {isHQ && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
            <Select showSearch optionFilterProp="label" value={partnerFilter}
              onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 160 }}
              options={[{ label: '전체 보기', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
        )}
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
      {canWrite && selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 8 }}>
          <Tag>{selectedRowKeys.length}개 선택</Tag>
          <Button size="small" onClick={() => { setBulkStatus(undefined); setBulkStatusModalOpen(true); }}>
            일괄 상태변경
          </Button>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>선택 해제</Button>
        </Space>
      )}
      <Table
        columns={columns}
        dataSource={products}
        rowKey="product_code"
        loading={loading || bulkLoading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        expandable={{ expandedRowRender, onExpand: handleExpand }}
        rowSelection={canWrite ? {
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        } : undefined}
      />

      {/* Bulk Status Modal */}
      <Modal
        title={`상품 일괄 상태변경 (${selectedRowKeys.length}개)`}
        open={bulkStatusModalOpen}
        onOk={handleBulkStatusChange}
        onCancel={() => { setBulkStatusModalOpen(false); setBulkStatus(undefined); }}
        okText="변경"
        cancelText="취소"
        confirmLoading={bulkLoading}
      >
        <p>선택된 {selectedRowKeys.length}개 상품의 판매 상태를 변경합니다.</p>
        <Select
          value={bulkStatus}
          onChange={setBulkStatus}
          placeholder="변경할 상태 선택"
          style={{ width: '100%' }}
          options={[
            { label: '판매중', value: '판매중' },
            { label: '일시품절', value: '일시품절' },
            { label: '단종', value: '단종' },
          ]}
        />
      </Modal>

      {/* Excel Upload Modal */}
      <Modal
        title="엑셀로 상품 일괄 등록"
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setUploadModalOpen(false)}>닫기</Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            엑셀 템플릿 다운로드
          </Button>
          <span style={{ marginLeft: 8, color: '#888' }}>먼저 템플릿을 다운로드하여 작성해주세요</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>거래처 (재고 등록용, 선택)</div>
          <Select
            value={uploadPartnerCode || undefined}
            onChange={(v) => setUploadPartnerCode(v || '')}
            placeholder="거래처를 선택하면 재고도 함께 등록됩니다"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={uploadPartners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
          />
        </div>

        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => { handleUpload(file); return false; }}
          disabled={uploading}
        >
          <p style={{ fontSize: 32, color: '#1890ff' }}><UploadOutlined /></p>
          <p>{uploading ? '업로드 중...' : '클릭하거나 파일을 드래그하세요'}</p>
          <p style={{ color: '#888' }}>.xlsx, .xls 파일만 가능 (최대 5MB)</p>
        </Upload.Dragger>

        {uploadResult && !uploadResult.error && (
          <div style={{ marginTop: 16 }}>
            <Alert
              type={uploadResult.created > 0 ? 'success' : 'warning'}
              message={`처리 완료: 전체 ${uploadResult.total}개 / 등록 ${uploadResult.created}개 / 건너뜀 ${uploadResult.skipped}개${uploadResult.stockCreated > 0 ? ` / 재고 ${uploadResult.stockCreated}건` : ''}`}
              style={{ marginBottom: 8 }}
            />
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <Alert
                type="warning"
                message="알림"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {uploadResult.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </div>
        )}

        {uploadResult?.error && (
          <Alert type="error" message={uploadResult.error} style={{ marginTop: 16 }} />
        )}
      </Modal>
    </div>
  );
}
