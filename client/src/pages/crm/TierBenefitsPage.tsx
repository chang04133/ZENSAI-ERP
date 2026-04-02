import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, Switch, message, Popconfirm, Collapse } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, GiftOutlined } from '@ant-design/icons';
import { crmApi } from '../../modules/crm/crm.api';

const TIERS = ['VVIP', 'VIP', '일반', '신규'];
const TIER_COLORS: Record<string, string> = { VVIP: 'gold', VIP: 'purple', '일반': 'blue', '신규': 'green' };
const BENEFIT_TYPES = [
  { label: '할인', value: 'DISCOUNT' },
  { label: '무료배송', value: 'FREE_SHIPPING' },
  { label: '포인트 보너스', value: 'POINT_BONUS' },
  { label: '우선 안내', value: 'PRIORITY' },
  { label: '선물/쿠폰', value: 'GIFT' },
  { label: '기타', value: 'CUSTOM' },
];

export default function TierBenefitsPage() {
  const [benefits, setBenefits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    crmApi.getTierBenefits(undefined, showInactive).then(setBenefits).catch((e: any) => message.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [showInactive]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.setFieldsValue({ tier_name: 'VVIP', benefit_type: 'DISCOUNT', is_active: true });
    }
    setFormOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = editTarget ? { ...values, benefit_id: editTarget.benefit_id } : values;
      await crmApi.upsertTierBenefit(payload);
      message.success(editTarget ? '혜택이 수정되었습니다.' : '혜택이 추가되었습니다.');
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await crmApi.deleteTierBenefit(id);
      message.success('혜택이 비활성화되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '혜택유형', dataIndex: 'benefit_type', key: 'type', width: 120,
      render: (v: string) => {
        const found = BENEFIT_TYPES.find(b => b.value === v);
        return <Tag>{found?.label || v}</Tag>;
      },
    },
    { title: '혜택명', dataIndex: 'benefit_name', key: 'name' },
    { title: '혜택값', dataIndex: 'benefit_value', key: 'value', width: 100 },
    { title: '설명', dataIndex: 'description', key: 'desc', ellipsis: true, render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'is_active', key: 'active', width: 60,
      render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag> },
    { title: '', key: 'act', width: 80, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} />
          {r.is_active ? (
            <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(r.benefit_id)} okText="비활성화" cancelText="취소">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : (
            <Button size="small" type="primary" ghost onClick={async () => {
              try {
                await crmApi.upsertTierBenefit({ ...r, is_active: true });
                message.success('혜택이 활성화되었습니다.');
                load();
              } catch (e: any) { message.error(e.message); }
            }}>복구</Button>
          )}
        </Space>
      ),
    },
  ];

  const grouped = TIERS.reduce<Record<string, any[]>>((acc, tier) => {
    acc[tier] = benefits.filter(b => b.tier_name === tier);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><GiftOutlined /> 등급별 혜택 관리</h2>
        <Space>
          <span style={{ fontSize: 12, color: '#888' }}>비활성 포함</span>
          <Switch size="small" checked={showInactive} onChange={setShowInactive} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>혜택 추가</Button>
        </Space>
      </div>

      <Collapse
        defaultActiveKey={TIERS}
        items={TIERS.map(tier => ({
          key: tier,
          label: (
            <Space>
              <Tag color={TIER_COLORS[tier]} style={{ fontSize: 14, padding: '2px 12px' }}>{tier}</Tag>
              <span style={{ color: '#888' }}>{grouped[tier]?.length || 0}개 혜택</span>
            </Space>
          ),
          children: (
            <Table
              dataSource={grouped[tier] || []}
              rowKey="benefit_id"
              loading={loading}
              size="small"
              pagination={false}
              columns={columns}
            />
          ),
        }))}
      />

      <Modal title={editTarget ? '혜택 수정' : '혜택 추가'} open={formOpen}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '추가'} cancelText="취소" confirmLoading={submitting} width={480}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="tier_name" label="등급" rules={[{ required: true }]}>
            <Select options={TIERS.map(t => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="benefit_type" label="혜택 유형" rules={[{ required: true }]}>
            <Select options={BENEFIT_TYPES} />
          </Form.Item>
          <Form.Item name="benefit_name" label="혜택명" rules={[{ required: true, message: '혜택명을 입력하세요' }]}>
            <Input placeholder="예: VIP 할인" />
          </Form.Item>
          <Form.Item name="benefit_value" label="혜택값">
            <Input placeholder="예: 10%, 무료, 2배" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="혜택 설명 (선택)" />
          </Form.Item>
          <Form.Item name="is_active" label="활성 상태">
            <Select options={[{ label: '활성', value: true }, { label: '비활성', value: false }]} />
          </Form.Item>
          <Form.Item name="sort_order" label="정렬 순서">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
