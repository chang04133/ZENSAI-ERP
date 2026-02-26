import { useEffect, useState, useMemo } from 'react';
import { Table, Button, Input, InputNumber, Select, Space, Tag, Modal, Form, Card, Segmented, message } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, ShopOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { sizeSort } from '../../utils/size-order';

type ViewMode = 'product' | 'color' | 'size';

export default function StoreInventoryPage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [rawData, setRawData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [partners, setPartners] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('product');

  // 조정 모달
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [adjustForm] = Form.useForm();

  // 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [variantSearching, setVariantSearching] = useState(false);

  const [searchTrigger, setSearchTrigger] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter) params.partner_code = partnerFilter;
      const result = await inventoryApi.list(params);
      setRawData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadPartners = async () => {
    try {
      const result = await partnerApi.list({ limit: '1000' });
      setPartners(result.data);
    } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
  };

  useEffect(() => { load(); }, [page, partnerFilter, searchTrigger]);
  useEffect(() => { loadPartners(); }, []);

  // 조정
  const openAdjust = (record: any) => {
    setAdjustTarget(record);
    adjustForm.resetFields();
    adjustForm.setFieldsValue({ qty_change: 0 });
    setAdjustModalOpen(true);
  };

  const handleAdjust = async (values: any) => {
    if (!adjustTarget || values.qty_change === 0) return;
    try {
      const result = await inventoryApi.adjust({
        partner_code: adjustTarget.partner_code,
        variant_id: adjustTarget.variant_id,
        qty_change: values.qty_change,
        memo: values.memo,
      });
      message.success(`재고 조정 완료 (${values.qty_change > 0 ? '+' : ''}${values.qty_change} → 현재: ${result.qty}개)`);
      setAdjustModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  // 추가 - 상품 검색
  const handleVariantSearch = async (searchText: string) => {
    if (!searchText || searchText.length < 1) { setVariantOptions([]); return; }
    setVariantSearching(true);
    try {
      const items = await productApi.searchVariants(searchText);
      setVariantOptions(items.map((v: any) => ({
        label: `${v.product_name} / ${v.sku} (${v.color}/${v.size})`,
        value: v.variant_id,
        price: v.price,
      })));
    } catch (e: any) { message.error('품목 검색 실패: ' + e.message); }
    finally { setVariantSearching(false); }
  };

  const handleAdd = async (values: any) => {
    try {
      await inventoryApi.adjust({
        partner_code: values.partner_code,
        variant_id: values.variant_id,
        qty_change: values.qty,
      });
      message.success('재고가 추가되었습니다.');
      setAddModalOpen(false);
      addForm.resetFields();
      setVariantOptions([]);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const partnerOptions = partners.map((p: any) => ({
    label: `${p.partner_name} (${p.partner_code})`,
    value: p.partner_code,
  }));

  // --- Render qty ---
  const renderQty = (qty: number) => {
    const n = Number(qty);
    const color = n === 0 ? '#ff4d4f' : n <= 5 ? '#faad14' : '#333';
    return <strong style={{ color, fontSize: 14 }}>{n.toLocaleString()}</strong>;
  };

  // --- 뷰모드별 데이터 변환 ---
  const displayData = useMemo(() => {
    if (viewMode === 'product') {
      const map: Record<string, any> = {};
      rawData.forEach((r) => {
        // Group by partner_code + product_code
        const key = `${r.partner_code}__${r.product_code}`;
        if (!map[key]) {
          map[key] = {
            partner_code: r.partner_code, partner_name: r.partner_name,
            product_code: r.product_code, product_name: r.product_name, category: r.category,
            brand: r.brand, season: r.season, image_url: r.image_url,
            total_qty: 0, _variants: [], _rowKey: key,
          };
        }
        map[key].total_qty += Number(r.qty || 0);
        map[key]._variants.push(r);
      });
      // 품번 알파벳순 정렬
      return Object.values(map).sort((a, b) => (a.product_code || '').localeCompare(b.product_code || ''));
    }

    if (viewMode === 'color') {
      const map: Record<string, any> = {};
      rawData.forEach((r) => {
        const key = `${r.partner_code}__${r.product_code}__${r.color || '-'}`;
        if (!map[key]) {
          map[key] = {
            partner_code: r.partner_code, partner_name: r.partner_name,
            product_code: r.product_code, product_name: r.product_name, category: r.category,
            brand: r.brand, season: r.season, image_url: r.image_url,
            _color: r.color || '-', _colorQty: 0, _colorVariants: [], _rowKey: key,
          };
        }
        map[key]._colorQty += Number(r.qty || 0);
        map[key]._colorVariants.push(r);
      });
      Object.values(map).forEach((row: any) => {
        row._colorVariants.sort((a: any, b: any) => sizeSort(a.size, b.size));
      });
      // 품번 → 컬러순 정렬
      return Object.values(map).sort((a, b) => {
        const pc = (a.product_code || '').localeCompare(b.product_code || '');
        if (pc !== 0) return pc;
        return (a._color || '').localeCompare(b._color || '');
      });
    }

    // size view: 품번 → 컬러 → 사이즈순
    return rawData
      .map((r) => ({ ...r, _rowKey: `${r.inventory_id}` }))
      .sort((a, b) => {
        const pc = (a.product_code || '').localeCompare(b.product_code || '');
        if (pc !== 0) return pc;
        const cc = (a.color || '').localeCompare(b.color || '');
        if (cc !== 0) return cc;
        return sizeSort(a.size || '', b.size || '');
      });
  }, [viewMode, rawData]);

  // --- 품번별 columns ---
  const productColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '총 재고', dataIndex: 'total_qty', key: 'total_qty', width: 100, render: (v: number) => renderQty(v) },
  ];

  // --- 컬러별 columns ---
  const colorColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: 'Color', dataIndex: '_color', key: '_color', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '재고', dataIndex: '_colorQty', key: '_colorQty', width: 100, render: (v: number) => renderQty(v) },
  ];

  // --- 사이즈별 columns ---
  const sizeViewColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70, render: (v: string) => <Tag>{v || '-'}</Tag> },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v || '-'}</Tag> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '재고', dataIndex: 'qty', key: 'qty', width: 100, render: (v: number) => renderQty(Number(v)) },
    ...(canWrite ? [{
      title: '조정', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openAdjust(record)}>조정</Button>
      ),
    }] : []),
  ];

  const displayColumns = useMemo(() => {
    if (viewMode === 'product') return productColumns;
    if (viewMode === 'color') return colorColumns;
    return sizeViewColumns;
  }, [viewMode, canWrite]);

  // --- Expandable rows ---
  const productExpandedRow = (record: any) => {
    const variants = record._variants || [];
    if (variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const colorMap: Record<string, any[]> = {};
    variants.forEach((v: any) => {
      const c = v.color || '-';
      if (!colorMap[c]) colorMap[c] = [];
      colorMap[c].push(v);
    });
    const rows: any[] = [];
    Object.entries(colorMap)
      .sort(([a], [b]) => a.localeCompare(b))  // 컬러 알파벳순
      .forEach(([, vs]) => {
        vs.sort((a: any, b: any) => sizeSort(a.size, b.size));
        vs.forEach((v: any) => rows.push(v));
      });
    const cols: any[] = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: 'Color', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, render: (v: number) => renderQty(Number(v)) },
      ...(canWrite ? [{
        title: '조정', key: 'action', width: 80,
        render: (_: any, row: any) => (
          <Button size="small" icon={<EditOutlined />} onClick={() => openAdjust(row)}>조정</Button>
        ),
      }] : []),
    ];
    return <Table columns={cols} dataSource={rows} rowKey="inventory_id" pagination={false} size="small" style={{ margin: 0 }} />;
  };

  const colorExpandedRow = (record: any) => {
    const variants = record._colorVariants || [];
    if (variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const cols: any[] = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, render: (v: number) => renderQty(Number(v)) },
      ...(canWrite ? [{
        title: '조정', key: 'action', width: 80,
        render: (_: any, row: any) => (
          <Button size="small" icon={<EditOutlined />} onClick={() => openAdjust(row)}>조정</Button>
        ),
      }] : []),
    ];
    return <Table columns={cols} dataSource={variants} rowKey="inventory_id" pagination={false} size="small" style={{ margin: 0 }} />;
  };

  const tableExpandable = useMemo(() => {
    if (viewMode === 'product') return { expandedRowRender: productExpandedRow };
    if (viewMode === 'color') return { expandedRowRender: colorExpandedRow };
    return undefined;
  }, [viewMode, rawData, canWrite]);

  return (
    <div>
      <PageHeader
        title="매장별 재고관리"
        extra={canWrite && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            재고 추가
          </Button>
        )}
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          size="small" placeholder="거래처 선택"
          allowClear showSearch optionFilterProp="label"
          value={partnerFilter}
          onChange={(v) => { setPartnerFilter(v); setPage(1); }}
          style={{ width: 220 }}
          options={partnerOptions}
        />
        <Input
          size="small" placeholder="상품명/SKU 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => { setPage(1); setSearchTrigger(t => t + 1); }}
          style={{ width: 220 }}
        />
        <Button size="small" onClick={() => { setPage(1); setSearchTrigger(t => t + 1); }}>조회</Button>
      </Space>

      {/* 거래처별 요약 */}
      {partnerFilter && rawData.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Space size="large">
            <span>거래처: <strong>{rawData[0]?.partner_name}</strong></span>
            <span>품목 수: <Tag color="blue">{rawData.length}</Tag></span>
            <span>총 재고: <Tag color="geekblue">{rawData.reduce((s, r) => s + Number(r.qty || 0), 0).toLocaleString()}개</Tag></span>
          </Space>
        </Card>
      )}

      {/* View Mode Segmented */}
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '품번별', value: 'product' },
            { label: '컬러별', value: 'color' },
            { label: '사이즈별', value: 'size' },
          ]}
        />
      </div>

      <Table
        columns={displayColumns}
        dataSource={displayData}
        rowKey="_rowKey"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        expandable={tableExpandable}
      />

      {/* 조정 모달 */}
      <Modal
        title="재고 조정"
        open={adjustModalOpen}
        onCancel={() => setAdjustModalOpen(false)}
        onOk={() => adjustForm.submit()}
        okText="조정" cancelText="취소"
      >
        {adjustTarget && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div><strong>거래처:</strong> {adjustTarget.partner_name}</div>
            <div><strong>상품:</strong> {adjustTarget.product_name} ({adjustTarget.sku})</div>
            <div><strong>색상/사이즈:</strong> {adjustTarget.color || '-'} / {adjustTarget.size || '-'}</div>
            <div><strong>현재수량:</strong> <Tag color="blue">{Number(adjustTarget.qty).toLocaleString()}</Tag></div>
          </div>
        )}
        <Form form={adjustForm} layout="vertical" onFinish={handleAdjust}>
          <Form.Item name="qty_change" label="변동 수량 (양수: 입고, 음수: 출고)" rules={[{ required: true, message: '수량을 입력해주세요' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="예: +10 또는 -5" />
          </Form.Item>
          <Form.Item name="memo" label="조정 사유">
            <Input.TextArea rows={2} placeholder="예: 재고실사 차이 보정, 파손 폐기 등" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 추가 모달 */}
      <Modal
        title="매장 재고 추가"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); setVariantOptions([]); }}
        onOk={() => addForm.submit()}
        okText="추가" cancelText="취소"
      >
        <Form form={addForm} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="partner_code" label="거래처 (매장)" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
            <Select showSearch placeholder="거래처 검색" optionFilterProp="label" options={partnerOptions} />
          </Form.Item>
          <Form.Item name="variant_id" label="상품 옵션 (검색)" rules={[{ required: true, message: '상품을 선택해주세요' }]}>
            <Select
              showSearch
              placeholder="상품명, SKU, 상품코드로 검색"
              filterOption={false}
              onSearch={handleVariantSearch}
              loading={variantSearching}
              options={variantOptions}
              notFoundContent={variantSearching ? '검색 중...' : '검색어를 입력하세요'}
            />
          </Form.Item>
          <Form.Item name="qty" label="초기 재고수량" rules={[{ required: true, message: '수량을 입력해주세요' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="수량 입력" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
