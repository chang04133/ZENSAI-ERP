import { useEffect, useState } from 'react';
import { Table, Modal, Form, Button, Input, InputNumber, Select, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { sizeRunApi } from '../../modules/size-run/size-run.api';
import type { SizeRun, SizeRunDetail } from '../../../../shared/types/size-run';

const CATEGORY_OPTIONS = [
  { label: '상의', value: '상의' },
  { label: '하의', value: '하의' },
  { label: '아우터', value: '아우터' },
  { label: '원피스', value: '원피스' },
];

export default function SizeRunPage() {
  const [data, setData] = useState<SizeRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [details, setDetails] = useState<{ size: string; ratio: number }[]>([]);
  const [saving, setSaving] = useState(false);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRunId, setPreviewRunId] = useState<number | null>(null);
  const [previewQty, setPreviewQty] = useState<number>(100);
  const [previewResult, setPreviewResult] = useState<{ size: string; ratio: number; qty: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await sizeRunApi.list({ page: String(page), limit: '50' });
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const openCreateModal = () => {
    setEditingId(null);
    form.resetFields();
    setDetails([{ size: '', ratio: 1 }]);
    setModalOpen(true);
  };

  const openEditModal = (record: SizeRun) => {
    setEditingId(record.run_id);
    form.setFieldsValue({ run_name: record.run_name, category: record.category, memo: record.memo });
    setDetails(record.details?.map((d) => ({ size: d.size, ratio: d.ratio })) || [{ size: '', ratio: 1 }]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const validDetails = details.filter((d) => d.size.trim());
      if (validDetails.length === 0) { message.warning('사이즈를 1개 이상 입력해주세요.'); return; }
      setSaving(true);
      const body = { ...values, details: validDetails };
      if (editingId) {
        await sizeRunApi.update(editingId, body);
        message.success('수정되었습니다.');
      } else {
        await sizeRunApi.create(body);
        message.success('등록되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await sizeRunApi.remove(id);
      message.success('삭제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const addDetailRow = () => setDetails([...details, { size: '', ratio: 1 }]);
  const removeDetailRow = (idx: number) => setDetails(details.filter((_, i) => i !== idx));
  const updateDetail = (idx: number, field: 'size' | 'ratio', value: any) => {
    const next = [...details];
    next[idx] = { ...next[idx], [field]: value };
    setDetails(next);
  };

  const totalRatio = details.reduce((sum, d) => sum + (d.ratio || 0), 0);

  const openPreview = (record: SizeRun) => {
    setPreviewRunId(record.run_id);
    setPreviewQty(100);
    setPreviewResult([]);
    setPreviewOpen(true);
  };

  const handlePreview = async () => {
    if (!previewRunId || previewQty <= 0) return;
    setPreviewLoading(true);
    try {
      const result = await sizeRunApi.applyToQuantity(previewRunId, previewQty);
      setPreviewResult(result);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const columns = [
    { title: '런 이름', dataIndex: 'run_name', key: 'run_name', width: 180 },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 100, render: (v: string) => v || '-' },
    {
      title: '사이즈 비율', key: 'details', width: 300,
      render: (_: any, r: SizeRun) =>
        (r.details || []).map((d: SizeRunDetail) => (
          <Tag key={d.detail_id || d.size}>{d.size}: {d.ratio}</Tag>
        )),
    },
    {
      title: '상태', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '등록일', dataIndex: 'created_at', key: 'created_at', width: 110,
      render: (v: string) => v ? v.slice(0, 10) : '-',
    },
    {
      title: '관리', key: 'actions', width: 200,
      render: (_: any, record: SizeRun) => (
        <Space>
          <Button size="small" onClick={() => openPreview(record)}>수량 배분</Button>
          <Button size="small" onClick={() => openEditModal(record)}>수정</Button>
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(record.run_id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="사이즈 런 관리"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            사이즈 런 등록
          </Button>
        }
      />

      <Table
        columns={columns}
        dataSource={data}
        rowKey="run_id"
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

      {/* Create / Edit Modal */}
      <Modal
        title={editingId ? '사이즈 런 수정' : '사이즈 런 등록'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={editingId ? '수정' : '등록'}
        cancelText="취소"
        confirmLoading={saving}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="run_name" label="런 이름" rules={[{ required: true, message: '런 이름을 입력해주세요' }]}>
            <Input placeholder="예: 여성 상의 기본" />
          </Form.Item>
          <Form.Item name="category" label="카테고리">
            <Select placeholder="카테고리 선택" allowClear options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="메모 (선택)" />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>사이즈 비율</strong>
          <span>합계: <Tag color="blue">{totalRatio}</Tag></span>
        </div>
        <Table
          dataSource={details.map((d, i) => ({ ...d, _idx: i }))}
          rowKey="_idx"
          pagination={false}
          size="small"
          columns={[
            {
              title: '사이즈', dataIndex: 'size', width: 150,
              render: (_: any, _r: any, idx: number) => (
                <Input value={details[idx].size} onChange={(e) => updateDetail(idx, 'size', e.target.value)} placeholder="예: S, M, L" />
              ),
            },
            {
              title: '비율', dataIndex: 'ratio', width: 120,
              render: (_: any, _r: any, idx: number) => (
                <InputNumber value={details[idx].ratio} onChange={(v) => updateDetail(idx, 'ratio', v || 0)} min={0} style={{ width: '100%' }} />
              ),
            },
            {
              title: '', width: 50,
              render: (_: any, _r: any, idx: number) => details.length > 1 ? (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeDetailRow(idx)} />
              ) : null,
            },
          ]}
        />
        <Button type="dashed" block onClick={addDetailRow} icon={<PlusOutlined />} style={{ marginTop: 8 }}>
          사이즈 추가
        </Button>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title="수량 배분 미리보기"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={[<Button key="close" onClick={() => setPreviewOpen(false)}>닫기</Button>]}
        width={500}
      >
        <Space style={{ marginBottom: 16 }}>
          <span>총 수량:</span>
          <InputNumber value={previewQty} onChange={(v) => setPreviewQty(v || 0)} min={1} style={{ width: 120 }} />
          <Button type="primary" onClick={handlePreview} loading={previewLoading}>계산</Button>
        </Space>
        {previewResult.length > 0 && (
          <Table
            dataSource={previewResult}
            rowKey="size"
            pagination={false}
            size="small"
            columns={[
              { title: '사이즈', dataIndex: 'size', width: 100 },
              { title: '비율', dataIndex: 'ratio', width: 80 },
              { title: '배분 수량', dataIndex: 'qty', width: 100, render: (v: number) => <Tag color="blue">{v}</Tag> },
            ]}
            summary={(pageData) => {
              const totalQty = pageData.reduce((sum, r) => sum + r.qty, 0);
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2}><Tag color="green">{totalQty}</Tag></Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
}
