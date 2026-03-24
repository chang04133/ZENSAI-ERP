import { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Select, Input, Space, Modal, Form,
  InputNumber, DatePicker, message, Popconfirm, Card, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { afterSalesApi } from '../../modules/crm/crm.api';

const STATUS_COLORS: Record<string, string> = {
  '접수': 'blue',
  '진행': 'orange',
  '완료': 'green',
  '취소': 'red',
};

const TYPE_COLORS: Record<string, string> = {
  '수선': 'cyan',
  '교환': 'purple',
  '클레임': 'red',
  '기타': 'default',
};

const SERVICE_TYPES = ['수선', '교환', '클레임', '기타'];
const STATUS_OPTIONS = ['접수', '진행', '완료', '취소'];

export default function AfterSalesPage() {
  const navigate = useNavigate();

  /* ── 목록 데이터 ── */
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  /* ── 필터 ── */
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* ── 통계 ── */
  const [stats, setStats] = useState<any>(null);

  /* ── 모달 ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  /* ══════════ 데이터 로드 ══════════ */
  const loadStats = useCallback(() => {
    afterSalesApi.stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (typeFilter) params.service_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    afterSalesApi.list(params)
      .then((r: any) => {
        setData(r.data || []);
        setTotal(r.total || 0);
      })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { load(); }, [load]);

  /* ══════════ 모달 핸들러 ══════════ */
  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        received_date: record.received_date ? dayjs(record.received_date) : null,
        completed_date: record.completed_date ? dayjs(record.completed_date) : null,
      });
    } else {
      form.setFieldsValue({
        service_type: '수선',
        received_date: dayjs(),
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        received_date: values.received_date ? values.received_date.format('YYYY-MM-DD') : null,
        completed_date: values.completed_date ? values.completed_date.format('YYYY-MM-DD') : null,
      };
      if (editTarget) {
        await afterSalesApi.update(editTarget.service_id, payload);
        message.success('A/S 접수가 수정되었습니다.');
      } else {
        await afterSalesApi.create(payload);
        message.success('A/S가 접수되었습니다.');
      }
      setModalOpen(false);
      load();
      loadStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await afterSalesApi.remove(id);
      message.success('A/S 접수가 삭제되었습니다.');
      load();
      loadStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  /* ══════════ 모달 내 상태 감시 ══════════ */
  const modalStatus = Form.useWatch('status', form);

  /* ══════════ 컬럼 정의 ══════════ */
  const columns = [
    {
      title: '접수일', dataIndex: 'received_date', key: 'received_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-',
    },
    {
      title: '고객명', dataIndex: 'customer_name', key: 'customer_name', width: 100,
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`/crm/${r.customer_id}`)}>
          {v || '-'}
        </Button>
      ),
    },
    {
      title: '유형', dataIndex: 'service_type', key: 'service_type', width: 80,
      render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140,
      ellipsis: true, render: (v: string) => v || '-',
    },
    {
      title: '옵션', dataIndex: 'variant_info', key: 'variant_info', width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '내용', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '완료일', dataIndex: 'completed_date', key: 'completed_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-',
    },
    {
      title: '', key: 'actions', width: 80, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); openForm(r); }} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.service_id)}
            okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ══════════ 통계 요약 ══════════ */
  const openCount = stats?.openCount ?? 0;
  const byType = stats?.byType || {};
  const byStatus = stats?.byStatus || {};

  return (
    <div>
      {/* 상단 통계 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>미처리 (접수+진행)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fa8c16' }}>
              {openCount}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>수선</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#13c2c2' }}>
              {byType['수선'] || 0}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>교환</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1' }}>
              {byType['교환'] || 0}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>클레임</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ff4d4f' }}>
              {byType['클레임'] || 0}
              <span style={{ fontSize: 14, fontWeight: 400, color: '#999', marginLeft: 4 }}>건</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }}
            style={{ width: 110 }}
            options={[
              { label: '전체', value: '' },
              ...SERVICE_TYPES.map((t) => ({ label: t, value: t })),
            ]} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}
            style={{ width: 110 }}
            options={[
              { label: '전체', value: '' },
              ...STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
            ]} />
        </div>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="고객명, 상품명" prefix={<SearchOutlined />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onPressEnter={load} allowClear />
        </div>
        <Button onClick={load}>조회</Button>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
          A/S 접수
        </Button>
      </div>

      {/* 테이블 */}
      <Table
        dataSource={data}
        rowKey="service_id"
        loading={loading}
        size="small"
        scroll={{ x: 1200, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
        columns={columns}
      />

      {/* 등록/수정 모달 */}
      <Modal
        title={
          <span>
            <ToolOutlined style={{ marginRight: 8 }} />
            {editTarget ? 'A/S 수정' : 'A/S 접수'}
          </span>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editTarget ? '수정' : '접수'}
        cancelText="취소"
        confirmLoading={submitting}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_id" label="고객ID"
                rules={[{ required: true, message: '고객ID를 입력하세요' }]}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder="고객 ID" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="service_type" label="유형"
                rules={[{ required: true, message: '유형을 선택하세요' }]}>
                <Select options={SERVICE_TYPES.map((t) => ({ label: t, value: t }))} />
              </Form.Item>
            </Col>
          </Row>

          {editTarget && (
            <Form.Item name="status" label="상태">
              <Select options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_name" label="상품명">
                <Input placeholder="상품명" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="variant_info" label="옵션">
                <Input placeholder="색상/사이즈 등" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="내용">
            <Input.TextArea rows={3} placeholder="A/S 요청 내용" />
          </Form.Item>

          {editTarget && (
            <Form.Item name="resolution" label="처리결과">
              <Input.TextArea rows={3} placeholder="처리 결과를 입력하세요" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="received_date" label="접수일"
                rules={[{ required: true, message: '접수일을 선택하세요' }]}>
                <DatePicker style={{ width: '100%' }} placeholder="접수일" />
              </Form.Item>
            </Col>
            <Col span={12}>
              {(editTarget && modalStatus === '완료') && (
                <Form.Item name="completed_date" label="완료일">
                  <DatePicker style={{ width: '100%' }} placeholder="완료일" />
                </Form.Item>
              )}
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
