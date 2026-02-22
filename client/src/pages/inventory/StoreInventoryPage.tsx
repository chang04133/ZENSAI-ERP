import { useEffect, useState } from 'react';
import { Table, Button, Input, InputNumber, Select, Space, Tag, Modal, Form, Card, message } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, ShopOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

export default function StoreInventoryPage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [partners, setPartners] = useState<any[]>([]);

  // 조정 모달
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [adjustForm] = Form.useForm();

  // 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [variantSearching, setVariantSearching] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter) params.partner_code = partnerFilter;
      const result = await inventoryApi.list(params);
      setData(result.data);
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

  useEffect(() => { load(); }, [page, partnerFilter]);
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

  const columns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 150 },
    { title: '거래처코드', dataIndex: 'partner_code', key: 'partner_code', width: 110 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150 },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '재고수량', dataIndex: 'qty', key: 'qty', width: 100,
      render: (v: number) => {
        const qty = Number(v);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty.toLocaleString()}</Tag>;
      },
    },
    ...(canWrite ? [{
      title: '조정', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openAdjust(record)}>조정</Button>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="매장별 재고관리"
        extra={canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            재고 추가
          </Button>
        )}
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="거래처 선택"
          allowClear showSearch optionFilterProp="label"
          value={partnerFilter}
          onChange={(v) => { setPartnerFilter(v); setPage(1); }}
          style={{ width: 220 }}
          options={partnerOptions}
        />
        <Input
          placeholder="상품명/SKU 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          style={{ width: 220 }}
        />
        <Button onClick={load}>조회</Button>
      </Space>

      {/* 거래처별 요약 */}
      {partnerFilter && data.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Space size="large">
            <span>거래처: <strong>{data[0]?.partner_name}</strong></span>
            <span>품목 수: <Tag color="blue">{data.length}</Tag></span>
            <span>총 재고: <Tag color="geekblue">{data.reduce((s, r) => s + Number(r.qty || 0), 0).toLocaleString()}개</Tag></span>
          </Space>
        </Card>
      )}

      <Table
        columns={columns}
        dataSource={data}
        rowKey="inventory_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
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
