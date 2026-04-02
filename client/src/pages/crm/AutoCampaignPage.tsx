import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, TimePicker, message, Tag, Space, Popconfirm, Card, Row, Col, Empty, Tooltip } from 'antd';
import { PlusOutlined, PlayCircleOutlined, DeleteOutlined, EditOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { autoCampaignApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const TRIGGER_OPTIONS = [
  { label: '생일', value: 'BIRTHDAY' },
  { label: '구매 기념일', value: 'ANNIVERSARY' },
  { label: '휴면 경고', value: 'DORMANT_ALERT' },
];

const TYPE_OPTIONS = [
  { label: 'SMS', value: 'SMS' },
  { label: '이메일', value: 'EMAIL' },
  { label: '카카오 알림톡', value: 'KAKAO' },
];

const TRIGGER_COLORS: Record<string, string> = { BIRTHDAY: 'magenta', ANNIVERSARY: 'purple', DORMANT_ALERT: 'orange' };
const TRIGGER_LABELS: Record<string, string> = { BIRTHDAY: '생일', ANNIVERSARY: '기념일', DORMANT_ALERT: '휴면경고' };

export default function AutoCampaignPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ([ROLES.ADMIN, ROLES.SYS_ADMIN] as string[]).includes(user?.role || '');
  const [data, setData] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const campaigns = await autoCampaignApi.list();
      setData(campaigns || []);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, []);

  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const result = await autoCampaignApi.history({ page: String(historyPage), limit: '50' });
      setHistory(result.data || []);
      setHistoryTotal(result.total || 0);
    } catch (e: any) { message.error(e.message || '이력 조회 실패'); }
    finally { setHistoryLoading(false); }
  }, [historyPage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        send_time: record.send_time ? dayjs(record.send_time, 'HH:mm:ss') : dayjs('09:00', 'HH:mm'),
      });
    } else {
      form.setFieldsValue({ campaign_type: 'SMS', trigger_type: 'BIRTHDAY', is_active: true, send_time: dayjs('09:00', 'HH:mm') });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        ...values,
        send_time: values.send_time ? values.send_time.format('HH:mm:ss') : '09:00:00',
      };
      if (editTarget) {
        await autoCampaignApi.update(editTarget.auto_campaign_id, payload);
        message.success('수정되었습니다.');
      } else {
        await autoCampaignApi.create(payload);
        message.success('등록되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await autoCampaignApi.remove(id);
      message.success('삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleExecute = async () => {
    try {
      const result = await autoCampaignApi.execute();
      message.success(`수동 실행 완료: ${result.data?.totalSent || 0}건 발송`);
      loadHistory();
    } catch (e: any) { message.error(e.message); }
  };

  const handleToggle = async (record: any) => {
    try {
      await autoCampaignApi.update(record.auto_campaign_id, { is_active: !record.is_active });
      message.success(record.is_active ? '비활성화됨' : '활성화됨');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '캠페인명', dataIndex: 'campaign_name', width: 200 },
    {
      title: '트리거', dataIndex: 'trigger_type', width: 100,
      render: (v: string) => <Tag color={TRIGGER_COLORS[v]}>{TRIGGER_LABELS[v] || v}</Tag>,
    },
    { title: '발송 유형', dataIndex: 'campaign_type', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: '발송 시간', dataIndex: 'send_time', width: 90, render: (v: string) => v?.substring(0, 5) },
    {
      title: '상태', dataIndex: 'is_active', width: 80,
      render: (v: boolean, r: any) => <Switch size="small" checked={v} onChange={() => handleToggle(r)} />,
    },
    {
      title: '', width: 80,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.auto_campaign_id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    { title: '캠페인', dataIndex: 'campaign_name', width: 150 },
    { title: '고객명', dataIndex: 'customer_name', width: 100 },
    { title: '전화번호', dataIndex: 'phone', width: 120 },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'SENT' ? 'green' : 'red'}>{v}</Tag> },
    { title: '발송일시', dataIndex: 'sent_at', width: 150, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '' },
    { title: '에러', dataIndex: 'error_message', ellipsis: true,
      render: (v: string) => v ? <Tooltip title={v}><span style={{ color: '#f5222d' }}>{v}</span></Tooltip> : '-' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>자동 캠페인 관리</h3>
        <Space>
          {isAdmin && <Button icon={<PlayCircleOutlined />} onClick={handleExecute}>수동 실행</Button>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>추가</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="자동 캠페인 목록" size="small">
            <Table dataSource={data} columns={columns} loading={loading} rowKey="auto_campaign_id"
              size="small" scroll={{ x: 800 }} pagination={false} />
          </Card>
        </Col>
      </Row>

      <Card title={<><HistoryOutlined /> 발송 이력</>} size="small" style={{ marginTop: 16 }}>
        <Table dataSource={history} columns={historyColumns} rowKey="log_id"
          loading={historyLoading}
          size="small" scroll={{ x: 800, y: 'calc(100vh - 500px)' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="발송 이력이 없습니다" /> }}
          pagination={{ current: historyPage, total: historyTotal, pageSize: 50, onChange: setHistoryPage, showTotal: (t: number) => `총 ${t}건` }} />
      </Card>

      <Modal title={editTarget ? '자동 캠페인 수정' : '자동 캠페인 등록'} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleSubmit} confirmLoading={submitting} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="campaign_name" label="캠페인명" rules={[{ required: true, message: '캠페인명 필수' }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="trigger_type" label="트리거" rules={[{ required: true }]}>
                <Select options={TRIGGER_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="campaign_type" label="발송 유형">
                <Select options={TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="send_time" label="발송 시간">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="메시지 내용" rules={[{ required: true, message: '내용 필수' }]}
            extra="변수: {{customer_name}}, {{years}}, {{phone}}, {{tier}}">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="subject" label="제목 (이메일용)">
            <Input />
          </Form.Item>
          <Form.Item name="days_before" label="N일 전 발송" extra="0이면 당일 발송">
            <Input type="number" min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="is_active" label="활성화" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
