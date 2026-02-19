import { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Card, Space, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { getProductApi, createProductApi, updateProductApi } from '../../api/product.api';
import LoadingSpinner from '../../components/LoadingSpinner';

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'].map((s) => ({ label: s, value: s }));

export default function ProductFormPage() {
  const { code } = useParams();
  const isEdit = !!code;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
    if (isEdit && code) {
      setFetching(true);
      getProductApi(code)
        .then((data) => form.setFieldsValue(data))
        .catch((e) => message.error(e.message))
        .finally(() => setFetching(false));
    }
  }, [code, isEdit, form]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        await updateProductApi(code!, values);
        message.success('상품이 수정되었습니다.');
      } else {
        await createProductApi(values);
        message.success('상품이 등록되었습니다.');
      }
      navigate('/products');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title={isEdit ? '상품 수정' : '상품 등록'} />
      <Card style={{ maxWidth: 700 }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ base_price: 0 }}>
          <Form.Item name="product_code" label="상품코드" rules={[{ required: true, message: '상품코드를 입력해주세요' }]}>
            <Input disabled={isEdit} placeholder="예: TS-001" />
          </Form.Item>
          <Form.Item name="product_name" label="상품명" rules={[{ required: true, message: '상품명을 입력해주세요' }]}>
            <Input />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="category" label="카테고리">
              <Input placeholder="예: 상의" />
            </Form.Item>
            <Form.Item name="brand" label="브랜드">
              <Input />
            </Form.Item>
            <Form.Item name="season" label="시즌">
              <Input placeholder="예: 2025SS" />
            </Form.Item>
          </Space>
          <Form.Item name="base_price" label="기본가">
            <InputNumber style={{ width: '100%' }} min={0} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          </Form.Item>

          {!isEdit && (
            <>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>변형 (컬러/사이즈)</div>
              <Form.List name="variants">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...rest }) => (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item {...rest} name={[name, 'color']} rules={[{ required: true, message: '컬러' }]}>
                          <Input placeholder="컬러 (예: BK)" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'size']} rules={[{ required: true, message: '사이즈' }]}>
                          <Select placeholder="사이즈" options={SIZE_OPTIONS} style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'price']}>
                          <InputNumber placeholder="가격 (선택)" min={0} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      변형 추가
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={loading} style={{ marginRight: 8 }}>
              {isEdit ? '수정' : '등록'}
            </Button>
            <Button onClick={() => navigate('/products')}>취소</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
