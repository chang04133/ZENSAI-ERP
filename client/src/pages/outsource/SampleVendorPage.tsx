import { useEffect, useState } from 'react';
import { Button, Card, Input, Modal, Table, Tag, message, Form, Select, Space, Tabs, DatePicker, List, Avatar, Typography } from 'antd';
import { PlusOutlined, PhoneOutlined, MailOutlined, TeamOutlined, WarningOutlined, FileTextOutlined } from '@ant-design/icons';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsWorkOrder, OsSample, OsVendorLog, OsVendorLogType } from '../../../../shared/types/outsource';
import dayjs from 'dayjs';

const { Text } = Typography;

const SAMPLE_TYPE_MAP: Record<string, string> = { PROTO: '프로토', FITTING: '피팅', PP: 'PP', PRODUCTION: '양산' };
const SAMPLE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '대기', color: 'default' },
  IN_PROGRESS: { label: '진행', color: 'processing' },
  APPROVED: { label: '승인', color: 'success' },
  REJECTED: { label: '반려', color: 'error' },
};
const LOG_TYPE_ICONS: Record<OsVendorLogType, any> = {
  NOTE: <FileTextOutlined />,
  CALL: <PhoneOutlined />,
  EMAIL: <MailOutlined />,
  MEETING: <TeamOutlined />,
  ISSUE: <WarningOutlined style={{ color: '#fa541c' }} />,
};

