import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, Switch, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { promotionApi } from '../../modules/promotion/promotion.api';
import type { Promotion } from '../../../../shared/types/promotion';

const PROMO_TYPE_OPTIONS = [
  { label: '%', value: 'PERCENT' },
  { label: '정액', value: 'FIXED' },
  { label: '1+1', value: 'BOGO' },
  { label: '구매금액', value: 'THRESHOLD' },
];

const CATEGORY_OPTIONS = ['상의', '하의', '아우터', '원피스', '악세서리'];

const promoTypeLabel: Record<string, string> = {
  PERCENT: '%', FIXED: '정액', BOGO: '1+1', THRESHOLD: '구매금액',
};

function getStatusInfo(row: Promotion) {
  const now = dayjs();
  if (!row.is_active) return { text: '비활성', color: 'default' };
  if (dayjs(row.end_date).isBefore(now, 'day')) return { text: '종료', color: 'red' };
  if (dayjs(row.start_date).isAfter(now, 'day')) return { text: '예정', color: 'blue' };
  return { text: '진행중', color: 'green' };
}

export default function PromotionManagePage() {
  const [data, setData] = useState<Promotion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Promotion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const promoType = Form.useWatch('promo_type', form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await promotionApi.list({ limit: '50' });
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ promo_type: 'PERCENT', priority: 0, is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: Promotion) => {
    setEditItem(row);
    form.setFieldsValue({
      ...row,
      start_date: dayjs(row.start_date),
      end_date: dayjs(row.end_date),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const body = {
        ...values,
        start_date: values.start_date.format('YYYY-MM-DD'),
        end_date: values.end_date.format('YYYY-MM-DD'),
      };
      if (editItem) {
        await promotionApi.update(editItem.promo_id, body);
        message.success('프로모션이 수정되었습니다.');
      } else {
        await promotionApi.create(body);
        message.success('프로모션이 등록되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await promotionApi.remove(id);
      message.success('프로모션이 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '프로모션명', dataIndex: 'promo_name', width: 200, ellipsis: true },
    {
      title: '유형', dataIndex: 'promo_type', width: 90, align: 'center' as const,
      render: (v: string) => promoTypeLabel[v] || v,
    },
    {
      title: '할인값', dataIndex: 'discount_value', width: 100, align: 'right' as const,
      render: (v: number, r: Promotion) => r.promo_type === 'PERCENT' ? `${v}%` : v?.toLocaleString(),
    },
    {
      title: '기간', width: 200, align: 'center' as const,
      render: (_: any, r: Promotion) =>
        `${dayjs(r.start_date).format('YY.MM.DD')} ~ ${dayjs(r.end_date).format('YY.MM.DD')}`,
    },
    { title: '우선순위', dataIndex: 'priority', width: 80, align: 'center' as const },
    {
      title: '상태', width: 80, align: 'center' as const,
      render: (_: any, r: Promotion) => {
        const s = getStatusInfo(r);
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '등록일', dataIndex: 'created_at', width: 100, align: 'center' as const,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-',
    },
    {
      title: '관리', width: 120, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, r: Promotion) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.promo_id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="프로모션 관리" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>프로모션 등록</Button>} />
      <Table
        rowKey="promo_id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
      <Modal
        title={editItem ? '프로모션 수정' : '프로모션 등록'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={submitting}
        okText="저장"
        cancelText="취소"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small" style={{ marginTop: 16 }}>
          <Form.Item name="promo_name" label="프로모션명" rules={[{ required: true, message: '프로모션명을 입력하세요' }]}>
            <Input placeholder="프로모션명" />
          </Form.Item>
          <Form.Item name="promo_type" label="유형" rules={[{ required: true }]}>
            <Select options={PROMO_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="discount_value" label="할인값">
            <InputNumber min={0} style={{ width: '100%' }} placeholder={promoType === 'PERCENT' ? '할인율(%)' : '할인금액'} />
          </Form.Item>
          {promoType === 'BOGO' && (
            <Form.Item name="min_qty" label="최소 수량">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="최소 구매 수량" />
            </Form.Item>
          )}
          {(promoType === 'THRESHOLD' || promoType === 'PERCENT') && (
            <Form.Item name="min_amount" label="최소 금액">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="최소 구매 금액" />
            </Form.Item>
          )}
          <Form.Item name="target_categories" label="대상 카테고리">
            <Select mode="multiple" allowClear placeholder="전체 (미선택 시)" options={CATEGORY_OPTIONS.map((c) => ({ label: c, value: c }))} />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="start_date" label="시작일" rules={[{ required: true, message: '시작일 필수' }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="end_date" label="종료일" rules={[{ required: true, message: '종료일 필수' }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="priority" label="우선순위">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="is_active" label="활성" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
