import { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Modal, Form, Input, Select, Upload, Image, Drawer, message, Space, Spin } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, UploadOutlined, PictureOutlined, EyeOutlined, DeleteOutlined, FileOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import PageHeader from '../../components/PageHeader';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsDesignSubmission } from '../../../../shared/types/outsource';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '심사대기', color: 'warning' },
  APPROVED: { label: '승인', color: 'success' },
  REJECTED: { label: '반려', color: 'error' },
};

interface FileItem {
  filename: string;
  url: string;
  size: number;
  isImage: boolean;
  uploadedAt: string;
}

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
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // 상세 Drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<OsDesignSubmission | null>(null);
  const [detailFiles, setDetailFiles] = useState<FileItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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
      const item = await outsourceApi.createSubmission(values);

      // 파일 업로드
      const rawFiles = fileList.map(f => f.originFileObj).filter(Boolean) as File[];
      if (rawFiles.length > 0) {
        await outsourceApi.uploadSubmissionFiles(item.submission_id, rawFiles);
      }

      message.success('디자인 시안이 제출되었습니다.');
      setSubmitOpen(false);
      form.resetFields();
      setFileList([]);
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

  const openDetail = async (record: OsDesignSubmission) => {
    setDetailItem(record);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const files = await outsourceApi.listSubmissionFiles(record.submission_id);
      setDetailFiles(files);
    } catch { setDetailFiles([]); }
    finally { setDetailLoading(false); }
  };

  const handleDeleteFile = async (filename: string) => {
    try {
      await outsourceApi.deleteFile(filename);
      message.success('파일이 삭제되었습니다.');
      setDetailFiles(prev => prev.filter(f => f.filename !== filename));
    } catch (e: any) { message.error(e.message); }
  };

  const handleDetailUpload = async (files: File[]) => {
    if (!detailItem) return;
    try {
      await outsourceApi.uploadSubmissionFiles(detailItem.submission_id, files);
      message.success('파일이 업로드되었습니다.');
      const updated = await outsourceApi.listSubmissionFiles(detailItem.submission_id);
      setDetailFiles(updated);
    } catch (e: any) { message.error(e.message); }
  };

  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1048576).toFixed(1)}MB`;

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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setFileList([]); setSubmitOpen(true); }}>
          시안 제출
        </Button>
      </div>

      <Table
        dataSource={data} rowKey="submission_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={[
          { title: '시안번호', dataIndex: 'submission_no', width: 130,
            render: (v: string, r: OsDesignSubmission) => (
              <a onClick={() => openDetail(r)} style={{ fontWeight: 500 }}>{v}</a>
            ),
          },
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
          { title: '액션', key: 'action', width: 180, render: (_: any, r: OsDesignSubmission) => (
            <Space size={4}>
              <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>상세</Button>
              {r.status === 'PENDING' && (
                <>
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                    onClick={() => Modal.confirm({
                      title: '디자인 승인', content: '승인 시 작업지시서와 착수금(P1) 결제가 자동 생성됩니다.',
                      okText: '승인', cancelText: '취소',
                      onOk: () => handleApprove(r.submission_id),
                    })}>승인</Button>
                  <Button size="small" danger icon={<CloseCircleOutlined />}
                    onClick={() => { setRejectTarget(r.submission_id); setRejectReason(''); setRejectOpen(true); }}>반려</Button>
                </>
              )}
            </Space>
          )},
        ]}
      />

      {/* 시안 제출 모달 */}
      <Modal title="디자인 시안 제출" open={submitOpen} onOk={handleSubmit}
        onCancel={() => setSubmitOpen(false)} confirmLoading={saving} width={600} okText="제출">
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="brief_id" label="브리프 ID" rules={[{ required: true }]}>
            <Input type="number" placeholder="연결할 브리프 ID" />
          </Form.Item>
          <Form.Item name="material_research" label="소재 리서치">
            <Input.TextArea rows={2} placeholder="소재/원단 조사 내용" />
          </Form.Item>
          <Form.Item name="work_order_draft" label="작업지시서 초안 (JSON)">
            <Input.TextArea rows={3} placeholder='{"fabric": "코튼", "color": ["블랙", "네이비"]}' />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item label="디자인 이미지 / 첨부파일">
            <Upload
              multiple
              listType="picture-card"
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
              beforeUpload={() => false}
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.xlsx,.doc,.docx,.zip"
            >
              {fileList.length >= 10 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 4, fontSize: 12 }}>업로드</div>
                </div>
              )}
            </Upload>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              이미지, PDF, 문서, ZIP 파일 (최대 10개, 각 10MB)
            </div>
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

      {/* 상세 Drawer */}
      <Drawer
        title={detailItem ? `${detailItem.submission_no} (v${detailItem.version})` : '시안 상세'}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailItem(null); setDetailFiles([]); }}
        width={640}
      >
        {detailItem && (
          <div>
            {/* 기본 정보 */}
            <Card size="small" title="기본 정보" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 12px', fontSize: 13 }}>
                <span style={{ color: '#888' }}>브리프</span>
                <span style={{ fontWeight: 500 }}>{detailItem.brief_title || `#${detailItem.brief_id}`}</span>
                <span style={{ color: '#888' }}>상태</span>
                <span><Tag color={STATUS_MAP[detailItem.status]?.color}>{STATUS_MAP[detailItem.status]?.label}</Tag></span>
                <span style={{ color: '#888' }}>제출일</span>
                <span>{detailItem.submitted_at ? new Date(detailItem.submitted_at).toLocaleDateString('ko-KR') : '-'}</span>
                <span style={{ color: '#888' }}>심사기한</span>
                <span>{detailItem.review_deadline ? new Date(detailItem.review_deadline).toLocaleDateString('ko-KR') : '-'}</span>
                {detailItem.material_research && (
                  <>
                    <span style={{ color: '#888' }}>소재 리서치</span>
                    <span>{detailItem.material_research}</span>
                  </>
                )}
                {detailItem.memo && (
                  <>
                    <span style={{ color: '#888' }}>메모</span>
                    <span>{detailItem.memo}</span>
                  </>
                )}
                {detailItem.reject_reason && (
                  <>
                    <span style={{ color: '#ff4d4f' }}>반려사유</span>
                    <span style={{ color: '#ff4d4f' }}>{detailItem.reject_reason}</span>
                  </>
                )}
              </div>
            </Card>

            {/* 디자인 이미지 / 첨부파일 */}
            <Card
              size="small"
              title={<span><PictureOutlined style={{ marginRight: 6 }} />디자인 이미지 / 첨부파일</span>}
              extra={
                detailItem.status === 'PENDING' && (
                  <Upload
                    multiple
                    showUploadList={false}
                    beforeUpload={(_, fl) => {
                      handleDetailUpload(fl as unknown as File[]);
                      return false;
                    }}
                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.xlsx,.doc,.docx,.zip"
                  >
                    <Button size="small" icon={<UploadOutlined />}>추가 업로드</Button>
                  </Upload>
                )
              }
            >
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
              ) : detailFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#ccc' }}>
                  <PictureOutlined style={{ fontSize: 32 }} />
                  <div style={{ marginTop: 8, fontSize: 13 }}>첨부된 파일이 없습니다</div>
                </div>
              ) : (
                <>
                  {/* 이미지 갤러리 */}
                  {detailFiles.filter(f => f.isImage).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>이미지</div>
                      <Image.PreviewGroup>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {detailFiles.filter(f => f.isImage).map(f => (
                            <div key={f.filename} style={{ position: 'relative' }}>
                              <Image
                                src={f.url}
                                width={120}
                                height={120}
                                style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
                              />
                              {detailItem.status === 'PENDING' && (
                                <Button
                                  size="small" danger type="text" icon={<DeleteOutlined />}
                                  style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,255,255,0.85)' }}
                                  onClick={() => Modal.confirm({
                                    title: '파일 삭제', content: '이 이미지를 삭제하시겠습니까?',
                                    okText: '삭제', okButtonProps: { danger: true },
                                    onOk: () => handleDeleteFile(f.filename),
                                  })}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </Image.PreviewGroup>
                    </div>
                  )}

                  {/* 비이미지 파일 목록 */}
                  {detailFiles.filter(f => !f.isImage).length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>첨부파일</div>
                      {detailFiles.filter(f => !f.isImage).map(f => (
                        <div key={f.filename} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                          <FileOutlined style={{ color: '#1890ff' }} />
                          <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13 }}>
                            {f.filename.replace(/^ds\d+_\d+_/, '')}
                          </a>
                          <span style={{ fontSize: 11, color: '#999' }}>{fmtSize(f.size)}</span>
                          {detailItem.status === 'PENDING' && (
                            <Button size="small" danger type="text" icon={<DeleteOutlined />}
                              onClick={() => Modal.confirm({
                                title: '파일 삭제', content: '이 파일을 삭제하시겠습니까?',
                                okText: '삭제', okButtonProps: { danger: true },
                                onOk: () => handleDeleteFile(f.filename),
                              })}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
