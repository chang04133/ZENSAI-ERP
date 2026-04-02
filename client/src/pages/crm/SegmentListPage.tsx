import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, Checkbox, DatePicker, message, Popconfirm, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, TeamOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { segmentApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';

const TIER_OPTIONS = ['VVIP', 'VIP', '일반', '신규'];

export default function SegmentListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [partners, setPartners] = useState<any[]>([]);

  // 세그먼트 생성/수정 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 갱신 로딩 (행별)
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isStore]);

  const load = useCallback(() => {
    // 본사 계정은 매장을 선택해야만 조회
    if (!isStore && !partnerFilter) { setData([]); setTotal(0); return; }
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (partnerFilter) params.partner_code = partnerFilter;
    segmentApi.list(params)
      .then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, partnerFilter, isStore]);

  useEffect(() => { load(); }, [load]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      const c = record.conditions || {};
      form.setFieldsValue({
        segment_name: record.segment_name,
        description: record.description,
        auto_refresh: record.auto_refresh,
        tiers: c.tiers || [],
        gender: c.gender || undefined,
        min_amount: c.min_amount ?? undefined,
        max_amount: c.max_amount ?? undefined,
        min_purchase_count: c.min_purchase_count ?? undefined,
        max_purchase_count: c.max_purchase_count ?? undefined,
        last_purchase_range: c.last_purchase_from && c.last_purchase_to
          ? [dayjs(c.last_purchase_from), dayjs(c.last_purchase_to)]
          : undefined,
        days_since_purchase_max: c.days_since_purchase_max ?? undefined,
        days_since_purchase_min: c.days_since_purchase_min ?? undefined,
        age_min: c.age_min ?? undefined,
        age_max: c.age_max ?? undefined,
      });
    }
    setFormOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const conditions: Record<string, any> = {};
      if (values.tiers?.length) conditions.tiers = values.tiers;
      if (values.gender) conditions.gender = values.gender;
      if (values.min_amount != null) conditions.min_amount = values.min_amount;
      if (values.max_amount != null) conditions.max_amount = values.max_amount;
      if (values.min_purchase_count != null) conditions.min_purchase_count = values.min_purchase_count;
      if (values.max_purchase_count != null) conditions.max_purchase_count = values.max_purchase_count;
      if (values.last_purchase_range?.length === 2) {
        conditions.last_purchase_from = values.last_purchase_range[0].format('YYYY-MM-DD');
        conditions.last_purchase_to = values.last_purchase_range[1].format('YYYY-MM-DD');
      }
      if (values.days_since_purchase_max != null) conditions.days_since_purchase_max = values.days_since_purchase_max;
      if (values.days_since_purchase_min != null) conditions.days_since_purchase_min = values.days_since_purchase_min;
      if (values.age_min != null) conditions.age_min = values.age_min;
      if (values.age_max != null) conditions.age_max = values.age_max;

      const payload: any = {
        segment_name: values.segment_name,
        description: values.description || null,
        conditions,
        auto_refresh: values.auto_refresh || false,
      };
      // 본사 계정이 매장을 선택한 상태에서 생성 → 해당 매장 세그먼트로
      if (!isStore && partnerFilter) payload.partner_code = partnerFilter;

      if (editTarget) {
        await segmentApi.update(editTarget.segment_id, payload);
        message.success('세그먼트가 수정되었습니다.');
      } else {
        await segmentApi.create(payload);
        message.success('세그먼트가 생성되었습니다.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await segmentApi.remove(id);
      message.success('세그먼트가 삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleRefresh = async (id: number) => {
    setRefreshingId(id);
    try {
      const refreshed = await segmentApi.refresh(id);
      message.success(`세그먼트가 갱신되었습니다. (${refreshed?.member_count ?? 0}명)`);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setRefreshingId(null); }
  };

  const columns = [
    {
      title: '세그먼트명', dataIndex: 'segment_name', key: 'name', ellipsis: true,
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`/crm/segments/${r.segment_id}`)}>
          <TeamOutlined style={{ marginRight: 4 }} />{v}
        </Button>
      ),
    },
    ...(!isStore ? [{ title: '매장', dataIndex: 'partner_name', key: 'store', width: 100,
      render: (v: string | null) => v || '공통' }] : []),
    { title: '설명', dataIndex: 'description', key: 'desc', ellipsis: true,
      render: (v: string | null) => v || '-' },
    { title: '멤버수', dataIndex: 'member_count', key: 'members', width: 100, align: 'right' as const,
      render: (v: number) => v.toLocaleString() },
    { title: '자동갱신', dataIndex: 'auto_refresh', key: 'auto', width: 90, align: 'center' as const,
      render: (v: boolean) => v ? <Tag color="blue">ON</Tag> : <Tag>OFF</Tag> },
    { title: '생성일', dataIndex: 'created_at', key: 'created', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD') },
    { title: '', key: 'actions', width: 130, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<ReloadOutlined />}
            loading={refreshingId === r.segment_id}
            onClick={(e) => { e.stopPropagation(); handleRefresh(r.segment_id); }} />
          <Button size="small" icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); openForm(r); }} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.segment_id)}
            okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {!isStore && (
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>매장 선택</div>
            <Select showSearch optionFilterProp="label" value={partnerFilter || undefined}
              placeholder="매장을 선택하세요"
              onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 180 }}
              options={partners.map(p => ({ label: p.partner_name, value: p.partner_code }))} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />}
          disabled={!isStore && !partnerFilter}
          onClick={() => openForm()}>새 세그먼트</Button>
      </div>

      {!isStore && !partnerFilter ? (
        <Empty image={<ShopOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
          description="매장을 선택하면 해당 매장의 세그먼트가 표시됩니다."
          style={{ padding: 80 }} />
      ) : (
      <Table dataSource={data} rowKey="segment_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/crm/segments/${r.segment_id}`), style: { cursor: 'pointer' } })} />
      )}

      {/* 세그먼트 생성/수정 모달 */}
      <Modal title={editTarget ? '세그먼트 수정' : '새 세그먼트'} open={formOpen} width={600}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '생성'} cancelText="취소" confirmLoading={submitting}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="segment_name" label="세그먼트명"
            rules={[{ required: true, message: '세그먼트명을 입력하세요' }]}>
            <Input placeholder="예: VIP 여성 고객" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="세그먼트에 대한 설명" />
          </Form.Item>

          <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>조건 설정</div>

            <Form.Item name="tiers" label="등급" style={{ marginBottom: 8 }}>
              <Select mode="multiple" placeholder="전체" allowClear
                options={TIER_OPTIONS.map((t) => ({ label: t, value: t }))} />
            </Form.Item>

            <Form.Item name="gender" label="성별" style={{ marginBottom: 8 }}>
              <Select allowClear placeholder="전체" style={{ width: 120 }}
                options={[{ label: '남', value: '남' }, { label: '여', value: '여' }]} />
            </Form.Item>

            <Space size={16} style={{ width: '100%', marginBottom: 8 }} align="start">
              <Form.Item name="min_amount" label="최소 구매액" style={{ marginBottom: 0 }}>
                <InputNumber min={0} style={{ width: 160 }} placeholder="0"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
              <Form.Item name="max_amount" label="최대 구매액" style={{ marginBottom: 0 }}>
                <InputNumber min={0} style={{ width: 160 }} placeholder="제한없음"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Space>

            <Space size={16} style={{ width: '100%', marginBottom: 8 }} align="start">
              <Form.Item name="min_purchase_count" label="최소 구매횟수" style={{ marginBottom: 0 }}>
                <InputNumber min={0} style={{ width: 160 }} placeholder="0" />
              </Form.Item>
              <Form.Item name="max_purchase_count" label="최대 구매횟수" style={{ marginBottom: 0 }}>
                <InputNumber min={0} style={{ width: 160 }} placeholder="제한없음" />
              </Form.Item>
            </Space>

            <Form.Item name="last_purchase_range" label="최근 구매 기간 (고정 날짜)" style={{ marginBottom: 8 }}>
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>

            <Space size={16} style={{ width: '100%', marginBottom: 8 }} align="start">
              <Form.Item name="days_since_purchase_max" label="최근 N일 이내 구매" style={{ marginBottom: 0 }}>
                <InputNumber min={1} style={{ width: 160 }} placeholder="예: 90" addonAfter="일" />
              </Form.Item>
              <Form.Item name="days_since_purchase_min" label="N일 이상 미구매" style={{ marginBottom: 0 }}>
                <InputNumber min={1} style={{ width: 160 }} placeholder="예: 180" addonAfter="일" />
              </Form.Item>
            </Space>

            <Space size={16} style={{ width: '100%' }} align="start">
              <Form.Item name="age_min" label="최소 나이" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={150} style={{ width: 160 }} placeholder="0" />
              </Form.Item>
              <Form.Item name="age_max" label="최대 나이" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={150} style={{ width: 160 }} placeholder="제한없음" />
              </Form.Item>
            </Space>
          </div>

          <Form.Item name="auto_refresh" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>자동 갱신</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
