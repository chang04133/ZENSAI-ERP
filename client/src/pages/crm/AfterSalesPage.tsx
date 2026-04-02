import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Tag, Button, Select, Input, InputNumber, Space, Modal, Form,
  DatePicker, message, Popconfirm, Card, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined, RollbackOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { crmApi, afterSalesApi } from '../../modules/crm/crm.api';
import { productApi } from '../../modules/product/product.api';
import { salesApi } from '../../modules/sales/sales.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const STATUS_COLORS: Record<string, string> = {
  '접수': 'blue',
  '진행': 'orange',
  '완료': 'green',
  '취소': 'red',
};

const TYPE_COLORS: Record<string, string> = {
  '수선': 'cyan',
  '교환': 'purple',
  '클레임': 'red',
  '기타': 'default',
};

const SERVICE_TYPES = ['수선', '교환', '클레임', '기타'];
const STATUS_OPTIONS = ['접수', '진행', '완료', '취소'];
const RETURN_REASON_OPTIONS = [
  { label: '사이즈 불일치', value: 'SIZE' },
  { label: '색상 불일치', value: 'COLOR' },
  { label: '불량/하자', value: 'DEFECT' },
  { label: '고객 변심', value: 'CHANGE_MIND' },
  { label: '파손/오염', value: 'DAMAGE' },
  { label: '오배송', value: 'WRONG_ITEM' },
  { label: '기타', value: 'OTHER' },
];

