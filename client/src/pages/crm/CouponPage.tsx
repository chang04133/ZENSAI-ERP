import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Popconfirm, Switch, Card,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined, GiftOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { couponApi, segmentApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const TYPE_COLORS: Record<string, string> = { PERCENTAGE: 'blue', FIXED: 'green', FREE_SHIPPING: 'purple' };
const TYPE_LABELS: Record<string, string> = { PERCENTAGE: '% 할인', FIXED: '정액 할인', FREE_SHIPPING: '무료배송' };
const TIER_OPTIONS = ['VVIP', 'VIP', '일반', '신규'];

export default function CouponPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<any>(null);
  const [issueMode, setIssueMode] = useState<'segment'>('segment');
  const [segments, setSegments] = useState<any[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    couponApi.list({ page: String(page), limit: '50' })
      .then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.setFieldsValue({ coupon_type: 'FIXED', valid_days: 30, usage_per_customer: 1, is_active: true });
    }
    setFormOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      if (editTarget) {
        await couponApi.update(editTarget.coupon_id, values);
        message.success('쿠폰이 수정되었습니다.');
      } else {
        await couponApi.create(values);
        message.success('쿠폰이 생성되었습니다.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await couponApi.remove(id);
      message.success('쿠폰이 비활성화되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const openIssue = async (record: any) => {
    setIssueTarget(record);
    setSelectedSegment(null);
    try {
      const segRes = await segmentApi.list({ limit: '200' });
      setSegments(segRes.data || []);
    } catch { setSegments([]); }
    setIssueOpen(true);
  };

  const handleIssue = async () => {
    if (!issueTarget) return;
    if (!selectedSegment) { message.warning('세그먼트를 선택해주세요.'); return; }
    setIssuing(true);
    try {
      const res = await couponApi.issueBySegment(issueTarget.coupon_id, selectedSegment);
      message.success(res.message || `${res.data?.issued || 0}명에게 발급 완료`);
      setIssueOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setIssuing(false); }
  };

  const columns = [
    { title: '쿠폰명', dataIndex: 'coupon_name', key: 'name', ellipsis: true },
    { title: '코드', dataIndex: 'coupon_code', key: 'code', width: 110,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: '유형', dataIndex: 'coupon_type', key: 'type', width: 90, align: 'center' as const,
      render: (v: string) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] || v}</Tag> },
    { title: '할인', dataIndex: 'discount_value', key: 'val', width: 100, align: 'right' as const,
      render: (v: number, r: any) => r.coupon_type === 'PERCENTAGE' ? `${v}%` : `${Number(v).toLocaleString()}원` },
    { title: '최소구매', dataIndex: 'min_purchase_amt', key: 'min', width: 100, align: 'right' as const,
      render: (v: number) => v > 0 ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '유효(일)', dataIndex: 'valid_days', key: 'days', width: 70, align: 'center' as const },
    { title: '대상등급', dataIndex: 'target_tier', key: 'tier', width: 80, align: 'center' as const,
      render: (v: string) => v || '전체' },
    { title: '발급', dataIndex: 'issued_count', key: 'issued', width: 60, align: 'right' as const,
      render: (v: number) => (v || 0).toLocaleString() },
    { title: '사용', dataIndex: 'used_count', key: 'used', width: 60, align: 'right' as const,
      render: (v: number) => (v || 0).toLocaleString() },
    { title: '상태', dataIndex: 'is_active', key: 'active', width: 60, align: 'center' as const,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag> },
    { title: '생성일', dataIndex: 'created_at', key: 'created', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD') },
    { title: '', key: 'actions', width: 130, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<SendOutlined />} onClick={() => openIssue(r)} disabled={!r.is_active}>발급</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} />
          <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(r.coupon_id)} okText="확인" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}><GiftOutlined /> 쿠폰 관리</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>새 쿠폰</Button>
      </div>

      <Table dataSource={data} rowKey="coupon_id" loading={loading} size="small"
        scroll={{ x: 1200, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={columns} />

      {/* 쿠폰 생성/수정 모달 */}
      <Modal title={editTarget ? '쿠폰 수정' : '새 쿠폰'} open={formOpen} width={500}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '생성'} cancelText="취소" confirmLoading={submitting}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="coupon_name" label="쿠폰명" rules={[{ required: true, message: '쿠폰명 필수' }]}>
            <Input placeholder="예: 봄 시즌 10% 할인" />
          </Form.Item>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="coupon_type" label="할인 유형" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={[
                { label: '정액 할인', value: 'FIXED' },
                { label: '% 할인', value: 'PERCENTAGE' },
                { label: '무료배송', value: 'FREE_SHIPPING' },
              ]} />
            </Form.Item>
            <Form.Item name="discount_value" label="할인 값" rules={[{ required: true, message: '필수' }]}>
              <InputNumber min={0} style={{ width: 140 }} placeholder="금액 또는 %" />
            </Form.Item>
          </Space>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="min_purchase_amt" label="최소 구매금액">
              <InputNumber min={0} style={{ width: 160 }} placeholder="0 = 제한없음" />
            </Form.Item>
            <Form.Item name="max_discount_amt" label="최대 할인금액">
              <InputNumber min={0} style={{ width: 160 }} placeholder="비워두면 제한없음" />
            </Form.Item>
          </Space>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="valid_days" label="유효기간 (일)">
              <InputNumber min={1} max={365} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="usage_per_customer" label="1인당 발급 수">
              <InputNumber min={1} max={99} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="usage_limit" label="총 발급 한도">
              <InputNumber min={1} style={{ width: 120 }} placeholder="무제한" />
            </Form.Item>
          </Space>
          <Form.Item name="target_tier" label="대상 등급">
            <Select allowClear placeholder="전체" style={{ width: 160 }}
              options={TIER_OPTIONS.map(t => ({ label: t, value: t }))} />
          </Form.Item>
          {editTarget && (
            <Form.Item name="is_active" label="활성 상태" valuePropName="checked">
              <Switch checkedChildren="활성" unCheckedChildren="비활성" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 발급 모달 */}
      <Modal title={`쿠폰 발급: ${issueTarget?.coupon_name || ''}`} open={issueOpen}
        onCancel={() => setIssueOpen(false)} onOk={handleIssue}
        okText="발급" cancelText="취소" confirmLoading={issuing} width={450}>
        <div style={{ marginBottom: 12 }}>
          <Tag color={TYPE_COLORS[issueTarget?.coupon_type]}>{TYPE_LABELS[issueTarget?.coupon_type]}</Tag>
          {issueTarget?.coupon_type === 'PERCENTAGE'
            ? `${issueTarget?.discount_value}% 할인`
            : `${Number(issueTarget?.discount_value || 0).toLocaleString()}원 할인`}
        </div>
        <div style={{ marginBottom: 12, fontSize: 13 }}>세그먼트를 선택하면 해당 멤버에게 일괄 발급됩니다.</div>
        <Select
          style={{ width: '100%' }}
          placeholder="세그먼트 선택"
          value={selectedSegment}
          onChange={setSelectedSegment}
          showSearch
          optionFilterProp="label"
          options={segments.map((s: any) => ({
            label: `${s.segment_name} (${s.member_count || 0}명)`,
            value: s.segment_id,
          }))}
        />
      </Modal>
    </div>
  );
}
