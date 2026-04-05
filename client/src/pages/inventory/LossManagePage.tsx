import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Button, Tag, Input, Select, message, Row, Col, Card,
  Segmented, Modal, Form, InputNumber, AutoComplete, DatePicker,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';
import {
  SearchOutlined, PlusOutlined, WarningOutlined, DeleteOutlined,
  GiftOutlined, UserOutlined, StopOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const LOSS_TYPES = [
  { value: 'LOST', label: '유실', color: '#ff4d4f', icon: <WarningOutlined /> },
  { value: 'DISPOSE', label: '폐기', color: '#fa8c16', icon: <DeleteOutlined /> },
  { value: 'GIFT', label: '증정', color: '#722ed1', icon: <GiftOutlined /> },
  { value: 'EMP_DISCOUNT', label: '직원할인', color: '#1890ff', icon: <UserOutlined /> },
] as const;

const LOSS_LABEL: Record<string, string> = { LOST: '유실', DISPOSE: '폐기', GIFT: '증정', EMP_DISCOUNT: '직원할인' };
const LOSS_COLOR: Record<string, string> = { LOST: 'red', DISPOSE: 'orange', GIFT: 'purple', EMP_DISCOUNT: 'blue' };
const LOSS_TAG_COLOR: Record<string, string> = { LOST: '#ff4d4f', DISPOSE: '#fa8c16', GIFT: '#722ed1', EMP_DISCOUNT: '#1890ff' };

const CAT_TAG_COLORS: Record<string, string> = { TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple' };

type FilterType = '' | 'LOST' | 'DISPOSE' | 'GIFT' | 'EMP_DISCOUNT';

export default function LossManagePage() {
  const user = useAuthStore((s) => s.user);
  const isHQ = user && ([ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER] as string[]).includes(user.role);

  // Data
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<{ total_count: number; total_loss_qty: number; variant_count: number }>({ total_count: 0, total_loss_qty: 0, variant_count: 0 });
  const [byCategory, setByCategory] = useState<Array<{ loss_type: string; count: number; qty: number }>>([]);

  // Filters
  const [typeFilter, setTypeFilter] = useState<FilterType>('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // Register modal
  const [regOpen, setRegOpen] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regForm] = Form.useForm();
  const [partners, setPartners] = useState<Array<{ partner_code: string; partner_name: string }>>([]);
  const [variantOptions, setVariantOptions] = useState<Array<{ value: string; label: string; data: any }>>([]);
  const [selectedStock, setSelectedStock] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load data
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '50' };
      if (typeFilter) params.loss_type = typeFilter;
      if (search) params.search = search;
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      const res = await inventoryApi.lossHistory(params);
      setData(res.data);
      setTotal(res.total);
      setSummary(res.summary);
      setByCategory(res.byCategory || []);
    } catch (e: any) {
      message.error(e.message || '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, search, dateRange]);

  useEffect(() => { load(); }, [page]);
  useEffect(() => { setPage(1); load(1); }, [typeFilter]);

  // Partners for register
  useEffect(() => {
    partnerApi.list({ limit: '500' }).then((r: any) => {
      const list = (r.data || r || []).map((p: any) => ({ partner_code: p.partner_code, partner_name: p.partner_name }));
      setPartners(list);
    }).catch(() => {});
  }, []);

  // Variant search
  const handleVariantSearch = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value || value.length < 1) { setVariantOptions([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const pc = regForm.getFieldValue('partner_code') || '';
        const pcParam = pc ? `&partner_code=${encodeURIComponent(pc)}` : '';
        const res = await apiFetch(`/api/products/variants/search?search=${encodeURIComponent(value)}&limit=20${pcParam}`);
        const d = await res.json();
        if (d.success && d.data) {
          setVariantOptions(d.data.map((v: any) => ({
            value: String(v.variant_id),
            label: `${v.product_name} / ${v.color} / ${v.size} (${v.sku})${v.current_stock != null ? ` [재고: ${v.current_stock}]` : ''}`,
            data: v,
          })));
        }
      } catch { /* ignore */ }
    }, 300);
  };

  // Register submit
  const handleRegister = async () => {
    try {
      await regForm.validateFields();
    } catch { return; }
    const values = regForm.getFieldsValue();
    setRegLoading(true);
    try {
      await inventoryApi.registerLoss({
        partner_code: values.partner_code,
        variant_id: Number(values.variant_id),
        qty: Number(values.qty),
        loss_type: values.loss_type,
        memo: values.memo || undefined,
      });
      message.success('등록 완료');
      setRegOpen(false);
      regForm.resetFields();
      load(page);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setRegLoading(false);
    }
  };

  // Category summary helpers
  const getCatStat = (type: string) => {
    const cat = byCategory.find((c) => c.loss_type === type);
    return { count: cat?.count || 0, qty: cat?.qty || 0 };
  };

  const columns = [
    { title: '일시', dataIndex: 'created_at', key: 'date', width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '유형', dataIndex: 'loss_type', key: 'type', width: 85,
      render: (v: string) => <Tag color={LOSS_COLOR[v] || 'default'}>{LOSS_LABEL[v] || v || '유실'}</Tag> },
    { title: '품번', dataIndex: 'product_code', key: 'code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => v || '-' },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
      render: (v: string) => <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v || '-'}</Tag> },
    { title: '수량', dataIndex: 'loss_qty', key: 'loss', width: 80, align: 'right' as const,
      render: (v: number) => <strong style={{ color: '#ff4d4f' }}>{v}</strong> },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 110, ellipsis: true },
    { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12, color: '#666' }}>{v || '-'}</span> },
    { title: '작업자', dataIndex: 'created_by', key: 'user', width: 90 },
  ];

  return (
    <div>
      <PageHeader title="재고처리" />

      {/* 카테고리별 요약 카드 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {LOSS_TYPES.map((lt) => {
          const stat = getCatStat(lt.value);
          const isActive = typeFilter === lt.value;
          return (
            <Col xs={12} sm={6} key={lt.value}>
              <Card size="small"
                style={{
                  borderRadius: 10, cursor: 'pointer',
                  borderLeft: `4px solid ${lt.color}`,
                  background: isActive ? lt.color : '#fff',
                  transition: 'all 0.2s',
                }}
                onClick={() => setTypeFilter(isActive ? '' : lt.value as FilterType)}
              >
                <div style={{ fontSize: 12, color: isActive ? '#ffffffcc' : '#888' }}>
                  {lt.icon} {lt.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: isActive ? '#fff' : lt.color }}>
                  {stat.count}<span style={{ fontSize: 13, fontWeight: 500 }}>건</span>
                </div>
                {stat.qty > 0 && (
                  <div style={{ fontSize: 11, color: isActive ? '#ffffffcc' : '#999' }}>
                    {stat.qty.toLocaleString()}개
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 필터 + 등록 버튼 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <DatePicker.RangePicker size="middle" value={dateRange} onChange={(v) => setDateRange(v)}
            presets={datePresets} style={{ width: 260 }} />
        </div>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input.Search placeholder="상품명, SKU, 품번" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => { setPage(1); load(1); }} allowClear />
        </div>
        <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          regForm.resetFields();
          setSelectedStock(null);
          if (user?.partnerCode) regForm.setFieldValue('partner_code', user.partnerCode);
          if (typeFilter) regForm.setFieldValue('loss_type', typeFilter);
          setRegOpen(true);
        }}>등록</Button>
      </div>

      {/* 현재 필터 요약 */}
      <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>
        {typeFilter ? <Tag color={LOSS_COLOR[typeFilter]}>{LOSS_LABEL[typeFilter]}</Tag> : '전체'}
        {' '}— 총 <b>{summary.total_count}</b>건 / <b>{summary.total_loss_qty.toLocaleString()}</b>개
        {' '}/ 품목 <b>{summary.variant_count}</b>종
      </div>

      {/* 테이블 */}
      <Table columns={columns} dataSource={data} rowKey="tx_id" loading={loading} size="small"
        scroll={{ x: 1200, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, pageSize: 50, total,
          showTotal: (t) => `총 ${t}건`,
          onChange: (p) => setPage(p),
        }}
      />

      {/* 등록 모달 */}
      <Modal title="재고처리 등록" open={regOpen} onCancel={() => setRegOpen(false)}
        onOk={handleRegister} okText="등록" confirmLoading={regLoading} width={500}>
        <Form form={regForm} layout="vertical" initialValues={{ qty: 1, loss_type: 'LOST' }}>
          <Form.Item name="loss_type" label="처리유형" rules={[{ required: true }]}>
            <Segmented
              options={LOSS_TYPES.map((lt) => ({
                value: lt.value,
                label: (
                  <span style={{ color: LOSS_TAG_COLOR[lt.value] }}>
                    {lt.icon} {lt.label}
                  </span>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item name="partner_code" label="거래처" rules={[{ required: true, message: '거래처를 선택하세요' }]}>
            <Select showSearch placeholder="거래처 선택"
              disabled={!!user?.partnerCode}
              filterOption={(input, opt) =>
                (opt?.label as string || '').toLowerCase().includes(input.toLowerCase())
              }
              options={partners.map((p) => ({ value: p.partner_code, label: `${p.partner_name} (${p.partner_code})` }))}
            />
          </Form.Item>
          <Form.Item name="variant_id" label="상품" rules={[{ required: true, message: '상품을 검색하세요' }]}>
            <AutoComplete
              placeholder="상품명, SKU, 품번으로 검색"
              options={variantOptions}
              onSearch={handleVariantSearch}
              onSelect={(val: string, opt: any) => {
                regForm.setFieldValue('variant_id', val);
                regForm.setFieldValue('_variant_label', opt.label);
                setSelectedStock(opt.data?.current_stock ?? null);
              }}
            />
          </Form.Item>
          {selectedStock != null && (
            <div style={{ marginTop: -12, marginBottom: 12, fontSize: 13, color: selectedStock === 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              현재 재고: {selectedStock}개{selectedStock === 0 ? ' (재고 없음)' : ''}
            </div>
          )}
          <Form.Item name="qty" label="수량" rules={[{ required: true, message: '수량 입력' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="사유 입력 (선택)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
