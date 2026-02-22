import { useEffect, useState } from 'react';
import { Table, Tag, Button, Select, Tabs, Modal, Form, InputNumber, DatePicker, Input, Space, Card, Row, Col, message } from 'antd';
import { PlusOutlined, ReloadOutlined, AlertOutlined, FireOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { restockApi } from '../../modules/restock/restock.api';
import { useRestockStore } from '../../modules/restock/restock.store';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import type { RestockSuggestion, SellingVelocity, RestockRequest } from '../../../../shared/types/restock';
import dayjs from 'dayjs';

const ALERT_COLORS: Record<string, string> = { ZERO: 'red', LOW: 'orange', MEDIUM: 'gold' };
const ALERT_LABELS: Record<string, string> = { ZERO: '품절', LOW: '부족', MEDIUM: '주의' };
const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', APPROVED: 'blue', ORDERED: 'cyan', RECEIVED: 'green', CANCELLED: 'red' };
const STATUS_LABELS: Record<string, string> = { DRAFT: '작성중', APPROVED: '승인', ORDERED: '발주', RECEIVED: '입고완료', CANCELLED: '취소' };

export default function RestockManagePage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [tab, setTab] = useState('suggestions');
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();

  // 제안 탭
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(false);

  // 판매속도 탭
  const [velocity, setVelocity] = useState<SellingVelocity[]>([]);
  const [velLoading, setVelLoading] = useState(false);

  // 의뢰 목록 탭
  const { data: requests, total, loading: reqLoading, fetchList } = useRestockStore();
  const [reqPage, setReqPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // 생성 모달
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [selectedItems, setSelectedItems] = useState<RestockSuggestion[]>([]);
  const [itemQtys, setItemQtys] = useState<Record<number, number>>({});
  const [creating, setCreating] = useState(false);

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<RestockRequest | null>(null);

  useEffect(() => {
    apiFetch('/api/partners?limit=100').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch((e: any) => { message.error('거래처 로드 실패: ' + (e.message || '')); });
  }, []);

  const loadSuggestions = async () => {
    setSugLoading(true);
    try {
      const data = await restockApi.getRestockSuggestions(partnerFilter);
      setSuggestions(data);
    } catch (e: any) { message.error(e.message); }
    finally { setSugLoading(false); }
  };

  const loadVelocity = async () => {
    setVelLoading(true);
    try {
      const data = await restockApi.getSellingVelocity(partnerFilter);
      setVelocity(data);
    } catch (e: any) { message.error(e.message); }
    finally { setVelLoading(false); }
  };

  const loadRequests = () => {
    const params: Record<string, string> = { page: String(reqPage), limit: '50' };
    if (statusFilter) params.status = statusFilter;
    if (partnerFilter) params.partner_code = partnerFilter;
    fetchList(params);
  };

  useEffect(() => {
    if (tab === 'suggestions') loadSuggestions();
    else if (tab === 'velocity') loadVelocity();
    else loadRequests();
  }, [tab, partnerFilter]);

  useEffect(() => { if (tab === 'requests') loadRequests(); }, [reqPage, statusFilter]);

  const openCreateModal = () => {
    if (selectedItems.length === 0) { message.warning('제안 목록에서 품목을 선택해주세요.'); return; }
    const qtys: Record<number, number> = {};
    selectedItems.forEach(i => { qtys[i.variant_id] = i.suggested_qty; });
    setItemQtys(qtys);
    createForm.resetFields();
    if (isStore && user?.partnerCode) createForm.setFieldsValue({ partner_code: user.partnerCode });
    setCreateOpen(true);
  };

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      const items = selectedItems.map(s => ({
        variant_id: s.variant_id,
        request_qty: itemQtys[s.variant_id] || s.suggested_qty,
      }));
      await restockApi.create({
        partner_code: values.partner_code,
        expected_date: values.expected_date ? values.expected_date.format('YYYY-MM-DD') : null,
        memo: values.memo,
        items,
      });
      message.success('재입고 의뢰가 생성되었습니다.');
      setCreateOpen(false);
      setSelectedItems([]);
      setTab('requests');
      loadRequests();
    } catch (e: any) { message.error(e.message); }
    finally { setCreating(false); }
  };

  const openDetail = async (id: number) => {
    try {
      const data = await restockApi.get(id);
      setDetailData(data);
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const sugColumns = [
    { title: '상태', dataIndex: 'alert_level', key: 'alert_level', width: 70,
      render: (v: string) => <Tag color={ALERT_COLORS[v]}>{ALERT_LABELS[v]}</Tag>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상품', dataIndex: 'product_name', key: 'product_name' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '컬러', dataIndex: 'color', key: 'color', width: 60 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v}</Tag> },
    { title: '현재수량', dataIndex: 'current_qty', key: 'current_qty', width: 80,
      render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 5 ? 'orange' : 'gold'}>{v}</Tag>,
    },
    { title: 'LOW', dataIndex: 'low_threshold', key: 'low_threshold', width: 60 },
    { title: 'MED', dataIndex: 'medium_threshold', key: 'medium_threshold', width: 60 },
    { title: '7일판매', dataIndex: 'sold_7d', key: 'sold_7d', width: 80,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '30일판매', dataIndex: 'sold_30d', key: 'sold_30d', width: 80,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '일평균', dataIndex: 'avg_daily_7d', key: 'avg_daily_7d', width: 70,
      render: (v: number) => v > 0 ? v.toFixed(1) : '-',
    },
    { title: '추천수량', dataIndex: 'suggested_qty', key: 'suggested_qty', width: 80,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
  ];

  const velColumns = [
    { title: '상품', dataIndex: 'product_name', key: 'product_name' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '컬러', dataIndex: 'color', key: 'color', width: 60 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v}</Tag> },
    { title: '현재재고', dataIndex: 'current_qty', key: 'current_qty', width: 80 },
    { title: '7일판매', dataIndex: 'sold_7d', key: 'sold_7d', width: 80,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '30일판매', dataIndex: 'sold_30d', key: 'sold_30d', width: 80,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '일평균(7일)', dataIndex: 'avg_daily_7d', key: 'avg_daily_7d', width: 90,
      render: (v: number) => v > 0 ? v.toFixed(2) : '-',
    },
    { title: '일평균(30일)', dataIndex: 'avg_daily_30d', key: 'avg_daily_30d', width: 90,
      render: (v: number) => v > 0 ? v.toFixed(2) : '-',
    },
    { title: '소진예상(7일기준)', dataIndex: 'days_until_out_7d', key: 'days_until_out_7d', width: 130,
      render: (v: number | null) => v != null
        ? <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : 'default'}>{v}일</Tag>
        : '-',
    },
    { title: '소진예상(30일기준)', dataIndex: 'days_until_out_30d', key: 'days_until_out_30d', width: 130,
      render: (v: number | null) => v != null
        ? <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : 'default'}>{v}일</Tag>
        : '-',
    },
  ];

  const reqColumns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no',
      render: (v: string, r: any) => <a onClick={() => openDetail(r.request_id)}>{v}</a>,
    },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
    },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '입고예정', dataIndex: 'expected_date', key: 'expected_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70 },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80 },
    { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true },
  ];

  return (
    <div>
      <PageHeader
        title="재입고 관리"
        extra={
          <Space>
            {!isStore && (
              <Select placeholder="거래처 필터" allowClear value={partnerFilter}
                onChange={setPartnerFilter} style={{ width: 150 }}
                options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
              />
            )}
            {tab === 'suggestions' && selectedItems.length > 0 && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                재입고 의뢰 ({selectedItems.length}건)
              </Button>
            )}
          </Space>
        }
      />

      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'suggestions', label: <span><AlertOutlined /> 재입고 제안</span>,
          children: (
            <Table
              dataSource={suggestions}
              columns={sugColumns}
              rowKey={(r) => `${r.partner_code}-${r.variant_id}`}
              loading={sugLoading}
              size="small"
              pagination={{ pageSize: 50 }}
              scroll={{ x: 1200 }}
              rowSelection={{
                selectedRowKeys: selectedItems.map(i => `${i.partner_code}-${i.variant_id}`),
                onChange: (_keys, rows) => setSelectedItems(rows),
              }}
              title={() => (
                <Space>
                  <span style={{ color: '#888' }}>재고 부족/주의 품목 ({suggestions.length}건)</span>
                  <Button size="small" icon={<ReloadOutlined />} onClick={loadSuggestions}>새로고침</Button>
                </Space>
              )}
            />
          ),
        },
        {
          key: 'velocity', label: <span><FireOutlined /> 판매속도</span>,
          children: (
            <Table
              dataSource={velocity}
              columns={velColumns}
              rowKey="variant_id"
              loading={velLoading}
              size="small"
              pagination={{ pageSize: 50 }}
              scroll={{ x: 1200 }}
              title={() => (
                <Space>
                  <span style={{ color: '#888' }}>판매 실적이 있는 품목 ({velocity.length}건)</span>
                  <Button size="small" icon={<ReloadOutlined />} onClick={loadVelocity}>새로고침</Button>
                </Space>
              )}
            />
          ),
        },
        {
          key: 'requests', label: '의뢰 목록',
          children: (
            <>
              <Space style={{ marginBottom: 12 }}>
                <Select placeholder="상태" allowClear value={statusFilter}
                  onChange={(v) => { setStatusFilter(v); setReqPage(1); }} style={{ width: 120 }}
                  options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))}
                />
              </Space>
              <Table
                dataSource={requests}
                columns={reqColumns}
                rowKey="request_id"
                loading={reqLoading}
                size="small"
                scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
                pagination={{ current: reqPage, total, pageSize: 50, onChange: setReqPage, showTotal: (t) => `총 ${t}건` }}
              />
            </>
          ),
        },
      ]} />

      {/* 의뢰 생성 모달 */}
      <Modal
        title="재입고 의뢰 생성"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText="생성"
        cancelText="취소"
        confirmLoading={creating}
        width={700}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="partner_code" label="입고 거래처" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
                <Select showSearch placeholder="거래처" optionFilterProp="label" disabled={isStore}
                  options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_date" label="입고 예정일">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 8, fontWeight: 600, marginBottom: 8 }}>선택 품목 ({selectedItems.length}건)</div>
        <Table
          dataSource={selectedItems}
          rowKey={(r) => `${r.partner_code}-${r.variant_id}`}
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
          columns={[
            { title: '상품', dataIndex: 'product_name', key: 'product_name' },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
            { title: '사이즈', dataIndex: 'size', key: 'size', width: 60 },
            { title: '현재', dataIndex: 'current_qty', key: 'current_qty', width: 60 },
            { title: '주문수량', key: 'qty', width: 100,
              render: (_: any, r: RestockSuggestion) => (
                <InputNumber min={1} value={itemQtys[r.variant_id] || r.suggested_qty}
                  onChange={(v) => setItemQtys(prev => ({ ...prev, [r.variant_id]: v || 1 }))}
                  size="small" style={{ width: 80 }}
                />
              ),
            },
          ]}
        />
      </Modal>

      {/* 상세 모달 */}
      <Modal
        title={detailData ? `재입고 의뢰 - ${detailData.request_no}` : '상세'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>닫기</Button>}
        width={700}
      >
        {detailData && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>거래처: <strong>{detailData.partner_name}</strong></Col>
              <Col span={8}>상태: <Tag color={STATUS_COLORS[detailData.status]}>{STATUS_LABELS[detailData.status]}</Tag></Col>
              <Col span={8}>의뢰일: {dayjs(detailData.request_date).format('YYYY-MM-DD')}</Col>
            </Row>
            {detailData.expected_date && <div style={{ marginBottom: 8 }}>입고예정: {dayjs(detailData.expected_date).format('YYYY-MM-DD')}</div>}
            {detailData.memo && <div style={{ marginBottom: 8, color: '#888' }}>메모: {detailData.memo}</div>}
            <Table
              dataSource={detailData.items}
              rowKey="item_id"
              size="small"
              pagination={false}
              columns={[
                { title: '상품', dataIndex: 'product_name', key: 'product_name' },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
                { title: '컬러', dataIndex: 'color', key: 'color', width: 60 },
                { title: '사이즈', dataIndex: 'size', key: 'size', width: 60 },
                { title: '요청수량', dataIndex: 'request_qty', key: 'request_qty', width: 80 },
                { title: '입고수량', dataIndex: 'received_qty', key: 'received_qty', width: 80,
                  render: (v: number) => v > 0 ? <Tag color="green">{v}</Tag> : '-',
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
