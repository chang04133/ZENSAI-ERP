import { useEffect, useState, CSSProperties } from 'react';
import { Table, Tag, Button, Select, Tabs, Modal, Form, InputNumber, DatePicker, Input, Space, Row, Col, message } from 'antd';
import { PlusOutlined, ReloadOutlined, AlertOutlined, FireOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { restockApi } from '../../modules/restock/restock.api';
import { useRestockStore } from '../../modules/restock/restock.store';
import { apiFetch } from '../../core/api.client';
import type { RestockSuggestion, SellingVelocity, RestockRequest } from '../../../../shared/types/restock';
import dayjs from 'dayjs';

const URGENCY_COLORS: Record<string, string> = { CRITICAL: 'red', WARNING: 'orange', NORMAL: 'blue' };
const URGENCY_LABELS: Record<string, string> = { CRITICAL: '위험', WARNING: '주의', NORMAL: '보통' };
const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', APPROVED: 'blue', ORDERED: 'cyan', RECEIVED: 'green', CANCELLED: 'red' };
const STATUS_LABELS: Record<string, string> = { DRAFT: '작성중', APPROVED: '승인', ORDERED: '발주', RECEIVED: '입고완료', CANCELLED: '취소' };

function SummaryCard({ title, count, icon, bg, color }: {
  title: string; count: number; icon: React.ReactNode; bg: string; color: string;
}) {
  const style: CSSProperties = {
    background: bg, borderRadius: 12, padding: '14px 18px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 80, border: 'none',
  };
  return (
    <div style={style}>
      <div>
        <div style={{ fontSize: 11, color: color + 'cc' }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.3 }}>{count}건</div>
      </div>
      <div style={{ fontSize: 26, color: color + '44' }}>{icon}</div>
    </div>
  );
}

