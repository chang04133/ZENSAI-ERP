import { useEffect, useState, useRef, useMemo } from 'react';
import { Table, Button, Input, Select, Space, Tag, Popconfirm, Upload, Modal, Switch, AutoComplete, message, Alert, Spin, InputNumber, DatePicker } from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined, TagsOutlined, ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { useProductStore } from '../../modules/product/product.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { productApi } from '../../modules/product/product.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { codeApi } from '../../modules/code/code.api';
import { getToken, apiFetch } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import { SALE_STATUS_COLORS } from '../../utils/constants';
import { exportToExcel } from '../../utils/export-excel';
import { useCodeLabels } from '../../hooks/useCodeLabels';

const { RangePicker } = DatePicker;

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
  const [selectedProductsCache, setSelectedProductsCache] = useState<Record<string, any>>({});
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | undefined>();
  const [issueFilter, setIssueFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  // 일괄 행사 설정
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [bulkEventPriceMap, setBulkEventPriceMap] = useState<Record<string, number>>({});
  const [bulkEventDateRange, setBulkEventDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [bulkEventStores, setBulkEventStores] = useState<string[]>([]);
  const [bulkAllStores, setBulkAllStores] = useState(true);
  const [bulkEventLoading, setBulkEventLoading] = useState(false);
  const [storePartners, setStorePartners] = useState<any[]>([]);

  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const storeOptions = useMemo(() =>
    storePartners.map((p: any) => ({ label: p.partner_name, value: p.partner_code })),
    [storePartners],
  );

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
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    partnerApi.list({ limit: '1000' }).then(r => {
      setStorePartners((r.data || []).filter((p: any) => p.partner_type !== '본사' && p.is_active));
    }).catch(() => {});
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
    if (colorFilter) params.color = colorFilter;
    if (sizeFilter) params.size = sizeFilter;
    if (issueFilter) params.issue = issueFilter;
    if (eventFilter) params.event = eventFilter;
    const lastUnderscore = sortValue.lastIndexOf('_');
    params.orderBy = sortValue.substring(0, lastUnderscore);
    params.orderDir = sortValue.substring(lastUnderscore + 1);
    fetchProducts(params);
  };

  useEffect(() => { load(); }, [page, categoryFilter, subCategoryFilter, yearFromFilter, yearToFilter, seasonFilter, statusFilter, fitFilter, colorFilter, sizeFilter, sortValue, issueFilter, eventFilter]);

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

  // 선택 시 캐시에 상품 데이터 보존 (페이지 이동해도 유지)
  const handleRowSelect = (keys: React.Key[]) => {
    setSelectedRowKeys(keys);
    setSelectedProductsCache(prev => {
      const next = { ...prev };
      products.forEach((p: any) => { if (keys.includes(p.product_code)) next[p.product_code] = p; });
      Object.keys(next).forEach(k => { if (!keys.includes(k)) delete next[k]; });
      return next;
    });
  };

  // 모달에 표시할 선택 상품 목록 (캐시에서 가져옴)
  const selectedProducts = useMemo(() =>
    selectedRowKeys.map(k => selectedProductsCache[k as string]).filter(Boolean),
    [selectedRowKeys, selectedProductsCache],
  );

  // 일괄 행사가 설정
  const openEventModal = () => {
    if (selectedRowKeys.length === 0) { message.warning('상품을 선택해주세요'); return; }
    const priceMap: Record<string, number> = {};
    selectedProducts.forEach((p: any) => {
      priceMap[p.product_code] = p.event_price || p.discount_price || p.base_price || 0;
    });
    setBulkEventPriceMap(priceMap);
    setBulkEventDateRange([null, null]);
    setBulkEventStores([]);
    setBulkAllStores(true);
    setEventModalOpen(true);
  };

  const applyBulkPrice = (price: number) => {
    const newMap: Record<string, number> = {};
    selectedRowKeys.forEach(code => { newMap[code as string] = price; });
    setBulkEventPriceMap(newMap);
  };

  const handleBulkEventSet = async () => {
    const hasZero = Object.values(bulkEventPriceMap).some(v => !v || v <= 0);
    if (hasZero) { message.error('모든 상품의 행사가를 입력해주세요'); return; }
    if (!bulkAllStores && bulkEventStores.length === 0) { message.error('대상 매장을 선택해주세요'); return; }
    setBulkEventLoading(true);
    try {
      const updates = selectedRowKeys.map(code => ({ product_code: code as string, event_price: bulkEventPriceMap[code as string] || 0 }));
      const storeCodes = bulkAllStores ? null : bulkEventStores;
      const startDate = bulkEventDateRange[0]?.format('YYYY-MM-DD') || null;
      const endDate = bulkEventDateRange[1]?.format('YYYY-MM-DD') || null;
      await productApi.bulkUpdateEventPrices(updates, storeCodes, startDate, endDate);
      message.success(`${selectedRowKeys.length}개 상품 행사가 설정 완료`);
      setEventModalOpen(false);
      setSelectedRowKeys([]);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setBulkEventLoading(false); }
  };

  const handleBulkEventClear = () => {
    if (selectedRowKeys.length === 0) { message.warning('상품을 선택해주세요'); return; }
    Modal.confirm({
      title: '행사 해제',
      icon: <ExclamationCircleOutlined />,
      content: `선택한 ${selectedRowKeys.length}개 상품의 행사가를 해제하시겠습니까?`,
      okText: '해제',
      okType: 'danger',
      cancelText: '취소',
      onOk: async () => {
        try {
          const updates = selectedRowKeys.map(code => ({ product_code: code as string, event_price: null as any }));
          await productApi.bulkUpdateEventPrices(updates, null, null, null);
          message.success(`${selectedRowKeys.length}개 상품 행사 해제 완료`);
          setSelectedRowKeys([]);
          load();
        } catch (e: any) { message.error(e.message); }
      },
    });
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
        // 기존 행사기간/매장 유지
        await productApi.updateEventPrice(
          productCode, price,
          record.event_start_date || undefined,
          record.event_end_date || undefined,
          record.event_store_codes || undefined,
        );
        message.success(`${record.product_name} 행사 등록 (${Number(price).toLocaleString()}원)`);
      } else {
        await productApi.updateEventPrice(productCode, null, null, null, null);
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
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>행사</div>
          <Select value={eventFilter} onChange={(v) => { setEventFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[
              { label: '전체 보기', value: '' },
              { label: '행사중', value: 'on' },
              { label: '행사없음', value: 'off' },
            ]} /></div>
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
          <Button size="small" type="primary" icon={<TagsOutlined />} onClick={openEventModal} style={{ background: '#fa8c16', borderColor: '#fa8c16' }}>
            행사 설정 ({selectedRowKeys.length})
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBulkEventClear}>
            행사 해제 ({selectedRowKeys.length})
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
          onChange: handleRowSelect,
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

      {/* 일괄 행사가 설정 모달 */}
      <Modal
        title={`행사가 일괄 설정 (${selectedRowKeys.length}개 상품)`}
        open={eventModalOpen}
        onCancel={() => setEventModalOpen(false)}
        onOk={handleBulkEventSet}
        confirmLoading={bulkEventLoading}
        okText="행사가 설정"
        cancelText="취소"
        width={700}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          {/* 공통 설정: 기간 + 매장 */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>행사기간 (공통)</div>
              <RangePicker
                value={bulkEventDateRange as any}
                onChange={(v) => setBulkEventDateRange(v ? [v[0], v[1]] : [null, null])}
                style={{ width: '100%' }}
                placeholder={['시작일', '종료일']}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                대상 매장
                <Switch
                  size="small" style={{ marginLeft: 8 }}
                  checked={bulkAllStores}
                  onChange={(v) => { setBulkAllStores(v); if (v) setBulkEventStores([]); }}
                  checkedChildren="전체" unCheckedChildren="선택"
                />
              </div>
              {!bulkAllStores ? (
                <Select
                  mode="multiple" placeholder="매장 선택"
                  options={storeOptions} value={bulkEventStores}
                  onChange={setBulkEventStores} style={{ width: '100%' }}
                  optionFilterProp="label"
                />
              ) : <div style={{ height: 32, lineHeight: '32px', color: '#999', fontSize: 12 }}>전체 매장 적용</div>}
            </div>
          </div>

          {/* 일괄 가격 적용 */}
          <div className="event-bulk-price-row" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f6f6f6', padding: '8px 12px', borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>일괄 가격:</span>
            <InputNumber
              min={0} style={{ width: 160 }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              placeholder="금액 입력 후 적용"
              onPressEnter={(e) => { const v = Number((e.target as HTMLInputElement).value.replace(/,/g, '')); if (v > 0) applyBulkPrice(v); }}
            />
            <Button size="small" onClick={() => {
              const el = document.querySelector('.event-bulk-price-row input') as HTMLInputElement;
              const v = el ? Number(el.value.replace(/,/g, '')) : 0;
              if (v > 0) applyBulkPrice(v);
              else message.warning('금액을 입력해주세요');
            }}>전체 적용</Button>
            <span style={{ fontSize: 11, color: '#999' }}>Enter로도 적용 가능</span>
          </div>

          {/* 상품별 행사가 테이블 */}
          <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>상품코드</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>상품명</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>정상가</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>할인가</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0', width: 150 }}>행사가 *</th>
                </tr>
              </thead>
              <tbody>
                {selectedProducts.map((p: any) => (
                  <tr key={p.product_code} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '4px 8px', color: '#666', fontSize: 12 }}>{p.product_code}</td>
                    <td style={{ padding: '4px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#999', fontSize: 12 }}>{Number(p.base_price || 0).toLocaleString()}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#cf1322', fontSize: 12 }}>{p.discount_price ? Number(p.discount_price).toLocaleString() : '-'}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <InputNumber
                        min={0} size="small"
                        style={{ width: '100%' }}
                        value={bulkEventPriceMap[p.product_code] || 0}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        onChange={(v) => setBulkEventPriceMap(prev => ({ ...prev, [p.product_code]: v || 0 }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
