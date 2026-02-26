import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form,
  InputNumber, DatePicker, Tag, message, Divider, Descriptions, Popconfirm,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined,
  CheckCircleOutlined, SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { purchaseApi } from '../../modules/purchase/purchase.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import type { PurchaseOrder, PurchaseOrderItem } from '../../../../shared/types/purchase';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '임시저장' },
  CONFIRMED: { color: 'blue', label: '발주확정' },
  SHIPPED: { color: 'orange', label: '배송중' },
  RECEIVED: { color: 'green', label: '입고완료' },
  CANCELLED: { color: 'red', label: '취소' },
};

interface ItemRow {
  key: number;
  variant_id: number;
  sku: string;
  product_name: string;
  color: string;
  size: string;
  order_qty: number;
  unit_cost: number;
}

let rowKey = 0;

export default function PurchaseOrderPage() {
  /* ── 목록 상태 ── */
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  /* ── 파트너/품목 옵션 ── */
  const [partners, setPartners] = useState<any[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  /* ── 등록 모달 ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [creating, setCreating] = useState(false);

  /* ── 상세 모달 ── */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);

  /* ── 입고 모달 ── */
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});
  const [receiving, setReceiving] = useState(false);

  /* ══════════ 데이터 로드 ══════════ */
  const load = useCallback(async (p?: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p ?? page), limit: '50' };
      if (search) params.search = search;
      const res = await purchaseApi.list(params);
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(1); }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await partnerApi.list({ limit: '1000' });
        setPartners(res.data);
      } catch { /* ignore */ }
      try { setVariantOptions(await productApi.searchVariants('')); }
      catch { /* ignore */ }
    })();
  }, []);

  const partnerOptions = useMemo(
    () => partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code })),
    [partners],
  );

  const handleSearch = () => { setPage(1); load(1); };
  const handlePageChange = (p: number) => { setPage(p); load(p); };

  /* ══════════ 품목 검색/추가 ══════════ */
  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) {
      try { setVariantOptions(await productApi.searchVariants(value)); }
      catch { setVariantOptions([]); }
    }
  };

  const handleAddItem = (variantId: number) => {
    const v = variantOptions.find((o) => o.variant_id === variantId);
    if (!v) return;
    if (items.find((i) => i.variant_id === variantId)) {
      message.warning('이미 추가된 품목입니다');
      return;
    }
    setItems([...items, {
      key: ++rowKey,
      variant_id: variantId,
      sku: v.sku,
      product_name: v.product_name,
      color: v.color,
      size: v.size,
      order_qty: 1,
      unit_cost: v.price || 0,
    }]);
  };

  const handleRemoveItem = (key: number) => setItems(items.filter((i) => i.key !== key));

  const handleItemChange = (key: number, field: 'order_qty' | 'unit_cost', val: number) => {
    setItems(items.map((i) => i.key === key ? { ...i, [field]: val } : i));
  };

  const totalAmount = useMemo(
    () => items.reduce((sum, i) => sum + i.order_qty * i.unit_cost, 0), [items],
  );

  /* ══════════ 등록 ══════════ */
  const handleCreate = async (values: any) => {
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    setCreating(true);
    try {
      const body = {
        supplier_code: values.supplier_code,
        to_partner: values.to_partner || undefined,
        order_date: values.order_date ? values.order_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        expected_date: values.expected_date ? values.expected_date.format('YYYY-MM-DD') : undefined,
        memo: values.memo || undefined,
        items: items.map(({ variant_id, order_qty, unit_cost }) => ({ variant_id, order_qty, unit_cost })),
      };
      await purchaseApi.create(body);
      message.success('발주가 등록되었습니다.');
      setCreateOpen(false);
      createForm.resetFields();
      setItems([]);
      load(1);
    } catch (e: any) { message.error(e.message); }
    finally { setCreating(false); }
  };

  /* ══════════ 상세 보기 ══════════ */
  const handleViewDetail = async (poId: number) => {
    try {
      const d = await purchaseApi.get(poId);
      setDetail(d);
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  /* ══════════ 상태 변경 ══════════ */
  const handleStatusChange = async (poId: number, status: string) => {
    try {
      await purchaseApi.updateStatus(poId, status);
      message.success('상태가 변경되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ══════════ 삭제 ══════════ */
  const handleDelete = async (poId: number) => {
    try {
      await purchaseApi.remove(poId);
      message.success('삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ══════════ 입고 처리 ══════════ */
  const handleOpenReceive = async (poId: number) => {
    try {
      const d = await purchaseApi.get(poId);
      setReceiveTarget(d);
      const qtys: Record<number, number> = {};
      d.items?.forEach((item) => { qtys[item.item_id] = item.order_qty - item.received_qty; });
      setReceivedQtys(qtys);
      setReceiveOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmReceive = async () => {
    if (!receiveTarget) return;
    setReceiving(true);
    try {
      const rItems = receiveTarget.items!.map((item) => ({
        item_id: item.item_id,
        received_qty: receivedQtys[item.item_id] || 0,
      }));
      await purchaseApi.receive(receiveTarget.po_id, rItems);
      message.success('입고 처리가 완료되었습니다.');
      setReceiveOpen(false);
      setReceiveTarget(null);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setReceiving(false); }
  };

  /* ══════════ 컬럼 정의 ══════════ */
  const columns = [
    { title: '발주번호', dataIndex: 'po_no', width: 140,
      render: (v: string, r: PurchaseOrder) => <a onClick={() => handleViewDetail(r.po_id)}>{v}</a> },
    { title: '공급업체', dataIndex: 'supplier_name', width: 140, render: (v: string) => v || '-' },
    { title: '입고처', dataIndex: 'to_partner_name', width: 120, render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', width: 100,
      render: (v: string) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label || v}</Tag> },
    { title: '주문일', dataIndex: 'order_date', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '예정일', dataIndex: 'expected_date', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '품목수', key: 'items_count', width: 80, align: 'right' as const,
      render: (_: any, r: PurchaseOrder) => r.items?.length ?? '-' },
    { title: '총금액', dataIndex: 'total_amount', width: 130, align: 'right' as const,
      render: (v: number) => (v ?? 0).toLocaleString() + '원' },
    { title: '관리', key: 'action', width: 220, render: (_: any, r: PurchaseOrder) => (
      <Space size={4}>
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.po_id)}>상세</Button>
        {r.status === 'DRAFT' && (
          <Button size="small" type="primary" onClick={() => handleStatusChange(r.po_id, 'CONFIRMED')}>확정</Button>
        )}
        {r.status === 'CONFIRMED' && (
          <Button size="small" style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
            icon={<SendOutlined />} onClick={() => handleStatusChange(r.po_id, 'SHIPPED')}>배송</Button>
        )}
        {(r.status === 'CONFIRMED' || r.status === 'SHIPPED') && (
          <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}
            icon={<CheckCircleOutlined />} onClick={() => handleOpenReceive(r.po_id)}>입고</Button>
        )}
        {r.status === 'DRAFT' && (
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.po_id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
        {(r.status === 'DRAFT' || r.status === 'CONFIRMED') && (
          <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(r.po_id, 'CANCELLED')}>
            <Button size="small" danger>취소</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  /* ══════════ 등록 모달 품목 컬럼 ══════════ */
  const itemColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name' },
    { title: '색상', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '수량', key: 'order_qty', width: 100, render: (_: any, r: ItemRow) => (
      <InputNumber min={1} value={r.order_qty} size="small"
        onChange={(v) => handleItemChange(r.key, 'order_qty', v || 1)} />
    )},
    { title: '단가', key: 'unit_cost', width: 120, render: (_: any, r: ItemRow) => (
      <InputNumber min={0} value={r.unit_cost} size="small" style={{ width: 100 }}
        onChange={(v) => handleItemChange(r.key, 'unit_cost', v || 0)} />
    )},
    { title: '소계', key: 'subtotal', width: 110, align: 'right' as const,
      render: (_: any, r: ItemRow) => (r.order_qty * r.unit_cost).toLocaleString() + '원' },
    { title: '', key: 'del', width: 40, render: (_: any, r: ItemRow) => (
      <Button type="text" danger size="small" icon={<DeleteOutlined />}
        onClick={() => handleRemoveItem(r.key)} />
    )},
  ];

  /* ══════════ 입고 모달 품목 컬럼 ══════════ */
  const receiveColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name' },
    { title: '색상', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '주문수량', dataIndex: 'order_qty', width: 90, align: 'right' as const },
    { title: '기입고', dataIndex: 'received_qty', width: 80, align: 'right' as const },
    { title: '입고수량', key: 'receive', width: 110, render: (_: any, r: PurchaseOrderItem) => (
      <InputNumber min={0} max={r.order_qty - r.received_qty} size="small"
        value={receivedQtys[r.item_id] ?? 0}
        onChange={(v) => setReceivedQtys({ ...receivedQtys, [r.item_id]: v || 0 })} />
    )},
  ];

  /* ══════════ 상세 모달 품목 컬럼 ══════════ */
  const detailItemColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name' },
    { title: '색상', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '주문수량', dataIndex: 'order_qty', width: 90, align: 'right' as const },
    { title: '단가', dataIndex: 'unit_cost', width: 100, align: 'right' as const,
      render: (v: number) => (v ?? 0).toLocaleString() },
    { title: '금액', key: 'amount', width: 110, align: 'right' as const,
      render: (_: any, r: PurchaseOrderItem) => ((r.order_qty ?? 0) * (r.unit_cost ?? 0)).toLocaleString() + '원' },
    { title: '입고수량', dataIndex: 'received_qty', width: 90, align: 'right' as const },
  ];

  /* ══════════ 렌더 ══════════ */
  return (
    <div>
      <PageHeader title="발주 관리" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          createForm.resetFields();
          createForm.setFieldsValue({ order_date: dayjs() });
          setItems([]);
          setCreateOpen(true);
        }}>신규 발주</Button>
      } />

      <Space style={{ marginBottom: 12 }} wrap>
        <Input size="small" placeholder="발주번호/업체명 검색" prefix={<SearchOutlined />} value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={handleSearch} style={{ width: 240 }} />
        <Button size="small" onClick={handleSearch}>조회</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="po_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          onChange: handlePageChange,
          showTotal: (t) => `총 ${t}건`,
        }}
      />

      {/* ══ 등록 모달 ══ */}
      <Modal title="신규 발주 등록" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()} okText="등록" cancelText="취소" width={800}
        confirmLoading={creating}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Space style={{ width: '100%' }} direction="vertical" size={0}>
            <Space wrap style={{ width: '100%' }}>
              <Form.Item name="supplier_code" label="공급업체" rules={[{ required: true, message: '공급업체를 선택해주세요' }]}
                style={{ minWidth: 250 }}>
                <Select showSearch optionFilterProp="label" placeholder="공급업체 선택" options={partnerOptions} />
              </Form.Item>
              <Form.Item name="to_partner" label="입고처" style={{ minWidth: 250 }}>
                <Select showSearch optionFilterProp="label" placeholder="입고처 선택 (선택)" allowClear options={partnerOptions} />
              </Form.Item>
            </Space>
            <Space wrap style={{ width: '100%' }}>
              <Form.Item name="order_date" label="주문일" rules={[{ required: true, message: '주문일을 선택해주세요' }]}>
                <DatePicker />
              </Form.Item>
              <Form.Item name="expected_date" label="입고예정일">
                <DatePicker />
              </Form.Item>
            </Space>
            <Form.Item name="memo" label="메모">
              <Input.TextArea rows={2} placeholder="발주 메모" />
            </Form.Item>
          </Space>

          <Divider style={{ margin: '8px 0 12px' }} />

          <Form.Item label="품목 추가" style={{ marginBottom: 8 }}>
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} onChange={handleAddItem} value={null as any}
              notFoundContent="2자 이상 입력해주세요" style={{ width: '100%' }}>
              {variantOptions.map((v) => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {items.length > 0 && (
            <Table size="small" dataSource={items} columns={itemColumns} rowKey="key"
              pagination={false} style={{ marginBottom: 12 }} />
          )}
          {items.length > 0 && (
            <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 15 }}>
              합계: {totalAmount.toLocaleString()}원
            </div>
          )}
        </Form>
      </Modal>

      {/* ══ 상세 모달 ══ */}
      <Modal title={`발주 상세 - ${detail?.po_no || ''}`} open={detailOpen}
        onCancel={() => setDetailOpen(false)} footer={null} width={850}>
        {detail && (
          <>
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="발주번호">{detail.po_no}</Descriptions.Item>
              <Descriptions.Item label="공급업체">{detail.supplier_name || detail.supplier_code}</Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="주문일">{detail.order_date ? dayjs(detail.order_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="입고예정일">{detail.expected_date ? dayjs(detail.expected_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="입고처">{detail.to_partner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="총금액" span={2}>{(detail.total_amount ?? 0).toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="메모">{detail.memo || '-'}</Descriptions.Item>
            </Descriptions>
            <Table dataSource={detail.items || []} columns={detailItemColumns}
              rowKey="item_id" size="small" pagination={false} />
          </>
        )}
      </Modal>

      {/* ══ 입고 모달 ══ */}
      <Modal title={`입고 처리 - ${receiveTarget?.po_no || ''}`} open={receiveOpen}
        onCancel={() => setReceiveOpen(false)} onOk={handleConfirmReceive}
        okText="입고 확인" cancelText="취소" width={800} confirmLoading={receiving}>
        {receiveTarget && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="공급업체">{receiveTarget.supplier_name || receiveTarget.supplier_code}</Descriptions.Item>
              <Descriptions.Item label="주문일">{receiveTarget.order_date ? dayjs(receiveTarget.order_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
            </Descriptions>
            <Table dataSource={receiveTarget.items || []} columns={receiveColumns}
              rowKey="item_id" size="small" pagination={false} />
          </>
        )}
      </Modal>
    </div>
  );
}
