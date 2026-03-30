import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Tag, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, StarOutlined, StarFilled, EditOutlined, StopOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { warehouseApi } from '../../modules/warehouse/warehouse.api';

interface Warehouse {
  warehouse_code: string;
  warehouse_name: string;
  partner_code: string;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
  partner_name?: string;
}

export default function WarehouseManagePage() {
  const [data, setData] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const list = await warehouseApi.list();
      setData(list);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: Warehouse) => {
    setEditing(record);
    form.setFieldsValue({
      warehouse_code: record.warehouse_code,
      warehouse_name: record.warehouse_name,
      address: record.address,
      is_default: record.is_default,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await warehouseApi.update(editing.warehouse_code, values);
        message.success('창고가 수정되었습니다.');
      } else {
        await warehouseApi.create(values);
        message.success('창고가 등록되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleSetDefault = async (code: string) => {
    try {
      await warehouseApi.setDefault(code);
      message.success('기본 창고가 변경되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDeactivate = async (code: string) => {
    try {
      await warehouseApi.remove(code);
      message.success('창고가 비활성화되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    {
      title: '기본', dataIndex: 'is_default', width: 60, align: 'center' as const,
      render: (v: boolean, r: Warehouse) => v
        ? <StarFilled style={{ color: '#faad14', fontSize: 18 }} />
        : r.is_active
          ? <Button type="text" size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(r.warehouse_code)} />
          : null,
    },
    { title: '창고코드', dataIndex: 'warehouse_code', width: 130 },
    { title: '창고명', dataIndex: 'warehouse_name', width: 180 },
    { title: '연결 거래처', dataIndex: 'partner_name', width: 150, render: (v: string) => v || '-' },
    { title: '주소', dataIndex: 'address', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '상태', dataIndex: 'is_active', width: 80, align: 'center' as const,
      render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag color="default">비활성</Tag>,
    },
    {
      title: '', key: 'action', width: 120,
      render: (_: any, r: Warehouse) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>수정</Button>
          {r.is_active && !r.is_default && (
            <Popconfirm title="이 창고를 비활성화하시겠습니까?" onConfirm={() => handleDeactivate(r.warehouse_code)}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="창고 관리" />
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>창고 추가</Button>
        <span style={{ marginLeft: 12, color: '#888', fontSize: 12 }}>
          <StarFilled style={{ color: '#faad14' }} /> 기본 창고: 출고/입고/생산 시 자동 사용되는 메인 창고
        </span>
      </div>
      <Table
        columns={columns} dataSource={data} rowKey="warehouse_code" loading={loading}
        size="small" scroll={{ x: 800, y: 'calc(100vh - 280px)' }}
        pagination={false}
      />

      <Modal
        title={editing ? '창고 수정' : '창고 추가'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="warehouse_code" label="창고코드" rules={[{ required: true, message: '창고코드를 입력하세요' }]}>
            <Input placeholder="예: WH001" disabled={!!editing} maxLength={20} />
          </Form.Item>
          <Form.Item name="warehouse_name" label="창고명" rules={[{ required: true, message: '창고명을 입력하세요' }]}>
            <Input placeholder="예: 본사 물류창고" maxLength={100} />
          </Form.Item>
          <Form.Item name="address" label="주소">
            <Input placeholder="창고 주소 (선택)" maxLength={200} />
          </Form.Item>
          <Form.Item name="is_default" label="기본 창고" valuePropName="checked">
            <Switch checkedChildren="기본" unCheckedChildren="일반" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
