import { useEffect, useState } from 'react';
import { Tabs, Table, Button, Modal, Form, Input, InputNumber, Switch, Select, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { codeApi } from '../../modules/code/code.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const CODE_TYPES = [
  { key: 'CATEGORY', label: '카테고리' },
  { key: 'BRAND', label: '브랜드' },
  { key: 'YEAR', label: '연도' },
  { key: 'SEASON', label: '시즌' },
  { key: 'ITEM', label: '아이템' },
  { key: 'COLOR', label: '색상' },
  { key: 'SIZE', label: '사이즈' },
  { key: 'SHIPMENT_TYPE', label: '의뢰유형' },
  { key: 'FIT', label: '핏' },
  { key: 'LENGTH', label: '기장' },
  { key: 'SETTING', label: '시스템설정' },
];

interface CodeItem {
  code_id: number;
  code_type: string;
  code_value: string;
  code_label: string;
  sort_order: number;
  is_active: boolean;
  parent_code: number | null;
}

export default function CodeManagePage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN].includes(user.role as any);
  const [codes, setCodes] = useState<Record<string, CodeItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<CodeItem | null>(null);
  const [activeTab, setActiveTab] = useState('CATEGORY');
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await codeApi.getAll();
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
        await codeApi.update(editItem.code_id, values);
        message.success('코드가 수정되었습니다.');
      } else {
        await codeApi.create(values);
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
      await codeApi.remove(id);
      message.success('코드가 삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // Build hierarchical display for CATEGORY tab
  const getDisplayData = (items: CodeItem[]): CodeItem[] => {
    if (activeTab !== 'CATEGORY') return items;
    const parents = items.filter((i) => !i.parent_code).sort((a, b) => a.sort_order - b.sort_order);
    const children = items.filter((i) => i.parent_code);
    const result: CodeItem[] = [];
    for (const parent of parents) {
      result.push(parent);
      result.push(...children.filter((c) => c.parent_code === parent.code_id).sort((a, b) => a.sort_order - b.sort_order));
    }
    // Orphan children (parent not in current list)
    const usedIds = new Set(result.map((r) => r.code_id));
    result.push(...children.filter((c) => !usedIds.has(c.code_id)));
    return result;
  };

  const parentCategories = (codes['CATEGORY'] || []).filter((c) => !c.parent_code);

  const columns = [
    { title: '코드값', dataIndex: 'code_value', key: 'code_value', width: 120 },
    {
      title: '코드명', dataIndex: 'code_label', key: 'code_label',
      render: (v: string, record: CodeItem) => {
        if (activeTab !== 'CATEGORY') return v;
        return record.parent_code
          ? <span style={{ paddingLeft: 24 }}>└ {v}</span>
          : <strong>{v}</strong>;
      },
    },
    { title: '정렬순서', dataIndex: 'sort_order', key: 'sort_order', width: 100 },
    {
      title: '상태', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
    },
    ...(activeTab === 'CATEGORY' ? [{
      title: '구분', key: 'level', width: 80,
      render: (_: any, record: CodeItem) => (
        <Tag color={record.parent_code ? 'blue' : 'gold'}>{record.parent_code ? '소분류' : '대분류'}</Tag>
      ),
    }] : []),
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
        dataSource={getDisplayData(codes[ct.key] || [])}
        rowKey="code_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
    ),
  }));

  return (
    <div>
      <PageHeader
        title="코드관리"
        extra={canWrite && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
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
          {activeTab === 'CATEGORY' && (
            <Form.Item name="parent_code" label="상위 카테고리">
              <Select
                allowClear
                placeholder="미선택시 대분류로 등록"
                options={parentCategories.map((c) => ({ label: c.code_label, value: c.code_id }))}
              />
            </Form.Item>
          )}
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
