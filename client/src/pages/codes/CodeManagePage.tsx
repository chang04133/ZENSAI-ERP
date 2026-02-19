import { useEffect, useState } from 'react';
import { Tabs, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { getAllCodesApi, createCodeApi, updateCodeApi, deleteCodeApi } from '../../api/code.api';
import { useAuthStore } from '../../store/auth.store';
import { ROLES } from '../../constants/roles';

const CODE_TYPES = [
  { key: 'BRAND', label: '브랜드' },
  { key: 'YEAR', label: '연도' },
  { key: 'SEASON', label: '시즌' },
  { key: 'ITEM', label: '아이템' },
  { key: 'COLOR', label: '색상' },
  { key: 'SIZE', label: '사이즈' },
];

interface CodeItem {
  code_id: number;
  code_type: string;
  code_value: string;
  code_label: string;
  sort_order: number;
  is_active: boolean;
}

export default function CodeManagePage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const [codes, setCodes] = useState<Record<string, CodeItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<CodeItem | null>(null);
  const [activeTab, setActiveTab] = useState('BRAND');
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAllCodesApi();
      setCodes(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ code_type: activeTab, sort_order: 0, is_active: true });
    setModalOpen(true);
  };

  const openEdit = (item: CodeItem) => {
    setEditItem(item);
    form.setFieldsValue(item);
    setModalOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      if (editItem) {
        await updateCodeApi(editItem.code_id, values);
        message.success('코드가 수정되었습니다.');
      } else {
        await createCodeApi(values);
        message.success('코드가 추가되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCodeApi(id);
      message.success('코드가 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '코드값', dataIndex: 'code_value', key: 'code_value', width: 120 },
    { title: '코드명', dataIndex: 'code_label', key: 'code_label' },
    { title: '정렬순서', dataIndex: 'sort_order', key: 'sort_order', width: 100 },
    {
      title: '상태', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 150,
      render: (_: any, record: CodeItem) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>수정</Button>
          {user?.role === ROLES.ADMIN && (
            <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(record.code_id)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    }] : []),
  ];

  const tabItems = CODE_TYPES.map((ct) => ({
    key: ct.key,
    label: `${ct.label} (${(codes[ct.key] || []).length})`,
    children: (
      <Table
        columns={columns}
        dataSource={codes[ct.key] || []}
        rowKey="code_id"
        loading={loading}
        pagination={false}
        size="small"
      />
    ),
  }));

  return (
    <div>
      <PageHeader
        title="코드관리"
        extra={canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            코드 추가
          </Button>
        )}
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      <Modal
        title={editItem ? '코드 수정' : '코드 추가'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editItem ? '수정' : '추가'}
        cancelText="취소"
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ sort_order: 0, is_active: true }}>
          <Form.Item name="code_type" label="코드타입">
            <Input disabled value={activeTab} />
          </Form.Item>
          <Form.Item name="code_value" label="코드값" rules={[{ required: true, message: '코드값을 입력해주세요' }]}>
            <Input placeholder="예: BK, 2025, SS" disabled={!!editItem} />
          </Form.Item>
          <Form.Item name="code_label" label="코드명" rules={[{ required: true, message: '코드명을 입력해주세요' }]}>
            <Input placeholder="예: 블랙, 2025, Spring/Summer" />
          </Form.Item>
          <Form.Item name="sort_order" label="정렬순서">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {editItem && (
            <Form.Item name="is_active" label="사용여부" valuePropName="checked">
              <Switch checkedChildren="활성" unCheckedChildren="비활성" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
