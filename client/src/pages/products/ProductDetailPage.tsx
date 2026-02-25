import { useEffect, useState } from 'react';
import { Descriptions, Table, Button, Card, Space, Tag, Modal, Form, Input, InputNumber, Select, Popconfirm, Image, Collapse, message } from 'antd';
import { PlusOutlined, ArrowLeftOutlined, EditOutlined, HistoryOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { productApi } from '../../modules/product/product.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import dayjs from 'dayjs';

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'].map((s) => ({ label: s, value: s }));

const SALE_STATUS_COLORS: Record<string, string> = {
  '판매중': 'green',
  '일시품절': 'orange',
  '단종': 'red',
  '승인대기': 'blue',
};

const fmtPrice = (v: any) => v != null && v > 0 ? `${Number(v).toLocaleString()}원` : '-';

export default function ProductDetailPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  // 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();

  // 수정 모달
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editingVariant, setEditingVariant] = useState<any>(null);

  // 판매이력
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const load = async () => {
    try {
      const data = await productApi.get(code!);
      setProduct(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSales = async () => {
    setSalesLoading(true);
    try {
      const res = await apiFetch(`/api/sales/by-product/${code}?limit=50`);
      const data = await res.json();
      if (data.success) setSalesHistory(data.data);
    } catch { /* ignore */ } finally { setSalesLoading(false); }
  };

  useEffect(() => { load(); loadSales(); }, [code]);

  // 변형 추가
  const handleAddVariant = async (values: any) => {
    try {
      await productApi.addVariant(code!, values);
      message.success('변형이 추가되었습니다.');
      setAddModalOpen(false);
      addForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 변형 수정 모달 열기
  const openEditModal = (record: any) => {
    setEditingVariant(record);
    editForm.setFieldsValue({
      color: record.color,
      size: record.size,
      price: record.price,
      barcode: record.barcode,
      warehouse_location: record.warehouse_location,
      stock_qty: record.stock_qty ?? 0,
      is_active: record.is_active,
    });
    setEditModalOpen(true);
  };

  // 변형 수정 저장
  const handleEditVariant = async (values: any) => {
    if (!editingVariant) return;
    try {
      await productApi.updateVariant(code!, editingVariant.variant_id, values);
      message.success('변형이 수정되었습니다.');
      setEditModalOpen(false);
      setEditingVariant(null);
      editForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 변형 삭제
  const handleDeleteVariant = async (variantId: number) => {
    try {
      await productApi.deleteVariant(code!, variantId);
      message.success('변형이 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <div>상품을 찾을 수 없습니다.</div>;

  // 총 재고
  const totalStock = (product.variants || []).reduce((sum: number, v: any) => sum + (v.stock_qty || 0), 0);

  const variantColumns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '컬러', dataIndex: 'color', key: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '가격', dataIndex: 'price', key: 'price', width: 100, render: fmtPrice },
    { title: '바코드', dataIndex: 'barcode', key: 'barcode', width: 150, render: (v: string) => v || '-' },
    { title: '창고위치', dataIndex: 'warehouse_location', key: 'warehouse_location', width: 100, render: (v: string) => v || '-' },
    { title: '재고수량', dataIndex: 'stock_qty', key: 'stock_qty', width: 90,
      render: (v: number) => {
        const qty = v ?? 0;
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
    { title: '상태', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 140,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>수정</Button>
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDeleteVariant(record.variant_id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title={product.product_name}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/products')}>목록</Button>
            {canWrite && <Button onClick={() => navigate(`/products/${code}/edit`)}>상품 수정</Button>}
          </Space>
        }
      />

      {/* 상품 기본 정보 */}
      <Card style={{ marginBottom: 24 }}>
        {product.image_url && (
          <div style={{ marginBottom: 16 }}>
            <Image
              src={product.image_url}
              alt={product.product_name}
              width={200}
              style={{ borderRadius: 8, border: '1px solid #d9d9d9' }}
            />
          </div>
        )}
        <Descriptions column={3} bordered size="small">
          <Descriptions.Item label="상품코드">{product.product_code}</Descriptions.Item>
          <Descriptions.Item label="카테고리">{product.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="세부카테고리">{product.sub_category || '-'}</Descriptions.Item>
          <Descriptions.Item label="브랜드">{product.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label="시즌">{product.season || '-'}</Descriptions.Item>
          <Descriptions.Item label="핏">{product.fit ? <Tag color="geekblue">{product.fit}</Tag> : '-'}</Descriptions.Item>
          <Descriptions.Item label="기장">{product.length ? <Tag color="volcano">{product.length}</Tag> : '-'}</Descriptions.Item>
          <Descriptions.Item label="판매상태">
            <Tag color={SALE_STATUS_COLORS[product.sale_status] || 'default'}>{product.sale_status || '-'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="총 재고수량">
            <Tag color={totalStock > 0 ? 'blue' : 'red'} style={{ fontSize: 14 }}>{totalStock}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="기본가 (판매가)">{fmtPrice(product.base_price)}</Descriptions.Item>
          {!isStore && <Descriptions.Item label="매입가 (원가)">{fmtPrice(product.cost_price)}</Descriptions.Item>}
          <Descriptions.Item label="할인가">{fmtPrice(product.discount_price)}</Descriptions.Item>
          <Descriptions.Item label="행사가격">{fmtPrice(product.event_price)}</Descriptions.Item>
          <Descriptions.Item label="재고부족 알림">
            <Tag color={product.low_stock_alert ? 'green' : 'default'}>{product.low_stock_alert ? 'ON' : 'OFF'}</Tag>
            {product.low_stock_threshold && <span style={{ marginLeft: 8, color: '#888' }}>임계값: {product.low_stock_threshold}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="등록일">{product.created_at ? new Date(product.created_at).toLocaleDateString('ko-KR') : '-'}</Descriptions.Item>
          <Descriptions.Item label="수정일">{product.updated_at ? new Date(product.updated_at).toLocaleDateString('ko-KR') : '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 변형 목록 (옵션/재고/위치) */}
      <Card
        title={`옵션별 재고/위치 관리 (${product.variants?.length || 0}개)`}
        extra={canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>변형 추가</Button>}
      >
        <Table
          columns={variantColumns}
          dataSource={product.variants}
          rowKey="variant_id"
          pagination={false}
          scroll={{ x: 1100 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={6} align="right"><strong>총 재고합계</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={6}><Tag color="blue" style={{ fontSize: 14 }}><strong>{totalStock}</strong></Tag></Table.Summary.Cell>
              <Table.Summary.Cell index={7} colSpan={2} />
            </Table.Summary.Row>
          )}
        />
      </Card>

      {/* 판매이력 */}
      <Card style={{ marginTop: 24 }}>
        <Collapse
          ghost
          items={[{
            key: 'sales',
            label: <span><HistoryOutlined /> 최근 판매이력 ({salesHistory.length}건)</span>,
            children: (
              <Table
                dataSource={salesHistory}
                rowKey="sale_id"
                size="small"
                loading={salesLoading}
                scroll={{ x: 800 }}
                pagination={{ pageSize: 10, showTotal: (t) => `총 ${t}건` }}
                columns={[
                  { title: '판매일', dataIndex: 'sale_date', key: 'sale_date', width: 100, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
                  { title: '매장', dataIndex: 'partner_name', key: 'partner_name', width: 100 },
                  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
                  { title: '컬러', dataIndex: 'color', key: 'color', width: 60 },
                  { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => <Tag>{v}</Tag> },
                  { title: '수량', dataIndex: 'qty', key: 'qty', width: 60 },
                  { title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 100, render: (v: number) => `${Number(v).toLocaleString()}원` },
                  { title: '합계', dataIndex: 'total_price', key: 'total_price', width: 100, render: (v: number) => `${Number(v).toLocaleString()}원` },
                  { title: '유형', dataIndex: 'sale_type', key: 'sale_type', width: 70, render: (v: string) => <Tag color={v === '반품' ? 'red' : v === '행사' ? 'orange' : 'blue'}>{v}</Tag> },
                ]}
              />
            ),
          }]}
        />
      </Card>

      {/* 변형 추가 모달 */}
      <Modal title="변형 추가" open={addModalOpen} onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }} onOk={() => addForm.submit()} okText="추가" cancelText="취소">
        <Form form={addForm} layout="vertical" onFinish={handleAddVariant} initialValues={{ stock_qty: 0 }}>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="color" label="컬러" rules={[{ required: true, message: '컬러를 입력해주세요' }]}>
              <Input placeholder="예: BK, WH, NV" />
            </Form.Item>
            <Form.Item name="size" label="사이즈" rules={[{ required: true, message: '사이즈를 선택해주세요' }]}>
              <Select options={SIZE_OPTIONS} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="price" label="가격">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="barcode" label="바코드">
            <Input placeholder="예: 8801234567890" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="warehouse_location" label="창고위치">
              <Input placeholder="예: A-01-01" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="stock_qty" label="재고수량">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 변형 수정 모달 */}
      <Modal
        title={editingVariant ? `변형 수정 - ${editingVariant.sku}` : '변형 수정'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingVariant(null); }}
        onOk={() => editForm.submit()}
        okText="저장"
        cancelText="취소"
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditVariant}>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="color" label="컬러" rules={[{ required: true, message: '컬러를 입력해주세요' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="size" label="사이즈" rules={[{ required: true, message: '사이즈를 선택해주세요' }]}>
              <Select options={SIZE_OPTIONS} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="price" label="가격">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="barcode" label="바코드">
            <Input placeholder="예: 8801234567890" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="warehouse_location" label="창고위치">
              <Input placeholder="예: A-01-01" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="stock_qty" label="재고수량" rules={[{ required: true, message: '재고수량을 입력해주세요' }]}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="is_active" label="활성 상태">
            <Select options={[{ label: '활성', value: true }, { label: '비활성', value: false }]} style={{ width: 120 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