export default function SampleVendorPage() {
  const [workOrders, setWorkOrders] = useState<OsWorkOrder[]>([]);
  const [selectedWo, setSelectedWo] = useState<number | null>(null);
  const [samples, setSamples] = useState<OsSample[]>([]);
  const [vendorLogs, setVendorLogs] = useState<OsVendorLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [sampleModal, setSampleModal] = useState(false);
  const [logModal, setLogModal] = useState(false);
  const [sampleForm] = Form.useForm();
  const [logForm] = Form.useForm();

  useEffect(() => {
    (async () => {
      try {
        const res = await outsourceApi.listWorkOrders({ limit: '100' });
        setWorkOrders(res.data);
      } catch (e: any) { message.error(e.message); }
    })();
  }, []);

  const loadWoDetail = async (woId: number) => {
    setSelectedWo(woId);
    setLoading(true);
    try {
      const [wo, logs] = await Promise.all([
        outsourceApi.getWorkOrder(woId),
        outsourceApi.listVendorLogs(woId),
      ]);
      setSamples(wo.samples || []);
      setVendorLogs(logs);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateSample = async () => {
    if (!selectedWo) return;
    try {
      const values = await sampleForm.validateFields();
      const body = {
        ...values,
        send_date: values.send_date?.format('YYYY-MM-DD'),
        receive_date: values.receive_date?.format('YYYY-MM-DD'),
      };
      await outsourceApi.createSample(selectedWo, body);
      message.success('샘플이 등록되었습니다.');
      setSampleModal(false);
      sampleForm.resetFields();
      loadWoDetail(selectedWo);
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const handleUpdateSampleStatus = async (id: number, status: string) => {
    try {
      await outsourceApi.updateSample(id, { status } as any);
      message.success('상태가 변경되었습니다.');
      if (selectedWo) loadWoDetail(selectedWo);
    } catch (e: any) { message.error(e.message); }
  };

  const handleCreateLog = async () => {
    if (!selectedWo) return;
    try {
      const values = await logForm.validateFields();
      await outsourceApi.createVendorLog(selectedWo, values);
      message.success('로그가 등록되었습니다.');
      setLogModal(false);
      logForm.resetFields();
      loadWoDetail(selectedWo);
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const sampleColumns = [
    { title: '유형', dataIndex: 'sample_type', width: 80, render: (v: string) => SAMPLE_TYPE_MAP[v] || v },
    {
      title: '상태', dataIndex: 'status', width: 80,
      render: (s: string) => <Tag color={SAMPLE_STATUS_MAP[s]?.color}>{SAMPLE_STATUS_MAP[s]?.label || s}</Tag>,
    },
    { title: '업체', dataIndex: 'vendor_name', width: 120 },
    { title: '연락처', dataIndex: 'vendor_contact', width: 130 },
    { title: '발송일', dataIndex: 'send_date', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '수령일', dataIndex: 'receive_date', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '메모', dataIndex: 'memo', ellipsis: true },
    {
      title: '관리', width: 180,
      render: (_: any, r: OsSample) => r.status === 'PENDING' || r.status === 'IN_PROGRESS' ? (
        <Space size="small">
          {r.status === 'PENDING' && <Button size="small" onClick={() => handleUpdateSampleStatus(r.sample_id, 'IN_PROGRESS')}>진행</Button>}
          <Button size="small" type="primary" onClick={() => handleUpdateSampleStatus(r.sample_id, 'APPROVED')}>승인</Button>
          <Button size="small" danger onClick={() => handleUpdateSampleStatus(r.sample_id, 'REJECTED')}>반려</Button>
        </Space>
      ) : null,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Card title="샘플 + 업체 관리" size="small">
        <Space style={{ marginBottom: 12 }}>
          <Select
            placeholder="작업지시서 선택"
            showSearch
            style={{ width: 350 }}
            optionFilterProp="label"
            options={workOrders.map((w) => ({ value: w.wo_id, label: `${w.wo_no} — ${w.brief_title || ''}` }))}
            onChange={(v) => loadWoDetail(v)}
          />
        </Space>

        {selectedWo && (
          <Tabs
            defaultActiveKey="samples"
            items={[
              {
                key: 'samples',
                label: `샘플 (${samples.length})`,
                children: (
                  <>
                    <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => { sampleForm.resetFields(); setSampleModal(true); }} style={{ marginBottom: 8 }}>샘플 등록</Button>
                    <Table
                      dataSource={samples}
                      columns={sampleColumns}
                      rowKey="sample_id"
                      loading={loading}
                      size="small"
                      scroll={{ x: 900 }}
                      pagination={false}
                    />
                  </>
                ),
              },
              {
                key: 'vendor-logs',
                label: `업체 로그 (${vendorLogs.length})`,
                children: (
                  <>
                    <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => { logForm.resetFields(); setLogModal(true); }} style={{ marginBottom: 8 }}>로그 등록</Button>
                    <List
                      loading={loading}
                      dataSource={vendorLogs}
                      renderItem={(item) => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={<Avatar icon={LOG_TYPE_ICONS[item.log_type] || <FileTextOutlined />} />}
                            title={<>{item.vendor_name || '업체'} <Tag>{item.log_type}</Tag> <Text type="secondary">{dayjs(item.created_at).format('MM-DD HH:mm')}</Text></>}
                            description={item.content}
                          />
                        </List.Item>
                      )}
                    />
                  </>
                ),
              },
            ]}
          />
        )}

        {!selectedWo && <Text type="secondary">작업지시서를 선택하세요.</Text>}
      </Card>

      {/* 샘플 등록 모달 */}
      <Modal title="샘플 등록" open={sampleModal} onOk={handleCreateSample} onCancel={() => setSampleModal(false)} okText="등록">
        <Form form={sampleForm} layout="vertical">
          <Form.Item name="sample_type" label="샘플 유형" rules={[{ required: true }]}>
            <Select options={Object.entries(SAMPLE_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="vendor_name" label="업체명"><Input /></Form.Item>
          <Form.Item name="vendor_contact" label="연락처"><Input /></Form.Item>
          <Space>
            <Form.Item name="send_date" label="발송일"><DatePicker /></Form.Item>
            <Form.Item name="receive_date" label="수령일"><DatePicker /></Form.Item>
          </Space>
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 로그 등록 모달 */}
      <Modal title="업체 로그 등록" open={logModal} onOk={handleCreateLog} onCancel={() => setLogModal(false)} okText="등록">
        <Form form={logForm} layout="vertical">
          <Form.Item name="log_type" label="유형" initialValue="NOTE">
            <Select options={[
              { value: 'NOTE', label: '메모' }, { value: 'CALL', label: '전화' },
              { value: 'EMAIL', label: '이메일' }, { value: 'MEETING', label: '미팅' },
              { value: 'ISSUE', label: '이슈' },
            ]} />
          </Form.Item>
          <Form.Item name="vendor_name" label="업체명"><Input /></Form.Item>
          <Form.Item name="content" label="내용" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
