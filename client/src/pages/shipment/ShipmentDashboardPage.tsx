import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card, Table, Button, Tag, Steps, message, Space, Popconfirm, Spin, Modal, Input,
} from 'antd';
import {
  SendOutlined, EyeOutlined, CheckCircleOutlined,
  CloseCircleOutlined, RollbackOutlined, SwapOutlined,
  ShoppingCartOutlined, AlertOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { STATUS_COLORS, getStatusLabel } from '../../components/shipment/ShipmentConstants';
import ShippedQtyModal from '../../components/shipment/ShippedQtyModal';
import ReceivedQtyModal from '../../components/shipment/ReceivedQtyModal';
import ShipmentDetailModal from '../../components/shipment/ShipmentDetailModal';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';

interface SummaryRow {
  status: string;
  request_type: string;
  count: number;
  total_request_qty: number;
  total_shipped_qty: number;
  as_from_count?: number;  // partner가 발신자인 건수
  as_to_count?: number;    // partner가 수신자인 건수
}

interface StatusEntry {
  count: number; qty: number;
  fromCount: number; toCount: number;  // 방향별 건수 (매장 사용자 전용)
}

interface TypeSummary {
  PENDING: StatusEntry;
  SHIPPED: StatusEntry;
  RECEIVED: StatusEntry;
  CANCELLED: StatusEntry;
  DISCREPANCY: StatusEntry;
}

const emptyEntry = (): StatusEntry => ({ count: 0, qty: 0, fromCount: 0, toCount: 0 });
const emptySummary = (): TypeSummary => ({
  PENDING: emptyEntry(),
  SHIPPED: emptyEntry(),
  RECEIVED: emptyEntry(),
  CANCELLED: emptyEntry(),
  DISCREPANCY: emptyEntry(),
});

type RequestType = '출고' | '반품' | '수평이동' | '출고요청';

export default function ShipmentDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilterApplied = useRef(false);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Summary by type
  const [shipmentSummary, setShipmentSummary] = useState<TypeSummary>(emptySummary());
  const [returnSummary, setReturnSummary] = useState<TypeSummary>(emptySummary());
  const [transferSummary, setTransferSummary] = useState<TypeSummary>(emptySummary());
  const [storeReqSummary, setStoreReqSummary] = useState<TypeSummary>(emptySummary());

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
  const [transferDirection, setTransferDirection] = useState<'' | 'from' | 'to'>('');

  const [storeReqData, setStoreReqData] = useState<any[]>([]);
  const [storeReqTotal, setStoreReqTotal] = useState(0);
  const [storeReqPage, setStoreReqPage] = useState(1);
  const [storeReqListLoading, setStoreReqListLoading] = useState(false);
  const [storeReqStatusFilter, setStoreReqStatusFilter] = useState('');

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // Ship confirm modal
  const [shipOpen, setShipOpen] = useState(false);
  const [shipDetail, setShipDetail] = useState<any>(null);
  const [shipQtys, setShipQtys] = useState<Record<number, number>>({});
  const [shipConfirmLoading, setShipConfirmLoading] = useState(false);
  const [shipStockMap, setShipStockMap] = useState<Record<number, number>>({});

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
      const sStoreReq = emptySummary();
      for (const row of summaryData as SummaryRow[]) {
        const target = row.request_type === '출고' ? sShip : row.request_type === '반품' ? sReturn : row.request_type === '수평이동' ? sTransfer : row.request_type === '출고요청' ? sStoreReq : null;
        const entry = target?.[row.status as keyof TypeSummary];
        if (entry) {
          entry.count += row.count;
          entry.qty += row.total_request_qty;
          entry.fromCount += row.as_from_count || 0;
          entry.toCount += row.as_to_count || 0;
        }
      }
      setShipmentSummary(sShip);
      setReturnSummary(sReturn);
      setTransferSummary(sTransfer);
      setStoreReqSummary(sStoreReq);
    } catch (e: any) { message.error(e.message); }
    finally { setSummaryLoading(false); }
  }, []);

  // --- Per-type list loaders ---
  const loadTypeList = useCallback(async (
    type: RequestType, page: number, statusFilter: string,
    setData: (d: any[]) => void, setTotal: (n: number) => void, setLoading: (b: boolean) => void,
    direction?: 'from' | 'to' | '',
  ) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { ...baseParams(), request_type: type, page: String(page), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      else params.exclude_status = 'RECEIVED,CANCELLED,REJECTED';
      if (direction) params.direction = direction;
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
    loadTypeList('수평이동', transferPage, transferStatusFilter, setTransferData, setTransferTotal, setTransferListLoading, transferDirection);
  }, [loadTypeList, transferPage, transferStatusFilter, transferDirection]);

  const loadStoreReqList = useCallback(() => {
    loadTypeList('출고요청', storeReqPage, storeReqStatusFilter, setStoreReqData, setStoreReqTotal, setStoreReqListLoading);
  }, [loadTypeList, storeReqPage, storeReqStatusFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadShipmentList(); }, [loadShipmentList]);
  useEffect(() => { loadReturnList(); }, [loadReturnList]);
  useEffect(() => { loadTransferList(); }, [loadTransferList]);
  useEffect(() => { loadStoreReqList(); }, [loadStoreReqList]);

  const refreshAll = () => {
    loadSummary();
    loadShipmentList();
    loadReturnList();
    loadTransferList();
    loadStoreReqList();
    setExpandedDetails({});
    setTransferDirection('');
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
            render: (v: number, r: any) => {
              const mismatch = r.shipped_qty > 0 && v !== r.shipped_qty;
              return <span style={{ color: mismatch ? '#fa8c16' : v > 0 ? '#13c2c2' : '#ccc', fontWeight: mismatch ? 600 : 400 }}>{v ?? 0}{mismatch ? ' !' : ''}</span>;
            } },
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
      // 출고처 재고 조회
      const fromPartner = (d as any).from_partner;
      if (fromPartner) {
        try {
          const res = await apiFetch(`/api/inventory?partner_code=${fromPartner}&limit=5000&page=1`);
          const json = await res.json();
          if (json.success && json.data?.data) {
            const map: Record<number, number> = {};
            for (const row of json.data.data) map[row.variant_id] = row.qty;
            setShipStockMap(map);
          } else { setShipStockMap({}); }
        } catch { setShipStockMap({}); }
      } else { setShipStockMap({}); }
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
      const result = await shipmentApi.receive(recvDetail.request_id, items);
      if ((result as any).status === 'DISCREPANCY') {
        message.success('수령수량이 갱신되었습니다. 최종 확정은 관리자가 처리합니다.');
      } else {
        message.success('수령확인 완료');
      }
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

  const handleReject = (id: number) => {
    let reason = '';
    Modal.confirm({
      title: '출고요청 거절',
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>거절 사유</div>
          <Input.TextArea rows={3} placeholder="거절 사유를 입력해주세요"
            onChange={(e) => { reason = e.target.value; }} />
        </div>
      ),
      okText: '거절', cancelText: '닫기', okButtonProps: { danger: true },
      async onOk() {
        if (!reason.trim()) { message.warning('거절 사유를 입력해주세요.'); throw new Error('cancel'); }
        try {
          await shipmentApi.update(id, { status: 'REJECTED', reject_reason: reason.trim() });
          message.success('출고요청이 거절되었습니다.');
          refreshAll();
        } catch (e: any) { message.error(e.message); throw e; }
      },
    });
  };

  // --- 권한 판별 ---
  const isAdmin = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'].includes(user?.role || '');
  const isStoreUser = !isAdmin && !!user?.partnerCode;
  const myPartner = user?.partnerCode;
  // 출고확인: 보내는 쪽(from_partner) 또는 관리자
  const canShipConfirm = (r: any) => isAdmin || r.from_partner === myPartner;
  // 수령확인: 받는 쪽(to_partner)만 — 관리자는 반품 수령만 가능
  const canRecvConfirm = (r: any) => {
    if (isAdmin) return r.request_type === '반품';
    return r.to_partner === myPartner;
  };
  // 취소: 처음 등록한 사람만 가능
  const canCancel = (r: any) => r.requested_by === user?.userId;

  // --- 문제확인중 → 완료처리 (관리자) ---
  const handleResolveDiscrepancy = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'RECEIVED' });
      message.success('수량 불일치가 확인 처리되었습니다.');
      refreshAll();
    } catch (e: any) { message.error(e.message); }
  };

  // --- Action column ---
  const actionColumn = (record: any) => (
    <Space size={4}>
      <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
      {record.status === 'PENDING' && canShipConfirm(record) && (
        <Button size="small" type="primary" icon={<SendOutlined />}
          onClick={() => openShipConfirm(record.request_id)}>출고확인</Button>
      )}
      {record.status === 'PENDING' && isAdmin && record.request_type === '출고요청' && (
        <Button size="small" danger icon={<StopOutlined />}
          onClick={() => handleReject(record.request_id)}>거절</Button>
      )}
      {record.status === 'SHIPPED' && canRecvConfirm(record) && (
        <Button size="small" style={{ color: '#08979c', borderColor: '#87e8de' }}
          icon={<CheckCircleOutlined />}
          onClick={() => openRecvConfirm(record.request_id)}>수령확인</Button>
      )}
      {record.status === 'DISCREPANCY' && canRecvConfirm(record) && (
        <Button size="small" style={{ color: '#fa8c16', borderColor: '#ffd591' }}
          icon={<ExclamationCircleOutlined />}
          onClick={() => openRecvConfirm(record.request_id)}>수량재확인</Button>
      )}
      {record.status === 'DISCREPANCY' && isAdmin && (
        <Popconfirm title="수량 불일치를 확인하고 완료 처리하시겠습니까?" onConfirm={() => handleResolveDiscrepancy(record.request_id)} okText="완료처리" cancelText="닫기">
          <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}
            icon={<CheckCircleOutlined />}>완료처리</Button>
        </Popconfirm>
      )}
      {record.status === 'PENDING' && canCancel(record) && (
        <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기">
          <Button size="small" danger icon={<CloseCircleOutlined />}>취소</Button>
        </Popconfirm>
      )}
      {record.status === 'SHIPPED' && canCancel(record) && (
        <Popconfirm title="취소하면 출고 재고가 복구됩니다. 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기">
          <Button size="small" danger icon={<CloseCircleOutlined />}>취소</Button>
        </Popconfirm>
      )}
      {record.status === 'DISCREPANCY' && canCancel(record) && (
        <Popconfirm title="취소하면 재고가 복구됩니다. 취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)} okText="취소처리" cancelText="닫기">
          <Button size="small" danger icon={<CloseCircleOutlined />}>취소</Button>
        </Popconfirm>
      )}
    </Space>
  );

  // --- Column builder ---
  const buildColumns = (extraCols: any[]) => [
    { title: '의뢰번호', dataIndex: 'request_no', width: 130 },
    { title: '의뢰일', dataIndex: 'request_date', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-' },
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
      render: (v: string, r: any) => {
        const isReceiver = !isAdmin && myPartner === r.to_partner;
        return <Tag color={STATUS_COLORS[v]}>{getStatusLabel(v, r.request_type, isReceiver)}</Tag>;
      } },
    { title: '액션', key: 'action', width: 260, render: (_: any, r: any) => actionColumn(r) },
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

  const storeReqColumns = buildColumns([
    { title: '요청매장', dataIndex: 'to_partner_name', width: 110, ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999', fontSize: 11 }}>({r.to_partner})</span></span> : '-' },
    { title: '출고창고', dataIndex: 'from_partner_name', width: 130, ellipsis: true,
      render: (v: string, r: any) => v ? <span>{v} <span style={{ color: '#999', fontSize: 11 }}>({r.from_partner})</span></span> : '-' },
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
    // 전체 건수: 진행중(PENDING + SHIPPED + DISCREPANCY)만 합산
    const activeCount = summary.PENDING.count + summary.SHIPPED.count + summary.DISCREPANCY.count;

    return (
      <Card
        size="small"
        style={{ borderRadius: 10, marginBottom: 16, borderLeft: `4px solid ${borderColor}` }}
        title={
          <span style={{ fontSize: 15, fontWeight: 600, color }}>
            {icon} <span style={{ marginLeft: 6 }}>{title}</span>
            <Tag style={{ marginLeft: 8, fontSize: 11 }}>{activeCount}건</Tag>
          </span>
        }
      >
        {/* 상태 칩 — 클릭으로 필터 */}
        <div style={{ padding: '8px 16px', marginBottom: 12, background: '#fafafa', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {steps.map((st) => {
              const s = summary[st.status as keyof TypeSummary];
              const active = statusFilter.split(',').includes(st.status);
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
                </div>
              );
            })}
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

  // --- 해야할일 / 대기중 계산 ---
  // ADMIN: 해야할일 = 반품.SHIPPED(수령) + 수량불일치
  //        대기중   = 출고.SHIPPED(매장수령대기) + 수평이동.SHIPPED(수령대기)
  // Store: 해야할일 = 출고.SHIPPED(수령) + 출고요청.SHIPPED(수령) + 수평이동.SHIPPED(to=나, 수령)
  //        대기중   = 출고요청.PENDING(본사승인대기) + 반품.SHIPPED(본사수령대기) + 수평이동.SHIPPED(from=나, 상대수령대기)
  const allDiscrepancy = shipmentSummary.DISCREPANCY.count + returnSummary.DISCREPANCY.count
    + transferSummary.DISCREPANCY.count + storeReqSummary.DISCREPANCY.count;

  const todoCount = isAdmin
    ? storeReqSummary.PENDING.count + returnSummary.SHIPPED.count + allDiscrepancy
    : shipmentSummary.SHIPPED.count + storeReqSummary.SHIPPED.count
      + transferSummary.SHIPPED.toCount
      + shipmentSummary.DISCREPANCY.count + storeReqSummary.DISCREPANCY.count
      + transferSummary.DISCREPANCY.toCount;
  const waitingCount = isAdmin
    ? shipmentSummary.SHIPPED.count + storeReqSummary.SHIPPED.count + transferSummary.SHIPPED.count
    : storeReqSummary.PENDING.count + returnSummary.SHIPPED.count
      + transferSummary.SHIPPED.fromCount;

  const [globalFilter, setGlobalFilter] = useState<'' | 'todo' | 'waiting'>('');

  const applyGlobalFilter = (mode: 'todo' | 'waiting') => {
    if (globalFilter === mode) {
      // 해제: 모든 필터 초기화
      setGlobalFilter('');
      setShipmentStatusFilter(''); setShipmentPage(1);
      setReturnStatusFilter(''); setReturnPage(1);
      setTransferStatusFilter(''); setTransferPage(1); setTransferDirection('');
      setStoreReqStatusFilter(''); setStoreReqPage(1);
      return;
    }
    setGlobalFilter(mode);
    if (mode === 'todo') {
      if (isAdmin) {
        // ADMIN 해야할일: 출고요청 승인대기 + 반품 수령 + 수량불일치
        setShipmentStatusFilter('DISCREPANCY'); setShipmentPage(1);
        setReturnStatusFilter('SHIPPED,DISCREPANCY'); setReturnPage(1);
        setTransferStatusFilter('DISCREPANCY'); setTransferPage(1); setTransferDirection('');
        setStoreReqStatusFilter('PENDING,DISCREPANCY'); setStoreReqPage(1);
      } else {
        // 매장 해야할일: 출고/출고요청 수령 + 수평이동 수령(to=나) + 수량불일치
        setShipmentStatusFilter('SHIPPED,DISCREPANCY'); setShipmentPage(1);
        setReturnStatusFilter('PENDING'); setReturnPage(1);
        setTransferStatusFilter('SHIPPED,DISCREPANCY'); setTransferPage(1); setTransferDirection('to');
        setStoreReqStatusFilter('SHIPPED,DISCREPANCY'); setStoreReqPage(1);
      }
    } else {
      if (isAdmin) {
        // ADMIN 대기중: 출고 매장수령대기 + 출고요청 출고완료(매장수령대기) + 수평이동 수령대기
        setShipmentStatusFilter('SHIPPED'); setShipmentPage(1);
        setReturnStatusFilter('PENDING'); setReturnPage(1);
        setTransferStatusFilter('SHIPPED'); setTransferPage(1); setTransferDirection('');
        setStoreReqStatusFilter('SHIPPED'); setStoreReqPage(1);
      } else {
        // 매장 대기중: 출고요청 본사승인대기 + 반품 본사수령대기 + 수평이동 상대수령대기(from=나)
        setShipmentStatusFilter('PENDING'); setShipmentPage(1);
        setReturnStatusFilter('SHIPPED'); setReturnPage(1);
        setTransferStatusFilter('SHIPPED'); setTransferPage(1); setTransferDirection('from');
        setStoreReqStatusFilter('PENDING'); setStoreReqPage(1);
      }
    }
  };

  // URL 파라미터로 전달된 필터 자동 적용 (대시보드 → 종합출고관리)
  useEffect(() => {
    if (initialFilterApplied.current) return;
    const filterParam = searchParams.get('filter');
    if (filterParam === 'todo' || filterParam === 'waiting') {
      initialFilterApplied.current = true;
      applyGlobalFilter(filterParam);
      // URL에서 파라미터 제거 (뒤로가기 시 재적용 방지)
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // 해야할일 상세 내역 (카드 하단 텍스트)
  const todoDetails = isAdmin
    ? [
        storeReqSummary.PENDING.count > 0 && `출고요청 ${storeReqSummary.PENDING.count}건`,
        returnSummary.SHIPPED.count > 0 && `반품수령 ${returnSummary.SHIPPED.count}건`,
        allDiscrepancy > 0 && `수량불일치 ${allDiscrepancy}건`,
      ].filter(Boolean)
    : [
        shipmentSummary.SHIPPED.count > 0 && `출고수령 ${shipmentSummary.SHIPPED.count}건`,
        storeReqSummary.SHIPPED.count > 0 && `요청수령 ${storeReqSummary.SHIPPED.count}건`,
        transferSummary.SHIPPED.toCount > 0 && `이동수령 ${transferSummary.SHIPPED.toCount}건`,
        (shipmentSummary.DISCREPANCY.count + storeReqSummary.DISCREPANCY.count + transferSummary.DISCREPANCY.toCount) > 0
          && `수량불일치 ${shipmentSummary.DISCREPANCY.count + storeReqSummary.DISCREPANCY.count + transferSummary.DISCREPANCY.toCount}건`,
      ].filter(Boolean);

  const waitingDetails = isAdmin
    ? [
        shipmentSummary.SHIPPED.count > 0 && `출고수령대기 ${shipmentSummary.SHIPPED.count}건`,
        storeReqSummary.SHIPPED.count > 0 && `요청수령대기 ${storeReqSummary.SHIPPED.count}건`,
        transferSummary.SHIPPED.count > 0 && `이동수령대기 ${transferSummary.SHIPPED.count}건`,
      ].filter(Boolean)
    : [
        storeReqSummary.PENDING.count > 0 && `출고요청대기 ${storeReqSummary.PENDING.count}건`,
        returnSummary.SHIPPED.count > 0 && `반품수령대기 ${returnSummary.SHIPPED.count}건`,
        transferSummary.SHIPPED.fromCount > 0 && `이동수령대기 ${transferSummary.SHIPPED.fromCount}건`,
      ].filter(Boolean);

  return (
    <div>
      <PageHeader title="종합출고관리" />

      {/* 상단 요약: 해야할일 / 대기중 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card
          hoverable
          onClick={() => applyGlobalFilter('todo')}
          style={{
            cursor: 'pointer', borderRadius: 12,
            borderColor: globalFilter === 'todo' ? '#ff4d4f' : '#f0f0f0',
            boxShadow: globalFilter === 'todo' ? '0 0 0 2px #ff4d4f30' : 'none',
            transition: 'all 0.2s',
          }}
          styles={{ body: { padding: '20px 24px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: '#fff2f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, color: '#ff4d4f',
            }}>
              <AlertOutlined />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>해야할일</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: todoCount > 0 ? '#ff4d4f' : '#bbb', lineHeight: 1 }}>
                {summaryLoading ? '-' : todoCount}
              </div>
            </div>
          </div>
          {todoDetails.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#666', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {todoDetails.map((t, i) => (
                <span key={i} style={{ background: '#fff2f0', padding: '2px 8px', borderRadius: 4, color: '#ff4d4f' }}>{t}</span>
              ))}
            </div>
          )}
        </Card>
        <Card
          hoverable
          onClick={() => applyGlobalFilter('waiting')}
          style={{
            cursor: 'pointer', borderRadius: 12,
            borderColor: globalFilter === 'waiting' ? '#1677ff' : '#f0f0f0',
            boxShadow: globalFilter === 'waiting' ? '0 0 0 2px #1677ff30' : 'none',
            transition: 'all 0.2s',
          }}
          styles={{ body: { padding: '20px 24px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: '#e6f4ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, color: '#1677ff',
            }}>
              <ClockCircleOutlined />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>대기중</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: waitingCount > 0 ? '#1677ff' : '#bbb', lineHeight: 1 }}>
                {summaryLoading ? '-' : waitingCount}
              </div>
            </div>
          </div>
          {waitingDetails.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#666', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {waitingDetails.map((t, i) => (
                <span key={i} style={{ background: '#e6f4ff', padding: '2px 8px', borderRadius: 4, color: '#1677ff' }}>{t}</span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 섹션 1: 출고 */}
      {renderSection({
        title: '출고 (본사→매장)',
        icon: <SendOutlined />,
        color: '#1890ff',
        borderColor: '#1890ff',
        summary: shipmentSummary,
        steps: isStoreUser
          ? [{ status: 'SHIPPED', label: '수령대기' }, { status: 'DISCREPANCY', label: '수량불일치' }, { status: 'RECEIVED', label: '수령완료' }]
          : [{ status: 'SHIPPED', label: '출고완료' }, { status: 'DISCREPANCY', label: '수량불일치' }, { status: 'RECEIVED', label: '수령완료' }],
        data: shipmentData,
        total: shipmentTotal,
        page: shipmentPage,
        onPageChange: setShipmentPage,
        listLoading: shipmentListLoading,
        statusFilter: shipmentStatusFilter,
        onStatusFilter: (s) => { setGlobalFilter(''); setShipmentStatusFilter(s); setShipmentPage(1); },
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
        steps: isAdmin
          ? [{ status: 'PENDING', label: '대기' }, { status: 'SHIPPED', label: '수령대기' }, { status: 'DISCREPANCY', label: '수량불일치' }, { status: 'RECEIVED', label: '반품수령' }]
          : [{ status: 'PENDING', label: '대기' }, { status: 'SHIPPED', label: '반품출고' }, { status: 'DISCREPANCY', label: '수량불일치' }, { status: 'RECEIVED', label: '반품수령' }],
        data: returnData,
        total: returnTotal,
        page: returnPage,
        onPageChange: setReturnPage,
        listLoading: returnListLoading,
        statusFilter: returnStatusFilter,
        onStatusFilter: (s) => { setGlobalFilter(''); setReturnStatusFilter(s); setReturnPage(1); },
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
          { status: 'SHIPPED', label: isStoreUser ? '출고/수령대기' : '이동출고' },
          { status: 'DISCREPANCY', label: '수량불일치' },
          { status: 'RECEIVED', label: '이동완료' },
        ],
        data: transferData,
        total: transferTotal,
        page: transferPage,
        onPageChange: setTransferPage,
        listLoading: transferListLoading,
        statusFilter: transferStatusFilter,
        onStatusFilter: (s) => { setGlobalFilter(''); setTransferStatusFilter(s); setTransferDirection(''); setTransferPage(1); },
        columns: transferColumns,
        emptyText: '수평이동 내역이 없습니다',
      })}

      {/* 섹션 4: 출고요청 */}
      {renderSection({
        title: '출고요청 (매장→본사)',
        icon: <ShoppingCartOutlined />,
        color: '#13c2c2',
        borderColor: '#13c2c2',
        summary: storeReqSummary,
        steps: [
          { status: 'PENDING', label: '요청중' },
          { status: 'SHIPPED', label: isStoreUser ? '수령대기' : '출고완료' },
          { status: 'DISCREPANCY', label: '수량불일치' },
          { status: 'RECEIVED', label: '수령완료' },
        ],
        data: storeReqData,
        total: storeReqTotal,
        page: storeReqPage,
        onPageChange: setStoreReqPage,
        listLoading: storeReqListLoading,
        statusFilter: storeReqStatusFilter,
        onStatusFilter: (s) => { setGlobalFilter(''); setStoreReqStatusFilter(s); setStoreReqPage(1); },
        columns: storeReqColumns,
        emptyText: '출고요청 내역이 없습니다',
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
        stockMap={shipStockMap}
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
