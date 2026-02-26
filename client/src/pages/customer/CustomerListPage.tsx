import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Input, Select, Space, Tag, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { customerApi } from '../../modules/customer/customer.api';
import type { Customer } from '../../../../shared/types/customer';

const GRADE_CONFIG: Record<string, { color: string; label: string }> = {
  NORMAL: { color: 'default', label: 'NORMAL' },
  SILVER: { color: '#8c8c8c', label: 'SILVER' },
  GOLD: { color: 'gold', label: 'GOLD' },
  VIP: { color: 'purple', label: 'VIP' },
};

export default function CustomerListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [formModal, setFormModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [historyModal, setHistoryModal] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (search) params.search = search;
      const res = await customerApi.list(params);
      setCustomers(res.data);
      setTotal(res.total);
    } catch (e: any) {
      message.error('고객 목록 조회 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ grade: 'NORMAL' });
    setFormModal(true);
  };

  const openEdit = (record: Customer) => {
    setEditing(record);
    form.setFieldsValue({
      customer_name: record.customer_name,
      phone: record.phone,
      email: record.email,
      grade: record.grade,
      memo: record.memo,
    });
    setFormModal(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await customerApi.update(editing.customer_id, values);
        message.success('고객 정보가 수정되었습니다.');
      } else {
        await customerApi.create(values);
        message.success('고객이 등록되었습니다.');
      }
      setFormModal(false);
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await customerApi.remove(id);
      message.success('고객이 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openHistory = async (record: Customer) => {
    setHistoryCustomer(record);
    setHistoryModal(true);
    setHistoryLoading(true);
    try {
      const data = await customerApi.getHistory(record.customer_id);
      setHistory(data);
    } catch (e: any) {
      message.error('구매이력 조회 실패: ' + e.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRecalculate = async (record: Customer) => {
    try {
      const result = await customerApi.recalculateGrade(record.customer_id);
      message.success(`등급 재산정 완료: ${result.grade}`);
      load();
    } catch (e: any) {
      message.error('등급 재산정 실패: ' + e.message);
    }
  };

  const columns = [
    { title: '고객명', dataIndex: 'customer_name', width: 110 },
    { title: '전화번호', dataIndex: 'phone', width: 130, render: (v: string) => v || '-' },
    { title: '이메일', dataIndex: 'email', width: 170, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '등급', dataIndex: 'grade', width: 90,
      render: (v: string) => {
        const cfg = GRADE_CONFIG[v] || GRADE_CONFIG.NORMAL;
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '누적구매액', dataIndex: 'total_purchases', width: 130, align: 'right' as const,
      render: (v: number) => `${Number(v || 0).toLocaleString()}원`,
    },
    { title: '방문횟수', dataIndex: 'visit_count', width: 90, align: 'right' as const, render: (v: number) => `${v || 0}회` },
    {
      title: '상태', dataIndex: 'is_active', width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '관리', key: 'actions', width: 220,
      render: (_: any, record: Customer) => (
        <Space size="small">
          <Button size="small" onClick={() => openEdit(record)}>수정</Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(record)}>이력</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRecalculate(record)}>등급</Button>
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(record.customer_id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    { title: '매출일', dataIndex: 'sale_date', width: 110 },
    { title: '상품명', dataIndex: 'product_name', width: 160, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 140, ellipsis: true },
    { title: '색상', dataIndex: 'color', width: 80, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', width: 70, render: (v: string) => v || '-' },
    { title: '수량', dataIndex: 'quantity', width: 60, align: 'right' as const },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right' as const, render: (v: number) => `${Number(v || 0).toLocaleString()}원` },
    { title: '유형', dataIndex: 'sale_type', width: 80, render: (v: string) => <Tag color={v === '판매' ? 'blue' : 'orange'}>{v || '-'}</Tag> },
  ];

  return (
    <div>
      <PageHeader
        title="고객 관리"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>고객 등록</Button>}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="이름/전화번호 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => { setPage(1); load(); }}
          style={{ width: 250 }}
        />
        <Button onClick={() => { setPage(1); load(); }}>조회</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={customers}
        rowKey="customer_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
      />

      {/* 등록/수정 모달 */}
      <Modal
        title={editing ? '고객 수정' : '고객 등록'}
        open={formModal}
        onOk={handleSave}
        onCancel={() => setFormModal(false)}
        okText={editing ? '수정' : '등록'}
        cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="customer_name" label="고객명" rules={[{ required: true, message: '고객명을 입력하세요' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="전화번호">
            <Input placeholder="010-0000-0000" />
          </Form.Item>
          <Form.Item name="email" label="이메일">
            <Input />
          </Form.Item>
          <Form.Item name="grade" label="등급">
            <Select options={[
              { value: 'NORMAL', label: 'NORMAL' },
              { value: 'SILVER', label: 'SILVER' },
              { value: 'GOLD', label: 'GOLD' },
              { value: 'VIP', label: 'VIP' },
            ]} />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 구매이력 모달 */}
      <Modal
        title={`구매이력 - ${historyCustomer?.customer_name || ''}`}
        open={historyModal}
        onCancel={() => setHistoryModal(false)}
        footer={<Button onClick={() => setHistoryModal(false)}>닫기</Button>}
        width={900}
      >
        <Table
          columns={historyColumns}
          dataSource={history}
          rowKey={(_, i) => String(i)}
          loading={historyLoading}
          size="small"
          scroll={{ x: 800 }}
          pagination={{ pageSize: 20, showTotal: (t) => `총 ${t}건` }}
        />
      </Modal>
    </div>
  );
}
