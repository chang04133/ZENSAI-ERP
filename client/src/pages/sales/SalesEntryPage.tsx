import { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Button, Modal, Select, InputNumber, Space, DatePicker, Tag, message, Divider, Upload, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingCartOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { getToken } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import dayjs from 'dayjs';

const SALE_TYPE_OPTIONS = [
  { label: '정상', value: '정상' },
  { label: '할인', value: '할인' },
  { label: '행사', value: '행사' },
];

const SALE_TYPE_COLORS: Record<string, string> = { '정상': 'blue', '할인': 'red', '행사': 'orange' };

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
}

let itemKey = 0;
const newItem = (): SaleItem => ({ key: ++itemKey, sale_type: '정상', qty: 1, unit_price: 0 });

export default function SalesEntryPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [variantSearchMap, setVariantSearchMap] = useState<Record<number, any[]>>({});

  // 엑셀 업로드 상태
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ total: number; created: number; skipped: number; errors?: string[] } | null>(null);

  // 모달 폼 상태
  const [saleDate, setSaleDate] = useState(dayjs());
  const [partnerCode, setPartnerCode] = useState<string | undefined>();
  const [items, setItems] = useState<SaleItem[]>([newItem()]);

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const result = await salesApi.list({ page: String(currentPage), limit: '20' });
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    if (!isStore) {
      (async () => { try { const r = await partnerApi.list({ limit: '1000' }); setPartners(r.data); } catch (e: any) { message.error('거래처 로드 실패: ' + e.message); } })();
    }
  }, []);

  const handleVariantSearch = useCallback(async (key: number, value: string) => {
    if (value.length >= 2) {
      try {
        const results = await productApi.searchVariants(value);
        setVariantSearchMap(prev => ({ ...prev, [key]: results }));
      } catch (e: any) { message.error('품목 검색 실패: ' + e.message); }
    }
  }, []);

  const updateItem = (key: number, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      // 상품 선택 시 가격 자동 설정
      if (field === 'variant_id') {
        const options = variantSearchMap[key] || [];
        const v = options.find((o: any) => o.variant_id === value);
        if (v) {
          updated.base_price = v.base_price || v.price || 0;
          updated.discount_price = v.discount_price;
          updated.event_price = v.event_price;
          updated.variantLabel = `${v.sku} - ${v.product_name} (${v.color}/${v.size})`;
          // 가격 적용
          updated.unit_price = getPrice(updated.sale_type, v);
        }
      }
      // 매출유형 변경 시 가격 재적용
      if (field === 'sale_type') {
        updated.unit_price = getPrice(value, updated);
      }
      return updated;
    }));
  };

  const getPrice = (saleType: string, product: any) => {
    let price = product.base_price || product.price || 0;
    if (saleType === '할인' && product.discount_price) price = product.discount_price;
    if (saleType === '행사' && product.event_price) price = product.event_price;
    return price;
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (key: number) => setItems(prev => prev.length > 1 ? prev.filter(i => i.key !== key) : prev);

  const handleSubmit = async () => {
    if (!saleDate) { message.error('매출일을 선택해주세요'); return; }
    if (!isStore && !partnerCode) { message.error('거래처를 선택해주세요'); return; }
    const validItems = items.filter(i => i.variant_id && i.qty > 0 && i.unit_price > 0);
    if (validItems.length === 0) { message.error('상품을 1개 이상 등록해주세요'); return; }

    setSubmitting(true);
    try {
      await salesApi.createBatch({
        sale_date: saleDate.format('YYYY-MM-DD'),
        partner_code: isStore ? undefined : partnerCode,
        items: validItems.map(i => ({
          variant_id: i.variant_id,
          qty: i.qty,
          unit_price: i.unit_price,
          sale_type: i.sale_type,
        })),
      });
      message.success(`${validItems.length}건 매출이 등록되었습니다.`);
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const openModal = () => {
    itemKey = 0;
    setSaleDate(dayjs());
    setPartnerCode(undefined);
    setItems([newItem()]);
    setVariantSearchMap({});
    setModalOpen(true);
  };

  const handleExcelUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await salesApi.uploadExcel(file);
      setUploadResult(result);
      if (result.created > 0) {
        message.success(`${result.created}건 매출이 등록되었습니다.`);
        load();
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setUploading(false);
    }
    return false; // prevent default upload behavior
  };

  const handleDownloadTemplate = () => {
    const token = getToken();
    const link = document.createElement('a');
    link.href = `/api/sales/excel/template`;
    link.setAttribute('download', 'sales_template.xlsx');
    // auth header via fetch
    fetch(`/api/sales/excel/template`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      });
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.qty || 0) * (i.unit_price || 0), 0);

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  // 목록 테이블 컬럼
  const columns = [
    { title: '매출일', dataIndex: 'sale_date', key: 'sale_date', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    ...(!isStore ? [{ title: '거래처', dataIndex: 'partner_name', key: 'partner_name' }] : []),
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70 },
    { title: '유형', dataIndex: 'sale_type', key: 'sale_type', width: 70,
      render: (v: string) => <Tag color={SALE_TYPE_COLORS[v] || 'default'}>{v || '정상'}</Tag>,
    },
    { title: '수량', dataIndex: 'qty', key: 'qty', width: 70, render: (v: number) => Number(v).toLocaleString() },
    { title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 100, render: (v: number) => Number(v).toLocaleString() },
    { title: '합계', dataIndex: 'total_price', key: 'total_price', width: 120,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{Number(v).toLocaleString()}</span>,
    },
  ];

  // 모달 내 아이템 컬럼
  const itemColumns = [
    {
      title: '상품', dataIndex: 'variant_id', key: 'variant_id', width: 300,
      render: (_: any, record: SaleItem) => (
        <Select
          showSearch placeholder="SKU/상품명 검색 (2자 이상)" filterOption={false} style={{ width: '100%' }}
          value={record.variant_id} onSearch={(v) => handleVariantSearch(record.key, v)}
          onChange={(v) => updateItem(record.key, 'variant_id', v)}
          notFoundContent="2자 이상 입력"
        >
          {(variantSearchMap[record.key] || []).map((v: any) => (
            <Select.Option key={v.variant_id} value={v.variant_id}>
              {v.sku} - {v.product_name} ({v.color}/{v.size})
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '유형', dataIndex: 'sale_type', key: 'sale_type', width: 90,
      render: (_: any, record: SaleItem) => (
        <Select value={record.sale_type} options={SALE_TYPE_OPTIONS} style={{ width: 80 }}
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
      title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 130,
      render: (_: any, record: SaleItem) => (
        <InputNumber min={0} value={record.unit_price} style={{ width: 120 }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          onChange={(v) => updateItem(record.key, 'unit_price', v || 0)} />
      ),
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

  return (
    <div>
      <PageHeader title="매출등록" extra={
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => { setUploadResult(null); setUploadModalOpen(true); }}>엑셀 업로드</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>매출 등록</Button>
        </Space>
      } />
      <Table columns={columns} dataSource={data} rowKey="sale_id" loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />

      <Modal
        title="매출 등록" open={modalOpen} onCancel={() => setModalOpen(false)}
        width={820} footer={null}
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>매출일</div>
            <DatePicker value={saleDate} onChange={(v) => setSaleDate(v || dayjs())} format="YYYY-MM-DD" />
          </div>
          {!isStore && (
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>거래처</div>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions}
                value={partnerCode} onChange={setPartnerCode} style={{ width: 250 }} />
            </div>
          )}
        </Space>

        <Table
          columns={itemColumns} dataSource={items} rowKey="key" size="small"
          pagination={false} scroll={{ y: 300 }}
        />

        <Button type="dashed" icon={<PlusOutlined />} onClick={addItem} style={{ width: '100%', marginTop: 8 }}>
          상품 추가
        </Button>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            총 {items.filter(i => i.variant_id).length}건 | 합계: {totalAmount.toLocaleString()}원
          </span>
          <Button type="primary" icon={<ShoppingCartOutlined />} onClick={handleSubmit} loading={submitting} size="large">
            등록
          </Button>
        </div>
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
    </div>
  );
}
