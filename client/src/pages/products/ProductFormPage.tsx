import { useEffect, useState, useMemo } from 'react';
import { Form, Input, InputNumber, Select, Button, Card, Space, Divider, Upload, Image, Table, Tag, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { useAuthStore } from '../../modules/auth/auth.store';
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
  const user = useAuthStore((s) => s.user);
  const isAdminUser = user?.role === 'ADMIN' || user?.role === 'SYS_ADMIN';

  // 새 상품 등록은 ADMIN/SYS_ADMIN만 가능
  if (!isEdit && !isAdminUser) {
    return (
      <div>
        <PageHeader title="상품 등록" />
        <Card style={{ maxWidth: 800, textAlign: 'center', padding: 40 }}>
          <p>상품 등록은 관리자만 가능합니다.</p>
          <Button onClick={() => navigate('/products')}>목록으로</Button>
        </Card>
      </div>
    );
  }
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [brandOptions, setBrandOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [allMaterials, setAllMaterials] = useState<any[]>([]);
  const [productMaterials, setProductMaterials] = useState<Array<{ material_id: number; usage_qty: number }>>([]);
  const [materialSaving, setMaterialSaving] = useState(false);

  // ADMIN만 부자재 목록 로드 (수정 권한이 있으므로)
  useEffect(() => {
    if (isAdminUser) {
      materialApi.list({ limit: '500' }).then((res: any) => {
        const items = res?.data || res || [];
        setAllMaterials(Array.isArray(items) ? items : []);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    codeApi.getAll().then((data: any) => {
      const toOpts = (items: any[]) => (items || []).filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value }));
      const allCats = data.CATEGORY || [];
      setCategoryOptions(allCats.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
      setBrandOptions(toOpts(data.BRAND));

      // 연도 옵션
      setYearOptions(
        (data.YEAR || []).filter((c: any) => c.is_active)
          .sort((a: any, b: any) => b.code_value.localeCompare(a.code_value))
          .map((c: any) => ({ label: c.code_label, value: c.code_value })),
      );
      // 시즌 옵션 (순수 시즌만)
      setSeasonOptions(toOpts(data.SEASON));
      setColorOptions(toOpts(data.COLOR));
    }).catch(() => {});
  }, []);

  // 상품 데이터 로드 (1회만)
  const [productLoaded, setProductLoaded] = useState(false);
  useEffect(() => {
    if (isEdit && code && !productLoaded) {
      setFetching(true);
      const promises: Promise<any>[] = [productApi.get(code)];
      // ADMIN만 부자재 연결 정보 로드
      if (isAdminUser) {
        promises.push(productApi.getProductMaterials(code));
      }
      Promise.all(promises)
        .then(([data, mats]) => {
          // PostgreSQL numeric → 문자열 반환되므로 숫자 변환
          const d = data as any;
          if (d.base_price !== undefined) d.base_price = Number(d.base_price) || 0;
          if (d.direct_cost !== undefined) d.direct_cost = Number(d.direct_cost) || 0;
          if (d.cost_price !== undefined) d.cost_price = Number(d.cost_price) || 0;
          if (d.discount_price !== undefined) d.discount_price = d.discount_price ? Number(d.discount_price) : undefined;
          if (d.event_price !== undefined) d.event_price = d.event_price ? Number(d.event_price) : undefined;
          form.setFieldsValue(d);
          if ((data as any).image_url) setImageUrl((data as any).image_url);
          if (mats) {
            setProductMaterials(mats.map((m: any) => ({ material_id: m.material_id, usage_qty: Number(m.usage_qty) })));
          }
          setProductLoaded(true);
        })
        .catch((e) => message.error(e.message))
        .finally(() => setFetching(false));
    }
  }, [code, isEdit, productLoaded]);

  const handleImageUpload = async (file: File) => {
    if (imageUploading) return false;
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

  // 원가 실시간 추적 (A: 직접원가, B: 부자재, C: 총원가)
  const watchDirectCost = Form.useWatch('direct_cost', form) || 0;
  const totalCostPrice = Number(watchDirectCost || 0) + calculatedCostPrice;

  // 변형 ��리보기용
  const watchSizes = Form.useWatch('variant_sizes', form) || [];
  const watchColors = Form.useWatch('variant_colors', form) || [];
  const validColorCount = watchColors.filter((c: any) => c?.color).length;

  const onFinish = async (values: any) => {
    if (loading) return;
    setLoading(true);
    try {
      const productCode = isEdit ? code! : values.product_code;

      if (isAdminUser) {
        // ADMIN: 총원가 = 직접원가 + 부자재 합계
        values.direct_cost = values.direct_cost || 0;
        values.cost_price = values.direct_cost + calculatedCostPrice;
      } else {
        // HQ: 가격/상태만 전송, 나머지 제거
        const allowed = ['base_price', 'discount_price', 'event_price', 'sale_status'];
        const filtered: Record<string, any> = {};
        for (const key of allowed) {
          if (values[key] !== undefined) filtered[key] = values[key];
        }
        Object.keys(values).forEach((k) => delete values[k]);
        Object.assign(values, filtered);
      }

      // 컬러×사이즈 → variants 배열 생성
      if (!isEdit && values.variant_sizes && values.variant_colors) {
        const sizes: string[] = values.variant_sizes;
        const colors: Array<{ color: string; price?: number; custom_barcode?: string }> = values.variant_colors.filter((c: any) => c?.color);
        values.variants = [];
        for (const c of colors) {
          for (const size of sizes) {
            values.variants.push({ color: c.color, size, price: c.price || undefined, custom_barcode: c.custom_barcode || undefined });
          }
        }
        delete values.variant_sizes;
        delete values.variant_colors;
      }
      if (isEdit) {
        await productApi.update(productCode, values);
      } else {
        await productApi.create(values);
      }
      // 부자재 저장 (ADMIN만, 실패해도 상품 등록은 유지)
      if (isAdminUser && productMaterials.length > 0) {
        try {
          await productApi.saveProductMaterials(productCode, productMaterials);
        } catch (e: any) {
          message.warning('상품은 저장되었으나 부자재 저장 실패: ' + e.message);
        }
      }
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
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ base_price: 0, direct_cost: 0, sale_status: '승인대기', variant_sizes: ['S', 'M', 'L'], variant_colors: [{ color: undefined }, { color: undefined }] }}>
          <Form.Item name="product_code" label="상품코드" rules={[{ required: true, message: '상품코드를 입력해주세요' }]}>
            <Input disabled={isEdit} placeholder="예: TS-001" />
          </Form.Item>
          <Form.Item name="product_name" label="상품명" rules={[{ required: true, message: '상품명을 입력해주세요' }]}>
            <Input disabled={!isAdminUser && isEdit} />
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
              <Select showSearch allowClear placeholder="카테고리 선택" options={categoryOptions} optionFilterProp="label" style={{ width: 160 }} disabled={!isAdminUser && isEdit} />
            </Form.Item>
            <Form.Item name="brand" label="브랜드">
              <Select showSearch allowClear placeholder="브랜드 선택" options={brandOptions} optionFilterProp="label" style={{ width: 160 }} disabled={!isAdminUser && isEdit} />
            </Form.Item>
            <Form.Item name="year" label="연도">
              <Select showSearch allowClear placeholder="연도 선택" options={yearOptions} optionFilterProp="label" style={{ width: 120 }} disabled={!isAdminUser && isEdit} />
            </Form.Item>
            <Form.Item name="season" label="시즌">
              <Select showSearch allowClear placeholder="시즌 선택" options={seasonOptions} optionFilterProp="label" style={{ width: 120 }} disabled={!isAdminUser && isEdit} />
            </Form.Item>
          </Space>

          {/* ── 원가 구성 (ADMIN) ── */}
          {isAdminUser && (
            <>
              <Divider orientation="left">원가 구성</Divider>

              {/* 부자재 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>부자재</div>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="부자재 검색/추가"
                  style={{ width: 360, marginBottom: 8 }}
                  onChange={(v: number) => addMaterial(v)}
                  options={allMaterials
                    .filter((m: any) => m.is_active !== false)
                    .map((m: any) => ({
                      label: `${m.material_code} - ${m.material_name} (${m.material_type}) ₩${Number(m.unit_price || 0).toLocaleString()}`,
                      value: m.material_id,
                    }))}
                />
                {productMaterials.length > 0 && (
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
                      { title: '단가', dataIndex: 'unit_price', width: 90, render: (v: number) => `${Number(v || 0).toLocaleString()}` },
                      { title: '수량', dataIndex: 'usage_qty', width: 90,
                        render: (_: any, record: any) => (
                          <InputNumber min={0.01} step={0.1} value={record.usage_qty} style={{ width: 70 }}
                            onChange={(v) => updateMaterialQty(record.material_id, v || 1)} />
                        ),
                      },
                      { title: '소계', dataIndex: 'subtotal', width: 90, render: (v: number) => `${Math.round(v).toLocaleString()}` },
                      { title: '', key: 'action', width: 40,
                        render: (_: any, record: any) => (
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeMaterial(record.material_id)} />
                        ),
                      },
                    ]}
                  />
                )}
              </div>

              {/* 직접원가 + 부자재합계 + 총원가 */}
              <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>직접원가</div>
                    <Form.Item name="direct_cost" noStyle>
                      <InputNumber style={{ width: 150 }} min={0} formatter={priceFormatter} />
                    </Form.Item>
                  </div>
                  <div style={{ fontSize: 22, color: '#bbb', lineHeight: '40px' }}>+</div>
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>부자재 합계</div>
                    <div style={{ height: 32, lineHeight: '32px', fontSize: 14, fontWeight: 600, padding: '0 11px', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 6, minWidth: 120, color: '#333' }}>
                      {Math.round(calculatedCostPrice).toLocaleString()}원
                    </div>
                  </div>
                  <div style={{ fontSize: 22, color: '#bbb', lineHeight: '40px' }}>=</div>
                  <div>
                    <div style={{ fontSize: 12, color: '#1677ff', marginBottom: 4, fontWeight: 600 }}>총원가</div>
                    <div style={{ height: 32, lineHeight: '32px', fontSize: 16, fontWeight: 700, padding: '0 14px', background: '#e6f4ff', border: '2px solid #1677ff', borderRadius: 6, minWidth: 130, color: '#1677ff' }}>
                      {Math.round(totalCostPrice).toLocaleString()}원
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── 가격 정보 ── */}
          <Divider orientation="left">가격 정보</Divider>
          <Space style={{ display: 'flex' }} align="start" wrap>
            <Form.Item name="base_price" label="기본가 (판매가)">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} />
            </Form.Item>
            <Form.Item label="할인가">
              <Form.Item name="discount_price" noStyle>
                <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} placeholder="선택" />
              </Form.Item>
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                {[20, 30, 40].map(pct => (
                  <Button key={pct} size="small" type="dashed" onClick={() => {
                    const base = form.getFieldValue('base_price') || 0;
                    if (!base) { message.warning('기본가를 먼저 입력해주세요.'); return; }
                    form.setFieldsValue({ discount_price: Math.round(base * (1 - pct / 100)) });
                  }} style={{ fontSize: 11, padding: '0 8px' }}>
                    {pct}%
                  </Button>
                ))}
              </div>
            </Form.Item>
            <Form.Item name="event_price" label="행사가격">
              <InputNumber style={{ width: 160 }} min={0} formatter={priceFormatter} placeholder="선택" />
            </Form.Item>
            <Form.Item name="sale_status" label="판매상태">
              <Select options={SALE_STATUS_OPTIONS} style={{ width: 160 }} />
            </Form.Item>
          </Space>

          {!isEdit && (
            <>
              <Divider orientation="left">변형 (컬러/사이즈)</Divider>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>사이즈는 전 컬러 공통 적용 · 바코드(SKU) 자동 생성</div>
              <Form.Item name="variant_sizes" label="사이즈 (공통)" rules={[{ required: true, message: '사이즈를 1개 이상 선택해주세요' }]}>
                <Select mode="multiple" options={SIZE_OPTIONS} style={{ maxWidth: 400 }} placeholder="사이즈 선택" />
              </Form.Item>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>컬러 목록</div>
              <Form.List name="variant_colors">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...rest }) => (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item {...rest} name={[name, 'color']} rules={[{ required: true, message: '컬러' }]}>
                          <Select placeholder="컬러 선택" options={colorOptions} style={{ width: 140 }} showSearch />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'price']}>
                          <InputNumber placeholder="가격 (미입력시 할인가→기본가)" min={0} formatter={priceFormatter} style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'custom_barcode']}>
                          <Input placeholder="별도 바코드 (선택)" style={{ width: 180 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ color: undefined })} block icon={<PlusOutlined />}>
                      컬러 추가
                    </Button>
                  </>
                )}
              </Form.List>
              {validColorCount > 0 && watchSizes.length > 0 && (
                <div style={{ fontSize: 12, color: '#1677ff', marginTop: 8 }}>
                  {validColorCount}컬러 × {watchSizes.length}사이즈 = 총 {validColorCount * watchSizes.length}개 SKU 생성
                </div>
              )}
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
