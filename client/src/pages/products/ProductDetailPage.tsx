import { useEffect, useState } from 'react';
import { Descriptions, Table, Button, Card, Space, Tag, Modal, Form, Input, InputNumber, Select, message } from 'antd';
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getProductApi, addVariantApi, deleteVariantApi } from '../../api/product.api';
import { useAuthStore } from '../../store/auth.store';
import { ROLES } from '../../constants/roles';

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'].map((s) => ({ label: s, value: s }));

export default function ProductDetailPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const load = async () => {
    try {
      const data = await getProductApi(code!);
      setProduct(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [code]);

  const handleAddVariant = async (values: any) => {
    try {
      await addVariantApi(code!, values);
      message.success('변형이 추가되었습니다.');
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDeleteVariant = async (variantId: number) => {
    try {
      await deleteVariantApi(code!, variantId);
      message.success('변형이 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <div>상품을 찾을 수 없습니다.</div>;

  const variantColumns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: '컬러', dataIndex: 'color', key: 'color' },
    { title: '사이즈', dataIndex: 'size', key: 'size', render: (v: string) => <Tag>{v}</Tag> },
    { title: '가격', dataIndex: 'price', key: 'price', render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '상태', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag> },
    ...(canWrite ? [{
      title: '관리', key: 'actions',
      render: (_: any, record: any) => (
        <Button size="small" danger onClick={() => handleDeleteVariant(record.variant_id)}>삭제</Button>
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
            {canWrite && <Button onClick={() => navigate(`/products/${code}/edit`)}>수정</Button>}
          </Space>
        }
      />
      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="상품코드">{product.product_code}</Descriptions.Item>
          <Descriptions.Item label="카테고리">{product.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="브랜드">{product.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label="시즌">{product.season || '-'}</Descriptions.Item>
          <Descriptions.Item label="기본가">{Number(product.base_price).toLocaleString()}원</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="변형 목록"
        extra={canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>변형 추가</Button>}
      >
        <Table columns={variantColumns} dataSource={product.variants} rowKey="variant_id" pagination={false} />
      </Card>

      <Modal title="변형 추가" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="추가" cancelText="취소">
        <Form form={form} layout="vertical" onFinish={handleAddVariant}>
          <Form.Item name="color" label="컬러" rules={[{ required: true, message: '컬러를 입력해주세요' }]}>
            <Input placeholder="예: BK, WH, NV" />
          </Form.Item>
          <Form.Item name="size" label="사이즈" rules={[{ required: true, message: '사이즈를 선택해주세요' }]}>
            <Select options={SIZE_OPTIONS} />
          </Form.Item>
          <Form.Item name="price" label="가격 (선택)">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
