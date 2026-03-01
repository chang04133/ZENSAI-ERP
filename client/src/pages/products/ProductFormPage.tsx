import { useEffect, useState, useCallback, useMemo } from 'react';
import { Form, Input, InputNumber, Select, Switch, Button, Card, Space, Divider, Upload, Image, Table, Tag, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
import { materialApi } from '../../modules/production/material.api';
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [allMaterials, setAllMaterials] = useState<any[]>([]);
  const [productMaterials, setProductMaterials] = useState<Array<{ material_id: number; usage_qty: number }>>([]);
  const [materialSaving, setMaterialSaving] = useState(false);

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
    materialApi.list({ limit: '500' }).then((res: any) => {
      const items = res?.data || res || [];
      setAllMaterials(Array.isArray(items) ? items : []);
    }).catch(() => {});
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
      Promise.all([
        productApi.get(code),
        productApi.getProductMaterials(code),
      ])
        .then(([data, mats]) => {
          form.setFieldsValue(data);
          if ((data as any).image_url) setImageUrl((data as any).image_url);
          if (data.category && allCategoryCodes.length > 0) {
            updateSubCategories(data.category, allCategoryCodes);
          }
          setProductMaterials(mats.map((m: any) => ({ material_id: m.material_id, usage_qty: Number(m.usage_qty) })));
        })
        .catch((e) => message.error(e.message))
        .finally(() => setFetching(false));
    }
  }, [code, isEdit, form, allCategoryCodes, updateSubCategories]);

  const handleImageUpload = async (file: File) => {
    if (!isEdit || !code) {
      message.info('상품 등록 후 이미지를 업로드할 수 있습니다.');
      return false;
    }
    setImageUploading(true);
    try {
      const result = await productApi.uploadImage(code, file);
      setImageUrl(result.image_url);
      message.success('이미지가 업로드되었습니다.');
    } catch (e: any) {
      message.error(e.message || '이미지 업로드 실패');
    } finally {
      setImageUploading(false);
    }
    return false; // prevent default upload
  };

  // 부자재 기반 원가 계산
  const materialMap = useMemo(() => {
    const m: Record<number, any> = {};
    for (const mat of allMaterials) m[mat.material_id] = mat;
    return m;
  }, [allMaterials]);

  const calculatedCostPrice = useMemo(() => {
    return productMaterials.reduce((sum, pm) => {
      const mat = materialMap[pm.material_id];
      if (!mat) return sum;
      return sum + (pm.usage_qty || 1) * Number(mat.unit_price || 0);
    }, 0);
  }, [productMaterials, materialMap]);

  const addMaterial = (materialId: number) => {
    if (productMaterials.some((pm) => pm.material_id === materialId)) {
      message.warning('이미 추가된 부자재입니다.');
      return;
    }
    setProductMaterials((prev) => [...prev, { material_id: materialId, usage_qty: 1 }]);
  };

  const removeMaterial = (materialId: number) => {
    setProductMaterials((prev) => prev.filter((pm) => pm.material_id !== materialId));
  };

  const updateMaterialQty = (materialId: number, qty: number) => {
    setProductMaterials((prev) =>
      prev.map((pm) => (pm.material_id === materialId ? { ...pm, usage_qty: qty } : pm)),
    );
  };

  const handleCategoryChange = (value: string) => {
    form.setFieldValue('sub_category', undefined);
    updateSubCategories(value, allCategoryCodes);
  };

  const onFinish = async (values: any) => {
    if (productMaterials.length === 0) {
      message.warning('부자재를 1개 이상 등록해야 합니다.');
      return;
    }
    setLoading(true);
    try {
      const productCode = isEdit ? code! : values.product_code;
      // cost_price는 부자재 기반 자동계산
      values.cost_price = calculatedCostPrice;
      if (isEdit) {
        await productApi.update(productCode, values);
      } else {
        await productApi.create(values);
      }
      // 부자재 저장
      await productApi.saveProductMaterials(productCode, productMaterials);
      message.success(isEdit ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.');
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

          {isEdit && (
            <Form.Item label="상품 이미지">
              <Space direction="vertical" size="small">
                {imageUrl && (
                  <Image
                    src={imageUrl}
                    alt="상품 이미지"
                    width={160}
                    style={{ borderRadius: 8, border: '1px solid #d9d9d9' }}
                    fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjYmZiZmJmIiBmb250LXNpemU9IjE0Ij5ObyBJbWFnZTwvdGV4dD48L3N2Zz4="
                  />
                )}
                <Upload
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  showUploadList={false}
                  beforeUpload={handleImageUpload}
                >
                  <Button icon={<UploadOutlined />} loading={imageUploading}>
                    {imageUrl ? '이미지 변경' : '이미지 업로드'}
                  </Button>
                </Upload>
              </Space>
            </Form.Item>
          )}

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
            <Form.Item label="매입가 (원가)">
              <InputNumber style={{ width: 160 }} value={calculatedCostPrice} formatter={priceFormatter} disabled />
              <div style={{ fontSize: 11, color: '#888' }}>부자재 합산 자동계산</div>
            </Form.Item>
            <Form.Item name="discount_price" label="할인가">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} placeholder="선택" />
            </Form.Item>
            <Form.Item name="event_price" label="행사가격">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} placeholder="선택" />
            </Form.Item>
          </Space>

          <Divider orientation="left">부자재 구성</Divider>
          <div style={{ marginBottom: 16 }}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="부자재 검색/추가"
              style={{ width: 320 }}
              value={undefined}
              onChange={(v: number) => addMaterial(v)}
              options={allMaterials
                .filter((m: any) => m.is_active !== false)
                .map((m: any) => ({
                  label: `${m.material_code} - ${m.material_name} (${m.material_type}) ₩${Number(m.unit_price || 0).toLocaleString()}`,
                  value: m.material_id,
                }))}
            />
          </div>
          {productMaterials.length === 0 ? (
            <Tag color="warning">부자재를 1개 이상 등록해야 합니다</Tag>
          ) : (
            <Table
              dataSource={productMaterials.map((pm) => {
                const mat = materialMap[pm.material_id] || {};
                const subtotal = (pm.usage_qty || 1) * Number(mat.unit_price || 0);
                return { ...pm, ...mat, subtotal };
              })}
              rowKey="material_id"
              pagination={false}
              size="small"
              columns={[
                { title: '자재코드', dataIndex: 'material_code', width: 100 },
                { title: '자재명', dataIndex: 'material_name', width: 140 },
                { title: '유형', dataIndex: 'material_type', width: 80, render: (v: string) => <Tag>{v === 'FABRIC' ? '원단' : v === 'ACCESSORY' ? '부속' : v === 'PACKAGING' ? '포장' : v}</Tag> },
                { title: '단가', dataIndex: 'unit_price', width: 100, render: (v: number) => `₩${Number(v || 0).toLocaleString()}` },
                { title: '사용량', dataIndex: 'usage_qty', width: 100,
                  render: (_: any, record: any) => (
                    <InputNumber
                      min={0.01} step={0.1} value={record.usage_qty}
                      style={{ width: 80 }}
                      onChange={(v) => updateMaterialQty(record.material_id, v || 1)}
                    />
                  ),
                },
                { title: '소계', dataIndex: 'subtotal', width: 100, render: (v: number) => `₩${Math.round(v).toLocaleString()}` },
                { title: '', key: 'action', width: 50,
                  render: (_: any, record: any) => (
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeMaterial(record.material_id)} />
                  ),
                },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5} align="right"><strong>원가 합계</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} colSpan={2}><strong>₩{Math.round(calculatedCostPrice).toLocaleString()}</strong></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          )}

          <Form.Item name="sale_status" label="판매상태" style={{ maxWidth: 200, marginTop: 16 }}>
            <Select options={SALE_STATUS_OPTIONS} />
          </Form.Item>

          <Divider orientation="left">재입고 알림</Divider>
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
