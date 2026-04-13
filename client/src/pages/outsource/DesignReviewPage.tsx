import { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Modal, Form, Input, Select, message, Space } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsDesignSubmission } from '../../../../shared/types/outsource';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '심사대기', color: 'warning' },
  APPROVED: { label: '승인', color: 'success' },
  REJECTED: { label: '반려', color: 'error' },
};

export default function DesignReviewPage() {
  const [data, setData] = useState<OsDesignSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      const res = await outsourceApi.listSubmissions(params);
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      await outsourceApi.createSubmission(values);
      message.success('디자인 시안이 제출되었습니다.');
      setSubmitOpen(false);
      form.resetFields();
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id: number) => {
    try {
      await outsourceApi.reviewSubmission(id, 'APPROVED');
      message.success('디자인이 승인되었습니다. 작업지시서가 자동 생성됩니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      setSaving(true);
      await outsourceApi.reviewSubmission(rejectTarget, 'REJECTED', rejectReason);
      message.success('디자인이 반려되었습니다.');
      setRejectOpen(false);
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="디자인 심사" />

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { key: '', label: '전체' },
          { key: 'PENDING', label: '심사대기' },
          { key: 'APPROVED', label: '승인' },
          { key: 'REJECTED', label: '반려' },
        ].map(f => (
          <Tag
            key={f.key}
            color={statusFilter === f.key ? 'blue' : undefined}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            style={{ cursor: 'pointer', padding: '4px 12px' }}
          >
            {f.label}
          </Tag>
        ))}
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setSubmitOpen(true); }}>
          시안 제출
        </Button>
      </div>

      <Table
        dataSource={data} rowKey="submission_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={[
          { title: '시안번호', dataIndex: 'submission_no', width: 130 },
          { title: '브리프', dataIndex: 'brief_title', ellipsis: true },
          { title: '버전', dataIndex: 'version', width: 60, align: 'center' as const, render: (v: number) => `v${v}` },
          { title: '소재리서치', dataIndex: 'material_research', width: 120, ellipsis: true, render: (v: string) => v || '-' },
          { title: '메모', dataIndex: 'memo', ellipsis: true, render: (v: string) => v || '-' },
          { title: '제출일', dataIndex: 'submitted_at', width: 100,
            render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
          { title: '심사기한', dataIndex: 'review_deadline', width: 100,
            render: (v: string) => {
              if (!v) return '-';
              const d = new Date(v);
              const overdue = d < new Date();
              return <span style={{ color: overdue ? '#ff4d4f' : undefined, fontWeight: overdue ? 600 : 400 }}>{d.toLocaleDateString('ko-KR')}</span>;
            }},
          { title: '상태', dataIndex: 'status', width: 90,
            render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag> },
          { title: '반려사유', dataIndex: 'reject_reason', width: 120, ellipsis: true, render: (v: string) => v || '-' },
          { title: '액션', key: 'action', width: 160, render: (_: any, r: OsDesignSubmission) => (
            r.status === 'PENDING' ? (
              <Space size={4}>
                <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                  onClick={() => Modal.confirm({
                    title: '디자인 승인', content: '승인 시 작업지시서와 착수금(P1) 결제가 자동 생성됩니다.',
                    okText: '승인', cancelText: '취소',
                    onOk: () => handleApprove(r.submission_id),
                  })}>승인</Button>
                <Button size="small" danger icon={<CloseCircleOutlined />}
                  onClick={() => { setRejectTarget(r.submission_id); setRejectReason(''); setRejectOpen(true); }}>반려</Button>
              </Space>
            ) : null
          )},
        ]}
      />

      {/* 시안 제출 모달 */}
      <Modal title="디자인 시안 제출" open={submitOpen} onOk={handleSubmit}
        onCancel={() => setSubmitOpen(false)} confirmLoading={saving} width={560} okText="제출">
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="brief_id" label="브리프 ID" rules={[{ required: true }]}>
            <Input type="number" placeholder="연결할 브리프 ID" />
          </Form.Item>
          <Form.Item name="material_research" label="소재 리서치">
            <Input.TextArea rows={2} placeholder="소재/원단 조사 내용" />
          </Form.Item>
          <Form.Item name="design_mockup" label="디자인 목업 (URL/경로)">
            <Input placeholder="이미지 URL 또는 파일 경로 (JSON 배열)" />
          </Form.Item>
          <Form.Item name="work_order_draft" label="작업지시서 초안 (JSON)">
            <Input.TextArea rows={3} placeholder='{"fabric": "코튼", "color": ["블랙", "네이비"]}' />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 반려 사유 모달 */}
      <Modal title="디자인 반려" open={rejectOpen} onOk={handleReject}
        onCancel={() => setRejectOpen(false)} confirmLoading={saving} okText="반려" okButtonProps={{ danger: true }}>
        <div style={{ marginBottom: 8 }}>반려 사유를 입력해주세요:</div>
        <Input.TextArea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
          placeholder="디자인 수정 방향, 부족한 부분 등" />
      </Modal>
    </div>
  );
}
