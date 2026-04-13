import { useEffect, useState, useCallback } from 'react';
import { Button, Card, Input, Modal, Table, Tag, message, Select, Space, Descriptions, Timeline, Form } from 'antd';
import { EyeOutlined, HistoryOutlined, EditOutlined } from '@ant-design/icons';
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

export default function WorkOrderPage() {
  const [data, setData] = useState<OsWorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [detailModal, setDetailModal] = useState<any>(null);
  const [versionModal, setVersionModal] = useState<{ woId: number; versions: OsWorkOrderVersion[] } | null>(null);
  const [editModal, setEditModal] = useState<number | null>(null);
  const [editForm] = Form.useForm();

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

  const openDetail = async (id: number) => {
    try {
      const item = await outsourceApi.getWorkOrder(id);
      setDetailModal(item);
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
      target_qty: wo.target_qty,
      unit_cost: wo.unit_cost,
      total_amount: wo.total_amount,
      memo: wo.memo,
    });
  };

  const handleEdit = async () => {
    if (!editModal) return;
    try {
      const values = await editForm.validateFields();
      let body: any = { ...values };
      if (values.spec_data) {
        try { body.spec_data = JSON.parse(values.spec_data); } catch { body.spec_data = undefined; }
      }
      await outsourceApi.updateWorkOrder(editModal, body);
      message.success('작업지시서가 수정되었습니다.');
      setEditModal(null);
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const columns = [
    { title: '번호', dataIndex: 'wo_no', width: 130 },
    { title: '브리프', dataIndex: 'brief_title', ellipsis: true },
    {
      title: '상태', dataIndex: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag>,
    },
    { title: '거래처', dataIndex: 'partner_name', width: 120, render: (v: string) => v || '-' },
    { title: '목표수량', dataIndex: 'target_qty', width: 90, align: 'right' as const, render: (v: number) => v?.toLocaleString() || '-' },
    { title: '총액', dataIndex: 'total_amount', width: 110, align: 'right' as const, render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '버전', dataIndex: 'current_version', width: 60, align: 'center' as const, render: (v: number) => `v${v}` },
    { title: '생성일', dataIndex: 'created_at', width: 110, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '관리', width: 200, fixed: 'right' as const,
      render: (_: any, r: OsWorkOrder) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.wo_id)}>상세</Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openVersions(r.wo_id)}>이력</Button>
          {!['COMPLETED', 'CANCELLED'].includes(r.status) && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>수정</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Card title="작업지시서 관리" size="small">
        <Space style={{ marginBottom: 12 }}>
          <Input.Search placeholder="검색..." allowClear onSearch={setSearch} style={{ width: 250 }} />
          <Select placeholder="상태" allowClear style={{ width: 120 }} value={statusFilter || undefined} onChange={(v) => setStatusFilter(v || '')}>
            {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
          </Select>
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
      <Modal title="작업지시서 상세" open={!!detailModal} onCancel={() => setDetailModal(null)} footer={null} width={700}>
        {detailModal && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="번호">{detailModal.wo_no}</Descriptions.Item>
              <Descriptions.Item label="상태"><Tag color={STATUS_MAP[detailModal.status]?.color}>{STATUS_MAP[detailModal.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="브리프">{detailModal.brief_title}</Descriptions.Item>
              <Descriptions.Item label="거래처">{detailModal.partner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="목표수량">{detailModal.target_qty?.toLocaleString() || '-'}</Descriptions.Item>
              <Descriptions.Item label="총액">{detailModal.total_amount ? `${Number(detailModal.total_amount).toLocaleString()}원` : '-'}</Descriptions.Item>
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

      {/* 수정 모달 */}
      <Modal title="작업지시서 수정" open={!!editModal} onOk={handleEdit} onCancel={() => setEditModal(null)} okText="저장" width={560}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="spec_data" label="스펙 데이터 (JSON)">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="change_summary" label="변경 사항 요약">
            <Input />
          </Form.Item>
          <Form.Item name="target_qty" label="목표수량">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="unit_cost" label="단가">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="total_amount" label="총액">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
