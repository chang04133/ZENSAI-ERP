import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Table, Button, Modal, Select, InputNumber, Space, DatePicker, Tag, message, Divider, Upload, Alert, Segmented, Input, Switch, Tabs, Popconfirm, Spin } from 'antd';
import type { InputRef } from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingCartOutlined, UploadOutlined, DownloadOutlined, BarcodeOutlined, MinusOutlined, EditOutlined, RollbackOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { crmApi } from '../../modules/crm/crm.api';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { getToken, apiFetch } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import { useSearchParams, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import SalesDailyPage from './SalesDailyPage';

const SALE_TYPE_OPTIONS = [
  { label: '정상', value: '정상' },
  { label: '할인', value: '할인' },
  { label: '행사', value: '행사' },
  { label: '직원할인', value: '직원할인' },
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

interface SaleItem {
  key: number;
  variant_id?: number;
  variantLabel?: string;
  sale_type: string;
  qty: number;
  unit_price: number;
  base_price?: number;
  discount_price?: number;
  event_price?: number;
  current_stock?: number;
  tax_free_amount: number;
}

export default function SalesEntryPage() {
  const itemKeyRef = useRef(0);
  const newItem = (): SaleItem => ({ key: ++itemKeyRef.current, sale_type: '정상', qty: 1, unit_price: 0, tax_free_amount: 0 });
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'ADMIN' || user?.role === 'SYS_ADMIN' || user?.role === 'HQ_MANAGER' || user?.role === 'STORE_MANAGER';
  const saleTypeOptions = isAdmin ? SALE_TYPE_OPTIONS : SALE_TYPE_OPTIONS.filter(o => o.value !== '직원할인');

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isPreorderRoute = location.pathname === '/sales/preorders';
  const isReturnsRoute = location.pathname === '/sales/returns';
  const isDailyRoute = location.pathname === '/sales/daily';
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || (isPreorderRoute ? 'preorders' : isReturnsRoute ? 'returns' : isDailyRoute ? 'daily' : 'entry'));
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [variantSearchMap, setVariantSearchMap] = useState<Record<number, any[]>>({});

  // 엑셀 업로드
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ total: number; created: number; skipped: number; errors?: string[] } | null>(null);

  // 폼 상태
  const [saleDate, setSaleDate] = useState(dayjs());
  const [partnerCode, setPartnerCode] = useState<string | undefined>();
  const [items, setItems] = useState<SaleItem[]>([newItem()]);
  const [memo, setMemo] = useState('');

  // 거래처 변경 시 검색결과 초기화 (재고 정보가 거래처별이므로)
  const handlePartnerChange = useCallback((pc: string | undefined) => {
    setPartnerCode(pc);
    setVariantSearchMap({});
    // 이미 선택된 상품의 재고 정보도 초기화
    setItems(prev => prev.map(i => i.variant_id ? { ...i, current_stock: undefined } : i));
  }, []);

  // 택스프리
  const allTaxFree = items.length > 0 && items.every(i => i.tax_free_amount > 0);
  const handleToggleAllTaxFree = (checked: boolean) => {
    setItems(prev => prev.map(i => {
      if (checked) {
        const total = (i.qty || 0) * (i.unit_price || 0);
        return { ...i, tax_free_amount: Math.round(total * 0.1) };
      }
      return { ...i, tax_free_amount: 0 };
    }));
  };

  // 바코드 스캔
  const [entryMode, setEntryMode] = useState<'manual' | 'barcode'>('manual');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const barcodeInputRef = useRef<InputRef>(null);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // CRM 고객
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [customerSearch, setCustomerSearch] = useState<any[]>([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerInfo, setCustomerInfo] = useState<any>(null);

  const [quickRegisterOpen, setQuickRegisterOpen] = useState(false);
  const [quickRegisterName, setQuickRegisterName] = useState('');
  const [quickRegisterGender, setQuickRegisterGender] = useState<string | undefined>();
  const [quickRegisterLoading, setQuickRegisterLoading] = useState(false);

  // ─── 반품관리 상태 ───
  const [returnData, setReturnData] = useState<any[]>([]);
  const [returnTotal, setReturnTotal] = useState(0);
  const [returnPage, setReturnPage] = useState(1);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnPartner, setReturnPartner] = useState<string | undefined>();
  const [returnDateRange, setReturnDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // 반품 수정 모달
  const [editReturnOpen, setEditReturnOpen] = useState(false);
  const [editReturnRecord, setEditReturnRecord] = useState<any>(null);
  const [editReturnQty, setEditReturnQty] = useState(1);
  const [editReturnPrice, setEditReturnPrice] = useState(0);
  const [editReturnReason, setEditReturnReason] = useState('');
  const [editReturnMemo, setEditReturnMemo] = useState('');
  const [editReturnSubmitting, setEditReturnSubmitting] = useState(false);

  // 직접 반품 등록 모달
  const [directReturnOpen, setDirectReturnOpen] = useState(false);
  const [drPartner, setDrPartner] = useState<string | undefined>();
  const [drVariantId, setDrVariantId] = useState<number | undefined>();
  const [drVariantSearch, setDrVariantSearch] = useState<any[]>([]);
  const [drQty, setDrQty] = useState(1);
  const [drPrice, setDrPrice] = useState(0);
  const [drReason, setDrReason] = useState('');
  const [drMemo, setDrMemo] = useState('');
  const [drSubmitting, setDrSubmitting] = useState(false);

  // 매출에서 반품 모달
  const [saleSearchOpen, setSaleSearchOpen] = useState(false);
  const [saleSearchData, setSaleSearchData] = useState<any[]>([]);
  const [saleSearchTotal, setSaleSearchTotal] = useState(0);
  const [saleSearchLoading, setSaleSearchLoading] = useState(false);
  const [saleSearchText, setSaleSearchText] = useState('');
  const [saleSearchPartner, setSaleSearchPartner] = useState<string | undefined>();
  const [saleSearchDate, setSaleSearchDate] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [saleSearchPage, setSaleSearchPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [returnFromSaleOpen, setReturnFromSaleOpen] = useState(false);
  const [returnableInfo, setReturnableInfo] = useState<{ total: number; returned: number; remaining: number } | null>(null);
  const [rfsQty, setRfsQty] = useState(1);
  const [rfsReason, setRfsReason] = useState('');
  const [rfsMemo, setRfsMemo] = useState('');
  const [rfsSubmitting, setRfsSubmitting] = useState(false);

  useEffect(() => {
    (async () => { try { const r = await partnerApi.list({ limit: '1000' }); setPartners(r.data); } catch {} })();
  }, []);

  // ─── 반품 목록 로드 ───
  const loadReturns = useCallback(async () => {
    setReturnLoading(true);
    try {
      const params: Record<string, string> = { page: String(returnPage), limit: '50' };
      if (returnSearch) params.search = returnSearch;
      if (returnPartner) params.partner_code = returnPartner;
      if (returnDateRange?.[0]) params.date_from = returnDateRange[0].format('YYYY-MM-DD');
      if (returnDateRange?.[1]) params.date_to = returnDateRange[1].format('YYYY-MM-DD');
      const r = await salesApi.returnList(params);
      setReturnData(r.data);
      setReturnTotal(r.total);
    } catch (e: any) { message.error('반품 목록 로드 실패: ' + e.message); }
    finally { setReturnLoading(false); }
  }, [returnPage, returnSearch, returnPartner, returnDateRange]);

  // ─── 예약판매 ───
  const [preorders, setPreorders] = useState<any[]>([]);
  const [preorderLoading, setPreorderLoading] = useState(false);

  const loadPreorders = useCallback(async () => {
    setPreorderLoading(true);
    try {
      const r = await salesApi.preorders();
      setPreorders(r.data || r || []);
    } catch (e: any) { message.error('예약판매 로드 실패: ' + e.message); }
    finally { setPreorderLoading(false); }
  }, []);

  // ─── 예약판매 재고조회 모달 ───
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState<any>(null);
  const [variantStocks, setVariantStocks] = useState<any[]>([]);
  const [variantStocksLoading, setVariantStocksLoading] = useState(false);
  const [stockRequestMode, setStockRequestMode] = useState<'transfer' | 'hq'>('transfer');
  const [stockRequestQty, setStockRequestQty] = useState(1);
  const [stockRequestMemo, setStockRequestMemo] = useState('');
  const [stockRequestLoading, setStockRequestLoading] = useState(false);

  // 출고요청용 본사 코드 (partner_type='본사' 중 첫 번째, 기본값 '1')
  const hqCode = useMemo(() => {
    const hq = partners.find((p: any) => p.partner_type === '본사');
    return hq?.partner_code || '1';
  }, [partners]);

  const openStockModal = async (record: any) => {
    setStockTarget(record);
    setStockRequestMode('transfer');
    setStockRequestQty(record.qty || 1);
    setStockRequestMemo('');
    setVariantStocks([]);
    setStockModalOpen(true);
    setVariantStocksLoading(true);
    try {
      const data = await inventoryApi.byProduct(record.product_code);
      const filtered = data.filter((d: any) => d.variant_id === record.variant_id && Number(d.qty) !== 0);
      // partner_type은 byProduct API에서 직접 반환 — partners 로딩 불필요
      const enriched = filtered.map((d: any) => ({
        ...d,
        _isHq: d.partner_type === '본사' || d.partner_type === '창고',
      }));
      enriched.sort((a: any, b: any) => {
        if (a._isHq && !b._isHq) return -1;
        if (!a._isHq && b._isHq) return 1;
        return Number(b.qty) - Number(a.qty);
      });
      setVariantStocks(enriched);
    } catch (e: any) { message.error(e.message); }
    finally { setVariantStocksLoading(false); }
  };

  const handleStockRequest = async () => {
    if (!stockTarget || stockRequestQty <= 0) { message.error('수량을 입력해주세요'); return; }
    setStockRequestLoading(true);
    try {
      if (stockRequestMode === 'transfer') {
        const targets = variantStocks
          .filter((s: any) => s.partner_code !== user?.partnerCode && !s._isHq && Number(s.qty) > 0)
          .map((s: any) => ({ partner_code: s.partner_code, qty: Number(s.qty) }));
        if (targets.length === 0) { message.warning('재고를 보유한 다른 매장이 없습니다'); setStockRequestLoading(false); return; }
        const myStock = variantStocks.find((s: any) => s.partner_code === user?.partnerCode);
        const res = await apiFetch('/api/notifications/stock-request', {
          method: 'POST',
          body: JSON.stringify({
            variant_id: stockTarget.variant_id,
            from_qty: myStock ? Number(myStock.qty) : Number(stockTarget.current_stock || 0),
            targets,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const nos = data.data?.requestNos as string[] | undefined;
          Modal.success({
            title: '수평이동 의뢰 완료',
            content: nos?.[0]
              ? `의뢰번호: ${nos[0]}\n${targets.length}개 매장에 수평이동 요청을 보냈습니다.`
              : `${targets.length}개 매장에 수평이동 요청을 보냈습니다.`,
          });
        } else { message.error(data.error || '요청 실패'); setStockRequestLoading(false); return; }
      } else {
        const result: any = await shipmentApi.create({
          request_type: '출고요청',
          from_partner: hqCode,
          items: [{ variant_id: stockTarget.variant_id, request_qty: stockRequestQty }],
          memo: stockRequestMemo.trim() || undefined,
        } as any);
        Modal.success({
          title: '본사 재고요청 완료',
          content: `의뢰번호: ${result?.request_no || '-'}\n수량: ${stockRequestQty}개`,
        });
      }
      setStockModalOpen(false);
    } catch (e: any) { message.error(e.message); }
    finally { setStockRequestLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'returns') loadReturns();
    if (activeTab === 'preorders') loadPreorders();
  }, [activeTab, loadReturns, loadPreorders]);

  // ─── 반품 삭제 ───
  const handleDeleteReturn = async (id: number) => {
    try {
      await salesApi.remove(id);
      message.success('반품이 삭제되었습니다.');
      loadReturns();
    } catch (e: any) { message.error(e.message); }
  };

  // ─── 반품 수정 모달 열기 ───
  const openEditReturn = (record: any) => {
    setEditReturnRecord(record);
    setEditReturnQty(record.qty);
    setEditReturnPrice(Number(record.unit_price));
    setEditReturnReason(record.return_reason || '');
    setEditReturnMemo(record.memo || '');
    setEditReturnOpen(true);
  };

  // ─── 반품 수정 제출 ───
  const handleEditReturnSubmit = async () => {
    if (!editReturnRecord || editReturnSubmitting) return;
    if (editReturnQty <= 0) { message.error('수량은 1 이상이어야 합니다.'); return; }
    if (editReturnPrice <= 0) { message.error('단가는 양수여야 합니다.'); return; }
    setEditReturnSubmitting(true);
    try {
      await salesApi.updateReturn(editReturnRecord.sale_id, {
        qty: editReturnQty,
        unit_price: editReturnPrice,
        return_reason: editReturnReason || undefined,
        memo: editReturnMemo || undefined,
      });
      message.success('반품이 수정되었습니다.');
      setEditReturnOpen(false);
      loadReturns();
    } catch (e: any) { message.error(e.message); }
    finally { setEditReturnSubmitting(false); }
  };

  // ─── 직접 반품 등록 모달 열기 ───
  const openDirectReturn = () => {
    setDrPartner(isStore ? undefined : undefined);
    setDrVariantId(undefined);
    setDrVariantSearch([]);
    setDrQty(1);
    setDrPrice(0);
    setDrReason('');
    setDrMemo('');
    setDirectReturnOpen(true);
  };

  // ─── 직접 반품 상품 검색 ───
  const handleDrVariantSearch = useCallback(async (value: string) => {
    if (value.length >= 2) {
      try {
        const pc = isStore ? user?.partnerCode : drPartner;
        const results = await productApi.searchVariants(value, pc || undefined);
        setDrVariantSearch(results);
      } catch { setDrVariantSearch([]); }
    }
  }, [isStore, user?.partnerCode, drPartner]);

  // ─── 직접 반품 제출 ───
  const handleDirectReturnSubmit = async () => {
    if (drSubmitting) return;
    if (!drVariantId) { message.error('상품을 선택해주세요.'); return; }
    if (drQty <= 0) { message.error('수량은 1 이상이어야 합니다.'); return; }
    if (drPrice <= 0) { message.error('단가는 양수여야 합니다.'); return; }
    if (!drReason) { message.error('반품 사유를 선택해주세요.'); return; }
    if (!isStore && !drPartner) { message.error('거래처를 선택해주세요.'); return; }

    setDrSubmitting(true);
    try {
      await salesApi.createDirectReturn({
        variant_id: drVariantId,
        qty: drQty,
        unit_price: drPrice,
        return_reason: drReason,
        reason: drMemo || undefined,
        partner_code: isStore ? undefined : drPartner,
      });
      message.success('반품이 등록되었습니다.');
      setDirectReturnOpen(false);
      loadReturns();
    } catch (e: any) { message.error(e.message); }
    finally { setDrSubmitting(false); }
  };

  // ─── 매출에서 반품 ───
  const loadSaleSearch = useCallback(async () => {
    setSaleSearchLoading(true);
    try {
      const params: Record<string, string> = { page: String(saleSearchPage), limit: '20', exclude_type: '반품,수정' };
      if (saleSearchText) params.search = saleSearchText;
      if (saleSearchPartner) params.partner_code = saleSearchPartner;
      else if (isStore && user?.partnerCode) params.partner_code = user.partnerCode;
      if (saleSearchDate?.[0]) params.date_from = saleSearchDate[0].format('YYYY-MM-DD');
      if (saleSearchDate?.[1]) params.date_to = saleSearchDate[1].format('YYYY-MM-DD');
      const r = await salesApi.list(params);
      setSaleSearchData(r.data);
      setSaleSearchTotal(r.total);
    } catch (e: any) { message.error('매출 검색 실패: ' + e.message); }
    finally { setSaleSearchLoading(false); }
  }, [saleSearchPage, saleSearchText, saleSearchPartner, saleSearchDate, isStore, user?.partnerCode]);

  const openSaleSearch = () => {
    setSaleSearchText('');
    setSaleSearchPartner(undefined);
    setSaleSearchDate(null);
    setSaleSearchPage(1);
    setSaleSearchData([]);
    setSaleSearchTotal(0);
    setSaleSearchOpen(true);
  };

  useEffect(() => {
    if (saleSearchOpen) loadSaleSearch();
  }, [saleSearchOpen, saleSearchPage]);

  const handleSelectSale = async (record: any) => {
    setSelectedSale(record);
    setRfsQty(1);
    setRfsReason('');
    setRfsMemo('');
    setReturnableInfo(null);
    setSaleSearchOpen(false);
    setReturnFromSaleOpen(true);
    try {
      const info = await salesApi.getReturnable(record.sale_id);
      setReturnableInfo(info);
      setRfsQty(Math.min(1, info.remaining));
    } catch { setReturnableInfo({ total: record.qty, returned: 0, remaining: record.qty }); }
  };

  const handleReturnFromSaleSubmit = async () => {
    if (rfsSubmitting) return;
    if (!selectedSale) return;
    if (rfsQty <= 0) { message.error('반품 수량은 1 이상이어야 합니다.'); return; }
    if (!rfsReason) { message.error('반품 사유를 선택해주세요.'); return; }
    setRfsSubmitting(true);
    try {
      await salesApi.createReturn(selectedSale.sale_id, {
        qty: rfsQty,
        return_reason: rfsReason,
        reason: rfsMemo || undefined,
      });
      message.success('반품이 등록되었습니다.');
      setReturnFromSaleOpen(false);
      loadReturns();
    } catch (e: any) { message.error(e.message); }
    finally { setRfsSubmitting(false); }
  };

  // ─── 기존 매출등록 함수들 ───
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

  const handleOpenQuickRegister = useCallback(() => {
    const cleaned = customerPhone.replace(/[^0-9]/g, '');
    if (cleaned.length < 10) { message.warning('전화번호를 정확히 입력해주세요.'); return; }
    setQuickRegisterName('');
    setQuickRegisterGender(undefined);
    setQuickRegisterOpen(true);
  }, [customerPhone]);

  const handleQuickRegister = useCallback(async () => {
    if (!quickRegisterName.trim()) { message.warning('고객 이름을 입력해주세요.'); return; }
    const cleaned = customerPhone.replace(/[^0-9]/g, '');
    setQuickRegisterLoading(true);
    try {
      const result = await crmApi.create({
        phone: cleaned,
        customer_name: quickRegisterName.trim(),
        gender: quickRegisterGender || undefined,
        marketing_consent: false,
      });
      if (result.success && result.data) {
        setCustomerInfo(result.data);
        setCustomerId(result.data.customer_id);
        setQuickRegisterOpen(false);
        message.success(`고객 "${quickRegisterName.trim()}" 등록 완료`);
      }
    } catch (e: any) { message.error(e.message || '고객 등록 실패'); }
    finally { setQuickRegisterLoading(false); }
  }, [customerPhone, quickRegisterName, quickRegisterGender]);

  const variantSearchTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleVariantSearch = useCallback((key: number, value: string) => {
    if (variantSearchTimer.current) clearTimeout(variantSearchTimer.current);
    if (value.length < 2) return;
    variantSearchTimer.current = setTimeout(async () => {
      try {
        const pc = isStore ? user?.partnerCode : partnerCode;
        const results = await productApi.searchVariants(value, pc || undefined);
        setVariantSearchMap(prev => ({ ...prev, [key]: results }));
      } catch (e: any) { message.error('품목 검색 실패: ' + e.message); }
    }, 300);
  }, [isStore, user?.partnerCode, partnerCode]);

  const updateItem = (key: number, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === 'variant_id') {
        const options = variantSearchMap[key] || [];
        const v = options.find((o: any) => o.variant_id === value);
        if (v) {
          updated.base_price = v.base_price || v.price || 0;
          updated.discount_price = v.discount_price;
          updated.event_price = v.event_price;
          updated.current_stock = v.current_stock;
          updated.variantLabel = `${v.sku} - ${v.product_name} (${v.color}/${v.size})`;
          updated.sale_type = getSaleType(v);
          updated.unit_price = getPrice(updated.sale_type, v);
        }
      }
      if (field === 'sale_type') {
        if (value === '직원할인') {
          // 직원할인: 현재 단가 유지 (이후 직접 수정)
        } else {
          updated.unit_price = getPrice(value, updated);
        }
      }
      return updated;
    }));
  };

  const getPrice = (_saleType: string, product: any) => {
    if (product.event_price) return product.event_price;
    if (product.discount_price) return product.discount_price;
    return product.base_price || product.price || 0;
  };

  const getSaleType = (product: any) => {
    if (product.event_price) return '행사';
    if (product.discount_price) return '할인';
    return '정상';
  };

  const handleBarcodeScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanning(true);
    try {
      const scanPc = isStore ? undefined : partnerCode;
      const product = await salesApi.scanProduct(trimmed, scanPc);
      const existing = items.find(i => i.variant_id === product.variant_id);
      if (existing) {
        setItems(prev => prev.map(i =>
          i.key === existing.key ? { ...i, qty: i.qty + 1 } : i,
        ));
        message.success(`${product.sku} 수량 +1 (총 ${existing.qty + 1}개)`);
      } else {
        const autoSaleType = product.event_price ? '행사' : product.discount_price ? '할인' : '정상';
        const autoPrice = product.event_price || product.discount_price || product.base_price || 0;
        const item: SaleItem = {
          key: ++itemKeyRef.current,
          variant_id: product.variant_id,
          variantLabel: `${product.sku} - ${product.product_name} (${product.color}/${product.size})`,
          sale_type: autoSaleType,
          qty: 1,
          unit_price: autoPrice,
          base_price: product.base_price,
          discount_price: product.discount_price,
          event_price: product.event_price,
          current_stock: product.current_stock,
          tax_free_amount: allTaxFree ? Math.round(autoPrice * 0.1) : 0,
        };
        setItems(prev => {
          if (prev.length === 1 && !prev[0].variant_id) return [item];
          return [...prev, item];
        });
        message.success(`${product.sku} 추가됨`);
      }
      if (product.current_stock !== undefined && product.current_stock < 5) {
        message.warning(`재고 부족 주의: ${product.sku} 현재 ${product.current_stock}개`);
      }
    } catch {
      message.error('상품을 찾을 수 없습니다');
    } finally {
      setBarcodeInput('');
      setScanning(false);
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (key: number) => setItems(prev => prev.length > 1 ? prev.filter(i => i.key !== key) : prev);

  const doSubmit = async (validItems: SaleItem[]) => {
    setSubmitting(true);
    try {
      const result = await salesApi.createBatch({
        sale_date: saleDate!.format('YYYY-MM-DD'),
        partner_code: isStore ? undefined : partnerCode,
        customer_id: customerId || undefined,
        memo: memo.trim() || undefined,
        items: validItems.map(i => ({
          variant_id: i.variant_id,
          qty: i.qty,
          unit_price: i.unit_price,
          sale_type: i.sale_type,
          tax_free_amount: i.tax_free_amount || 0,
        })),
      });
      if (result.preorders && result.preorders.length > 0) {
        const saleCount = result.data?.length || 0;
        const preorderCount = result.preorders.length;
        if (saleCount > 0) {
          message.success(`${saleCount}건 매출 등록 완료`);
        }
        message.warning(`${preorderCount}건 재고 부족 → 예약판매로 전환됨 (예약판매 탭에서 확인)`);
      } else {
        message.success(`${validItems.length}건 매출이 등록되었습니다.`);
      }
      handleReset();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!saleDate) { message.error('매출일을 선택해주세요'); return; }
    if (!isStore && !partnerCode) { message.error('거래처를 선택해주세요'); return; }
    const validItems = items.filter(i => i.variant_id && i.qty > 0 && i.unit_price > 0);
    if (validItems.length === 0) { message.error('상품을 1개 이상 등록해주세요'); return; }

    // 재고 0인 상품 체크 → 예약판매 확인창
    const zeroStockItems = validItems.filter(i => (i.current_stock ?? 0) <= 0);
    if (zeroStockItems.length > 0) {
      const itemList = zeroStockItems.map(i => `• ${i.variantLabel || `variant #${i.variant_id}`} (재고 0개)`).join('\n');
      Modal.confirm({
        title: '재고 없음 — 예약판매로 전환됩니다',
        content: (
          <div>
            <p>아래 상품은 현재 재고가 <strong>0개</strong>입니다.</p>
            <pre style={{ background: '#fff7e6', padding: 8, borderRadius: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>{itemList}</pre>
            <p style={{ marginTop: 12, color: '#d4380d', fontWeight: 600 }}>
              예약판매로 등록되며, 2주 이내 재고 입고가 없으면 자동 취소됩니다.
            </p>
          </div>
        ),
        okText: '예약판매 등록',
        cancelText: '취소',
        okButtonProps: { danger: true },
        onOk: () => doSubmit(validItems),
      });
      return;
    }

    doSubmit(validItems);
  };

  const handleReset = () => {
    itemKeyRef.current = 0;
    setSaleDate(dayjs());
    setPartnerCode(undefined);
    setItems([newItem()]);
    setMemo('');
    setVariantSearchMap({});
    setEntryMode('manual');
    setBarcodeInput('');
    setCustomerId(undefined);
    setCustomerSearch([]);
    setCustomerPhone('');
    setCustomerInfo(null);
  };

  const handleExcelUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await salesApi.uploadExcel(file);
      setUploadResult(result);
      if (result.created > 0) {
        message.success(`${result.created}건 매출이 등록되었습니다.`);
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleDownloadTemplate = () => {
    const token = getToken();
    fetch(`/api/sales/excel/template`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sales_template.xlsx');
        link.click();
        URL.revokeObjectURL(url);
      });
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.qty || 0) * (i.unit_price || 0), 0);
  const totalTaxFree = items.reduce((sum, i) => sum + (i.tax_free_amount || 0), 0);
  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  // ─── 바코드 모드 아이템 컬럼 ───
  const barcodeItemColumns = [
    {
      title: '상품', dataIndex: 'variantLabel', key: 'product', ellipsis: true,
      render: (_: any, record: SaleItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.variantLabel || '-'}</div>
          {record.current_stock !== undefined && (
            <span style={{ fontSize: 12, color: record.current_stock <= 0 ? '#cf1322' : '#52c41a', fontWeight: 600 }}>
              재고: {record.current_stock}개{record.current_stock <= 0 ? ' ⚠' : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      title: '유형', dataIndex: 'sale_type', key: 'sale_type', width: 100,
      render: (_: any, record: SaleItem) => (
        isStore
          ? <Tag>{record.sale_type}</Tag>
          : <Select value={record.sale_type} options={saleTypeOptions} style={{ width: 90 }}
              onChange={(v) => updateItem(record.key, 'sale_type', v)} />
      ),
    },
    {
      title: '수량', dataIndex: 'qty', key: 'qty', width: 130,
      render: (_: any, record: SaleItem) => (
        <Space size={4}>
          <Button size="small" icon={<MinusOutlined />}
            disabled={record.qty <= 1}
            onClick={() => updateItem(record.key, 'qty', Math.max(1, record.qty - 1))} />
          <InputNumber min={1} value={record.qty} style={{ width: 55 }} size="small" controls={false}
            onChange={(v) => updateItem(record.key, 'qty', v || 1)} />
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => updateItem(record.key, 'qty', record.qty + 1)} />
        </Space>
      ),
    },
    {
      title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 130,
      render: (_: any, record: SaleItem) => (
        record.sale_type === '직원할인'
          ? <InputNumber min={0} value={record.unit_price} style={{ width: 100 }} size="small"
              onChange={(v) => updateItem(record.key, 'unit_price', v || 0)}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          : <span>
              {Number(record.unit_price || 0).toLocaleString()}
              {record.event_price && record.unit_price === record.event_price && (
                <Tag color="orange" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>행사</Tag>
              )}
            </span>
      ),
    },
    {
      title: 'T/F', key: 'tax_free', width: 90,
      render: (_: any, record: SaleItem) => {
        const maxAmt = Math.round((record.qty || 0) * (record.unit_price || 0) * 0.1);
        return (
          <InputNumber min={0} max={maxAmt} value={record.tax_free_amount || 0} size="small"
            style={{ width: 80 }} controls={false}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            onChange={(v) => updateItem(record.key, 'tax_free_amount', v || 0)} />
        );
      },
    },
    {
      title: '소계', key: 'subtotal', width: 110,
      render: (_: any, record: SaleItem) => (
        <span style={{ fontWeight: 600 }}>{((record.qty || 0) * (record.unit_price || 0)).toLocaleString()}</span>
      ),
    },
    {
      title: '', key: 'actions', width: 40,
      render: (_: any, record: SaleItem) => (
        <Button type="text" danger icon={<DeleteOutlined />}
          onClick={() => removeItem(record.key)} size="small" />
      ),
    },
  ];

  // ─── 수동 모드 아이템 컬럼 ───
  const itemColumns = [
    {
      title: '상품', dataIndex: 'variant_id', key: 'variant_id', width: 300,
      render: (_: any, record: SaleItem) => (
        <div>
          <Select
            showSearch placeholder="SKU/상품명 검색 (2자 이상)" filterOption={false} style={{ width: '100%' }}
            value={record.variant_id} onSearch={(v) => handleVariantSearch(record.key, v)}
            onChange={(v) => updateItem(record.key, 'variant_id', v)}
            notFoundContent="2자 이상 입력"
          >
            {(variantSearchMap[record.key] || []).map((v: any) => (
              <Select.Option key={v.variant_id} value={v.variant_id}>
                {v.sku} - {v.product_name} ({v.color}/{v.size})
                {v.current_stock != null && (
                  <span style={{ color: v.current_stock <= 0 ? '#cf1322' : '#52c41a', fontWeight: 600, marginLeft: 4 }}>
                    [재고: {v.current_stock}]
                  </span>
                )}
              </Select.Option>
            ))}
          </Select>
          {record.variant_id && record.current_stock != null && (
            <span style={{ fontSize: 12, color: record.current_stock <= 0 ? '#cf1322' : '#52c41a', fontWeight: 600, marginTop: 2, display: 'inline-block' }}>
              현재 재고: {record.current_stock}개{record.current_stock <= 0 ? ' (부족)' : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      title: '유형', dataIndex: 'sale_type', key: 'sale_type', width: 100,
      render: (_: any, record: SaleItem) => (
        isStore
          ? <Tag>{record.sale_type}</Tag>
          : <Select value={record.sale_type} options={saleTypeOptions} style={{ width: 90 }}
              onChange={(v) => updateItem(record.key, 'sale_type', v)} />
      ),
    },
    {
      title: '수량', dataIndex: 'qty', key: 'qty', width: 80,
      render: (_: any, record: SaleItem) => (
        <InputNumber min={1} value={record.qty} style={{ width: 70 }}
          onChange={(v) => updateItem(record.key, 'qty', v || 1)} />
      ),
    },
    {
      title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 140,
      render: (_: any, record: SaleItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <InputNumber min={0} value={record.unit_price} style={{ width: 110 }}
            disabled={record.sale_type !== '직원할인'}
            onChange={(v) => updateItem(record.key, 'unit_price', v || 0)}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          {record.event_price && record.unit_price === record.event_price && (
            <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>행사</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'T/F', key: 'tax_free', width: 100,
      render: (_: any, record: SaleItem) => {
        const maxAmt = Math.round((record.qty || 0) * (record.unit_price || 0) * 0.1);
        return (
          <InputNumber min={0} max={maxAmt} value={record.tax_free_amount || 0} size="small"
            style={{ width: 90 }} controls={false}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            onChange={(v) => updateItem(record.key, 'tax_free_amount', v || 0)} />
        );
      },
    },
    {
      title: '소계', key: 'subtotal', width: 110,
      render: (_: any, record: SaleItem) => (
        <span style={{ fontWeight: 600 }}>{((record.qty || 0) * (record.unit_price || 0)).toLocaleString()}</span>
      ),
    },
    {
      title: '', key: 'actions', width: 40,
      render: (_: any, record: SaleItem) => (
        items.length > 1 ? <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(record.key)} size="small" /> : null
      ),
    },
  ];

  // ─── 반품 목록 컬럼 ───
  const returnColumns = [
    { title: '반품일', dataIndex: 'sale_date', key: 'sale_date', width: 100,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    ...(!isStore ? [{ title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120, ellipsis: true }] : []),
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 160, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130, ellipsis: true },
    { title: '컬러', dataIndex: 'color', key: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70 },
    { title: '수량', dataIndex: 'qty', key: 'qty', width: 70, align: 'right' as const },
    { title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 100, align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString(),
    },
    { title: '반품금액', dataIndex: 'total_price', key: 'total_price', width: 110, align: 'right' as const,
      render: (v: number) => <span style={{ color: '#cf1322' }}>{Number(v).toLocaleString()}</span>,
    },
    { title: '반품사유', dataIndex: 'return_reason', key: 'return_reason', width: 110,
      render: (v: string) => {
        if (!v) return '-';
        const label = RETURN_REASON_OPTIONS.find(o => o.value === v)?.label || v;
        return <Tag color="purple">{label}</Tag>;
      },
    },
    { title: '메모', dataIndex: 'memo', key: 'memo', width: 150, ellipsis: true },
    ...(isManager ? [{
      title: '관리', key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditReturn(record)}>수정</Button>
          <Popconfirm title="정말 삭제하시겠습니까?" description="반품 삭제 시 재고가 다시 차감됩니다." onConfirm={() => handleDeleteReturn(record.sale_id)} okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  // ─── 매출등록 탭 JSX ───
  const entryTabContent = (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>매출일</div>
          <DatePicker value={saleDate} onChange={(v) => setSaleDate(v || dayjs())} format="YYYY-MM-DD" />
        </div>
        {!isStore && (
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>거래처</div>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions}
              value={partnerCode} onChange={handlePartnerChange} style={{ width: 250 }} />
          </div>
        )}
        <div style={{ minWidth: 300 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>고객 검색</div>
          {customerInfo ? (
            <Tag closable onClose={() => { setCustomerInfo(null); setCustomerId(undefined); setCustomerPhone(''); setCustomerSearch([]); }}
              color="green" style={{ fontSize: 13, padding: '4px 10px', lineHeight: '24px' }}>
              {customerInfo.customer_name} ({customerInfo.phone}) | {customerInfo.customer_tier || '일반'}
            </Tag>
          ) : (
            <Select
              showSearch
              placeholder="전화번호 또는 이름 (2자 이상)"
              filterOption={false}
              onSearch={handleCustomerSearch}
              onChange={(v: number) => {
                const c = customerSearch.find((c: any) => c.customer_id === v);
                if (c) {
                  setCustomerInfo(c); setCustomerId(c.customer_id); setCustomerPhone(c.phone || '');
                  setCustomerSearch([]);
                  message.success(`고객 연결: ${c.customer_name} (${c.customer_tier || '일반'})`);
                }
              }}
              style={{ width: 300 }}
              notFoundContent={
                customerPhone.trim().length >= 2 ? (
                  <div style={{ padding: '4px 0' }}>
                    <div style={{ color: '#999', marginBottom: 4 }}>검색 결과 없음</div>
                    {customerPhone.replace(/[^0-9]/g, '').length >= 10 && (
                      <Button type="link" size="small" style={{ padding: 0 }} onClick={handleOpenQuickRegister}>
                        신규 고객 등록
                      </Button>
                    )}
                  </div>
                ) : '2자 이상 입력'
              }
            >
              {customerSearch.map((c: any) => (
                <Select.Option key={c.customer_id} value={c.customer_id}>
                  <span style={{ fontWeight: 500 }}>{c.customer_name}</span>
                  <span style={{ color: '#888', marginLeft: 6 }}>{c.phone}</span>
                  <span style={{ color: '#1677ff', marginLeft: 6, fontSize: 12 }}>{c.customer_tier || '일반'}</span>
                  {Number(c.total_amount) > 0 && <span style={{ color: '#999', marginLeft: 6, fontSize: 11 }}>{Number(c.total_amount).toLocaleString()}원</span>}
                </Select.Option>
              ))}
            </Select>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Tax Free (전체 10%)</div>
          <Switch checked={allTaxFree} onChange={handleToggleAllTaxFree} checkedChildren="면세" unCheckedChildren="과세" />
        </div>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모</div>
          <Input placeholder="택스프리, 현금결제 등" value={memo} onChange={(e) => setMemo(e.target.value)} allowClear />
        </div>
      </Space>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={entryMode}
          onChange={(v) => {
            setEntryMode(v as 'manual' | 'barcode');
            if (v === 'barcode') setTimeout(() => barcodeInputRef.current?.focus(), 100);
          }}
          options={[
            { label: '수동 입력', value: 'manual' },
            { label: '바코드 스캔', value: 'barcode', icon: <BarcodeOutlined /> },
          ]}
        />
      </div>

      {entryMode === 'barcode' && (
        <Input
          ref={barcodeInputRef}
          placeholder="바코드를 스캔하거나 SKU를 입력하세요"
          prefix={<BarcodeOutlined />}
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
          onPressEnter={() => handleBarcodeScan(barcodeInput)}
          disabled={scanning}
          allowClear
          size="large"
          style={{ marginBottom: 12 }}
          autoFocus
        />
      )}

      <Table
        columns={entryMode === 'barcode' ? barcodeItemColumns : itemColumns}
        dataSource={items.filter(i => entryMode === 'barcode' ? i.variant_id : true)}
        rowKey="key" size="small"
        pagination={false} scroll={{ y: 'calc(100vh - 460px)' }}
      />

      {entryMode === 'manual' && (
        <Button type="dashed" icon={<PlusOutlined />} onClick={addItem} style={{ width: '100%', marginTop: 8 }}>
          상품 추가
        </Button>
      )}

      <Divider style={{ margin: '12px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          총 {items.filter(i => i.variant_id).length}건 | 합계: {totalAmount.toLocaleString()}원
          {totalTaxFree > 0 && <span style={{ color: '#1677ff', marginLeft: 8 }}>(T/F: {totalTaxFree.toLocaleString()}원)</span>}
        </span>
        <Space>
          <Button onClick={handleReset}>초기화</Button>
          <Button type="primary" icon={<ShoppingCartOutlined />} onClick={handleSubmit} loading={submitting} size="large">
            등록
          </Button>
        </Space>
      </div>
    </div>
  );

  // ─── 반품관리 탭 JSX ───
  const returnsTabContent = (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        {!isStore && (
          <Select showSearch optionFilterProp="label" placeholder="거래처" options={partnerOptions}
            value={returnPartner} onChange={setReturnPartner} style={{ width: 200 }} allowClear />
        )}
        <DatePicker.RangePicker
          value={returnDateRange as any}
          onChange={(v) => { setReturnDateRange(v as any); setReturnPage(1); }}
          format="YYYY-MM-DD"
        />
        <Input
          placeholder="상품명/SKU/거래처 검색"
          prefix={<SearchOutlined />}
          value={returnSearch}
          onChange={(e) => setReturnSearch(e.target.value)}
          onPressEnter={() => { setReturnPage(1); loadReturns(); }}
          allowClear
          style={{ width: 220 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => { setReturnPage(1); loadReturns(); }}>조회</Button>
        {isManager && (
          <>
            <Button type="primary" icon={<RollbackOutlined />} onClick={openSaleSearch}>매출에서 반품</Button>
            <Button icon={<RollbackOutlined />} onClick={openDirectReturn}>직접 반품 등록</Button>
          </>
        )}
      </Space>

      <Table
        columns={returnColumns}
        dataSource={returnData}
        rowKey="sale_id"
        size="small"
        loading={returnLoading}
        scroll={{ x: 1200, y: 'calc(100vh - 300px)' }}
        pagination={{
          current: returnPage,
          pageSize: 50,
          total: returnTotal,
          showTotal: (t) => `총 ${t}건`,
          onChange: (p) => setReturnPage(p),
        }}
      />
    </div>
  );

  // ─── 예약판매 탭 JSX ───
  const preorderColumns = [
    { title: '등록일', dataIndex: 'preorder_date', width: 100,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    ...(!isStore ? [{ title: '거래처', dataIndex: 'partner_name', width: 120, ellipsis: true }] : []),
    { title: '상품명', dataIndex: 'product_name', width: 160, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 130, ellipsis: true },
    { title: '컬러', dataIndex: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const },
    { title: '단가', dataIndex: 'unit_price', width: 100, align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString(),
    },
    { title: '합계', dataIndex: 'total_price', width: 110, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{Number(v).toLocaleString()}</span>,
    },
    { title: '현재고', dataIndex: 'current_stock', width: 80, align: 'right' as const,
      render: (v: number, r: any) => (
        <span style={{ fontWeight: 600, color: (v ?? 0) >= r.qty ? '#52c41a' : '#ff4d4f' }}>
          {v ?? '-'}
        </span>
      ),
    },
    ...(isStore ? [{
      title: '', key: 'stock_search', width: 40,
      render: (_: any, record: any) => (
        <Button type="link" size="small" icon={<SearchOutlined />}
          onClick={() => openStockModal(record)} style={{ padding: 0 }} />
      ),
    }] : []),
    ...(isManager ? [{
      title: '관리', key: 'actions', width: 60, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Popconfirm title="예약판매를 삭제하시겠습니까?" onConfirm={async () => {
          try { await salesApi.removePreorder(record.preorder_id); message.success('삭제됨'); loadPreorders(); }
          catch (e: any) { message.error(e.message); }
        }} okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    }] : []),
  ];

  const preorderTabContent = (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#666', fontSize: 13 }}>
          재고 부족 시 매출은 즉시 등록되며 재고가 음수로 차감됩니다. 입고/출고 수령 시 재고가 자동 복구되며, 2주 내 재고 미확보 시 매출이 자동 삭제됩니다.
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadPreorders}>새로고침</Button>
      </div>
      <Table
        columns={preorderColumns}
        dataSource={preorders}
        rowKey="preorder_id"
        size="small"
        loading={preorderLoading}
        scroll={{ x: 1200, y: 'calc(100vh - 300px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
    </div>
  );

  return (
    <div>
      <PageHeader title={isPreorderRoute ? '예약판매' : isReturnsRoute ? '고객반품관리' : '매출관리'} extra={
        activeTab === 'entry' ? (
          <Button icon={<UploadOutlined />} onClick={() => { setUploadResult(null); setUploadModalOpen(true); }}>엑셀 업로드</Button>
        ) : null
      } />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'entry', label: '매출등록', children: entryTabContent },
          { key: 'daily', label: '판매내역', children: <SalesDailyPage embedded /> },
          { key: 'returns', label: '고객 반품 관리', children: returnsTabContent },
          { key: 'preorders', label: <span>예약판매 {preorders.length > 0 && <Tag color="orange" style={{ marginLeft: 4 }}>{preorders.length}</Tag>}</span>, children: preorderTabContent },
        ]}
        style={{ marginTop: -8 }}
      />

      {/* 예약판매 재고조회 모달 */}
      <Modal
        title="재고 조회 / 요청"
        open={stockModalOpen}
        onCancel={() => setStockModalOpen(false)}
        onOk={handleStockRequest}
        confirmLoading={stockRequestLoading}
        okText={stockRequestMode === 'transfer' ? '수평이동 알림 보내기' : '본사에 출고요청'}
        width={560}
      >
        {stockTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{stockTarget.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{stockTarget.sku} ({stockTarget.color}/{stockTarget.size})</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>예약수량: {stockTarget.qty}개 | 현재고: <strong style={{ color: (stockTarget.current_stock ?? 0) >= stockTarget.qty ? '#52c41a' : '#ff4d4f' }}>{stockTarget.current_stock ?? '?'}개</strong></div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>전체 매장 재고 현황</div>
              {variantStocksLoading ? (
                <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
              ) : variantStocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 12, color: '#aaa' }}>재고 보유 매장이 없습니다</div>
              ) : (
                <Table
                  columns={[
                    { title: '거래처', dataIndex: 'partner_name', key: 'name',
                      render: (v: string, r: any) => (
                        <span>
                          <span style={{ fontWeight: r.partner_code === user?.partnerCode ? 700 : 400, color: r.partner_code === user?.partnerCode ? '#52c41a' : undefined }}>
                            {v}
                          </span>
                          {r.partner_code === user?.partnerCode && <Tag color="green" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>내 매장</Tag>}
                          {r._isHq && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>본사</Tag>}
                        </span>
                      ),
                    },
                    { title: '보유수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: Number(v) > 0 ? '#1890ff' : '#ccc' }}>{Number(v)}개</strong>,
                    },
                  ]}
                  dataSource={variantStocks}
                  rowKey={(r) => r.partner_code}
                  size="small"
                  pagination={false}
                  scroll={{ y: 200 }}
                />
              )}
            </div>

            <Segmented
              block
              value={stockRequestMode}
              onChange={(v) => setStockRequestMode(v as 'transfer' | 'hq')}
              options={[
                { label: '수평이동 요청', value: 'transfer' },
                { label: '본사 재고요청', value: 'hq' },
              ]}
            />

            {(() => {
              if (stockRequestMode === 'transfer') {
                const targets = variantStocks.filter(s => s.partner_code !== user?.partnerCode && !s._isHq && Number(s.qty) > 0);
                return targets.length === 0 ? (
                  <div style={{ background: '#fff7e6', padding: 12, borderRadius: 6, fontSize: 12, color: '#fa8c16' }}>재고를 보유한 다른 매장이 없습니다.</div>
                ) : (
                  <div style={{ background: '#e6f7ff', padding: 12, borderRadius: 6, fontSize: 12 }}>
                    <div style={{ color: '#1890ff', marginBottom: 6 }}>아래 매장에 수평이동 요청 알림을 보냅니다:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {targets.map(s => (
                        <Tag key={s.partner_code} color="blue">{s.partner_name} ({Number(s.qty)}개)</Tag>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>요청수량</div>
                    <InputNumber min={1} value={stockRequestQty} onChange={(v) => setStockRequestQty(v || 1)} style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모 (선택)</div>
                    <Input placeholder="예: 급히 필요" value={stockRequestMemo} onChange={(e) => setStockRequestMemo(e.target.value)} allowClear />
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* 엑셀 업로드 모달 */}
      <Modal
        title="매출 엑셀 업로드"
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        footer={null}
        width={520}
      >
        <div style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} type="link" style={{ padding: 0 }}>
            엑셀 템플릿 다운로드
          </Button>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>(.xlsx 형식)</span>
        </div>

        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => { handleExcelUpload(file); return false; }}
          disabled={uploading}
        >
          <p style={{ fontSize: 40, color: '#1890ff', margin: 0 }}><UploadOutlined /></p>
          <p style={{ fontWeight: 600 }}>{uploading ? '업로드 중...' : '클릭 또는 파일을 드래그하세요'}</p>
          <p style={{ color: '#888', fontSize: 12 }}>지원 형식: .xlsx, .xls (최대 5MB)</p>
        </Upload.Dragger>

        {uploadResult && (
          <div style={{ marginTop: 16 }}>
            <Alert
              type={uploadResult.created > 0 ? 'success' : 'warning'}
              message={`처리 완료: 전체 ${uploadResult.total}건 중 ${uploadResult.created}건 등록 / ${uploadResult.skipped}건 건너뜀`}
              style={{ marginBottom: 8 }}
            />
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div style={{ maxHeight: 200, overflow: 'auto', background: '#fff2f0', padding: 12, borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#cf1322' }}>오류 상세:</div>
                {uploadResult.errors.map((e, i) => (
                  <div key={i} style={{ color: '#555' }}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 신규 고객 등록 모달 */}
      <Modal
        title="신규 고객 등록"
        open={quickRegisterOpen}
        onCancel={() => setQuickRegisterOpen(false)}
        onOk={handleQuickRegister}
        confirmLoading={quickRegisterLoading}
        okText="등록"
        cancelText="취소"
        width={360}
        okButtonProps={{ disabled: !quickRegisterName.trim() }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>전화번호</div>
            <Input value={customerPhone} disabled />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>이름 <span style={{ color: '#ff4d4f' }}>*</span></div>
            <Input
              placeholder="고객 이름"
              value={quickRegisterName}
              onChange={(e) => setQuickRegisterName(e.target.value)}
              autoFocus
              onPressEnter={handleQuickRegister}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>성별</div>
            <Segmented
              options={[
                { label: '선택안함', value: '' },
                { label: '남성', value: '남성' },
                { label: '여성', value: '여성' },
              ]}
              value={quickRegisterGender || ''}
              onChange={(v) => setQuickRegisterGender(v as string || undefined)}
            />
          </div>
        </div>
      </Modal>

      {/* 반품 수정 모달 */}
      <Modal
        title="반품 수정"
        open={editReturnOpen}
        onCancel={() => setEditReturnOpen(false)}
        onOk={handleEditReturnSubmit}
        confirmLoading={editReturnSubmitting}
        okText="수정"
        cancelText="취소"
        width={480}
      >
        {editReturnRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>상품</div>
              <Input value={`${editReturnRecord.product_name} (${editReturnRecord.color}/${editReturnRecord.size})`} disabled />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>수량</div>
                <InputNumber min={1} value={editReturnQty} style={{ width: '100%' }}
                  onChange={(v) => setEditReturnQty(v || 1)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>단가</div>
                <InputNumber min={0} value={editReturnPrice} style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  onChange={(v) => setEditReturnPrice(v || 0)} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품사유</div>
              <Select options={RETURN_REASON_OPTIONS} value={editReturnReason} onChange={setEditReturnReason}
                style={{ width: '100%' }} placeholder="반품사유 선택" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모</div>
              <Input.TextArea rows={2} value={editReturnMemo} onChange={(e) => setEditReturnMemo(e.target.value)}
                placeholder="메모 (선택)" />
            </div>
            <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 13 }}>
              반품금액: <strong style={{ color: '#cf1322' }}>-{(editReturnQty * editReturnPrice).toLocaleString()}원</strong>
            </div>
          </div>
        )}
      </Modal>

      {/* 매출 검색 모달 */}
      <Modal
        title="매출에서 반품 — 매출 선택"
        open={saleSearchOpen}
        onCancel={() => setSaleSearchOpen(false)}
        footer={null}
        width={800}
      >
        <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {!isStore && (
            <Select showSearch optionFilterProp="label" placeholder="거래처" options={partnerOptions}
              value={saleSearchPartner} onChange={setSaleSearchPartner} allowClear style={{ width: 160 }} />
          )}
          <DatePicker.RangePicker
            value={saleSearchDate as any}
            onChange={(v) => setSaleSearchDate(v as any)}
            style={{ width: 240 }}
          />
          <Input placeholder="상품명/SKU 검색" prefix={<SearchOutlined />} value={saleSearchText}
            onChange={(e) => setSaleSearchText(e.target.value)}
            onPressEnter={() => { setSaleSearchPage(1); loadSaleSearch(); }}
            allowClear style={{ width: 200 }} />
          <Button onClick={() => { setSaleSearchPage(1); loadSaleSearch(); }}>검색</Button>
        </Space>
        <Table
          dataSource={saleSearchData}
          rowKey="sale_id"
          size="small"
          loading={saleSearchLoading}
          scroll={{ y: 400 }}
          pagination={{
            current: saleSearchPage,
            pageSize: 20,
            total: saleSearchTotal,
            showTotal: (t) => `총 ${t}건`,
            onChange: (p) => setSaleSearchPage(p),
            size: 'small',
          }}
          onRow={(record) => ({
            onClick: () => handleSelectSale(record),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: '일자', dataIndex: 'sale_date', width: 90,
              render: (v: string) => dayjs(v).format('YY-MM-DD') },
            ...(!isStore ? [{ title: '매장', dataIndex: 'partner_name', width: 100, ellipsis: true }] : []),
            { title: '상품명', dataIndex: 'product_name', ellipsis: true },
            { title: 'SKU', dataIndex: 'sku', width: 130, ellipsis: true,
              render: (v: string) => <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</span> },
            { title: '컬러/사이즈', key: 'cs', width: 100,
              render: (_: any, r: any) => `${r.color || '-'}/${r.size || '-'}` },
            { title: '유형', dataIndex: 'sale_type', width: 65,
              render: (v: string) => <Tag color={v === '정상' ? 'blue' : v === '할인' ? 'gold' : v === '행사' ? 'purple' : 'cyan'}>{v}</Tag> },
            { title: '수량', dataIndex: 'qty', width: 55, align: 'right' as const },
            { title: '단가', dataIndex: 'unit_price', width: 80, align: 'right' as const,
              render: (v: number) => Number(v).toLocaleString() },
            { title: '합계', dataIndex: 'total_price', width: 90, align: 'right' as const,
              render: (v: number) => `${Number(v).toLocaleString()}원` },
          ]}
        />
      </Modal>

      {/* 매출에서 반품 입력 모달 */}
      <Modal
        title="매출에서 반품 등록"
        open={returnFromSaleOpen}
        onCancel={() => setReturnFromSaleOpen(false)}
        onOk={handleReturnFromSaleSubmit}
        confirmLoading={rfsSubmitting}
        okText="반품 등록"
        okButtonProps={{ danger: true, disabled: !rfsReason || rfsQty <= 0 }}
        cancelText="취소"
        width={480}
      >
        {selectedSale && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedSale.product_name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {selectedSale.sku} / {selectedSale.color}-{selectedSale.size}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                <span>매출일: <strong>{dayjs(selectedSale.sale_date).format('YYYY-MM-DD')}</strong></span>
                <span>판매가: <strong>{Number(selectedSale.unit_price).toLocaleString()}원</strong></span>
                <span>수량: <strong>{selectedSale.qty}개</strong></span>
              </div>
              {returnableInfo && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  반품 가능: <strong style={{ color: returnableInfo.remaining > 0 ? '#389e0d' : '#cf1322' }}>{returnableInfo.remaining}개</strong>
                  {returnableInfo.returned > 0 && <span style={{ color: '#888', marginLeft: 8 }}>(기반품: {returnableInfo.returned}개)</span>}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 수량 <span style={{ color: '#ff4d4f' }}>*</span></div>
              <InputNumber min={1} max={returnableInfo?.remaining ?? selectedSale.qty}
                value={rfsQty} onChange={(v) => setRfsQty(v || 1)} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 사유 <span style={{ color: '#ff4d4f' }}>*</span></div>
              <Select options={RETURN_REASON_OPTIONS} value={rfsReason || undefined} onChange={setRfsReason}
                style={{ width: '100%' }} placeholder="반품사유 선택" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모</div>
              <Input.TextArea rows={2} value={rfsMemo} onChange={(e) => setRfsMemo(e.target.value)} placeholder="메모 (선택)" />
            </div>
            <div style={{ background: '#fff1f0', padding: 8, borderRadius: 4, fontSize: 13 }}>
              반품금액: <strong style={{ color: '#cf1322' }}>-{(rfsQty * Number(selectedSale.unit_price)).toLocaleString()}원</strong>
            </div>
          </div>
        )}
      </Modal>

      {/* 직접 반품 등록 모달 */}
      <Modal
        title="반품 등록"
        open={directReturnOpen}
        onCancel={() => setDirectReturnOpen(false)}
        onOk={handleDirectReturnSubmit}
        confirmLoading={drSubmitting}
        okText="등록"
        cancelText="취소"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          {!isStore && (
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>거래처 <span style={{ color: '#ff4d4f' }}>*</span></div>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions}
                value={drPartner} onChange={setDrPartner} style={{ width: '100%' }} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>상품 <span style={{ color: '#ff4d4f' }}>*</span></div>
            <Select
              showSearch placeholder="SKU/상품명 검색 (2자 이상)" filterOption={false}
              style={{ width: '100%' }}
              value={drVariantId}
              onSearch={handleDrVariantSearch}
              onChange={(v: number) => {
                setDrVariantId(v);
                const variant = drVariantSearch.find((o: any) => o.variant_id === v);
                if (variant) setDrPrice(variant.base_price || variant.price || 0);
              }}
              notFoundContent="2자 이상 입력"
            >
              {drVariantSearch.map((v: any) => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size})
                </Select.Option>
              ))}
            </Select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>수량 <span style={{ color: '#ff4d4f' }}>*</span></div>
              <InputNumber min={1} value={drQty} style={{ width: '100%' }}
                onChange={(v) => setDrQty(v || 1)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>단가 <span style={{ color: '#ff4d4f' }}>*</span></div>
              <InputNumber min={0} value={drPrice} style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                onChange={(v) => setDrPrice(v || 0)} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품사유 <span style={{ color: '#ff4d4f' }}>*</span></div>
            <Select options={RETURN_REASON_OPTIONS} value={drReason || undefined} onChange={setDrReason}
              style={{ width: '100%' }} placeholder="반품사유 선택" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>메모</div>
            <Input.TextArea rows={2} value={drMemo} onChange={(e) => setDrMemo(e.target.value)}
              placeholder="메모 (선택)" />
          </div>
          <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 13 }}>
            반품금액: <strong style={{ color: '#cf1322' }}>-{(drQty * drPrice).toLocaleString()}원</strong>
          </div>
        </div>
      </Modal>
    </div>
  );
}
