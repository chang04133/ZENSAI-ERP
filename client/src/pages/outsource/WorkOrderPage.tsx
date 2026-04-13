import { useEffect, useState, useCallback } from 'react';
import {
  Button, Card, Input, Modal, Table, Tag, message, Select, Space,
  Descriptions, Timeline, Form, Upload, Image, Popconfirm, Spin, Empty,
} from 'antd';
import {
  EyeOutlined, HistoryOutlined, EditOutlined, PlusOutlined,
  UploadOutlined, DeleteOutlined, FileOutlined, FilePdfOutlined,
  FileExcelOutlined, FileWordOutlined, FileZipOutlined, PaperClipOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsWorkOrder, OsWorkOrderVersion } from '../../../../shared/types/outsource';
import dayjs from 'dayjs';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: '확정', color: 'blue' },
  IN_PRODUCTION: { label: '생산중', color: 'processing' },
  QC_1ST: { label: '1차QC', color: 'orange' },
  QC_FINAL: { label: '최종QC', color: 'purple' },
  COMPLETED: { label: '완료', color: 'success' },
  CANCELLED: { label: '취소', color: 'error' },
};

interface WoFile {
  filename: string;
  url: string;
  size: number;
  isImage: boolean;
  uploadedAt: string;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
    case 'xls': case 'xlsx': return <FileExcelOutlined style={{ color: '#52c41a' }} />;
    case 'doc': case 'docx': return <FileWordOutlined style={{ color: '#1677ff' }} />;
    case 'zip': return <FileZipOutlined style={{ color: '#faad14' }} />;
    default: return <FileOutlined />;
  }
};

