import { useEffect, useState, useCallback } from 'react';
import { Form, Input, InputNumber, Select, Switch, Button, Card, Space, Divider, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import LoadingSpinner from '../../components/LoadingSpinner';

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'].map((s) => ({ label: s, value: s }));

const SALE_STATUS_OPTIONS = [
  { label: '판매중', value: '판매중' },
  { label: '일시품절', value: '일시품절' },
  { label: '단종', value: '단종' },
  { label: '승인대기', value: '승인대기' },
];

const priceFormatter = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default function ProductFormPage() {
  const { code } = useParams();
  const isEdit = !!code;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [brandOptions, setBrandOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [lengthOptions, setLengthOptions] = useState<{ label: string; value: string }[]>([]);

  const updateSubCategories = useCallback((categoryValue: string | undefined, allCats: any[]) => {
    if (!categoryValue) {
      setSubCategoryOptions([]);
      return;
    }
    const parent = allCats.find((c: any) => c.code_value === categoryValue && !c.parent_code);
    if (parent) {
      setSubCategoryOptions(
        allCats
          .filter((c: any) => c.parent_code === parent.code_id && c.is_active)
          .map((c: any) => ({ label: c.code_label, value: c.code_value })),
      );
    } else {
      setSubCategoryOptions([]);
    }
  }, []);

  useEffect(() => {
    codeApi.getAll().then((data: any) => {
      const toOpts = (items: any[]) => (items || []).filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value }));
      const allCats = data.CATEGORY || [];
      setAllCategoryCodes(allCats);
      setCategoryOptions(allCats.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
      setBrandOptions(toOpts(data.BRAND));

      // 연도 × 시즌 조합 옵션 생성 (예: 2026SA, 2026SM, ...)
      const years = (data.YEAR || []).filter((c: any) => c.is_active).map((c: any) => c.code_value);
      const seasons = (data.SEASON || []).filter((c: any) => c.is_active);
      const combined: { label: string; value: string }[] = [];
      for (const yr of years.sort().reverse()) {
        for (const sz of seasons) {
          combined.push({ label: `${yr} ${sz.code_label}`, value: `${yr}${sz.code_value}` });
        }
      }
      setSeasonOptions(combined);

      setFitOptions(toOpts(data.FIT));
      setLengthOptions(toOpts(data.LENGTH));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit && code) {
      setFetching(true);
      productApi.get(code)
        .then((data) => {
          form.setFieldsValue(data);
          if (data.category && allCategoryCodes.length > 0) {
            updateSubCategories(data.category, allCategoryCodes);
          }
        })
        .catch((e) => message.error(e.message))
        .finally(() => setFetching(false));
    }
  }, [code, isEdit, form, allCategoryCodes, updateSubCategories]);

  const handleCategoryChange = (value: string) => {
    form.setFieldValue('sub_category', undefined);
    updateSubCategories(value, allCategoryCodes);
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        await productApi.update(code!, values);
        message.success('상품이 수정되었습니다.');
      } else {
        await productApi.create(values);
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
      <Card style={{ maxWidth: 800 }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ base_price: 0, cost_price: 0, sale_status: '판매중', low_stock_alert: true }}>
          <Form.Item name="product_code" label="상품코드" rules={[{ required: true, message: '상품코드를 입력해주세요' }]}>
            <Input disabled={isEdit} placeholder="예: TS-001" />
          </Form.Item>
          <Form.Item name="product_name" label="상품명" rules={[{ required: true, message: '상품명을 입력해주세요' }]}>
            <Input />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start" wrap>
            <Form.Item name="category" label="카테고리">
              <Select showSearch allowClear placeholder="카테고리 선택" options={categoryOptions} optionFilterProp="label" style={{ width: 160 }} onChange={handleCategoryChange} />
            </Form.Item>
            <Form.Item name="sub_category" label="세부카테고리">
              <Select showSearch allowClear placeholder="세부카테고리" options={subCategoryOptions} optionFilterProp="label" style={{ width: 160 }} disabled={subCategoryOptions.length === 0} />
            </Form.Item>
            <Form.Item name="brand" label="브랜드">
              <Select showSearch allowClear placeholder="브랜드 선택" options={brandOptions} optionFilterProp="label" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="season" label="시즌">
              <Select showSearch allowClear placeholder="시즌 선택" options={seasonOptions} optionFilterProp="label" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="fit" label="핏">
              <Select showSearch allowClear placeholder="핏 선택" options={fitOptions} optionFilterProp="label" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="length" label="기장">
              <Select showSearch allowClear placeholder="기장 선택" options={lengthOptions} optionFilterProp="label" style={{ width: 160 }} />
            </Form.Item>
          </Space>

          <Divider orientation="left">가격 정보</Divider>
          <Space style={{ display: 'flex' }} align="start" wrap>
            <Form.Item name="base_price" label="기본가 (판매가)">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} />
            </Form.Item>
            <Form.Item name="cost_price" label="매입가 (원가)">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} />
            </Form.Item>
            <Form.Item name="discount_price" label="할인가">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} placeholder="선택" />
            </Form.Item>
            <Form.Item name="event_price" label="행사가격">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} placeholder="선택" />
            </Form.Item>
          </Space>

          <Form.Item name="sale_status" label="판매상태" style={{ maxWidth: 200 }}>
            <Select options={SALE_STATUS_OPTIONS} />
          </Form.Item>

          <Divider orientation="left">재고부족 알림</Divider>
          <Space style={{ display: 'flex' }} align="start" wrap>
            <Form.Item name="low_stock_alert" label="알림 활성화" valuePropName="checked">
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            <Form.Item name="low_stock_threshold" label="임계값 (미입력시 기본값)">
              <InputNumber min={0} style={{ width: 160 }} placeholder="기본값 사용" />
            </Form.Item>
          </Space>

          {!isEdit && (
            <>
              <Divider orientation="left">변형 (컬러/사이즈/바코드/창고위치/재고)</Divider>
              <Form.List name="variants">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...rest }) => (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" wrap>
                        <Form.Item {...rest} name={[name, 'color']} rules={[{ required: true, message: '컬러' }]}>
                          <Input placeholder="컬러 (예: BK)" style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'size']} rules={[{ required: true, message: '사이즈' }]}>
                          <Select placeholder="사이즈" options={SIZE_OPTIONS} style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'price']}>
                          <InputNumber placeholder="가격" min={0} style={{ width: 110 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'barcode']}>
                          <Input placeholder="바코드" style={{ width: 140 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'warehouse_location']}>
                          <Input placeholder="창고위치" style={{ width: 110 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'stock_qty']}>
                          <InputNumber placeholder="재고" min={0} style={{ width: 80 }} />
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
