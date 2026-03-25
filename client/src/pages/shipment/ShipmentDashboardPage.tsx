import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Steps, message, Space, Popconfirm, Spin,
} from 'antd';
import {
  SendOutlined, EyeOutlined, CheckCircleOutlined,
  CloseCircleOutlined, RollbackOutlined, SwapOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { STATUS_COLORS, getStatusLabel } from '../../components/shipment/ShipmentConstants';
import ShippedQtyModal from '../../components/shipment/ShippedQtyModal';
import ReceivedQtyModal from '../../components/shipment/ReceivedQtyModal';
import ShipmentDetailModal from '../../components/shipment/ShipmentDetailModal';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { useAuthStore } from '../../modules/auth/auth.store';

interface SummaryRow {
  status: string;
  request_type: string;
  count: number;
  total_request_qty: number;
  total_shipped_qty: number;
}

interface TypeSummary {
  PENDING: { count: number; qty: number };
  SHIPPED: { count: number; qty: number };
  RECEIVED: { count: number; qty: number };
  CANCELLED: { count: number; qty: number };
}

const emptySummary = (): TypeSummary => ({
  PENDING: { count: 0, qty: 0 },
  SHIPPED: { count: 0, qty: 0 },
  RECEIVED: { count: 0, qty: 0 },
  CANCELLED: { count: 0, qty: 0 },
});

type RequestType = '출고' | '반품' | '수평이동';

export default function ShipmentDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Summary by type
  const [shipmentSummary, setShipmentSummary] = useState<TypeSummary>(emptySummary());
  const [returnSummary, setReturnSummary] = useState<TypeSummary>(emptySummary());
  const [transferSummary, setTransferSummary] = useState<TypeSummary>(emptySummary());

  // Per-type list state
  const [shipmentData, setShipmentData] = useState<any[]>([]);
  const [shipmentTotal, setShipmentTotal] = useState(0);
  const [shipmentPage, setShipmentPage] = useState(1);
  const [shipmentListLoading, setShipmentListLoading] = useState(false);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('');

  const [returnData, setReturnData] = useState<any[]>([]);
  const [returnTotal, setReturnTotal] = useState(0);
  const [returnPage, setReturnPage] = useState(1);
  const [returnListLoading, setReturnListLoading] = useState(false);
  const [returnStatusFilter, setReturnStatusFilter] = useState('');

  const [transferData, setTransferData] = useState<any[]>([]);
  const [transferTotal, setTransferTotal] = useState(0);
  const [transferPage, setTransferPage] = useState(1);
  const [transferListLoading, setTransferListLoading] = useState(false);
  const [transferStatusFilter, setTransferStatusFilter] = useState('');

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // Ship confirm modal
  const [shipOpen, setShipOpen] = useState(false);
  const [shipDetail, setShipDetail] = useState<any>(null);
  const [shipQtys, setShipQtys] = useState<Record<number, number>>({});
  const [shipConfirmLoading, setShipConfirmLoading] = useState(false);

  // Receive confirm modal
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvDetail, setRecvDetail] = useState<any>(null);
  const [recvQtys, setRecvQtys] = useState<Record<number, number>>({});
  const [recvConfirmLoading, setRecvConfirmLoading] = useState(false);

  // Expanded rows
  const [expandedDetails, setExpandedDetails] = useState<Record<number, any[]>>({});
  const [expandLoading, setExpandLoading] = useState<Record<number, boolean>>({});

  const baseParams = useCallback((): Record<string, string> => {
    const p: Record<string, string> = {};
    if (user?.partnerCode) p.partner = user.partnerCode;
    return p;
  }, [user?.partnerCode]);

  // --- Summary ---
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const summaryData = await shipmentApi.summary();
      const sShip = emptySummary();
      const sReturn = emptySummary();
      const sTransfer = emptySummary();
      for (const row of summaryData as SummaryRow[]) {
        const target = row.request_type === '출고' ? sShip : row.request_type === '반품' ? sReturn : row.request_type === '수평이동' ? sTransfer : null;
        if (target && target[row.status as keyof TypeSummary]) {
          target[row.status as keyof TypeSummary].count += row.count;
          target[row.status as keyof TypeSummary].qty += row.total_request_qty;
        }
      }
      setShipmentSummary(sShip);
      setReturnSummary(sReturn);
      setTransferSummary(sTransfer);
    } catch (e: any) { message.error(e.message); }
    finally { setSummaryLoading(false); }
  }, []);

  // --- Per-type list loaders ---
  const loadTypeList = useCallback(async (
    type: RequestType, page: number, statusFilter: string,
    setData: (d: any[]) => void, setTotal: (n: number) => void, setLoading: (b: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { ...baseParams(), request_type: type, page: String(page), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [baseParams]);

  const loadShipmentList = useCallback(() => {
    loadTypeList('출고', shipmentPage, shipmentStatusFilter, setShipmentData, setShipmentTotal, setShipmentListLoading);
  }, [loadTypeList, shipmentPage, shipmentStatusFilter]);

  const loadReturnList = useCallback(() => {
    loadTypeList('반품', returnPage, returnStatusFilter, setReturnData, setReturnTotal, setReturnListLoading);
  }, [loadTypeList, returnPage, returnStatusFilter]);

  const loadTransferList = useCallback(() => {
    loadTypeList('수평이동', transferPage, transferStatusFilter, setTransferData, setTransferTotal, setTransferListLoading);
  }, [loadTypeList, transferPage, transferStatusFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadShipmentList(); }, [loadShipmentList]);
  useEffect(() => { loadReturnList(); }, [loadReturnList]);
  useEffect(() => { loadTransferList(); }, [loadTransferList]);

  const refreshAll = () => {
    loadSummary();
    loadShipmentList();
    loadReturnList();
    loadTransferList();
    setExpandedDetails({});
  };

  // --- Handlers ---
  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); }
    catch (e: any) { message.error(e.message); }
  };

  const handleExpand = async (expanded: boolean, record: any) => {
    if (!expanded || expandedDetails[record.request_id]) return;
    setExpandLoading((prev) => ({ ...prev, [record.request_id]: true }));
    try {
      const d = await shipmentApi.get(record.request_id);
      setExpandedDetails((prev) => ({ ...prev, [record.request_id]: (d as any).items || [] }));
    } catch { /* ignore */ }
    setExpandLoading((prev) => ({ ...prev, [record.request_id]: false }));
  };

  const expandedRowRender = (record: any) => {
    const items = expandedDetails[record.request_id];
    if (expandLoading[record.request_id]) return <div style={{ textAlign: 'center', padding: 12 }}>로딩 중...</div>;
    if (!items || items.length === 0) return <div style={{ textAlign: 'center', padding: 12, color: '#999' }}>품목 없음</div>;
    return (
      <Table size="small" dataSource={items} rowKey="item_id" pagination={false}
        columns={[
          { title: 'SKU', dataIndex: 'sku', width: 150 },
          { title: '상품명', dataIndex: 'product_name' },
          { title: '색상', dataIndex: 'color', width: 80 },
          { title: '사이즈', dataIndex: 'size', width: 70 },
          { title: '의뢰', dataIndex: 'request_qty', width: 70, align: 'right' as const },
          { title: '출고', dataIndex: 'shipped_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v ?? 0}</span> },
          { title: '수령', dataIndex: 'received_qty', width: 70, align: 'right' as const,
            render: (v: number) => <span style={{ color: v > 0 ? '#13c2c2' : '#ccc' }}>{v ?? 0}</span> },
        ]}
      />
    );
  };

  const openShipConfirm = async (id: number) => {
    try {
      const d = await shipmentApi.get(id);
      setShipDetail(d);
      const qtys: Record<number, number> = {};
      ((d as any).items || []).forEach((item: any) => { qtys[item.variant_id] = item.request_qty; });
      setShipQtys(qtys);
      setShipOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleShipConfirm = async () => {
    if (!shipDetail) return;
    setShipConfirmLoading(true);
    try {
      const items = Object.entries(shipQtys).map(([vid, qty]) => ({ variant_id: Number(vid), shipped_qty: qty }));
      await shipmentApi.shipConfirm(shipDetail.request_id, items);
      message.success('출고확인 완료');
      setShipOpen(false);
      refreshAll();
    } catch (e: any) { message.error(e.message); }
    finally { setShipConfirmLoading(false); }
  };

  const openRecvConfirm = async (id: number) => {
    try {
      const d = await shipmentApi.get(id);
      setRecvDetail(d);
      const qtys: Record<number, number> = {};
      ((d as any).items || []).forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty; });
      setRecvQtys(qtys);
      setRecvOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleRecvConfirm = async () => {
    if (!recvDetail) return;
    setRecvConfirmLoading(true);
    try {
      const items = Object.entries(recvQtys).map(([vid, qty]) => ({ variant_id: Number(vid), received_qty: qty }));
      await shipmentApi.receive(recvDetail.request_id, items);
      message.success('수령확인 완료');
      setRecvOpen(false);
      refreshAll();
    } catch (e: any) { message.error(e.message); }
    finally { setRecvConfirmLoading(false); }
  };

  const handleCancel = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'CANCELLED' });
      message.success('취소 처리되었습니다.');
      refreshAll();
    } catch (e: any) { message.error(e.message); }
  };

  // --- 권한 판별 ---
  const isAdmin = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'].includes(user?.role || '');
  const myPartner = user?.partnerCode;
  const canShipConfirm = (r: any) => isAdmin || r.from_partner === myPartner;
  const canRecvConfirm = (r: any) => isAdmin || r.to_partner === myPartner;

  // --- Action column ---
  const actionColumn = (record: any) => (
    <Space size={4}>
      <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
      {record.status === 'PENDING' && canShipConfirm(record) && (
        <Button size="small" type="primary" icon={<SendOutlined />}
          onClick={() => openShipConfirm(record.request_id)}>출고확인</Button>
      )}
      {record.status === 'SHIPPED' && canRecvConfirm(record) && (
        <Button size="small" style={{ color: '#08979c', borderColor: '#87e8de' }}
          icon={<CheckCircleOutlined />}
          onClick={() => openRecvConfirm(record.request_id)}>수령확인</Button>
      )}
      {(record.status === 'PENDING' || record.status === 'SHIPPED') && (canShipConfirm(record) || isAdmin) && (
        <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기">
          <Button size="small" danger icon={<CloseCircleOutlined />}>취소</Button>
        </Popconfirm>
      )}
    </Space>
  );

  // --- Column builder ---
  const buildColumns = (extraCols: any[]) => [
    { title: '의뢰번호', dataIndex: 'request_no', width: 130 },
    { title: '의뢰일', dataIndex: 'request_date', width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    ...extraCols,
    { title: '품목', dataIndex: 'item_summary', ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999' }}>({r.item_count}종)</span></span> : '-' },
    { title: '의뢰', dataIndex: 'total_request_qty', width: 60, align: 'right' as const,
      render: (v: number) => <strong>{v || 0}</strong> },
    { title: '출고', dataIndex: 'total_shipped_qty', width: 60, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ccc' }}>{v || 0}</span> },
    { title: '수령', dataIndex: 'total_received_qty', width: 60, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#13c2c2' : '#ccc' }}>{v || 0}</span> },
    { title: '상태', dataIndex: 'status', width: 90,
      render: (v: string, r: any) => <Tag color={STATUS_COLORS[v]}>{getStatusLabel(v, r.request_type)}</Tag> },
    { title: '액션', key: 'action', width: 200, render: (_: any, r: any) => actionColumn(r) },
  ];

  const shipmentColumns = buildColumns([
    { title: '출발', dataIndex: 'from_partner_name', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', width: 100, ellipsis: true, render: (v: string) => v || '-' },
  ]);

  const returnColumns = buildColumns([
    { title: '반품처', dataIndex: 'from_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '입고처', dataIndex: 'to_partner_name', width: 110, ellipsis: true, render: (v: string) => v || '-' },
  ]);

  const transferColumns = buildColumns([
    { title: '출발', dataIndex: 'from_partner_name', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '도착', dataIndex: 'to_partner_name', width: 100, ellipsis: true, render: (v: string) => v || '-' },
  ]);

  // --- Section renderer ---
  const renderSection = (config: {
    title: string;
    icon: React.ReactNode;
    color: string;
    borderColor: string;
    summary: TypeSummary;
    steps: Array<{ status: string; label: string }>;
    data: any[];
    total: number;
    page: number;
    onPageChange: (p: number) => void;
    listLoading: boolean;
    statusFilter: string;
    onStatusFilter: (s: string) => void;
    columns: any[];
    emptyText: string;
  }) => {
    const { title, icon, color, borderColor, summary, steps, data, total, page, onPageChange,
      listLoading, statusFilter, onStatusFilter, columns, emptyText } = config;
    const totalAll = Object.values(summary).reduce((s, v) => s + v.count, 0);

    return (
      <Card
        size="small"
        style={{ borderRadius: 10, marginBottom: 16, borderLeft: `4px solid ${borderColor}` }}
        title={
          <span style={{ fontSize: 15, fontWeight: 600, color }}>
            {icon} <span style={{ marginLeft: 6 }}>{title}</span>
            <Tag style={{ marginLeft: 8, fontSize: 11 }}>{totalAll}건</Tag>
          </span>
        }
      >
        {/* 상태 흐름 — 클릭으로 필터 */}
        <div style={{ padding: '8px 16px', marginBottom: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* 전체 버튼 */}
            <div
              onClick={() => { onStatusFilter(''); }}
              style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                background: !statusFilter ? color : 'transparent',
                color: !statusFilter ? '#fff' : '#666',
                fontWeight: !statusFilter ? 600 : 400,
                fontSize: 13, transition: 'all 0.2s',
                border: !statusFilter ? 'none' : '1px solid #e8e8e8',
              }}
            >
              전체 {totalAll}건
            </div>
            {steps.map((st) => {
              const s = summary[st.status as keyof TypeSummary];
              const active = statusFilter === st.status;
              return (
                <div
                  key={st.status}
                  onClick={() => onStatusFilter(active ? '' : st.status)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                    background: active ? color : 'transparent',
                    color: active ? '#fff' : '#666',
                    fontWeight: active ? 600 : 400,
                    fontSize: 13, transition: 'all 0.2s',
                    border: active ? 'none' : '1px solid #e8e8e8',
                  }}
                >
                  {st.label} <strong>{s.count}</strong>건
                  <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>({s.qty.toLocaleString()})</span>
                </div>
              );
            })}
            {summary.CANCELLED.count > 0 && (
              <div
                onClick={() => onStatusFilter(statusFilter === 'CANCELLED' ? '' : 'CANCELLED')}
                style={{
                  padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                  background: statusFilter === 'CANCELLED' ? '#ff4d4f' : 'transparent',
                  color: statusFilter === 'CANCELLED' ? '#fff' : '#999',
                  fontSize: 13, transition: 'all 0.2s',
                  border: statusFilter === 'CANCELLED' ? 'none' : '1px solid #e8e8e8',
                }}
              >
                취소 {summary.CANCELLED.count}건
              </div>
            )}
          </div>
        </div>

        {/* 테이블 */}
        <Table
          columns={columns}
          dataSource={data}
          rowKey="request_id"
          loading={summaryLoading || listLoading}
          size="small"
          scroll={{ x: 1100 }}
          pagination={{
            current: page, total, pageSize: 50,
            onChange: onPageChange,
            showTotal: (t) => `총 ${t}건`,
            size: 'small',
          }}
          expandable={{ expandedRowRender, onExpand: handleExpand, rowExpandable: () => true }}
          locale={{ emptyText: <div style={{ padding: 16, color: '#bbb' }}>{emptyText}</div> }}
        />
      </Card>
    );
  };

  return (
    <div>
      <PageHeader title="종합출고관리" />

      {/* 섹션 1: 출고 */}
      {renderSection({
        title: '출고 (본사→매장)',
        icon: <SendOutlined />,
        color: '#1890ff',
        borderColor: '#1890ff',
        summary: shipmentSummary,
        steps: [
          { status: 'SHIPPED', label: '출고완료' },
          { status: 'RECEIVED', label: '수령완료' },
        ],
        data: shipmentData,
        total: shipmentTotal,
        page: shipmentPage,
        onPageChange: setShipmentPage,
        listLoading: shipmentListLoading,
        statusFilter: shipmentStatusFilter,
        onStatusFilter: (s) => { setShipmentStatusFilter(s); setShipmentPage(1); },
        columns: shipmentColumns,
        emptyText: '출고 내역이 없습니다',
      })}

      {/* 섹션 2: 반품 */}
      {renderSection({
        title: '반품 (매장→본사)',
        icon: <RollbackOutlined />,
        color: '#fa8c16',
        borderColor: '#fa8c16',
        summary: returnSummary,
        steps: [
          { status: 'PENDING', label: '대기' },
          { status: 'SHIPPED', label: '반품출고' },
          { status: 'RECEIVED', label: '반품수령' },
        ],
        data: returnData,
        total: returnTotal,
        page: returnPage,
        onPageChange: setReturnPage,
        listLoading: returnListLoading,
        statusFilter: returnStatusFilter,
        onStatusFilter: (s) => { setReturnStatusFilter(s); setReturnPage(1); },
        columns: returnColumns,
        emptyText: '반품 내역이 없습니다',
      })}

      {/* 섹션 3: 수평이동 */}
      {renderSection({
        title: '수평이동 (매장↔매장)',
        icon: <SwapOutlined />,
        color: '#722ed1',
        borderColor: '#722ed1',
        summary: transferSummary,
        steps: [
          { status: 'PENDING', label: '대기' },
          { status: 'SHIPPED', label: '이동출고' },
          { status: 'RECEIVED', label: '이동완료' },
        ],
        data: transferData,
        total: transferTotal,
        page: transferPage,
        onPageChange: setTransferPage,
        listLoading: transferListLoading,
        statusFilter: transferStatusFilter,
        onStatusFilter: (s) => { setTransferStatusFilter(s); setTransferPage(1); },
        columns: transferColumns,
        emptyText: '수평이동 내역이 없습니다',
      })}

      {/* 모달들 */}
      <ShipmentDetailModal open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} />

      <ShippedQtyModal
        open={shipOpen}
        detail={shipDetail}
        qtys={shipQtys}
        onQtyChange={(vid, qty) => setShipQtys((prev) => ({ ...prev, [vid]: qty }))}
        onConfirm={handleShipConfirm}
        onCancel={() => setShipOpen(false)}
        confirmLoading={shipConfirmLoading}
      />

      <ReceivedQtyModal
        open={recvOpen}
        detail={recvDetail}
        qtys={recvQtys}
        onQtyChange={(vid, qty) => setRecvQtys((prev) => ({ ...prev, [vid]: qty }))}
        onConfirm={handleRecvConfirm}
        onCancel={() => setRecvOpen(false)}
        confirmLoading={recvConfirmLoading}
      />
    </div>
  );
}
