import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Button, Select, Tabs, Modal, Form, InputNumber, DatePicker,
  Input, Space, message, Popconfirm, Tag, Card, Row, Col, Segmented,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ImportOutlined, UploadOutlined, DownloadOutlined,
  InboxOutlined, SearchOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload';
import Upload from 'antd/es/upload';
import { inboundApi } from '../../modules/inbound/inbound.api';
import { useInboundStore } from '../../modules/inbound/inbound.store';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { fmt } from '../../utils/format';
import type { InboundRecord, InboundItem } from '../../../../shared/types/inbound';
import dayjs from 'dayjs';

interface VariantRow {
  key: string;
  variant_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  qty: number;
  unit_price: number;
}

/* ── 입고 등록 탭 ── */
function RegisterTab({ partners, onCreated }: { partners: any[]; onCreated: () => void }) {
  const user = useAuthStore((s) => s.user);
  const isHQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user?.role as any);
  const [form] = Form.useForm();
  const [items, setItems] = useState<VariantRow[]>([]);
  const [creating, setCreating] = useState(false);

  // ── 엑셀 일괄 입고 ──
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelForm] = Form.useForm();
  const [excelFile, setExcelFile] = useState<UploadFile | null>(null);
  const [excelUploading, setExcelUploading] = useState(false);
  const [excelResult, setExcelResult] = useState<any>(null);

  const handleTemplateDownload = async () => {
    try {
      const res = await apiFetch('/api/inbounds/excel/template');
      if (!res.ok) { message.error('템플릿 다운로드 실패'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inbound_template.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) { message.error('템플릿 다운로드 실패'); }
  };

  const handleExcelUpload = async () => {
    try {
      await excelForm.validateFields();
    } catch { return; }
    if (!excelFile) { message.warning('엑셀 파일을 선택해주세요.'); return; }

    const values = excelForm.getFieldsValue();
    const fd = new FormData();
    fd.append('file', excelFile as any);
    fd.append('partner_code', values.excel_partner_code);
    fd.append('inbound_date', values.excel_inbound_date ? values.excel_inbound_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
    if (values.excel_memo) fd.append('memo', values.excel_memo);

    setExcelUploading(true);
    setExcelResult(null);
    try {
      const res = await apiFetch('/api/inbounds/excel/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.success) {
        setExcelResult(d.data);
        message.success(`${d.data.created}건 입고 등록 완료`);
        onCreated();
      } else {
        setExcelResult(d.data || null);
        message.error(d.error || '업로드 실패');
      }
    } catch (e: any) {
      message.error(e.message || '업로드 실패');
    } finally {
      setExcelUploading(false);
    }
  };

  const handleExcelClose = () => {
    setExcelOpen(false);
    setExcelFile(null);
    setExcelResult(null);
    excelForm.resetFields();
  };

  // 상품 검색
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value || value.length < 1) { setVariantOptions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch(`/api/products/variants/search?search=${encodeURIComponent(value)}`);
        const d = await res.json();
        if (d.success) {
          setVariantOptions((d.data || []).map((v: any) => ({
            label: `${v.product_code} · ${v.product_name} · ${v.color}/${v.size}`,
            value: v.variant_id,
            raw: v,
          })));
        }
      } catch { /* ignore */ }
      finally { setSearchLoading(false); }
    }, 250);
  };

  const handleSelect = (_value: number, option: any) => {
    const row = option.raw;
    if (items.find((i) => i.variant_id === row.variant_id)) {
      message.warning('이미 추가된 항목입니다.');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: `${row.variant_id}-${Date.now()}`,
        variant_id: row.variant_id,
        product_code: row.product_code,
        product_name: row.product_name,
        sku: row.sku,
        color: row.color,
        size: row.size,
        qty: 1,
        unit_price: row.base_price || 0,
      },
    ]);
  };

  const updateItem = (key: string, field: string, value: number) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      message.warning('입고할 품목을 추가해주세요.');
      return;
    }
    try {
      await form.validateFields();
    } catch {
      message.warning('거래처를 선택해주세요.');
      return;
    }
    const values = form.getFieldsValue();
    setCreating(true);
    try {
      await inboundApi.create({
        partner_code: values.partner_code,
        inbound_date: values.inbound_date ? values.inbound_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        memo: values.memo || '',
        items: items.map((i) => ({
          variant_id: i.variant_id,
          qty: i.qty,
          unit_price: i.unit_price || undefined,
        })),
      });
      message.success('입고가 등록되었습니다.');
      form.resetFields();
      form.setFieldsValue({ inbound_date: dayjs() });
      setItems([]);
      setVariantOptions([]);
      onCreated();
    } catch (e: any) {
      message.error(e.message || '입고 등록 실패');
    } finally {
      setCreating(false);
    }
  };

  if (!isHQ) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>입고 등록 권한이 없습니다.</div>;
  }

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalAmount = items.reduce((s, i) => s + i.qty * i.unit_price, 0);

  const itemColumns = [
    { title: '품번', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 160 },
    { title: '컬러', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 65 },
    {
      title: '수량', dataIndex: 'qty', width: 90,
      render: (_: number, r: VariantRow) => (
        <InputNumber min={1} value={r.qty} size="small" style={{ width: 70 }}
          onChange={(v) => updateItem(r.key, 'qty', v || 1)} />
      ),
    },
    {
      title: '원가(원)', dataIndex: 'unit_price', width: 110,
      render: (_: number, r: VariantRow) => (
        <InputNumber min={0} value={r.unit_price} size="small" style={{ width: 100 }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number((v || '').replace(/,/g, ''))}
          onChange={(v) => updateItem(r.key, 'unit_price', v || 0)} />
      ),
    },
    {
      title: '금액', width: 100,
      render: (_: unknown, r: VariantRow) => (
        <span style={{ fontWeight: 600, fontSize: 12 }}>{fmt(r.qty * r.unit_price)}원</span>
      ),
    },
    {
      title: '', width: 40,
      render: (_: unknown, r: VariantRow) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeItem(r.key)} />
      ),
    },
  ];

  return (
    <div>
      {/* 입고 정보 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}
          initialValues={{ inbound_date: dayjs(), partner_code: undefined }}>
          <Form.Item name="partner_code" label="거래처" rules={[{ required: true, message: '거래처 선택' }]}>
            <Select placeholder="거래처 선택" style={{ width: 180 }} showSearch
              optionFilterProp="label"
              options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
          </Form.Item>
          <Form.Item name="inbound_date" label="입고일">
            <DatePicker style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="memo" label="비고">
            <Input placeholder="비고" style={{ width: 200 }} />
          </Form.Item>
          <Button icon={<UploadOutlined />} onClick={() => setExcelOpen(true)}>엑셀 일괄 입고</Button>
        </Form>
      </Card>

      {/* 엑셀 입고 모달 */}
      <Modal title="엑셀 일괄 입고" open={excelOpen} onCancel={handleExcelClose} width={520}
        footer={[
          <Button key="cancel" onClick={handleExcelClose}>닫기</Button>,
          <Button key="upload" type="primary" icon={<UploadOutlined />}
            onClick={handleExcelUpload} loading={excelUploading}
            disabled={!excelFile}>업로드</Button>,
        ]}>
        <Form form={excelForm} layout="vertical" initialValues={{ excel_inbound_date: dayjs() }}>
          <Form.Item name="excel_partner_code" label="거래처" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
            <Select placeholder="거래처 선택" showSearch optionFilterProp="label"
              options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
          </Form.Item>
          <Form.Item name="excel_inbound_date" label="입고일">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="excel_memo" label="비고">
            <Input placeholder="비고 (선택)" />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 12 }}>
          <Button icon={<DownloadOutlined />} size="small" onClick={handleTemplateDownload}>
            템플릿 다운로드
          </Button>
          <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>SKU / 수량 / 원가 / 메모</span>
        </div>

        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          beforeUpload={(file) => { setExcelFile(file as any); return false; }}
          onRemove={() => { setExcelFile(null); }}
          fileList={excelFile ? [excelFile] : []}
        >
          <p style={{ fontSize: 14, color: '#666' }}>엑셀 파일을 드래그하거나 클릭하여 선택</p>
          <p style={{ fontSize: 12, color: '#999' }}>xlsx, xls (최대 5MB)</p>
        </Upload.Dragger>

        {excelResult && (
          <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
            <div>전체: <b>{excelResult.total}</b>건 / 등록: <b>{excelResult.created}</b>건 / 건너뜀: <b>{excelResult.skipped || 0}</b>건</div>
            {excelResult.errors && excelResult.errors.length > 0 && (
              <div style={{ marginTop: 8, color: '#cf1322', fontSize: 12 }}>
                {excelResult.errors.map((e: string, i: number) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 상품 추가 */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <SearchOutlined style={{ color: '#1890ff' }} />
        <Select
          showSearch
          value={null as any}
          placeholder="품번 / 상품명 / SKU 입력하여 추가"
          style={{ flex: 1, maxWidth: 500 }}
          filterOption={false}
          onSearch={handleSearch}
          onSelect={handleSelect}
          loading={searchLoading}
          options={variantOptions}
          notFoundContent={searchLoading ? '검색 중...' : '검색어를 입력하세요'}
        />
      </div>

      {/* 입고 품목 */}
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>입고 품목 ({items.length}건)</span>
        <Space size="large">
          <span style={{ fontSize: 13, color: '#666' }}>
            총 수량: <b>{fmt(totalQty)}</b>
          </span>
          <span style={{ fontSize: 13, color: '#666' }}>
            총 금액: <b style={{ color: '#1890ff' }}>{fmt(totalAmount)}원</b>
          </span>
        </Space>
      </div>
      <Table dataSource={items} columns={itemColumns} rowKey="key"
        size="small" scroll={{ x: 1000 }} pagination={false} />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<ImportOutlined />} size="large"
          onClick={handleSubmit} loading={creating} disabled={items.length === 0}>
          입고 등록 ({totalQty}개)
        </Button>
      </div>
    </div>
  );
}

/* ── 입고 내역 탭 ── */
function HistoryTab({ partners }: { partners: any[] }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = [ROLES.ADMIN, ROLES.SYS_ADMIN].includes(user?.role as any);
  const isHQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user?.role as any);
  const { data, total, loading, fetchList } = useInboundStore();
  const [page, setPage] = useState(1);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [search, setSearch] = useState('');

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<InboundRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 입고확정 모달
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRecord, setConfirmRecord] = useState<InboundRecord | null>(null);
  const [confirmItems, setConfirmItems] = useState<VariantRow[]>([]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [searchLoadingV, setSearchLoadingV] = useState(false);
  const searchTimerRef2 = useRef<ReturnType<typeof setTimeout>>();

  // 요약 통계
  const todayCount = data.filter((d: any) => d.inbound_date && dayjs(d.inbound_date).isSame(dayjs(), 'day')).length;
  const totalQty = data.reduce((s: number, d: any) => s + (Number(d.total_qty) || 0), 0);
  const pendingCount = data.filter((d: any) => d.status === 'PENDING').length;

  const load = useCallback((p = 1) => {
    const params: any = { page: p, limit: '50' };
    if (partnerFilter) params.partner_code = partnerFilter;
    if (statusFilter) params.status = statusFilter;
    if (search) params.search = search;
    if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
    if (dateRange[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
    fetchList(params);
    setPage(p);
  }, [partnerFilter, statusFilter, dateRange, search, fetchList]);

  useEffect(() => { load(1); }, [load]);

  const showDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await apiFetch(`/api/inbounds/${id}`);
      const d = await res.json();
      if (d.success) setDetailData(d.data);
      else message.error(d.error || '상세 조회 실패');
    } catch (e: any) { message.error(e.message || '상세 조회 실패'); }
    finally { setDetailLoading(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await inboundApi.remove(id);
      message.success('입고가 삭제되었습니다.');
      setDetailOpen(false);
      load(page);
    } catch (e: any) {
      message.error(e.message || '삭제 실패');
    }
  };

  // ── 입고확정 ──
  const openConfirmModal = (record: InboundRecord) => {
    setConfirmRecord(record);
    setConfirmItems([]);
    setConfirmOpen(true);
    setDetailOpen(false);
  };

  const handleVSearch = (value: string) => {
    if (searchTimerRef2.current) clearTimeout(searchTimerRef2.current);
    if (!value || value.length < 1) { setVariantOptions([]); return; }
    searchTimerRef2.current = setTimeout(async () => {
      setSearchLoadingV(true);
      try {
        const res = await apiFetch(`/api/products/variants/search?search=${encodeURIComponent(value)}`);
        const d = await res.json();
        if (d.success) {
          setVariantOptions((d.data || []).map((v: any) => ({
            label: `${v.product_code} · ${v.product_name} · ${v.color}/${v.size}`,
            value: v.variant_id,
            raw: v,
          })));
        }
      } catch { /* ignore */ }
      finally { setSearchLoadingV(false); }
    }, 250);
  };

  const handleVSelect = (_value: number, option: any) => {
    const row = option.raw;
    if (confirmItems.find((i) => i.variant_id === row.variant_id)) {
      message.warning('이미 추가된 항목입니다.');
      return;
    }
    setConfirmItems((prev) => [
      ...prev,
      {
        key: `${row.variant_id}-${Date.now()}`,
        variant_id: row.variant_id,
        product_code: row.product_code,
        product_name: row.product_name,
        sku: row.sku,
        color: row.color,
        size: row.size,
        qty: 1,
        unit_price: row.base_price || 0,
      },
    ]);
  };

  const updateCI = (key: string, field: string, value: number) => {
    setConfirmItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };
  const removeCI = (key: string) => {
    setConfirmItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleConfirm = async () => {
    if (!confirmRecord) return;
    if (confirmItems.length === 0) { message.warning('품목을 추가해주세요.'); return; }
    if (confirmRecord.expected_qty && confirmTotalQty !== confirmRecord.expected_qty) {
      message.error(`입고 수량(${confirmTotalQty}개)이 예상 수량(${confirmRecord.expected_qty}개)과 일치하지 않습니다.`);
      return;
    }
    setConfirmLoading(true);
    try {
      await inboundApi.confirm(confirmRecord.record_id, confirmItems.map((i) => ({
        variant_id: i.variant_id, qty: i.qty, unit_price: i.unit_price || undefined,
      })));
      message.success('입고가 확정되었습니다.');
      setConfirmOpen(false);
      load(page);
    } catch (e: any) { message.error(e.message || '입고확정 실패'); }
    finally { setConfirmLoading(false); }
  };

  const confirmTotalQty = confirmItems.reduce((s, i) => s + i.qty, 0);

  const columns: any[] = [
    { title: '입고번호', dataIndex: 'inbound_no', width: 140 },
    { title: '상태', dataIndex: 'status', width: 80,
      render: (v: string) => v === 'PENDING'
        ? <Tag color="orange">대기중</Tag>
        : <Tag color="green">완료</Tag>,
    },
    { title: '입고일', dataIndex: 'inbound_date', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '거래처', dataIndex: 'partner_name', width: 130, ellipsis: true },
    { title: '품목수', dataIndex: 'item_count', width: 80, render: (v: number) => `${v}건` },
    { title: '총수량', dataIndex: 'total_qty', width: 90,
      render: (v: number, r: any) => r.status === 'PENDING'
        ? <span style={{ color: '#fa8c16' }}>예상 {fmt(r.expected_qty || 0)}</span>
        : <b>{fmt(v)}</b>,
    },
    { title: '비고', dataIndex: 'memo', width: 150, ellipsis: true },
    { title: '등록자', dataIndex: 'created_by', width: 100 },
    { title: '등록일시', dataIndex: 'created_at', width: 150,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
  ];

  const detailItemCols = [
    { title: '품번', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 160 },
    { title: '컬러', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 65 },
    { title: '수량', dataIndex: 'qty', width: 80, render: (v: number) => <b>{fmt(v)}</b> },
    { title: '원가(원)', dataIndex: 'unit_price', width: 100,
      render: (v: number | null) => v != null ? fmt(v) + '원' : '-' },
  ];

  const confirmItemCols = [
    { title: '품번', dataIndex: 'product_code', width: 100 },
    { title: '상품명', dataIndex: 'product_name', width: 150, ellipsis: true },
    { title: '컬러/사이즈', width: 100, render: (_: unknown, r: VariantRow) => `${r.color}/${r.size}` },
    { title: '수량', width: 90,
      render: (_: unknown, r: VariantRow) => (
        <InputNumber min={1} value={r.qty} size="small" style={{ width: 70 }}
          onChange={(v) => updateCI(r.key, 'qty', v || 1)} />
      ),
    },
    { title: '원가(원)', width: 110,
      render: (_: unknown, r: VariantRow) => (
        <InputNumber min={0} value={r.unit_price} size="small" style={{ width: 100 }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number((v || '').replace(/,/g, ''))}
          onChange={(v) => updateCI(r.key, 'unit_price', v || 0)} />
      ),
    },
    { title: '', width: 40,
      render: (_: unknown, r: VariantRow) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeCI(r.key)} />
      ),
    },
  ];

  return (
    <div>
      {/* 요약 카드 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <div style={{ background: '#fff1f0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#cf132299' }}>입고대기</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#cf1322' }}>{pendingCount}건</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ background: '#e6f7ff', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#1890ff99' }}>전체 건수</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>{total}건</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ background: '#f6ffed', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#52c41a99' }}>조회 총수량</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{fmt(totalQty)}개</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ background: '#fff7e6', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#fa8c1699' }}>오늘 입고</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>{todayCount}건</div>
          </div>
        </Col>
      </Row>

      {/* 필터 */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string)}
            options={[
              { label: '전체', value: '' },
              { label: '대기중', value: 'PENDING' },
              { label: '완료', value: 'COMPLETED' },
            ]}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          <Select value={partnerFilter || undefined} placeholder="전체" allowClear
            onChange={(v) => setPartnerFilter(v || '')} style={{ width: 160 }}
            showSearch optionFilterProp="label"
            options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <DatePicker.RangePicker value={dateRange as any} onChange={(v) => setDateRange(v as any)}
            style={{ width: 260 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="입고번호 검색" value={search} onChange={e => setSearch(e.target.value)}
            onPressEnter={() => load(1)} allowClear style={{ width: 180 }} prefix={<SearchOutlined />} />
        </div>
        <Button onClick={() => load(1)}>조회</Button>
      </div>

      <Table dataSource={data} columns={columns} rowKey="record_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 400px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          showTotal: (t) => `총 ${t}건`,
          onChange: (p) => load(p),
        }}
        onRow={(r) => ({
          onClick: () => showDetail(r.record_id),
          style: { cursor: 'pointer', background: r.status === 'PENDING' ? '#fffbe6' : undefined },
        })}
      />

      {/* 상세 모달 */}
      <Modal title={detailData ? `입고 상세 — ${detailData.inbound_no}` : '입고 상세'}
        open={detailOpen} onCancel={() => setDetailOpen(false)} width={850}
        footer={
          detailData ? (
            <Space>
              {detailData.status === 'PENDING' && isHQ && (
                <Button type="primary" icon={<CheckCircleOutlined />}
                  onClick={() => openConfirmModal(detailData)}>입고확정</Button>
              )}
              {isAdmin && (
                <Popconfirm title={detailData.status === 'COMPLETED' ? '삭제하면 재고가 원복됩니다. 삭제하시겠습니까?' : '대기중 입고를 삭제하시겠습니까?'}
                  onConfirm={() => handleDelete(detailData.record_id)}>
                  <Button danger>삭제{detailData.status === 'COMPLETED' ? ' (재고 원복)' : ''}</Button>
                </Popconfirm>
              )}
              <Button onClick={() => setDetailOpen(false)}>닫기</Button>
            </Space>
          ) : <Button onClick={() => setDetailOpen(false)}>닫기</Button>
        }>
        {detailData && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={6}>
                <Tag color="blue">{detailData.inbound_no}</Tag>
                {detailData.status === 'PENDING' ? <Tag color="orange">대기중</Tag> : <Tag color="green">완료</Tag>}
              </Col>
              <Col span={6}>거래처: <b>{detailData.partner_name}</b></Col>
              <Col span={6}>입고일: <b>{dayjs(detailData.inbound_date).format('YYYY-MM-DD')}</b></Col>
              <Col span={6}>등록자: <b>{detailData.created_by}</b></Col>
            </Row>
            {detailData.expected_qty != null && detailData.status === 'PENDING' && (
              <div style={{ marginBottom: 8, color: '#fa8c16', fontWeight: 500 }}>
                예상 수량: {fmt(detailData.expected_qty)}개
              </div>
            )}
            {detailData.memo && <div style={{ marginBottom: 8, color: '#666' }}>비고: {detailData.memo}</div>}
            {detailData.status === 'COMPLETED' && (
              <>
                <Table dataSource={detailData.items || []} columns={detailItemCols} rowKey="item_id"
                  size="small" pagination={false} loading={detailLoading} />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                  <span>총 품목: <b>{(detailData.items || []).length}</b>건</span>
                  <span>총 수량: <b>{fmt((detailData.items || []).reduce((s: number, i: InboundItem) => s + i.qty, 0))}</b>개</span>
                </div>
              </>
            )}
            {detailData.status === 'PENDING' && (
              <div style={{ padding: 16, background: '#fffbe6', borderRadius: 8, textAlign: 'center', color: '#fa8c16' }}>
                입고확정 버튼을 눌러 품목을 추가하고 재고를 반영하세요.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 입고확정 모달 */}
      <Modal
        title={confirmRecord ? `입고확정 — ${confirmRecord.inbound_no}` : '입고확정'}
        open={confirmOpen} onCancel={() => setConfirmOpen(false)} width={900}
        footer={
          <Space>
            <Button onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button type="primary" icon={<CheckCircleOutlined />}
              onClick={handleConfirm} loading={confirmLoading}
              disabled={confirmItems.length === 0}>
              입고확정 ({confirmTotalQty}개)
            </Button>
          </Space>
        }
      >
        {confirmRecord && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={6}><Tag color="blue">{confirmRecord.inbound_no}</Tag></Col>
              <Col span={6}>거래처: <b>{confirmRecord.partner_name}</b></Col>
              <Col span={6}>입고일: <b>{dayjs(confirmRecord.inbound_date).format('YYYY-MM-DD')}</b></Col>
              {confirmRecord.expected_qty != null && (
                <Col span={6}>예상 수량: <b style={{ color: '#fa8c16' }}>{fmt(confirmRecord.expected_qty)}개</b></Col>
              )}
            </Row>
            {confirmRecord.memo && <div style={{ marginBottom: 12, color: '#666' }}>비고: {confirmRecord.memo}</div>}
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <SearchOutlined style={{ color: '#1890ff' }} />
              <Select showSearch value={null as any} placeholder="품번 / 상품명 / SKU 입력하여 추가"
                style={{ flex: 1 }} filterOption={false}
                onSearch={handleVSearch} onSelect={handleVSelect}
                loading={searchLoadingV} options={variantOptions}
                notFoundContent={searchLoadingV ? '검색 중...' : '검색어를 입력하세요'} />
            </div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              입고 품목 ({confirmItems.length}건) — 총 {fmt(confirmTotalQty)}개
            </div>
            <Table dataSource={confirmItems} columns={confirmItemCols} rowKey="key"
              size="small" scroll={{ x: 700 }} pagination={false} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function InboundPage() {
  const [tab, setTab] = useState('register');
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/partners?limit=1000').then((r) => r.json()).then((d) => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch((e) => { message.error('거래처 목록 로드 실패: ' + (e.message || '')); });
  }, []);

  const handleCreated = () => {
    setTab('history');
  };

  return (
    <div>
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'register',
          label: <span><InboxOutlined /> 입고 등록</span>,
          children: <RegisterTab partners={partners} onCreated={handleCreated} />,
        },
        {
          key: 'history',
          label: '입고 내역',
          children: <HistoryTab partners={partners} />,
        },
      ]} />
    </div>
  );
}
