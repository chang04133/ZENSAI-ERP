import { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MessageOutlined, MailOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { templateApi } from '../../modules/crm/crm.api';

const TYPE_COLORS: Record<string, string> = { SMS: 'orange', EMAIL: 'purple' };

export default function TemplatePage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 미리보기 모달
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    templateApi.list()
      .then((d: any) => setData(d || []))
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.setFieldsValue({ template_type: 'SMS' });
    }
    setFormOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      if (editTarget) {
        await templateApi.update(editTarget.template_id, values);
        message.success('템플릿이 수정되었습니다.');
      } else {
        await templateApi.create(values);
        message.success('템플릿이 생성되었습니다.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try { await templateApi.remove(id); message.success('삭제되었습니다.'); load(); }
    catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '템플릿명', dataIndex: 'template_name', key: 'name', ellipsis: true },
    { title: '유형', dataIndex: 'template_type', key: 'type', width: 80, align: 'center' as const,
      render: (v: string) => <Tag color={TYPE_COLORS[v]}>{v}</Tag> },
    { title: '제목', dataIndex: 'subject', key: 'subject', width: 200, ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '내용 미리보기', dataIndex: 'content', key: 'content', ellipsis: true,
      render: (v: string, r: any) => (
        <span style={{ color: '#888', cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); setPreviewItem(r); setPreviewOpen(true); }}>
          {v?.substring(0, 50)}{v?.length > 50 ? '...' : ''}
        </span>
      ) },
    { title: '생성일', dataIndex: 'created_at', key: 'created', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD') },
    { title: '', key: 'actions', width: 90, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.template_id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>새 템플릿</Button>
      </div>

      <Table dataSource={data} rowKey="template_id" loading={loading} size="small"
        scroll={{ x: 900, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        columns={columns} />

      <Modal title={editTarget ? '템플릿 수정' : '새 템플릿'} open={formOpen} width={520}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '생성'} cancelText="취소" confirmLoading={submitting}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="template_name" label="템플릿명" rules={[{ required: true, message: '템플릿명을 입력하세요' }]}>
            <Input placeholder="예: VIP 시즌 안내" />
          </Form.Item>
          <Form.Item name="template_type" label="유형" rules={[{ required: true }]}>
            <Select options={[
              { label: <><MessageOutlined /> SMS</>, value: 'SMS' },
              { label: <><MailOutlined /> EMAIL</>, value: 'EMAIL' },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.template_type !== cur.template_type}>
            {({ getFieldValue }) => getFieldValue('template_type') === 'EMAIL' ? (
              <Form.Item name="subject" label="이메일 제목">
                <Input placeholder="이메일 제목" />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Form.Item name="content" label="내용" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={6} placeholder="메시지 내용" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 미리보기 모달 */}
      <Modal
        title={previewItem?.template_name || '템플릿 미리보기'}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={[
          <Button key="edit" icon={<EditOutlined />} onClick={() => { setPreviewOpen(false); openForm(previewItem); }}>수정</Button>,
          <Button key="close" type="primary" onClick={() => setPreviewOpen(false)}>닫기</Button>,
        ]}
        width={520}
      >
        {previewItem && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Tag color={TYPE_COLORS[previewItem.template_type]}>{previewItem.template_type}</Tag>
              {previewItem.subject && <span style={{ marginLeft: 8, color: '#555' }}>제목: {previewItem.subject}</span>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', padding: 16, background: '#fafafa', borderRadius: 8, maxHeight: 400, overflow: 'auto', lineHeight: 1.7 }}>
              {previewItem.content}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
