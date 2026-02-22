import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Tag, Modal, Form, Popconfirm, InputNumber, Upload, message } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { getToken } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '입고완료', CANCELLED: '취소',
};

interface ItemRow {
  variant_id: number;
  request_qty: number;
  sku: string;
  product_name: string;
  color: string;
  size: string;
}

export default function ShipmentRequestPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [form] = Form.useForm();

  // 의뢰유형 (마스터코드 기반)
  const [shipmentTypes, setShipmentTypes] = useState<Array<{ code_value: string; code_label: string }>>([]);

  // 품목 관련 상태
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (typeFilter) params.request_type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (isStore && user?.partnerCode) params.partner = user.partnerCode;
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadPartners = async () => {
    try {
      const result = await partnerApi.list({ limit: '1000' });
      setPartners(result.data);
    } catch (e: any) { message.error('거래처 목록 로드 실패'); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    loadPartners();
    codeApi.getByType('SHIPMENT_TYPE').then((data: any[]) => {
      setShipmentTypes(data.filter((c: any) => c.is_active));
    }).catch(() => {
      // fallback if master codes not loaded
      setShipmentTypes([
        { code_value: '출고', code_label: '출고' },
        { code_value: '반품', code_label: '반품' },
        { code_value: '수평이동', code_label: '수평이동' },
      ]);
    });
  }, []);
  useEffect(() => { load(1); }, [typeFilter, statusFilter]);

  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) {
      try {
        const results = await productApi.searchVariants(value);
        setVariantOptions(results);
      } catch (e: any) { message.error('품목 검색 실패'); setVariantOptions([]); }
    }
  };

  const handleAddItem = (variantId: number) => {
    const variant = variantOptions.find(v => v.variant_id === variantId);
    if (!variant) return;
    if (items.find(i => i.variant_id === variantId)) {
      message.warning('이미 추가된 품목입니다');
      return;
    }
    setItems([...items, {
      variant_id: variantId,
      request_qty: 1,
      sku: variant.sku,
      product_name: variant.product_name,
      color: variant.color,
      size: variant.size,
    }]);
  };

  const handleCreate = async (values: any) => {
    if (items.length === 0) {
      message.error('최소 1개 이상의 품목을 추가해주세요');
      return;
    }
    try {
      await shipmentApi.create({
        ...values,
        items: items.map(({ variant_id, request_qty }) => ({ variant_id, request_qty })),
      });
      message.success('의뢰가 등록되었습니다.');
      setModalOpen(false);
      form.resetFields();
      setItems([]);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDownloadTemplate = () => {
    const token = getToken();
    fetch(shipmentApi.templateUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shipment_template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => message.error('템플릿 다운로드 실패'));
  };

  const handleExcelUpload = async (file: File) => {
    try {
      const result = await shipmentApi.uploadExcel(file);
      message.success(`${result.createdRequests}건 의뢰 (${result.createdItems}개 품목) 등록 완료`);
      if (result.errors && result.errors.length > 0) {
        Modal.warning({ title: '일부 오류', content: result.errors.join('\n'), width: 500 });
      }
      load();
    } catch (e: any) {
      message.error('업로드 실패: ' + e.message);
    }
    return false; // prevent default upload
  };

  const handleCancel = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'CANCELLED' });
      message.success('취소되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const result = await shipmentApi.get(id);
      setDetail(result);
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no' },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '유형', dataIndex: 'request_type', key: 'request_type', render: (v: string) => <Tag>{v}</Tag> },
    { title: '출발', dataIndex: 'from_partner_name', key: 'from_partner_name', render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', key: 'to_partner_name', render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', key: 'memo', render: (v: string) => v || '-', ellipsis: true },
    { title: '관리', key: 'action', width: 140, render: (_: any, record: any) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
        {record.status === 'PENDING' && (
          <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)}>
            <Button size="small" danger icon={<CloseOutlined />}>취소</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  const itemColumns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '색상', dataIndex: 'color', key: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 80 },
    { title: '수량', key: 'qty', width: 100, render: (_: any, record: ItemRow) => (
      <InputNumber min={1} value={record.request_qty} size="small"
        onChange={(v) => setItems(items.map(i => i.variant_id === record.variant_id ? { ...i, request_qty: v || 1 } : i))} />
    )},
    { title: '', key: 'action', width: 40, render: (_: any, record: ItemRow) => (
      <Button type="text" danger size="small" icon={<DeleteOutlined />}
        onClick={() => setItems(items.filter(i => i.variant_id !== record.variant_id))} />
    )},
  ];

  return (
    <div>
      <PageHeader title="의뢰등록" extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>엑셀폼</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleExcelUpload as any}>
            <Button icon={<UploadOutlined />}>엑셀 업로드</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ request_type: '출고', ...(isStore && user?.partnerCode ? { from_partner: user.partnerCode } : {}) }); setItems([]); setModalOpen(true); }}>의뢰 등록</Button>
        </Space>
      } />
      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => { setPage(1); load(1); }} style={{ width: 200 }} />
        <Select placeholder="유형" allowClear value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} style={{ width: 120 }}
          options={shipmentTypes.map(t => ({ label: t.code_label, value: t.code_value }))} />
        <Select placeholder="상태" allowClear value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }} options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
        <Button onClick={() => load()}>조회</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />

      {/* 등록 모달 */}
      <Modal title="의뢰 등록" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="등록" cancelText="취소" width={700}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="request_type" label="의뢰유형" rules={[{ required: true, message: '의뢰유형을 선택해주세요' }]}>
            <Select placeholder="유형 선택" options={shipmentTypes.map(t => ({ label: t.code_label, value: t.code_value }))} />
          </Form.Item>
          <Form.Item name="from_partner" label="출발 거래처" rules={[{ required: true, message: '출발 거래처를 선택해주세요' }]}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} disabled={isStore} />
          </Form.Item>
          <Form.Item name="to_partner" label="도착 거래처">
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" allowClear
              options={isStore ? partnerOptions.filter(p => p.value !== user?.partnerCode) : partnerOptions} />
          </Form.Item>
          <Form.Item label="품목 추가">
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} onChange={handleAddItem} value={null as any}
              notFoundContent="2자 이상 입력해주세요">
              {variantOptions.map(v => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {items.length > 0 && (
            <Table size="small" dataSource={items} rowKey="variant_id" pagination={false}
              columns={itemColumns} style={{ marginBottom: 16 }} />
          )}
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 상세 모달 */}
      <Modal title={`의뢰 상세 - ${detail?.request_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
              <div><strong>유형:</strong> {detail.request_type}</div>
              <div><strong>상태:</strong> <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag></div>
              <div><strong>출발:</strong> {detail.from_partner_name || '-'}</div>
              <div><strong>도착:</strong> {detail.to_partner_name || '-'}</div>
              <div><strong>의뢰일:</strong> {detail.request_date ? new Date(detail.request_date).toLocaleDateString('ko-KR') : '-'}</div>
              <div><strong>메모:</strong> {detail.memo || '-'}</div>
            </div>
            {detail.items && detail.items.length > 0 ? (
              <Table size="small" dataSource={detail.items} rowKey="item_id" pagination={false}
                columns={[
                  { title: 'SKU', dataIndex: 'sku', key: 'sku' },
                  { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
                  { title: '색상', dataIndex: 'color', key: 'color' },
                  { title: '사이즈', dataIndex: 'size', key: 'size' },
                  { title: '요청수량', dataIndex: 'request_qty', key: 'request_qty' },
                  { title: '출고수량', dataIndex: 'shipped_qty', key: 'shipped_qty' },
                  { title: '수령수량', dataIndex: 'received_qty', key: 'received_qty' },
                ]} />
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>등록된 품목이 없습니다.</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