export default function WorkOrderPage() {
  const [data, setData] = useState<OsWorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [detailModal, setDetailModal] = useState<any>(null);
  const [versionModal, setVersionModal] = useState<{ woId: number; versions: OsWorkOrderVersion[] } | null>(null);
  const [editModal, setEditModal] = useState<number | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();

  // 파일 관련 state
  const [woFiles, setWoFiles] = useState<WoFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await outsourceApi.listWorkOrders(params);
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // ── 파일 로드 ──
  const loadFiles = async (woId: number) => {
    setFilesLoading(true);
    try {
      const files = await outsourceApi.listFiles(woId);
      setWoFiles(files);
    } catch { setWoFiles([]); }
    finally { setFilesLoading(false); }
  };

  const openDetail = async (id: number) => {
    try {
      const item = await outsourceApi.getWorkOrder(id);
      setDetailModal(item);
      loadFiles(id);
    } catch (e: any) { message.error(e.message); }
  };

  const openVersions = async (woId: number) => {
    try {
      const versions = await outsourceApi.listWorkOrderVersions(woId);
      setVersionModal({ woId, versions });
    } catch (e: any) { message.error(e.message); }
  };

  const openEdit = (wo: OsWorkOrder) => {
    setEditModal(wo.wo_id);
    editForm.setFieldsValue({
      spec_data: JSON.stringify({}),
      change_summary: '',
      memo: wo.memo,
    });
    loadFiles(wo.wo_id);
  };

  const handleEdit = async () => {
    if (!editModal) return;
    try {
      const values = await editForm.validateFields();
      const body: any = { ...values };
      if (values.spec_data) {
        try { body.spec_data = JSON.parse(values.spec_data); } catch { body.spec_data = undefined; }
      }
      await outsourceApi.updateWorkOrder(editModal, body);
      message.success('작업지시서가 수정되었습니다.');
      setEditModal(null);
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      if (values.spec_data) {
        try { values.spec_data = JSON.parse(values.spec_data); } catch { delete values.spec_data; }
      }
      const res = await outsourceApi.createWorkOrder(values);
      message.success('작업지시서가 등록되었습니다.');
      setCreateModal(false);
      createForm.resetFields();
      load();
      // 생성 후 상세 모달 열기 → 이미지 업로드 가능
      if (res?.wo_id) openDetail(res.wo_id);
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  // ── 파일 업로드 ──
  const handleFileUpload = async (woId: number, file: File) => {
    setUploading(true);
    try {
      await outsourceApi.uploadFiles(woId, [file]);
      message.success(`${file.name} 업로드 완료`);
      loadFiles(woId);
    } catch (e: any) { message.error(e.message); }
    finally { setUploading(false); }
  };

  const handleFileDelete = async (filename: string, woId: number) => {
    try {
      await outsourceApi.deleteFile(filename);
      message.success('파일이 삭제되었습니다.');
      loadFiles(woId);
    } catch (e: any) { message.error(e.message); }
  };

  // ── 파일 섹션 컴포넌트 ──
  const FileSection = ({ woId, readOnly = false }: { woId: number; readOnly?: boolean }) => (
    <Card
      title={<span><PaperClipOutlined style={{ marginRight: 6 }} />첨부파일 / 이미지</span>}
      size="small"
      style={{ marginTop: 12, borderRadius: 8 }}
      extra={!readOnly && (
        <Upload
          beforeUpload={(file) => { handleFileUpload(woId, file as any); return false; }}
          showUploadList={false}
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.xlsx,.xls,.doc,.docx,.zip"
          multiple
        >
          <Button size="small" icon={<UploadOutlined />} loading={uploading}>파일/이미지 추가</Button>
        </Upload>
      )}
    >
      {filesLoading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
      ) : woFiles.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={readOnly ? '첨부파일 없음' : '이미지나 파일을 업로드하세요'} style={{ margin: '12px 0' }} />
      ) : (
        <>
          {/* 이미지 미리보기 */}
          {woFiles.some(f => f.isImage) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {woFiles.filter(f => f.isImage).map(f => (
                <div key={f.filename} style={{ position: 'relative' }}>
                  <Image
                    src={f.url}
                    width={100} height={100}
                    style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
                    preview={{
                      mask: <EyeOutlined />,
                    }}
                  />
                  {!readOnly && (
                    <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleFileDelete(f.filename, woId)} okText="삭제" cancelText="취소">
                      <Button
                        size="small" danger type="text" icon={<DeleteOutlined />}
                        style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,255,255,0.85)', borderRadius: 4, width: 22, height: 22, padding: 0 }}
                      />
                    </Popconfirm>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* 비이미지 파일 목록 */}
          {woFiles.filter(f => !f.isImage).map(f => (
            <div key={f.filename} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
              {getFileIcon(f.filename)}
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.filename.replace(/^wo\d+_\d+_/, '')}
              </a>
              <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>{fmtSize(f.size)}</span>
              <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>{dayjs(f.uploadedAt).format('MM.DD')}</span>
              {!readOnly && (
                <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleFileDelete(f.filename, woId)} okText="삭제" cancelText="취소">
                  <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </div>
          ))}
        </>
      )}
    </Card>
  );

  const columns = [
    { title: '번호', dataIndex: 'wo_no', width: 130 },
    { title: '브리프', dataIndex: 'brief_title', ellipsis: true },
    {
      title: '상태', dataIndex: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag>,
    },
    { title: '거래처', dataIndex: 'partner_name', width: 120, render: (v: string) => v || '-' },
    { title: '버전', dataIndex: 'current_version', width: 60, align: 'center' as const, render: (v: number) => `v${v}` },
    { title: '생성일', dataIndex: 'created_at', width: 110, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '관리', width: 200, fixed: 'right' as const,
      render: (_: any, r: OsWorkOrder) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.wo_id)}>상세</Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openVersions(r.wo_id)}>이력</Button>
          {!['COMPLETED', 'CANCELLED'].includes(r.status) && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>수정</Button>
              <Button size="small" icon={<PictureOutlined />} onClick={() => openDetail(r.wo_id)}>이미지</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Card title="작업지시서 관리" size="small">
        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input.Search placeholder="검색..." allowClear onSearch={setSearch} style={{ width: 250 }} />
            <Select placeholder="상태" allowClear style={{ width: 120 }} value={statusFilter || undefined} onChange={(v) => setStatusFilter(v || '')}>
              {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
            </Select>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateModal(true); }}>작업지시서 등록</Button>
        </Space>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="wo_id"
          loading={loading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
          pagination={{ pageSize: 50, total, showTotal: (t) => `총 ${t}건` }}
        />
      </Card>

      {/* 상세 모달 */}
      <Modal title="작업지시서 상세" open={!!detailModal} onCancel={() => { setDetailModal(null); setWoFiles([]); }} footer={null} width={720}>
        {detailModal && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="번호">{detailModal.wo_no}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_MAP[detailModal.status]?.color}>{STATUS_MAP[detailModal.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="브리프">{detailModal.brief_title}</Descriptions.Item>
              <Descriptions.Item label="거래처">{detailModal.partner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="버전">v{detailModal.current_version}</Descriptions.Item>
              <Descriptions.Item label="메모">{detailModal.memo || '-'}</Descriptions.Item>
            </Descriptions>
            {detailModal.latest_spec && (
              <Card title="최신 스펙 (JSON)" size="small" style={{ marginTop: 12 }}>
                <pre style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                  {JSON.stringify(detailModal.latest_spec.spec_data, null, 2)}
                </pre>
              </Card>
            )}
            {detailModal.samples?.length > 0 && (
              <Card title="샘플" size="small" style={{ marginTop: 12 }}>
                <Table
                  dataSource={detailModal.samples}
                  columns={[
                    { title: '유형', dataIndex: 'sample_type' },
                    { title: '상태', dataIndex: 'status' },
                    { title: '업체', dataIndex: 'vendor_name' },
                    { title: '발송일', dataIndex: 'send_date', render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
                  ]}
                  rowKey="sample_id"
                  size="small"
                  pagination={false}
                />
              </Card>
            )}
            {/* 첨부파일/이미지 */}
            <FileSection woId={detailModal.wo_id} readOnly={['COMPLETED', 'CANCELLED'].includes(detailModal.status)} />
          </>
        )}
      </Modal>

      {/* 버전 이력 모달 */}
      <Modal title="버전 이력" open={!!versionModal} onCancel={() => setVersionModal(null)} footer={null} width={500}>
        {versionModal && (
          <Timeline
            items={versionModal.versions.map((v) => ({
              children: (
                <div>
                  <b>v{v.version_no}</b> — {dayjs(v.created_at).format('YYYY-MM-DD HH:mm')}
                  <br />{v.change_summary || '변경사항 없음'}
                  <br /><small>작성: {v.created_by}</small>
                </div>
              ),
            }))}
          />
        )}
      </Modal>

      {/* 생성 모달 */}
      <Modal title="작업지시서 등록" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="등록" width={560}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="partner_code" label="거래처 코드">
            <Input placeholder="예: SF001" />
          </Form.Item>
          <Form.Item name="spec_data" label="스펙 데이터 (JSON)">
            <Input.TextArea rows={3} placeholder='{"fabric": "코튼", "color": ["블랙"]}' />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        <div style={{ background: '#f6f8fa', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#666' }}>
          <PictureOutlined style={{ marginRight: 6 }} />
          등록 후 상세화면에서 이미지/파일을 첨부할 수 있습니다.
        </div>
      </Modal>

      {/* 수정 모달 */}
      <Modal
        title="작업지시서 수정"
        open={!!editModal}
        onOk={handleEdit}
        onCancel={() => { setEditModal(null); setWoFiles([]); }}
        okText="저장"
        width={640}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="spec_data" label="스펙 데이터 (JSON)">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="change_summary" label="변경 사항 요약">
            <Input />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        {/* 수정 모달에서도 파일/이미지 관리 가능 */}
        {editModal && <FileSection woId={editModal} />}
      </Modal>

      {/* 이미지 프리뷰 */}
      {previewImage && (
        <Image
          style={{ display: 'none' }}
          preview={{
            visible: true,
            src: previewImage,
            onVisibleChange: (v) => { if (!v) setPreviewImage(null); },
          }}
        />
      )}
    </div>
  );
}
