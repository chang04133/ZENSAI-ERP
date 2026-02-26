import { useEffect, useState, useCallback } from 'react';
import {
  Table, Modal, Form, Button, Input, InputNumber, Select, DatePicker,
  Space, Tag, message, Divider, Popconfirm, Descriptions,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined, SearchOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { orderApi } from '../../modules/order/order.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { customerApi } from '../../modules/customer/customer.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import type { Order, OrderItem } from '../../../../shared/types/order';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING:    { label: '대기', color: 'default' },
  CONFIRMED:  { label: '확인', color: 'blue' },
  PROCESSING: { label: '처리중', color: 'orange' },
  COMPLETED:  { label: '완료', color: 'green' },
  CANCELLED:  { label: '취소', color: 'red' },
};

interface ItemRow {
  variant_id: number;
  qty: number;
  unit_price: number;
  sku: string;
  product_name: string;
  color: string;
  size: string;
}

export default function OrderManagePage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isManager = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'].includes(user?.role || '');

  /* -- state -- */
  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);

  /* -- data load -- */
  const loadData = useCallback(async (p?: number) => {
    setLoading(true);
    try {
      const pg = p ?? page;
      const params: Record<string, string> = { page: String(pg), limit: '50' };
      if (search) params.search = search;
      if (isStore && user?.partnerCode) params.partner_code = user.partnerCode;
      const res = await orderApi.list(params);
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, isStore, user?.partnerCode]);

  useEffect(() => { loadData(1); }, []);

  useEffect(() => {
    (async () => {
      try {
        const pRes = await partnerApi.list({ limit: '1000' });
        setPartners(pRes.data);
      } catch { /* ignore */ }
      try {
        const cRes = await customerApi.list({ limit: '1000' });
        setCustomers(cRes.data);
      } catch { /* ignore */ }
      try { setVariantOptions(await productApi.searchVariants('')); }
      catch { /* ignore */ }
    })();
  }, []);

  /* -- handlers -- */
  const handleSearch = () => { setPage(1); loadData(1); };

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
      variant_id: variantId, qty: 1, unit_price: v.price || 0,
      sku: v.sku, product_name: v.product_name, color: v.color, size: v.size,
    }]);
  };

  const handleRemoveItem = (variantId: number) => {
    setItems(items.filter((i) => i.variant_id !== variantId));
  };

  const totalAmount = items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);

  const handleCreate = async (values: any) => {
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    setSubmitting(true);
    try {
      const body = {
        customer_id: values.customer_id || undefined,
        partner_code: values.partner_code,
        order_date: values.order_date ? values.order_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        memo: values.memo || '',
        items: items.map(({ variant_id, qty, unit_price }) => ({ variant_id, qty, unit_price })),
      };
      await orderApi.create(body);
      message.success('주문이 등록되었습니다.');
      setCreateOpen(false);
      form.resetFields();
      setItems([]);
      loadData(1);
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const order = await orderApi.get(id);
      setDetail(order);
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await orderApi.updateStatus(id, status);
      message.success('상태가 변경되었습니다.');
      loadData();
    } catch (e: any) { message.error(e.message); }
  };

  const handleComplete = async (id: number) => {
    try {
      await orderApi.complete(id);
      message.success('매출 전환이 완료되었습니다.');
      loadData();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDelete = async (id: number) => {
    try {
      await orderApi.remove(id);
      message.success('주문이 삭제되었습니다.');
      loadData();
    } catch (e: any) { message.error(e.message); }
  };

  /* -- open create modal -- */
  const openCreateModal = () => {
    form.resetFields();
    setItems([]);
    if (isStore && user?.partnerCode) {
      form.setFieldsValue({ partner_code: user.partnerCode });
    }
    form.setFieldsValue({ order_date: dayjs() });
    setCreateOpen(true);
  };

  /* -- columns -- */
  const columns = [
    { title: '주문번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '고객명', dataIndex: 'customer_name', key: 'customer_name', width: 100,
      render: (v: string) => v || '-' },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120,
      render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => {
        const s = STATUS_MAP[v] || { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    { title: '주문일', dataIndex: 'order_date', key: 'order_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '품목수', key: 'item_count', width: 70, align: 'right' as const,
      render: (_: any, r: Order) => r.items?.length ?? '-' },
    { title: '총금액', dataIndex: 'total_amount', key: 'total_amount', width: 120, align: 'right' as const,
      render: (v: number) => (v ?? 0).toLocaleString() + '원' },
    { title: '관리', key: 'action', width: 260,
      render: (_: any, record: Order) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.order_id)}>
            상세
          </Button>
          {isManager && record.status === 'PENDING' && (
            <Button size="small" type="primary" onClick={() => handleStatusChange(record.order_id, 'CONFIRMED')}>
              확인
            </Button>
          )}
          {isManager && record.status === 'CONFIRMED' && (
            <Button size="small" style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
              onClick={() => handleStatusChange(record.order_id, 'PROCESSING')}>
              처리시작
            </Button>
          )}
          {isManager && record.status === 'PROCESSING' && (
            <Popconfirm title="매출 전환하시겠습니까?" onConfirm={() => handleComplete(record.order_id)}>
              <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                완료(매출전환)
              </Button>
            </Popconfirm>
          )}
          {isManager && record.status === 'PENDING' && (
            <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(record.order_id, 'CANCELLED')}>
              <Button size="small" danger>취소</Button>
            </Popconfirm>
          )}
          {isManager && record.status === 'PENDING' && (
            <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(record.order_id)}>
              <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  /* -- item columns for create modal -- */
  const itemColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name' },
    { title: '색상', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '수량', key: 'qty', width: 90,
      render: (_: any, r: ItemRow) => (
        <InputNumber min={1} value={r.qty} size="small"
          onChange={(v) => setItems(items.map((i) => i.variant_id === r.variant_id ? { ...i, qty: v || 1 } : i))} />
      ),
    },
    { title: '단가', key: 'unit_price', width: 110,
      render: (_: any, r: ItemRow) => (
        <InputNumber min={0} value={r.unit_price} size="small" style={{ width: 100 }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          onChange={(v) => setItems(items.map((i) => i.variant_id === r.variant_id ? { ...i, unit_price: v || 0 } : i))} />
      ),
    },
    { title: '소계', key: 'subtotal', width: 100, align: 'right' as const,
      render: (_: any, r: ItemRow) => (r.qty * r.unit_price).toLocaleString() + '원' },
    { title: '', key: 'del', width: 40,
      render: (_: any, r: ItemRow) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(r.variant_id)} />
      ),
    },
  ];

  /* -- detail item columns -- */
  const detailItemColumns = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name' },
    { title: '색상', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '수량', dataIndex: 'qty', width: 80, align: 'right' as const },
    { title: '단가', dataIndex: 'unit_price', width: 100, align: 'right' as const,
      render: (v: number) => (v ?? 0).toLocaleString() + '원' },
    { title: '소계', dataIndex: 'total_price', width: 100, align: 'right' as const,
      render: (v: number) => (v ?? 0).toLocaleString() + '원' },
  ];

  const partnerOptions = partners.map((p: any) => ({
    label: `${p.partner_code} - ${p.partner_name}`,
    value: p.partner_code,
  }));

  const customerOptions = customers.map((c: any) => ({
    label: c.customer_name || c.name || `고객 #${c.customer_id}`,
    value: c.customer_id,
  }));

  /* -- render -- */
  return (
    <div>
      <PageHeader
        title="주문 관리"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            주문 등록
          </Button>
        }
      />

      <Space style={{ marginBottom: 12 }} wrap>
        <Input size="small" placeholder="주문번호, 고객명 검색" prefix={<SearchOutlined />}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={handleSearch} style={{ width: 220 }} />
        <Button size="small" onClick={handleSearch}>조회</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="order_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          onChange: (p) => { setPage(p); loadData(p); },
          showTotal: (t) => `총 ${t}건`,
        }}
      />

      {/* -- 주문 등록 모달 -- */}
      <Modal title="주문 등록" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()} okText="등록" cancelText="취소"
        width={780} confirmLoading={submitting}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="partner_code" label="거래처" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택"
                options={partnerOptions} disabled={isStore} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="customer_id" label="고객 (선택)">
              <Select showSearch optionFilterProp="label" placeholder="고객 선택" allowClear
                options={customerOptions} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="order_date" label="주문일" rules={[{ required: true, message: '주문일을 선택해주세요' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item label="품목 추가">
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} onChange={handleAddItem} value={null as any}
              notFoundContent="2자 이상 입력해주세요" style={{ width: '100%' }}>
              {variantOptions.map((v) => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size}) | {(v.price || 0).toLocaleString()}원
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {items.length > 0 && (
            <>
              <Table size="small" dataSource={items} rowKey="variant_id" pagination={false}
                columns={itemColumns} style={{ marginBottom: 12 }} />
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                합계: {totalAmount.toLocaleString()}원
              </div>
            </>
          )}

          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="비고 사항" />
          </Form.Item>
        </Form>
      </Modal>

      {/* -- 주문 상세 모달 -- */}
      <Modal title="주문 상세" open={detailOpen} onCancel={() => setDetailOpen(false)}
        footer={null} width={700}>
        {detail && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="주문번호">{detail.order_no}</Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="거래처">{detail.partner_name || detail.partner_code}</Descriptions.Item>
              <Descriptions.Item label="고객명">{detail.customer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="주문일">{detail.order_date ? dayjs(detail.order_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="총금액">{(detail.total_amount ?? 0).toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="메모" span={2}>{detail.memo || '-'}</Descriptions.Item>
            </Descriptions>
            <Divider orientation="left" plain style={{ margin: '12px 0' }}>주문 품목</Divider>
            <Table size="small" dataSource={detail.items || []} rowKey="item_id"
              columns={detailItemColumns} pagination={false} />
          </>
        )}
      </Modal>
    </div>
  );
}
