import { useEffect, useState, CSSProperties } from 'react';
import { Table, Tag, Button, Select, Space, Card, Row, Col, Modal, Form, InputNumber, Popconfirm, message } from 'antd';
import {
  FileTextOutlined, CheckCircleOutlined, ShoppingCartOutlined,
  InboxOutlined, CloseCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { restockApi } from '../../modules/restock/restock.api';
import { useRestockStore } from '../../modules/restock/restock.store';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import type { RestockRequest } from '../../../../shared/types/restock';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', APPROVED: 'blue', ORDERED: 'cyan', RECEIVED: 'green', CANCELLED: 'red' };
const STATUS_LABELS: Record<string, string> = { DRAFT: '작성중', APPROVED: '승인', ORDERED: '발주', RECEIVED: '입고완료', CANCELLED: '취소' };

function StatCard({ title, count, qty, icon, bg, color }: {
  title: string; count: number; qty: number; icon: React.ReactNode; bg: string; color: string;
}) {
  const style: CSSProperties = {
    background: bg, borderRadius: 12, padding: '16px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 90, border: 'none',
  };
  return (
    <div style={style}>
      <div>
        <div style={{ fontSize: 12, color: color + 'cc' }}>{title}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.2 }}>{count}건</div>
        <div style={{ fontSize: 11, color: color + '99', marginTop: 2 }}>{qty.toLocaleString()}개</div>
      </div>
      <div style={{ fontSize: 28, color: color + '44' }}>{icon}</div>
    </div>
  );
}