export default function RestockManagePage() {
  const navigate = useNavigate();

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
    apiFetch('/api/partners?limit=1000').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch((e: any) => { message.error('거래처 로드 실패: ' + (e.message || '')); });
  }, []);

  const loadSuggestions = async () => {
    setSugLoading(true);
    try {
      const data = await restockApi.getRestockSuggestions();
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
  }, [tab]);

  useEffect(() => {
    if (tab === 'velocity') loadVelocity();
    else if (tab === 'requests') loadRequests();
  }, [partnerFilter]);

  useEffect(() => { if (tab === 'requests') loadRequests(); }, [reqPage, statusFilter]);

  const openCreateModal = () => {
    if (selectedItems.length === 0) { message.warning('제안 목록에서 품목을 선택해주세요.'); return; }
    const qtys: Record<number, number> = {};
    selectedItems.forEach(i => { qtys[i.variant_id] = i.suggested_qty; });
    setItemQtys(qtys);
    createForm.resetFields();
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

  // 제안 요약 통계
  const criticalCount = suggestions.filter(s => s.urgency === 'CRITICAL').length;
  const warningCount = suggestions.filter(s => s.urgency === 'WARNING').length;
  const totalCount = suggestions.length;

  const sugColumns = [
    { title: '긴급도', dataIndex: 'urgency', key: 'urgency', width: 70,
      render: (v: string) => <Tag color={URGENCY_COLORS[v]}>{URGENCY_LABELS[v]}</Tag>,
      filters: [
        { text: '위험', value: 'CRITICAL' },
        { text: '주의', value: 'WARNING' },
        { text: '보통', value: 'NORMAL' },
      ],
      onFilter: (value: any, record: RestockSuggestion) => record.urgency === value,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 60 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 55, render: (v: string) => <Tag>{v}</Tag> },
    { title: '판매율', dataIndex: 'sell_through_rate', key: 'sell_through_rate', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.sell_through_rate - b.sell_through_rate,
      render: (v: number) => <span style={{ fontWeight: 600, color: v >= 70 ? '#f5222d' : v >= 50 ? '#fa8c16' : '#1890ff' }}>{v}%</span>,
    },
    { title: '60일판매', dataIndex: 'total_sold', key: 'total_sold', width: 75,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.total_sold - b.total_sold,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '30일수요', dataIndex: 'demand_30d', key: 'demand_30d', width: 75,
      render: (v: number) => v > 0 ? v : '-',
    },
    { title: '현재고', dataIndex: 'current_stock', key: 'current_stock', width: 70,
      render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 5 ? 'orange' : 'default'}>{v}</Tag>,
    },
    { title: '생산중', dataIndex: 'in_production_qty', key: 'in_production_qty', width: 65,
      render: (v: number) => v > 0 ? <span style={{ color: '#722ed1' }}>{v}</span> : '-',
    },
    { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage_qty', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.shortage_qty - b.shortage_qty,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 700 }}>{v}</span> : '-',
    },
    { title: '소진일', dataIndex: 'days_of_stock', key: 'days_of_stock', width: 65,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.days_of_stock - b.days_of_stock,
      render: (v: number) => <Tag color={v < 7 ? 'red' : v < 14 ? 'orange' : v < 30 ? 'gold' : 'default'}>{v}일</Tag>,
    },
    { title: '권장수량', dataIndex: 'suggested_qty', key: 'suggested_qty', width: 80,
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : '-',
    },
  ];

  const velColumns = [
    { title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 60 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v}</Tag> },
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
    { title: '소진예상(7일)', dataIndex: 'days_until_out_7d', key: 'days_until_out_7d', width: 120,
      render: (v: number | null) => v != null
        ? <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : 'default'}>{v}일</Tag>
        : '-',
    },
    { title: '소진예상(30일)', dataIndex: 'days_until_out_30d', key: 'days_until_out_30d', width: 120,
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
            {tab === 'velocity' && (
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
            <>
              {/* 요약 카드 */}
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                  <SummaryCard title="긴급 보충 (7일 미만)" count={criticalCount}
                    icon={<ExclamationCircleOutlined />} bg="linear-gradient(135deg, #ff4d4f22 0%, #ff4d4f11 100%)" color="#cf1322" />
                </Col>
                <Col xs={24} sm={8}>
                  <SummaryCard title="주의 품목 (14일 미만)" count={warningCount}
                    icon={<WarningOutlined />} bg="linear-gradient(135deg, #fa8c1622 0%, #fa8c1611 100%)" color="#d46b08" />
                </Col>
                <Col xs={24} sm={8}>
                  <SummaryCard title="전체 보충 필요" count={totalCount}
                    icon={<AlertOutlined />} bg="linear-gradient(135deg, #1890ff22 0%, #1890ff11 100%)" color="#096dd9" />
                </Col>
              </Row>
              <Table
                dataSource={suggestions}
                columns={sugColumns}
                rowKey="variant_id"
                loading={sugLoading}
                size="small"
                scroll={{ x: 1200, y: 'calc(100vh - 380px)' }}
                pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                rowSelection={{
                  selectedRowKeys: selectedItems.map(i => i.variant_id),
                  onChange: (_keys, rows) => setSelectedItems(rows),
                }}
                title={() => (
                  <Space>
                    <span style={{ color: '#888', fontSize: 12 }}>
                      60일 판매 기반 · 판매율 ≥40% · 계절가중치 적용 · 소진일 오름차순
                    </span>
                    <Button size="small" icon={<ReloadOutlined />} onClick={loadSuggestions}>새로고침</Button>
                  </Space>
                )}
              />
            </>
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
              scroll={{ x: 1200, y: 'calc(100vh - 280px)' }}
              pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
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
                <Select placeholder="거래처" allowClear value={partnerFilter}
                  onChange={setPartnerFilter} style={{ width: 150 }}
                  options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
                />
              </Space>
              <Table
                dataSource={requests}
                columns={reqColumns}
                rowKey="request_id"
                loading={reqLoading}
                size="small"
                scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
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
                <Select showSearch placeholder="거래처" optionFilterProp="label"
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
          rowKey="variant_id"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
          columns={[
            { title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
            { title: 'Size', dataIndex: 'size', key: 'size', width: 50 },
            { title: '현재고', dataIndex: 'current_stock', key: 'current_stock', width: 60 },
            { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage_qty', width: 60,
              render: (v: number) => <span style={{ color: '#f5222d' }}>{v}</span>,
            },
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
                { title: 'Color', dataIndex: 'color', key: 'color', width: 60 },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 60 },
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
