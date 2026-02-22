import { useEffect, useState } from 'react';
import { Table, Button, Select, Space, Tag, Modal, Form, InputNumber, Alert, message } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '입고완료', CANCELLED: '취소',
};

export default function ShipmentProcessPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // 출고수량 입력 모달
  const [shippedModalOpen, setShippedModalOpen] = useState(false);
  const [shippedTarget, setShippedTarget] = useState<any>(null);
  const [shippedQtys, setShippedQtys] = useState<Record<number, number>>({});

  // 수령확인 모달
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      if (isStore && user?.partnerCode) params.partner = user.partnerCode;
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => { setPage(1); load(1); }, [statusFilter]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await shipmentApi.update(id, { status: newStatus });
      message.success(`상태가 ${STATUS_LABELS[newStatus]}(으)로 변경되었습니다.`);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const result = await shipmentApi.get(id);
      setDetail(result);
      setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  // 출고완료 처리: 먼저 출고수량 입력 모달 열기
  const handleOpenShippedModal = async (record: any) => {
    try {
      const detail = await shipmentApi.get(record.request_id);
      setShippedTarget(detail);
      const qtys: Record<number, number> = {};
      (detail as any).items?.forEach((item: any) => {
        qtys[item.variant_id] = item.shipped_qty || item.request_qty;
      });
      setShippedQtys(qtys);
      setShippedModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmShipped = async () => {
    if (!shippedTarget) return;
    try {
      const items = (shippedTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id,
        shipped_qty: shippedQtys[item.variant_id] || 0,
      }));
      // 1. 출고수량 저장
      await shipmentApi.updateShippedQty(shippedTarget.request_id, items);
      // 2. 상태 SHIPPED로 변경 (재고 차감 연동)
      await shipmentApi.update(shippedTarget.request_id, { status: 'SHIPPED' });
      message.success('출고 처리가 완료되었습니다.');
      setShippedModalOpen(false);
      setShippedTarget(null);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  // 수령확인 처리
  const handleOpenReceiveModal = async (record: any) => {
    try {
      const detail = await shipmentApi.get(record.request_id);
      setReceiveTarget(detail);
      const qtys: Record<number, number> = {};
      (detail as any).items?.forEach((item: any) => {
        qtys[item.variant_id] = item.shipped_qty; // 기본값 = 출고수량
      });
      setReceivedQtys(qtys);
      setReceiveModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmReceive = async () => {
    if (!receiveTarget) return;
    try {
      const items = (receiveTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id,
        received_qty: receivedQtys[item.variant_id] || 0,
      }));
      // 수령확인 (received_qty 저장 + RECEIVED + 재고 증가 원자적 처리)
      await shipmentApi.receive(receiveTarget.request_id, items);
      message.success('수령 확인이 완료되었습니다.');
      setReceiveModalOpen(false);
      setReceiveTarget(null);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no' },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '유형', dataIndex: 'request_type', key: 'request_type', render: (v: string) => <Tag>{v}</Tag> },
    { title: '출발', dataIndex: 'from_partner_name', key: 'from_partner_name', render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', key: 'to_partner_name', render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '처리', key: 'action', width: 200, render: (_: any, record: any) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
        {record.status === 'PENDING' && (
          <Button type="primary" size="small" onClick={() => handleOpenShippedModal(record)}>출고완료</Button>
        )}
        {record.status === 'SHIPPED' && (
          <Button type="primary" size="small" style={{ background: '#13c2c2' }} onClick={() => handleOpenReceiveModal(record)}>수령확인</Button>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <PageHeader title="출고처리" />
      <Space style={{ marginBottom: 16 }}>
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 150 }}
          options={[
            { label: '대기', value: 'PENDING' },
            { label: '출고완료', value: 'SHIPPED' },
            { label: '입고완료', value: 'RECEIVED' },
          ]} />
        <Button icon={<SearchOutlined />} onClick={() => load()}>조회</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />

      {/* 상세 모달 */}
      <Modal title={`의뢰 상세 - ${detail?.request_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
              <div><strong>유형:</strong> {detail.request_type}</div>
              <div><strong>상태:</strong> <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag></div>
              <div><strong>출발:</strong> {detail.from_partner_name || '-'}</div>
              <div><strong>도착:</strong> {detail.to_partner_name || '-'}</div>
              <div><strong>메모:</strong> {detail.memo || '-'}</div>
            </div>
            {detail.items && detail.items.length > 0 ? (
              <Table size="small" dataSource={detail.items} rowKey="item_id" pagination={false}
                columns={[
                  { title: 'SKU', dataIndex: 'sku' }, { title: '상품명', dataIndex: 'product_name' },
                  { title: '색상', dataIndex: 'color' }, { title: '사이즈', dataIndex: 'size' },
                  { title: '요청', dataIndex: 'request_qty' }, { title: '출고', dataIndex: 'shipped_qty' }, { title: '수령', dataIndex: 'received_qty' },
                ]} />
            ) : <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>등록된 품목이 없습니다.</div>}
          </div>
        )}
      </Modal>

      {/* 출고수량 입력 모달 */}
      <Modal title="출고수량 입력" open={shippedModalOpen} onCancel={() => setShippedModalOpen(false)} onOk={handleConfirmShipped} okText="출고완료" cancelText="취소" width={650}>
        <Alert message="각 품목의 실제 출고수량을 입력하세요. 확인 시 출발지 재고가 차감됩니다." type="info" showIcon style={{ marginBottom: 16 }} />
        {shippedTarget && (
          <Table size="small" dataSource={(shippedTarget as any).items || []} rowKey="variant_id" pagination={false}
            columns={[
              { title: 'SKU', dataIndex: 'sku', width: 140 },
              { title: '상품명', dataIndex: 'product_name' },
              { title: '요청', dataIndex: 'request_qty', width: 70 },
              { title: '출고수량', key: 'shipped', width: 120, render: (_: any, record: any) => (
                <InputNumber min={0} max={record.request_qty} value={shippedQtys[record.variant_id] || 0}
                  onChange={(v) => setShippedQtys({ ...shippedQtys, [record.variant_id]: v || 0 })} style={{ width: '100%' }} />
              )},
            ]} />
        )}
      </Modal>

      {/* 수령확인 모달 */}
      <Modal title="수령확인" open={receiveModalOpen} onCancel={() => setReceiveModalOpen(false)} onOk={handleConfirmReceive} okText="수령확인" cancelText="취소" width={650}>
        <Alert message="수령한 실제 수량을 입력하세요. 확인 시 도착지 재고가 증가합니다." type="info" showIcon style={{ marginBottom: 16 }} />
        {receiveTarget && (
          <Table size="small" dataSource={(receiveTarget as any).items || []} rowKey="variant_id" pagination={false}
            columns={[
              { title: 'SKU', dataIndex: 'sku', width: 140 },
              { title: '상품명', dataIndex: 'product_name' },
              { title: '출고수량', dataIndex: 'shipped_qty', width: 80 },
              { title: '수령수량', key: 'received', width: 120, render: (_: any, record: any) => (
                <InputNumber min={0} max={record.shipped_qty} value={receivedQtys[record.variant_id] || 0}
                  onChange={(v) => setReceivedQtys({ ...receivedQtys, [record.variant_id]: v || 0 })} style={{ width: '100%' }} />
              )},
            ]} />
        )}
      </Modal>
    </div>
  );
}