export default function RestockProgressPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [progressStats, setProgressStats] = useState<any[]>([]);
  const { data: requests, total, loading, fetchList } = useRestockStore();
  const [page, setPage] = useState(1);

  // 상세
  const [detailData, setDetailData] = useState<RestockRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 수령 모달
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm] = Form.useForm();
  const [receiveItems, setReceiveItems] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/partners?limit=100').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch(() => {});
  }, []);

  const loadStats = async () => {
    try {
      const data = await restockApi.getProgressStats(partnerFilter);
      setProgressStats(data);
    } catch (e: any) { message.error(e.message); }
  };

  const loadList = () => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (statusFilter) params.status = statusFilter;
    if (partnerFilter) params.partner_code = partnerFilter;
    fetchList(params);
  };

  useEffect(() => { loadStats(); loadList(); }, [partnerFilter]);
  useEffect(() => { loadList(); }, [page, statusFilter]);

  const getStat = (status: string) => {
    const s = progressStats.find(p => p.status === status);
    return { count: s?.count || 0, qty: s?.total_qty || 0 };
  };

  const openDetail = async (id: number) => {
    try {
      const data = await restockApi.get(id);
      setDetailData(data);
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await restockApi.update(id, { status: newStatus });
      message.success(`상태가 ${STATUS_LABELS[newStatus]}(으)로 변경되었습니다.`);
      loadStats();
      loadList();
      if (detailData?.request_id === id) {
        const updated = await restockApi.get(id);
        setDetailData(updated);
      }
    } catch (e: any) { message.error(e.message); }
  };

  const openReceive = () => {
    if (!detailData?.items) return;
    setReceiveItems(detailData.items.map(i => ({
      ...i,
      received_qty: i.request_qty, // 기본값: 요청수량 전량
    })));
    setReceiveOpen(true);
  };

  const handleReceive = async () => {
    if (!detailData) return;
    try {
      const items = receiveItems.map(i => ({
        variant_id: i.variant_id,
        received_qty: i.received_qty,
      }));
      await restockApi.receive(detailData.request_id, items);
      message.success('수령확인 완료. 재고가 자동 반영되었습니다.');
      setReceiveOpen(false);
      loadStats();
      loadList();
      const updated = await restockApi.get(detailData.request_id);
      setDetailData(updated);
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
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
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '입고일', dataIndex: 'received_date', key: 'received_date', width: 100,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70 },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80 },
    { title: '관리', key: 'actions', width: 180,
      render: (_: any, r: any) => (
        <Space size="small">
          {r.status === 'DRAFT' && (
            <Button size="small" type="primary" onClick={() => handleStatusChange(r.request_id, 'APPROVED')}>승인</Button>
          )}
          {r.status === 'APPROVED' && (
            <Button size="small" onClick={() => handleStatusChange(r.request_id, 'ORDERED')}>발주</Button>
          )}
          {r.status === 'ORDERED' && (
            <Button size="small" type="primary" onClick={() => openDetail(r.request_id)}>수령확인</Button>
          )}
          {['DRAFT', 'APPROVED'].includes(r.status) && (
            <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(r.request_id, 'CANCELLED')}>
              <Button size="small" danger>취소</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const draft = getStat('DRAFT');
  const approved = getStat('APPROVED');
  const ordered = getStat('ORDERED');
  const received = getStat('RECEIVED');

  return (
    <div>
      <PageHeader title="재입고 진행" extra={
        <Space>
          {!isStore && (
            <Select placeholder="거래처" allowClear value={partnerFilter}
              onChange={setPartnerFilter} style={{ width: 150 }}
              options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
            />
          )}
          <Button icon={<ReloadOutlined />} onClick={() => { loadStats(); loadList(); }}>새로고침</Button>
        </Space>
      } />

      {/* 진행 통계 카드 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="작성중" count={draft.count} qty={draft.qty}
            icon={<FileTextOutlined />} bg="linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)" color="#333" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="승인완료" count={approved.count} qty={approved.qty}
            icon={<CheckCircleOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="발주진행" count={ordered.count} qty={ordered.qty}
            icon={<ShoppingCartOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="입고완료" count={received.count} qty={received.qty}
            icon={<InboxOutlined />} bg="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" color="#fff" />
        </Col>
      </Row>

      {/* 필터 */}
      <Space style={{ marginBottom: 12 }}>
        <Select placeholder="상태" allowClear value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }}
          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))}
        />
      </Space>

      <Table
        dataSource={requests}
        columns={columns}
        rowKey="request_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
      />

      {/* 상세 모달 */}
      <Modal
        title={detailData ? `재입고 의뢰 - ${detailData.request_no}` : '상세'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={750}
        footer={
          <Space>
            {detailData?.status === 'DRAFT' && (
              <Button type="primary" onClick={() => handleStatusChange(detailData.request_id, 'APPROVED')}>승인</Button>
            )}
            {detailData?.status === 'APPROVED' && (
              <Button onClick={() => handleStatusChange(detailData.request_id, 'ORDERED')}>발주 처리</Button>
            )}
            {detailData?.status === 'ORDERED' && (
              <Button type="primary" onClick={openReceive}>수령확인</Button>
            )}
            {detailData && ['DRAFT', 'APPROVED'].includes(detailData.status) && (
              <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleStatusChange(detailData.request_id, 'CANCELLED')}>
                <Button danger>취소</Button>
              </Popconfirm>
            )}
            <Button onClick={() => setDetailOpen(false)}>닫기</Button>
          </Space>
        }
      >
        {detailData && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>거래처: <strong>{detailData.partner_name}</strong></Col>
              <Col span={8}>상태: <Tag color={STATUS_COLORS[detailData.status]}>{STATUS_LABELS[detailData.status]}</Tag></Col>
              <Col span={8}>의뢰일: {dayjs(detailData.request_date).format('YYYY-MM-DD')}</Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>입고예정: {detailData.expected_date ? dayjs(detailData.expected_date).format('YYYY-MM-DD') : '-'}</Col>
              <Col span={8}>입고일: {detailData.received_date ? dayjs(detailData.received_date).format('YYYY-MM-DD') : '-'}</Col>
              <Col span={8}>요청자: {detailData.requested_by || '-'}</Col>
            </Row>
            {detailData.memo && <div style={{ marginBottom: 12, color: '#888' }}>메모: {detailData.memo}</div>}
            <Table
              dataSource={detailData.items}
              rowKey="item_id"
              size="small"
              pagination={false}
              columns={[
                { title: '상품', dataIndex: 'product_name', key: 'product_name' },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
                { title: '컬러', dataIndex: 'color', key: 'color', width: 60 },
                { title: '사이즈', dataIndex: 'size', key: 'size', width: 60, render: (v: string) => <Tag>{v}</Tag> },
                { title: '요청수량', dataIndex: 'request_qty', key: 'request_qty', width: 80 },
                { title: '입고수량', dataIndex: 'received_qty', key: 'received_qty', width: 80,
                  render: (v: number) => v > 0 ? <Tag color="green">{v}</Tag> : '-',
                },
              ]}
              summary={(data) => {
                const totalReq = data.reduce((s, r) => s + (r.request_qty || 0), 0);
                const totalRec = data.reduce((s, r) => s + (r.received_qty || 0), 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right"><strong>합계</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={4}><strong>{totalReq}</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={5}>{totalRec > 0 ? <Tag color="green"><strong>{totalRec}</strong></Tag> : '-'}</Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </>
        )}
      </Modal>

      {/* 수령확인 모달 */}
      <Modal
        title="수령확인 - 입고수량 입력"
        open={receiveOpen}
        onCancel={() => setReceiveOpen(false)}
        onOk={handleReceive}
        okText="수령확인"
        cancelText="취소"
        width={600}
      >
        <p style={{ color: '#888', marginBottom: 12 }}>각 품목의 실제 입고 수량을 입력해주세요. 확인 시 재고에 자동 반영됩니다.</p>
        <Table
          dataSource={receiveItems}
          rowKey="variant_id"
          size="small"
          pagination={false}
          columns={[
            { title: '상품', dataIndex: 'product_name', key: 'product_name' },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
            { title: '사이즈', dataIndex: 'size', key: 'size', width: 60 },
            { title: '요청', dataIndex: 'request_qty', key: 'request_qty', width: 60 },
            { title: '입고수량', key: 'received_qty', width: 100,
              render: (_: any, record: any, index: number) => (
                <InputNumber
                  min={0}
                  max={record.request_qty * 2}
                  value={record.received_qty}
                  onChange={(v) => {
                    const updated = [...receiveItems];
                    updated[index] = { ...updated[index], received_qty: v || 0 };
                    setReceiveItems(updated);
                  }}
                  size="small"
                  style={{ width: 80 }}
                />
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