export default function AfterSalesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isHqOrAbove = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  /* ── 목록 데이터 ── */
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  /* ── 필터 ── */
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* ── 통계 ── */
  const [stats, setStats] = useState<any>(null);

  /* ── 모달 ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  /* ── 고객 검색 ── */
  const [customerOptions, setCustomerOptions] = useState<{ label: string; value: number }[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── 상품 검색 ── */
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [variantSearching, setVariantSearching] = useState(false);
  const variantTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── 반품처리 모달 ── */
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<any>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnReason, setReturnReason] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const handleCustomerSearch = (keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!keyword || keyword.length < 1) { setCustomerOptions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const r = await crmApi.list({ search: keyword, limit: '20' });
        setCustomerOptions((r.data || []).map((c: any) => ({
          label: `${c.customer_name} (${c.phone || '-'})`,
          value: c.customer_id,
        })));
      } catch (e: any) { console.warn('고객 검색 실패:', e.message); }
      finally { setCustomerSearching(false); }
    }, 300);
  };

  /* ── 상품 검색 핸들러 ── */
  const handleVariantSearch = (keyword: string) => {
    if (variantTimerRef.current) clearTimeout(variantTimerRef.current);
    if (!keyword || keyword.length < 2) { setVariantOptions([]); return; }
    variantTimerRef.current = setTimeout(async () => {
      setVariantSearching(true);
      try {
        const results = await productApi.searchVariants(keyword);
        setVariantOptions(results.map((v: any) => ({
          label: `${v.product_name} - ${v.color}/${v.size} (${v.sku})`,
          value: v.variant_id,
          data: v,
        })));
      } catch { /* ignore */ }
      finally { setVariantSearching(false); }
    }, 300);
  };

  const handleVariantSelect = (variantId: number) => {
    const opt = variantOptions.find((o: any) => o.value === variantId);
    if (opt?.data) {
      form.setFieldsValue({
        variant_id: variantId,
        product_name: opt.data.product_name,
        variant_info: `${opt.data.color || ''}/${opt.data.size || ''}`,
        unit_price: opt.data.price || 0,
      });
    }
  };

  /* ── 반품처리 핸들러 ── */
  const openReturn = (record: any) => {
    setReturnTarget(record);
    setReturnQty(1);
    setReturnReason('');
    setReturnOpen(true);
  };

  const handleReturnSubmit = async () => {
    if (!returnTarget?.variant_id) return;
    if (!returnReason) { message.warning('반품 사유를 선택하세요.'); return; }
    setReturnSubmitting(true);
    try {
      const result = await salesApi.createDirectReturn({
        variant_id: returnTarget.variant_id,
        qty: returnQty,
        unit_price: returnTarget.unit_price || 0,
        return_reason: returnReason,
        partner_code: returnTarget.partner_code,
      });
      // 매장매니저: '진행' (본사 확인 필요), 본사/admin: '완료'
      const nextStatus = isHqOrAbove ? '완료' : '진행';
      await afterSalesApi.update(returnTarget.service_id, {
        return_sale_id: result?.sale_id,
        status: nextStatus,
        ...(isHqOrAbove ? { completed_date: dayjs().format('YYYY-MM-DD') } : {}),
      });
      message.success(isHqOrAbove ? '반품처리가 완료되었습니다.' : '반품처리가 접수되었습니다. 본사 확인 후 완료됩니다.');
      setReturnOpen(false);
      load();
      loadStats();
    } catch (e: any) { message.error(e.message); }
    finally { setReturnSubmitting(false); }
  };

  /* ══════════ 데이터 로드 ══════════ */
  const loadStats = useCallback(() => {
    afterSalesApi.stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (typeFilter) params.service_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    afterSalesApi.list(params)
      .then((r: any) => {
        setData(r.data || []);
        setTotal(r.total || 0);
      })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (variantTimerRef.current) clearTimeout(variantTimerRef.current);
    };
  }, []);

  /* ══════════ 모달 핸들러 ══════════ */
  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        received_date: record.received_date ? dayjs(record.received_date) : null,
        completed_date: record.completed_date ? dayjs(record.completed_date) : null,
      });
      setCustomerOptions([{
        label: record.customer_name || `고객 #${record.customer_id}`,
        value: record.customer_id,
      }]);
    } else {
      form.setFieldsValue({
        service_type: '수선',
        received_date: dayjs(),
      });
      setCustomerOptions([]);
    }
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        received_date: values.received_date ? values.received_date.format('YYYY-MM-DD') : null,
        completed_date: values.completed_date ? values.completed_date.format('YYYY-MM-DD') : null,
      };
      if (editTarget) {
        await afterSalesApi.update(editTarget.service_id, payload);
        message.success('A/S 접수가 수정되었습니다.');
      } else {
        await afterSalesApi.create(payload);
        message.success('A/S가 접수되었습니다.');
      }
      setModalOpen(false);
      load();
      loadStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await afterSalesApi.remove(id);
      message.success('A/S 접수가 삭제되었습니다.');
      load();
      loadStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  /* ══════════ 모달 내 상태 감시 ══════════ */
  const modalStatus = Form.useWatch('status', form);

  /* ══════════ 컬럼 정의 ══════════ */
  const columns = [
    {
      title: '접수일', dataIndex: 'received_date', key: 'received_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-',
    },
    {
      title: '고객명', dataIndex: 'customer_name', key: 'customer_name', width: 100,
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`/crm/${r.customer_id}`)}>
          {v || '-'}
        </Button>
      ),
    },
    {
      title: '유형', dataIndex: 'service_type', key: 'service_type', width: 80,
      render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '매장', dataIndex: 'partner_name', key: 'partner_name', width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140,
      ellipsis: true, render: (v: string) => v || '-',
    },
    {
      title: '옵션', dataIndex: 'variant_info', key: 'variant_info', width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '내용', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '반품', dataIndex: 'return_sale_id', key: 'return_info', width: 100,
      render: (v: number, r: any) => v
        ? <Tag color="purple" style={{ fontSize: 11 }}>반품완료</Tag>
        : r.status === '진행' && r.variant_id
          ? <Tag color="orange" style={{ fontSize: 11 }}>반품진행</Tag>
          : null,
    },
    {
      title: '완료일', dataIndex: 'completed_date', key: 'completed_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-',
    },
    {
      title: '', key: 'actions', width: 130, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          {r.variant_id && !r.return_sale_id && r.status !== '취소' && (
            <Popconfirm title="반품처리 하시겠습니까?" onConfirm={() => openReturn(r)}
              okText="진행" cancelText="취소">
              <Button size="small" type="primary" ghost icon={<RollbackOutlined />}
                onClick={(e) => e.stopPropagation()}>반품</Button>
            </Popconfirm>
          )}
          <Button size="small" icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); openForm(r); }} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.service_id)}
            okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ══════════ 통계 요약 ══════════ */
  const openCount = stats?.openCount ?? 0;
  const byType: Record<string, number> = {};
  (stats?.byType || []).forEach((r: any) => { byType[r.service_type] = r.count; });
  const byStatus: Record<string, number> = {};
  (stats?.byStatus || []).forEach((r: any) => { byStatus[r.status] = r.count; });

  return (
    <div>
      {/* 상단 통계 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>미처리 (접수+진행)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fa8c16' }}>
              {openCount}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>수선</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#13c2c2' }}>
              {byType['수선'] || 0}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>교환</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1' }}>
              {byType['교환'] || 0}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>클레임</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ff4d4f' }}>
              {byType['클레임'] || 0}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }}
            style={{ width: 110 }}
            options={[
              { label: '전체', value: '' },
              ...SERVICE_TYPES.map((t) => ({ label: t, value: t })),
            ]} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}
            style={{ width: 110 }}
            options={[
              { label: '전체', value: '' },
              ...STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
            ]} />
        </div>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="고객명, 상품명" prefix={<SearchOutlined />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onPressEnter={load} allowClear />
        </div>
        <Button onClick={load}>조회</Button>
        {(search || typeFilter || statusFilter) && (
          <Button type="link" size="small" onClick={() => { setSearch(''); setTypeFilter(''); setStatusFilter(''); setPage(1); }}>
            초기화
          </Button>
        )}
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
          A/S 접수
        </Button>
      </div>

      {/* 테이블 */}
      <Table
        dataSource={data}
        rowKey="service_id"
        loading={loading}
        size="small"
        scroll={{ x: 1200, y: 'calc(100vh - 410px)' }}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
        columns={columns}
      />

      {/* 등록/수정 모달 */}
      <Modal
        title={
          <span>
            <ToolOutlined style={{ marginRight: 8 }} />
            {editTarget ? 'A/S 수정' : 'A/S 접수'}
          </span>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editTarget ? '수정' : '접수'}
        cancelText="취소"
        confirmLoading={submitting}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_id" label="고객"
                rules={[{ required: true, message: '고객을 선택하세요' }]}>
                <Select
                  showSearch
                  filterOption={false}
                  placeholder="이름/전화번호 검색"
                  onSearch={handleCustomerSearch}
                  loading={customerSearching}
                  options={customerOptions}
                  notFoundContent={customerSearching ? '검색중...' : '이름 또는 전화번호를 입력하세요'}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="service_type" label="유형"
                rules={[{ required: true, message: '유형을 선택하세요' }]}>
                <Select options={SERVICE_TYPES.map((t) => ({ label: t, value: t }))} />
              </Form.Item>
            </Col>
          </Row>

          {editTarget && (
            <Form.Item name="status" label="상태">
              <Select options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
          )}

          <Form.Item label="상품 검색">
            <Select
              showSearch
              filterOption={false}
              placeholder="상품명/SKU 검색 (2글자 이상)"
              onSearch={handleVariantSearch}
              onSelect={handleVariantSelect}
              loading={variantSearching}
              options={variantOptions}
              allowClear
              notFoundContent={variantSearching ? '검색중...' : '상품명 또는 SKU를 입력하세요'}
            />
          </Form.Item>
          <Form.Item name="variant_id" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="product_name" label="상품명">
                <Input placeholder="상품명" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="variant_info" label="옵션">
                <Input placeholder="색상/사이즈" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit_price" label="단가">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="내용">
            <Input.TextArea rows={3} placeholder="A/S 요청 내용" />
          </Form.Item>

          {editTarget && (
            <Form.Item name="resolution" label="처리결과">
              <Input.TextArea rows={3} placeholder="처리 결과를 입력하세요" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="received_date" label="접수일"
                rules={[{ required: true, message: '접수일을 선택하세요' }]}>
                <DatePicker style={{ width: '100%' }} placeholder="접수일" />
              </Form.Item>
            </Col>
            <Col span={12}>
              {(editTarget && modalStatus === '완료') && (
                <Form.Item name="completed_date" label="완료일">
                  <DatePicker style={{ width: '100%' }} placeholder="완료일" />
                </Form.Item>
              )}
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 반품처리 모달 */}
      <Modal
        title="A/S 반품처리"
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={handleReturnSubmit}
        confirmLoading={returnSubmitting}
        okText="반품처리"
        cancelText="취소"
        width={400}
        okButtonProps={{ disabled: !returnReason }}
      >
        {returnTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div style={{ fontWeight: 600 }}>{returnTarget.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{returnTarget.variant_info}</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                단가: {Number(returnTarget.unit_price || 0).toLocaleString()}원
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 수량</div>
              <InputNumber min={1} value={returnQty} onChange={(v) => setReturnQty(v || 1)}
                style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>반품 사유 <span style={{ color: '#ff4d4f' }}>*</span></div>
              <Select
                placeholder="반품 사유 선택"
                options={RETURN_REASON_OPTIONS}
                value={returnReason || undefined}
                onChange={setReturnReason}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 600, color: '#cf1322' }}>
              반품 금액: -{(returnQty * Number(returnTarget.unit_price || 0)).toLocaleString()}원
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
