import { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Button, Modal, Select, InputNumber, Space, DatePicker, Tag, message, Divider, Upload, Alert, Input } from 'antd';
import type { InputRef } from 'antd';
import { DeleteOutlined, ShoppingCartOutlined, UploadOutlined, DownloadOutlined, BarcodeOutlined, EditOutlined, RollbackOutlined, ExclamationCircleOutlined, SwapOutlined, SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { crmApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { getToken } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import dayjs from 'dayjs';

const SALE_TYPE_OPTIONS = [
  { label: '정상', value: '정상' },
  { label: '할인', value: '할인' },
  { label: '행사', value: '행사' },
];

const RETURN_REASON_OPTIONS = [
  { label: '사이즈 불일치', value: 'SIZE' },
  { label: '색상 불일치', value: 'COLOR' },
  { label: '불량/하자', value: 'DEFECT' },
  { label: '고객 변심', value: 'CHANGE_MIND' },
  { label: '파손/오염', value: 'DAMAGE' },
  { label: '오배송', value: 'WRONG_ITEM' },
  { label: '기타', value: 'OTHER' },
];

export default function SalesDailyPage({ embedded }: { embedded?: boolean } = {}) {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isManager = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER || user?.role === ROLES.STORE_MANAGER;
  const isStoreManager = user?.role === ROLES.STORE_MANAGER;
  const isHqOrAbove = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    [dayjs(), dayjs()],
  );
  const [searchText, setSearchText] = useState('');

  // 수정 모달
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editQty, setEditQty] = useState(1);
  const [editUnitPrice, setEditUnitPrice] = useState(0);
  const [editSaleType, setEditSaleType] = useState('정상');
  const [editMemo, setEditMemo] = useState('');
  const [editTaxFreeAmount, setEditTaxFreeAmount] = useState(0);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null);
  const [editCustomerInfo, setEditCustomerInfo] = useState<any>(null);
  const [editCustomerSearch, setEditCustomerSearch] = useState<any[]>([]);
  const editCustomerDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 반품 모달
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRecord, setReturnRecord] = useState<any>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnMaxQty, setReturnMaxQty] = useState(0);
  const [returnReason, setReturnReason] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // 직접 반품
  const [directReturnOpen, setDirectReturnOpen] = useState(false);
  const [directReturnProduct, setDirectReturnProduct] = useState<any>(null);
  const [directReturnQty, setDirectReturnQty] = useState(1);
  const [directReturnReason, setDirectReturnReason] = useState('');
  const [directReturnSubmitting, setDirectReturnSubmitting] = useState(false);
  const [directReturnBarcode, setDirectReturnBarcode] = useState('');
  const [directReturnScanning, setDirectReturnScanning] = useState(false);
  const [directReturnSearchResults, setDirectReturnSearchResults] = useState<any[]>([]);
  const [directReturnPartner, setDirectReturnPartner] = useState<string | undefined>();
  const directReturnBarcodeRef = useRef<InputRef>(null);

  // CRM 고객 연동 (직접 반품용)
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [customerSearch, setCustomerSearch] = useState<any[]>([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 교환 모달
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [exchangeRecord, setExchangeRecord] = useState<any>(null);
  const [exchangeReturnReason, setExchangeReturnReason] = useState('');
  const [exchangeNewVariant, setExchangeNewVariant] = useState<any>(null);
  const [exchangeNewQty, setExchangeNewQty] = useState(1);
  const [exchangeNewPrice, setExchangeNewPrice] = useState(0);
  const [exchangeSearchResults, setExchangeSearchResults] = useState<any[]>([]);
  const [exchangeSubmitting, setExchangeSubmitting] = useState(false);
  const [exchangeMaxQty, setExchangeMaxQty] = useState(1);

  // 엑셀
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }
      if (partnerFilter) params.partner_code = partnerFilter;
      if (searchText.trim()) params.search = searchText.trim();
      const result = await salesApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '1000' }).then((r: any) => setPartners(r.data)).catch(() => {});
    }
  }, []);

  const handleSearch = () => { setPage(1); load(1); };

  // 고객 검색
  const handleCustomerSearch = useCallback((value: string) => {
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    setCustomerPhone(value);
    if (!value || value.trim().length < 2) { setCustomerSearch([]); return; }
    customerDebounceRef.current = setTimeout(async () => {
      try {
        const r = await crmApi.list({ search: value.trim(), limit: '20' });
        setCustomerSearch(r.data || []);
      } catch { setCustomerSearch([]); }
    }, 300);
  }, []);

  // 수정
  const openEditModal = async (record: any) => {
    setEditRecord(record);
    setEditQty(Number(record.qty));
    setEditUnitPrice(Number(record.unit_price));
    setEditSaleType(record.sale_type || '정상');
    setEditMemo(record.memo || '');
    setEditTaxFreeAmount(Number(record.tax_free_amount) || 0);
    setEditCustomerId(record.customer_id || null);
    setEditCustomerInfo(null);
    setEditCustomerSearch([]);
    setEditModalOpen(true);
    // 기존 고객 정보 로드
    if (record.customer_id) {
      try {
        const r = await crmApi.detail(record.customer_id);
        setEditCustomerInfo(r);
      } catch { /* ignore */ }
    }
  };
  const handleEditCustomerSearch = useCallback((value: string) => {
    if (editCustomerDebounceRef.current) clearTimeout(editCustomerDebounceRef.current);
    if (!value || value.trim().length < 2) { setEditCustomerSearch([]); return; }
    editCustomerDebounceRef.current = setTimeout(async () => {
      try {
        const r = await crmApi.list({ search: value.trim(), limit: '20' });
        setEditCustomerSearch(r.data || []);
      } catch { setEditCustomerSearch([]); }
    }, 300);
  }, []);

  const handleEditSubmit = async () => {
    if (!editRecord || editSubmitting) return;
    setEditSubmitting(true);
    try {
      const result = await salesApi.update(editRecord.sale_id, { qty: editQty, unit_price: editUnitPrice, sale_type: editSaleType, memo: editMemo.trim() || undefined, tax_free_amount: editTaxFreeAmount, customer_id: editCustomerId });
      const newTotalPrice = editQty * editUnitPrice;
      // 목록 데이터 즉시 반영
      setData(prev => prev.map(row =>
        row.sale_id === editRecord.sale_id
          ? { ...row, qty: editQty, unit_price: editUnitPrice, total_price: newTotalPrice, sale_type: editSaleType, memo: editMemo.trim() || null, tax_free_amount: editTaxFreeAmount }
          : row,
      ));
      const diff = result.price_diff ?? 0;
      if (diff !== 0) {
        message.success(`매출이 수정되었습니다. (차액: ${diff > 0 ? '+' : ''}${Number(diff).toLocaleString()}원)`);
      } else {
        message.success('매출이 수정되었습니다.');
      }
      setEditModalOpen(false);
    } catch (e: any) { message.error(e.message); }
    finally { setEditSubmitting(false); }
  };

  // 삭제
  const handleDelete = (record: any) => {
    Modal.confirm({
      title: '매출 삭제',
      icon: <ExclamationCircleOutlined />,
      content: `${record.product_name} (${record.sku}) ${Number(record.qty)}개 매출을 삭제하시겠습니까? 재고가 복원됩니다.`,
      okText: '삭제', okType: 'danger', cancelText: '취소',
      onOk: async () => {
        try {
          await salesApi.remove(record.sale_id);
          message.success('매출이 삭제되었습니다.');
          load();
        } catch (e: any) { message.error(e.message); }
      },
    });
  };

  // 반품
  const openReturnModal = async (record: any) => {
    setReturnRecord(record);
    setReturnReason('');
    setReturnModalOpen(true);
    try {
      const info = await salesApi.getReturnable(record.sale_id);
      setReturnMaxQty(info.remaining);
      setReturnQty(Math.min(Number(record.qty), info.remaining));
    } catch {
      setReturnMaxQty(Number(record.qty));
      setReturnQty(Number(record.qty));
    }
  };
  const handleReturnSubmit = async () => {
    if (!returnRecord || returnSubmitting) return;
    if (!returnReason) { message.error('반품 사유를 선택해주세요'); return; }
    setReturnSubmitting(true);
    try {
      await salesApi.createReturn(returnRecord.sale_id, { qty: returnQty, reason: '', return_reason: returnReason });
      message.success(`${returnQty}개 반품이 등록되었습니다.`);
      setReturnModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setReturnSubmitting(false); }
  };

  // 직접 반품
  const openDirectReturn = () => {
    setDirectReturnProduct(null); setDirectReturnQty(1); setDirectReturnReason('');
    setDirectReturnBarcode(''); setDirectReturnSearchResults([]); setDirectReturnPartner(undefined);
    setCustomerId(undefined); setCustomerInfo(null); setCustomerPhone(''); setCustomerSearch([]);
    setDirectReturnOpen(true);
    setTimeout(() => directReturnBarcodeRef.current?.focus(), 100);
  };
  const handleDirectReturnScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setDirectReturnScanning(true);
    try {
      const product = await salesApi.scanProduct(trimmed);
      setDirectReturnProduct(product); setDirectReturnQty(1);
      message.success(`${product.sku} - ${product.product_name} 선택됨`);
    } catch { message.error('상품을 찾을 수 없습니다'); }
    finally { setDirectReturnBarcode(''); setDirectReturnScanning(false); setTimeout(() => directReturnBarcodeRef.current?.focus(), 50); }
  };
  const handleDirectReturnSearch = async (value: string) => {
    if (value.length >= 2) {
      try {
        const pc = isStore ? user?.partnerCode : directReturnPartner;
        const results = await productApi.searchVariants(value, pc || undefined);
        setDirectReturnSearchResults(results);
      } catch (e: any) { message.error('검색 실패: ' + e.message); }
    }
  };
  const handleDirectReturnSubmit = async () => {
    if (directReturnSubmitting) return;
    if (!directReturnProduct) { message.error('반품할 상품을 선택해주세요'); return; }
    if (directReturnQty <= 0) { message.error('반품 수량을 입력해주세요'); return; }
    if (!directReturnReason) { message.error('반품 사유를 선택해주세요'); return; }
    if (!isStore && !directReturnPartner) { message.error('거래처를 선택해주세요'); return; }
    setDirectReturnSubmitting(true);
    try {
      await salesApi.createDirectReturn({
        variant_id: directReturnProduct.variant_id, qty: directReturnQty,
        unit_price: directReturnProduct.base_price || 0, reason: '', return_reason: directReturnReason,
        ...(!isStore && directReturnPartner ? { partner_code: directReturnPartner } : {}),
      });
      message.success(`${directReturnQty}개 반품이 등록되었습니다.`);
      setDirectReturnOpen(false); load();
    } catch (e: any) { message.error(e.message); }
    finally { setDirectReturnSubmitting(false); }
  };

  // 교환
  const openExchangeModal = async (record: any) => {
    setExchangeRecord(record); setExchangeReturnReason(''); setExchangeNewVariant(null);
    setExchangeNewQty(1); setExchangeNewPrice(0); setExchangeSearchResults([]);
    setExchangeModalOpen(true);
    try {
      const info = await salesApi.getReturnable(record.sale_id);
      setExchangeMaxQty(info.remaining);
      setExchangeNewQty(Math.min(1, info.remaining));
    } catch {
      setExchangeMaxQty(Number(record.qty));
    }
    // 같은 상품의 다른 컬러/사이즈 variant 자동 로드
    if (record.product_code) {
      try {
        const pc = isStore ? user?.partnerCode : undefined;
        const results = await productApi.searchVariants(record.product_code, pc || undefined);
        // 원본 variant 제외
        const filtered = results.filter((v: any) => v.variant_id !== record.variant_id);
        setExchangeSearchResults(filtered);
        // 1개뿐이면 자동 선택
        if (filtered.length === 1) {
          setExchangeNewVariant(filtered[0]);
          setExchangeNewPrice(filtered[0].base_price || filtered[0].price || 0);
        }
      } catch { /* ignore */ }
    }
  };
  const handleExchangeSubmit = async () => {
    if (exchangeSubmitting) return;
    if (!exchangeRecord || !exchangeNewVariant) { message.error('교환 상품을 선택해주세요'); return; }
    if (!exchangeReturnReason) { message.error('교환 사유를 선택해주세요'); return; }
    setExchangeSubmitting(true);
    try {
      await salesApi.createExchange(exchangeRecord.sale_id, {
        new_variant_id: exchangeNewVariant.variant_id, new_qty: exchangeNewQty,
        new_unit_price: exchangeNewPrice, return_reason: exchangeReturnReason,
        return_qty: exchangeNewQty,
      });
      message.success('교환이 처리되었습니다.');
      setExchangeModalOpen(false); load();
    } catch (e: any) { message.error(e.message); }
    finally { setExchangeSubmitting(false); }
  };

  // 엑셀
  const handleExcelUpload = async (file: File) => {
    setUploading(true); setUploadResult(null);
    try {
      const result = await salesApi.uploadExcel(file);
      setUploadResult(result);
      if (result.created > 0) { message.success(`${result.created}건 매출이 등록되었습니다.`); load(); }
    } catch (e: any) { message.error(e.message); }
    finally { setUploading(false); }
    return false;
  };
  const handleDownloadTemplate = () => {
    const token = getToken();
    fetch(`/api/sales/excel/template`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'sales_template.xlsx'); link.click(); URL.revokeObjectURL(url); });
  };

  // 컬럼
  const columns: any[] = [
    { title: '매출일', dataIndex: 'sale_date', key: 'sale_date', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '매출번호', dataIndex: 'sale_number', key: 'sale_number', width: 140,
      render: (v: string) => v ? <span style={{ fontSize: 12, color: '#888' }}>{v}</span> : '-' },
    ...(!isStore ? [{ title: '거래처', dataIndex: 'partner_name', key: 'partner_name' }] : []),
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70 },
    { title: '유형', dataIndex: 'sale_type', key: 'sale_type', width: 75,
      render: (v: string) => {
        if (v === '예약판매') return <Tag color="orange">예약판매</Tag>;
        return <span style={{ color: { '정상': '#1677ff', '할인': '#cf1322', '행사': '#d46b08', '반품': '#722ed1', '수정': '#fa8c16' }[v] || '#666' }}>{v || '정상'}</span>;
      },
    },
    { title: 'T/F', dataIndex: 'tax_free_amount', key: 'tax_free_amount', width: 80, align: 'right' as const,
      render: (v: number) => v ? <span style={{ color: '#389e0d', fontWeight: 600 }}>{Number(v).toLocaleString()}</span> : null,
    },
    { title: '반품사유', dataIndex: 'return_reason', key: 'return_reason', width: 90,
      render: (v: string) => {
        if (!v) return null;
        const label = RETURN_REASON_OPTIONS.find(o => o.value === v)?.label || v;
        return <span style={{ fontSize: 12, color: '#722ed1' }}>{label}</span>;
      },
    },
    { title: '메모', dataIndex: 'memo', key: 'memo', width: 120, ellipsis: true,
      render: (v: string | null) => v ? <span style={{ fontSize: 12, color: '#888' }}>{v}</span> : null,
    },
    { title: '수량', dataIndex: 'qty', key: 'qty', width: 70, render: (v: number) => Number(v).toLocaleString() },
    { title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 100, render: (v: number) => Number(v).toLocaleString() },
    { title: '합계', dataIndex: 'total_price', key: 'total_price', width: 120,
      render: (v: number) => <span style={{ fontWeight: 600, color: Number(v) < 0 ? '#cf1322' : undefined }}>{Number(v).toLocaleString()}</span>,
    },
    ...(isManager ? [{
      title: '관리', key: 'actions', width: 130, fixed: 'right' as const,
      render: (_: any, record: any) => {
        // 예약판매(대기중) 행은 예약판매 탭에서 관리
        if (record.source === 'preorder') {
          return <Tag color="orange" style={{ fontSize: 11 }}>예약판매 탭에서 관리</Tag>;
        }
        const daysAgo = record.sale_date ? dayjs().diff(dayjs(record.sale_date), 'day') : 0;
        const editExpired = isStoreManager && daysAgo > 0;
        const returnExpired = isStoreManager && daysAgo > 30;
        const isFulfilledPreorder = (record.memo || '').includes('예약판매');
        if (isStoreManager && isFulfilledPreorder) {
          return null;
        }
        if (record.sale_type === '수정') {
          return <span style={{ color: '#fa8c16', fontSize: 12 }}>수정기록</span>;
        }
        if (record.sale_type === '반품') {
          if (isStoreManager) return <span style={{ color: '#999', fontSize: 12 }}>-</span>;
          return <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>삭제</Button>;
        }
        return (
          <Space size={4}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} disabled={editExpired} />
            <Button size="small" icon={<SwapOutlined />} onClick={() => openExchangeModal(record)} style={{ color: returnExpired ? undefined : '#1677ff' }} disabled={returnExpired} title={returnExpired ? '30일 초과' : '교환'} />
            <Button size="small" icon={<RollbackOutlined />} onClick={() => openReturnModal(record)} style={{ color: returnExpired ? undefined : '#722ed1' }} disabled={returnExpired} title={returnExpired ? '30일 초과' : '반품'} />
            {(!isStoreManager || !editExpired) && (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
            )}
          </Space>
        );
      },
    }] : []),
  ];

  return (
    <div>
      {!embedded && (
        <PageHeader title="판매일보" extra={
          <Space>
            <Button icon={<UploadOutlined />} onClick={() => { setUploadResult(null); setUploadModalOpen(true); }}>엑셀 업로드</Button>
            {isManager && (
              <Button icon={<RollbackOutlined />} onClick={openDirectReturn} style={{ color: '#722ed1', borderColor: '#722ed1' }}>반품 등록</Button>
            )}
          </Space>
        } />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            format="YYYY-MM-DD"
            allowClear
            style={{ width: 280 }}
          />
        </div>
        {!isStore && (
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
            <Select
              showSearch optionFilterProp="label" allowClear
              placeholder="전체"
              value={partnerFilter}
              onChange={setPartnerFilter}
              style={{ width: 180 }}
              options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
            />
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input.Search
            placeholder="SKU/상품명"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 200 }}
            allowClear
          />
        </div>
        <Button type="primary" onClick={handleSearch}>조회</Button>
      </div>

      <Table columns={columns} dataSource={data} rowKey="sale_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => { setPage(p); }, showTotal: (t) => `총 ${t}건` }} />

      {/* 수정 모달 */}
      <Modal title="매출 수정" open={editModalOpen} onCancel={() => setEditModalOpen(false)}
        onOk={handleEditSubmit} confirmLoading={editSubmitting} okText="저장" cancelText="취소" width={480}>
        {editRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div style={{ fontWeight: 600 }}>{editRecord.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{editRecord.sku} ({editRecord.color}/{editRecord.size})</div>
            </div>
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>판매유형{isStoreManager ? ' (변경불가)' : ''}</div>
              <Select value={editSaleType} options={SALE_TYPE_OPTIONS} style={{ width: '100%' }} onChange={setEditSaleType} disabled={isStoreManager} /></div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>수량</div>
                <InputNumber min={1} value={editQty} style={{ width: '100%' }} onChange={(v) => setEditQty(v || 1)} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>단가 (변경불가)</div>
                <InputNumber min={0} value={editUnitPrice} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} disabled /></div>
            </div>
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>고객</div>
              {editCustomerInfo ? (
                <Tag closable onClose={() => { setEditCustomerInfo(null); setEditCustomerId(null); setEditCustomerSearch([]); }}
                  color="green" style={{ fontSize: 13, padding: '4px 10px', lineHeight: '24px' }}>
                  {editCustomerInfo.customer_name} ({editCustomerInfo.phone}) | {editCustomerInfo.customer_tier || '일반'}
                </Tag>
              ) : (
                <Select showSearch placeholder="전화번호 또는 이름 (2자 이상)" filterOption={false} allowClear
                  onSearch={handleEditCustomerSearch} value={editCustomerId || undefined}
                  onChange={(v: number | undefined) => {
                    if (!v) { setEditCustomerId(null); setEditCustomerInfo(null); return; }
                    const c = editCustomerSearch.find((c: any) => c.customer_id === v);
                    if (c) { setEditCustomerInfo(c); setEditCustomerId(c.customer_id); setEditCustomerSearch([]); }
                  }} style={{ width: '100%' }}
                  notFoundContent="2자 이상 입력">
                  {editCustomerSearch.map((c: any) => (
                    <Select.Option key={c.customer_id} value={c.customer_id}>
                      <span style={{ fontWeight: 500 }}>{c.customer_name}</span>
                      <span style={{ color: '#888', marginLeft: 6 }}>{c.phone}</span>
                      <span style={{ color: '#1677ff', marginLeft: 6, fontSize: 12 }}>{c.customer_tier || '일반'}</span>
                    </Select.Option>
                  ))}
                </Select>
              )}
            </div>
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모</div>
              <Input placeholder="택스프리, 현금결제 등" value={editMemo} onChange={(e) => setEditMemo(e.target.value)} allowClear /></div>
            {isHqOrAbove && (
              <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Tax Free (최대 {Math.round(editQty * editUnitPrice * 0.1).toLocaleString()}원)</div>
                <InputNumber min={0} max={Math.round(editQty * editUnitPrice * 0.1)} value={editTaxFreeAmount}
                  onChange={(v) => setEditTaxFreeAmount(v || 0)} style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></div>
            )}
            {(() => {
              const origTotal = Number(editRecord.qty) * Number(editRecord.unit_price);
              const newTotal = editQty * editUnitPrice;
              const diff = newTotal - origTotal;
              return (
                <div style={{ background: '#fafafa', padding: 10, borderRadius: 6, marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666' }}>
                    <span>기존 금액</span><span>{origTotal.toLocaleString()}원</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                    <span>수정 금액</span><span>{newTotal.toLocaleString()}원</span>
                  </div>
                  {diff !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, marginTop: 4, color: diff > 0 ? '#389e0d' : '#cf1322' }}>
                      <span>차액</span><span>{diff > 0 ? '+' : ''}{diff.toLocaleString()}원</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* 반품 모달 */}
      <Modal title="반품 등록" open={returnModalOpen} onCancel={() => setReturnModalOpen(false)}
        onOk={handleReturnSubmit} confirmLoading={returnSubmitting} okText="반품 등록" cancelText="취소" width={480}
        okButtonProps={{ danger: true, disabled: returnMaxQty <= 0 }}>
        {returnRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div style={{ fontWeight: 600 }}>{returnRecord.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{returnRecord.sku} ({returnRecord.color}/{returnRecord.size})</div>
              <div style={{ fontSize: 12, color: '#666' }}>원본: {Number(returnRecord.qty)}개 x {Number(returnRecord.unit_price).toLocaleString()}원 = {Number(returnRecord.total_price).toLocaleString()}원</div>
            </div>
            {returnMaxQty < Number(returnRecord.qty) && returnMaxQty > 0 && (
              <Alert type="warning" showIcon style={{ marginBottom: 0 }} message={`기존 반품 ${Number(returnRecord.qty) - returnMaxQty}개 처리됨, 남은 반품 가능: ${returnMaxQty}개`} />
            )}
            {returnMaxQty <= 0 && <Alert type="error" showIcon style={{ marginBottom: 0 }} message="이미 전량 반품 처리되었습니다." />}
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 수량 (최대 {returnMaxQty}개)</div>
              <InputNumber min={1} max={returnMaxQty} value={returnQty} style={{ width: '100%' }} onChange={(v) => setReturnQty(v || 1)} disabled={returnMaxQty <= 0} /></div>
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 사유 *</div>
              <Select placeholder="반품 사유 선택" options={RETURN_REASON_OPTIONS} value={returnReason || undefined} onChange={setReturnReason} style={{ width: '100%' }} /></div>
            <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 600, color: '#cf1322' }}>반품 금액: -{(returnQty * Number(returnRecord.unit_price)).toLocaleString()}원</div>
          </div>
        )}
      </Modal>

      {/* 직접 반품 모달 */}
      <Modal title="반품 등록 (고객 반품)" open={directReturnOpen} onCancel={() => setDirectReturnOpen(false)}
        onOk={handleDirectReturnSubmit} confirmLoading={directReturnSubmitting} okText="반품 등록" cancelText="취소" width={520}
        okButtonProps={{ danger: true, disabled: !directReturnProduct }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert type="info" message="바코드 스캔 또는 상품 검색으로 반품할 상품을 선택하세요" showIcon style={{ marginBottom: 0 }} />
          <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>고객 검색</div>
            {customerInfo ? (
              <Tag closable onClose={() => { setCustomerInfo(null); setCustomerId(undefined); setCustomerPhone(''); setCustomerSearch([]); }}
                color="green" style={{ fontSize: 13, padding: '4px 10px', lineHeight: '24px' }}>
                {customerInfo.customer_name} ({customerInfo.phone}) | {customerInfo.customer_tier || '일반'}
              </Tag>
            ) : (
              <Select showSearch placeholder="전화번호 또는 이름 (2자 이상)" filterOption={false}
                onSearch={handleCustomerSearch} onChange={(v: number) => {
                  const c = customerSearch.find((c: any) => c.customer_id === v);
                  if (c) { setCustomerInfo(c); setCustomerId(c.customer_id); setCustomerPhone(c.phone || ''); setCustomerSearch([]); }
                }} style={{ width: '100%' }}
                notFoundContent={customerPhone.trim().length >= 2 ? '검색 결과 없음' : '2자 이상 입력'}>
                {customerSearch.map((c: any) => (
                  <Select.Option key={c.customer_id} value={c.customer_id}>
                    <span style={{ fontWeight: 500 }}>{c.customer_name}</span>
                    <span style={{ color: '#888', marginLeft: 6 }}>{c.phone}</span>
                    <span style={{ color: '#1677ff', marginLeft: 6, fontSize: 12 }}>{c.customer_tier || '일반'}</span>
                  </Select.Option>
                ))}
              </Select>
            )}
          </div>
          {!isStore && (
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>거래처 *</div>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" style={{ width: '100%' }}
                value={directReturnPartner} onChange={setDirectReturnPartner}
                options={partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }))} /></div>
          )}
          <Input ref={directReturnBarcodeRef} placeholder="바코드/SKU 스캔 또는 입력 후 Enter" prefix={<BarcodeOutlined />}
            value={directReturnBarcode} onChange={(e) => setDirectReturnBarcode(e.target.value)}
            onPressEnter={() => handleDirectReturnScan(directReturnBarcode)} disabled={directReturnScanning} allowClear size="large" />
          <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>또는 상품 검색</div>
            <Select showSearch placeholder="SKU/상품명 검색 (2자 이상)" filterOption={false} style={{ width: '100%' }}
              value={directReturnProduct?.variant_id} onSearch={handleDirectReturnSearch}
              onChange={(v) => { const found = directReturnSearchResults.find((r: any) => r.variant_id === v); if (found) { setDirectReturnProduct(found); setDirectReturnQty(1); } }}
              notFoundContent="2자 이상 입력">
              {directReturnSearchResults.map((v: any) => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size}){v.current_stock != null ? ` [재고: ${v.current_stock}]` : ''}
                </Select.Option>
              ))}
            </Select></div>
          {directReturnProduct && (
            <>
              <div style={{ background: '#f9f0ff', padding: 12, borderRadius: 6, border: '1px solid #d3adf7' }}>
                <div style={{ fontWeight: 600 }}>{directReturnProduct.product_name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{directReturnProduct.sku} ({directReturnProduct.color}/{directReturnProduct.size})</div>
                <div style={{ fontSize: 12, color: '#666' }}>정가: {Number(directReturnProduct.base_price || 0).toLocaleString()}원{directReturnProduct.current_stock !== undefined && ` | 현재 재고: ${directReturnProduct.current_stock}개`}</div>
              </div>
              <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 수량</div>
                <InputNumber min={1} value={directReturnQty} style={{ width: '100%' }} onChange={(v) => setDirectReturnQty(v || 1)} /></div>
              <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 사유 *</div>
                <Select placeholder="반품 사유 선택" options={RETURN_REASON_OPTIONS} value={directReturnReason || undefined} onChange={setDirectReturnReason} style={{ width: '100%' }} /></div>
              <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 600, color: '#cf1322' }}>반품 금액: -{(directReturnQty * Number(directReturnProduct.base_price || 0)).toLocaleString()}원</div>
            </>
          )}
        </div>
      </Modal>

      {/* 교환 모달 */}
      <Modal title="교환 처리" open={exchangeModalOpen} onCancel={() => setExchangeModalOpen(false)}
        onOk={handleExchangeSubmit} confirmLoading={exchangeSubmitting} okText="교환 처리" cancelText="취소" width={560}
        okButtonProps={{ disabled: !exchangeNewVariant || !exchangeReturnReason }}>
        {exchangeRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>원본 상품 (반품 처리됨)</div>
              <div style={{ fontWeight: 600 }}>{exchangeRecord.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{exchangeRecord.sku} ({exchangeRecord.color}/{exchangeRecord.size}) | {Number(exchangeRecord.qty)}개 x {Number(exchangeRecord.unit_price).toLocaleString()}원</div>
              <div style={{ fontSize: 12, color: '#1677ff', marginTop: 2 }}>교환 가능 수량: {exchangeMaxQty}개</div>
            </div>
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>교환 사유 *</div>
              <Select placeholder="교환 사유 선택" options={RETURN_REASON_OPTIONS} value={exchangeReturnReason || undefined} onChange={setExchangeReturnReason} style={{ width: '100%' }} /></div>
            <Divider style={{ margin: '4px 0' }}>교환 컬러/사이즈 선택</Divider>
            <div><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>같은 상품의 다른 컬러/사이즈 *</div>
              <Select showSearch optionFilterProp="label" placeholder="컬러/사이즈 선택" style={{ width: '100%' }}
                value={exchangeNewVariant?.variant_id}
                onChange={(v) => { const found = exchangeSearchResults.find((r: any) => r.variant_id === v); if (found) { setExchangeNewVariant(found); setExchangeNewPrice(found.base_price || found.price || 0); } }}
                notFoundContent="교환 가능한 옵션이 없습니다">
                {exchangeSearchResults.map((v: any) => (
                  <Select.Option key={v.variant_id} value={v.variant_id} label={`${v.color} ${v.size}`}>
                    {v.color}/{v.size}{v.current_stock != null ? ` [재고: ${v.current_stock}]` : ''}
                  </Select.Option>
                ))}
              </Select></div>
            {exchangeNewVariant && (
              <>
                <div style={{ background: '#f0f5ff', padding: 12, borderRadius: 6, border: '1px solid #adc6ff' }}>
                  <div style={{ fontWeight: 600 }}>{exchangeNewVariant.product_name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{exchangeNewVariant.sku} ({exchangeNewVariant.color}/{exchangeNewVariant.size}){exchangeNewVariant.current_stock !== undefined && ` | 재고: ${exchangeNewVariant.current_stock}개`}</div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>수량 (최대 {exchangeMaxQty}개)</div>
                    <InputNumber min={1} max={exchangeMaxQty} value={exchangeNewQty} style={{ width: '100%' }} onChange={(v) => setExchangeNewQty(v || 1)} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>단가</div>
                    <InputNumber min={0} value={exchangeNewPrice} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={(v) => setExchangeNewPrice(v || 0)} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                  <span style={{ color: '#cf1322' }}>반품: -{(exchangeNewQty * Number(exchangeRecord.unit_price)).toLocaleString()}원</span>
                  <span style={{ color: '#389e0d' }}>교환: +{(exchangeNewQty * exchangeNewPrice).toLocaleString()}원</span>
                </div>
                <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 600 }}>차액: {((exchangeNewQty * exchangeNewPrice) - (exchangeNewQty * Number(exchangeRecord.unit_price))).toLocaleString()}원</div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 엑셀 업로드 모달 */}
      <Modal title="매출 엑셀 업로드" open={uploadModalOpen} onCancel={() => setUploadModalOpen(false)} footer={null} width={520}>
        <div style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} type="link" style={{ padding: 0 }}>엑셀 템플릿 다운로드</Button>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>(.xlsx 형식)</span>
        </div>
        <Upload.Dragger accept=".xlsx,.xls" maxCount={1} showUploadList={false}
          beforeUpload={(file) => { handleExcelUpload(file); return false; }} disabled={uploading}>
          <p style={{ fontSize: 40, color: '#1890ff', margin: 0 }}><UploadOutlined /></p>
          <p style={{ fontWeight: 600 }}>{uploading ? '업로드 중...' : '클릭 또는 파일을 드래그하세요'}</p>
          <p style={{ color: '#888', fontSize: 12 }}>지원 형식: .xlsx, .xls (최대 5MB)</p>
        </Upload.Dragger>
        {uploadResult && (
          <div style={{ marginTop: 16 }}>
            <Alert type={uploadResult.created > 0 ? 'success' : 'warning'}
              message={`처리 완료: 전체 ${uploadResult.total}건 중 ${uploadResult.created}건 등록 / ${uploadResult.skipped}건 건너뜀`} style={{ marginBottom: 8 }} />
            {uploadResult.errors?.length > 0 && (
              <div style={{ maxHeight: 200, overflow: 'auto', background: '#fff2f0', padding: 12, borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#cf1322' }}>오류 상세:</div>
                {uploadResult.errors.map((e: string, i: number) => <div key={i} style={{ color: '#555' }}>{e}</div>)}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
