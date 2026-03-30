import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Button, Input, DatePicker, message, Row, Col, Tag, Modal, Space, Popconfirm,
  Segmented, Select, InputNumber,
} from 'antd';
import {
  SearchOutlined, InboxOutlined,
  DeleteOutlined, ClockCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inboundApi } from '../../modules/inbound/inbound.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { apiFetch } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import { datePresets } from '../../utils/date-presets';
import { fmt } from '../../utils/format';
import type { InboundRecord, InboundItem } from '../../../../shared/types/inbound';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface Summary {
  total_count: number; total_qty: number;
  pending_count: number; pending_qty: number;
  completed_count: number; completed_qty: number;
  manual_count: number; manual_qty: number;
  by_partner: Array<{ partner_code: string; partner_name: string; count: number; total_qty: number }>;
}

const CARD_STYLES = [
  { bg: '#fff1f0', text: '#cf1322', border: '#ffa39e', label: '입고대기', icon: <ClockCircleOutlined />, key: 'pending', qtyLabel: '예상' },
  { bg: '#f6ffed', text: '#52c41a', border: '#b7eb8f', label: '입고완료', icon: <CheckCircleOutlined />, key: 'completed', qtyLabel: '총' },
  { bg: '#e6f7ff', text: '#1890ff', border: '#91d5ff', label: '수동입고', icon: <InboxOutlined />, key: 'manual', qtyLabel: '총' },
];

interface ConfirmItem {
  key: string;
  variant_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  qty: number;
  unit_price: number;
}

export default function InboundDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user && [ROLES.ADMIN, ROLES.SYS_ADMIN].includes(user.role as any);
  const isHQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user?.role as any);

  // Summary
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // List
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [loadTrigger, setLoadTrigger] = useState(0);
  const triggerLoad = () => { setPage(1); setLoadTrigger((p) => p + 1); };

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<InboundRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Confirm modal (입고확정)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRecord, setConfirmRecord] = useState<InboundRecord | null>(null);
  const [confirmItems, setConfirmItems] = useState<ConfirmItem[]>([]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const result = await inboundApi.summary();
      setSummary(result);
    } catch (e: any) { message.error(e.message); }
    finally { setSummaryLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter) params.partner_code = partnerFilter;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source_type = sourceFilter;
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      const result = await inboundApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, partnerFilter, statusFilter, sourceFilter, dateRange]);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadList();
  }, [loadSummary, loadList]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [page, loadTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Summary card values
  const cardValues = summary ? [
    { count: summary.pending_count, qty: summary.pending_qty },
    { count: summary.completed_count, qty: summary.completed_qty },
    { count: summary.manual_count, qty: summary.manual_qty },
  ] : Array(3).fill({ count: 0, qty: 0 });

  // Detail
  const showDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await apiFetch(`/api/inbounds/${id}`);
      const d = await res.json();
      if (d.success) setDetailData(d.data);
      else message.error(d.error || '상세 조회 실패');
    } catch (e: any) { message.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await inboundApi.remove(id);
      message.success('입고가 삭제되었습니다 (재고 원복됨).');
      setDetailOpen(false);
      refreshAll();
    } catch (e: any) { message.error(e.message); }
  };

  const handlePartnerClick = (partnerCode: string) => {
    setPartnerFilter((prev) => prev === partnerCode ? '' : partnerCode);
    triggerLoad();
  };

  // ── 입고확정 관련 ──
  const openConfirmModal = (record: InboundRecord) => {
    setConfirmRecord(record);
    setConfirmItems([]);
    setConfirmOpen(true);
    setDetailOpen(false);
  };

  const handleVariantSearch = (value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value || value.length < 1) { setVariantOptions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch(`/api/products/variants/search?search=${encodeURIComponent(value)}`);
        const d = await res.json();
        if (d.success) {
          setVariantOptions((d.data || []).map((v: any) => ({
            label: `${v.product_code} · ${v.product_name} · ${v.color}/${v.size}`,
            value: v.variant_id,
            raw: v,
          })));
        }
      } catch { /* ignore */ }
      finally { setSearchLoading(false); }
    }, 250);
  };

  const handleVariantSelect = (_value: number, option: any) => {
    const row = option.raw;
    if (confirmItems.find((i) => i.variant_id === row.variant_id)) {
      message.warning('이미 추가된 항목입니다.');
      return;
    }
    setConfirmItems((prev) => [
      ...prev,
      {
        key: `${row.variant_id}-${Date.now()}`,
        variant_id: row.variant_id,
        product_code: row.product_code,
        product_name: row.product_name,
        sku: row.sku,
        color: row.color,
        size: row.size,
        qty: 1,
        unit_price: row.base_price || 0,
      },
    ]);
  };

  const updateConfirmItem = (key: string, field: string, value: number) => {
    setConfirmItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const removeConfirmItem = (key: string) => {
    setConfirmItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleConfirm = async () => {
    if (!confirmRecord) return;
    if (confirmItems.length === 0) {
      message.warning('입고할 품목을 추가해주세요.');
      return;
    }
    if (confirmRecord.expected_qty && confirmTotalQty !== confirmRecord.expected_qty) {
      message.error(`입고 수량(${confirmTotalQty}개)이 예상 수량(${confirmRecord.expected_qty}개)과 일치하지 않습니다.`);
      return;
    }
    setConfirmLoading(true);
    try {
      await inboundApi.confirm(confirmRecord.record_id, confirmItems.map((i) => ({
        variant_id: i.variant_id,
        qty: i.qty,
        unit_price: i.unit_price || undefined,
      })));
      message.success('입고가 확정되었습니다. 재고가 반영되었습니다.');
      setConfirmOpen(false);
      refreshAll();
    } catch (e: any) {
      message.error(e.message || '입고확정 실패');
    } finally {
      setConfirmLoading(false);
    }
  };

  const columns: any[] = [
    { title: '입고번호', dataIndex: 'inbound_no', width: 140 },
    { title: '상태', dataIndex: 'status', width: 80,
      render: (v: string) => v === 'PENDING'
        ? <Tag color="orange">대기중</Tag>
        : <Tag color="green">완료</Tag>,
    },
    { title: '입고일', dataIndex: 'inbound_date', width: 120,
      render: (v: string) => v ? dayjs(v).format('MM.DD HH:mm') : '-' },
    { title: '거래처', dataIndex: 'partner_name', width: 130, ellipsis: true,
      render: (v: string, r: any) => (
        <a onClick={(e) => { e.stopPropagation(); handlePartnerClick(r.partner_code); }}
          style={{ color: partnerFilter === r.partner_code ? '#1890ff' : undefined }}>
          {v || '-'}
        </a>
      ) },
    { title: '출처', dataIndex: 'source_type', width: 120,
      render: (_: string, r: any) => r.source_type === 'PRODUCTION'
        ? <Tag color="purple">{r.plan_no || '생산'}</Tag>
        : <span style={{ color: '#999' }}>수동</span>,
    },
    { title: '품목수', dataIndex: 'item_count', width: 80, render: (v: number) => `${v}건` },
    { title: '총수량', dataIndex: 'total_qty', width: 90, align: 'right' as const,
      render: (v: number, r: any) => r.status === 'PENDING'
        ? <span style={{ color: '#fa8c16' }}>예상 {fmt(r.expected_qty || 0)}</span>
        : <strong>{fmt(v)}</strong>,
    },
    { title: '비고', dataIndex: 'memo', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '등록일시', dataIndex: 'created_at', width: 140,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
  ];

  const detailItemCols = [
    { title: '품번', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 160 },
    { title: '컬러', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 65 },
    { title: '수량', dataIndex: 'qty', width: 80, align: 'right' as const,
      render: (v: number) => <strong>{fmt(v)}</strong> },
    { title: '원가(원)', dataIndex: 'unit_price', width: 100,
      render: (v: number | null) => v != null ? fmt(v) + '원' : '-' },
  ];

  const confirmItemCols = [
    { title: '품번', dataIndex: 'product_code', width: 100 },
    { title: '상품명', dataIndex: 'product_name', width: 150, ellipsis: true },
    { title: '컬러/사이즈', width: 100,
      render: (_: unknown, r: ConfirmItem) => `${r.color}/${r.size}` },
    { title: '수량', dataIndex: 'qty', width: 90,
      render: (_: number, r: ConfirmItem) => (
        <InputNumber min={1} value={r.qty} size="small" style={{ width: 70 }}
          onChange={(v) => updateConfirmItem(r.key, 'qty', v || 1)} />
      ),
    },
    { title: '원가(원)', dataIndex: 'unit_price', width: 110,
      render: (_: number, r: ConfirmItem) => (
        <InputNumber min={0} value={r.unit_price} size="small" style={{ width: 100 }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number((v || '').replace(/,/g, ''))}
          onChange={(v) => updateConfirmItem(r.key, 'unit_price', v || 0)} />
      ),
    },
    { title: '', width: 40,
      render: (_: unknown, r: ConfirmItem) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeConfirmItem(r.key)} />
      ),
    },
  ];

  const confirmTotalQty = confirmItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div>
      <PageHeader title="종합입고관리" />

      {/* 요약 카드 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {CARD_STYLES.map((style, i) => {
          const v = cardValues[i];
          const handleCardClick = () => {
            if (style.key === 'pending') { setStatusFilter('PENDING'); setSourceFilter(''); }
            else if (style.key === 'completed') { setStatusFilter('COMPLETED'); setSourceFilter(''); }
            else if (style.key === 'manual') { setStatusFilter('COMPLETED'); setSourceFilter('MANUAL'); }
            triggerLoad();
          };
          return (
            <Col xs={24} sm={8} key={style.label}>
              <div style={{
                background: style.bg, borderRadius: 8, padding: '12px 16px', textAlign: 'center',
                border: `1px solid ${style.border}`, cursor: 'pointer',
              }}
              onClick={handleCardClick}>
                <div style={{ fontSize: 11, color: style.text, opacity: 0.8 }}>
                  {style.icon} {style.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: style.text }}>
                  {summaryLoading ? '-' : `${v.count}건`}
                </div>
                <div style={{ fontSize: 11, color: style.text, opacity: 0.7 }}>
                  {style.qtyLabel} {summaryLoading ? '-' : fmt(v.qty)}수량
                </div>
              </div>
            </Col>
          );
        })}
      </Row>

      {/* 거래처별 입고 현황 */}
      {summary && summary.by_partner.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>거래처별 입고 현황 (상위 10)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {summary.by_partner.map((p) => (
              <Tag
                key={p.partner_code}
                color={partnerFilter === p.partner_code ? 'blue' : undefined}
                style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px' }}
                onClick={() => handlePartnerClick(p.partner_code)}
              >
                {p.partner_name} <strong>{p.count}</strong>건 / {fmt(p.total_qty)}수량
              </Tag>
            ))}
            {partnerFilter && (
              <Tag color="red" style={{ cursor: 'pointer' }} onClick={() => { setPartnerFilter(''); triggerLoad(); }}>
                필터 해제
              </Tag>
            )}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>분류</div>
          <Segmented
            value={`${statusFilter}|${sourceFilter}`}
            onChange={(v) => {
              const val = v as string;
              if (val === '|') { setStatusFilter(''); setSourceFilter(''); }
              else if (val === 'PENDING|') { setStatusFilter('PENDING'); setSourceFilter(''); }
              else if (val === 'COMPLETED|') { setStatusFilter('COMPLETED'); setSourceFilter(''); }
              else if (val === 'COMPLETED|MANUAL') { setStatusFilter('COMPLETED'); setSourceFilter('MANUAL'); }
              triggerLoad();
            }}
            options={[
              { label: '전체', value: '|' },
              { label: '입고대기', value: 'PENDING|' },
              { label: '입고완료', value: 'COMPLETED|' },
              { label: '수동입고', value: 'COMPLETED|MANUAL' },
            ]}
          />
        </div>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="입고번호 검색" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={triggerLoad}
            style={{ width: '100%' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={(v) => { setDateRange(v as any); triggerLoad(); }} />
        </div>
        <Button onClick={triggerLoad}>조회</Button>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="record_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
        onRow={(r) => ({
          onClick: () => showDetail(r.record_id),
          style: {
            cursor: 'pointer',
            background: r.status === 'PENDING' ? '#fffbe6' : undefined,
          },
        })}
      />

      {/* 상세 모달 */}
      <Modal
        title={detailData ? `입고 상세 — ${detailData.inbound_no}` : '입고 상세'}
        open={detailOpen} onCancel={() => setDetailOpen(false)} width={850}
        footer={
          detailData ? (
            <Space>
              {detailData.status === 'PENDING' && isHQ && (
                <Button type="primary" icon={<CheckCircleOutlined />}
                  onClick={() => openConfirmModal(detailData)}>
                  입고확정
                </Button>
              )}
              {isAdmin && detailData.status === 'COMPLETED' && (
                <Popconfirm title="삭제하면 재고가 원복됩니다. 삭제하시겠습니까?"
                  onConfirm={() => handleDelete(detailData.record_id)}>
                  <Button danger icon={<DeleteOutlined />}>삭제 (재고 원복)</Button>
                </Popconfirm>
              )}
              {isAdmin && detailData.status === 'PENDING' && (
                <Popconfirm title="대기중 입고를 삭제하시겠습니까?"
                  onConfirm={() => handleDelete(detailData.record_id)}>
                  <Button danger icon={<DeleteOutlined />}>삭제</Button>
                </Popconfirm>
              )}
              <Button onClick={() => setDetailOpen(false)}>닫기</Button>
            </Space>
          ) : <Button onClick={() => setDetailOpen(false)}>닫기</Button>
        }
      >
        {detailData && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={5}>
                <Tag color="blue">{detailData.inbound_no}</Tag>
                {detailData.status === 'PENDING'
                  ? <Tag color="orange">대기중</Tag>
                  : <Tag color="green">완료</Tag>}
              </Col>
              <Col span={5}>거래처: <strong>{detailData.partner_name}</strong></Col>
              <Col span={5}>입고일: <strong>{dayjs(detailData.inbound_date).format('YYYY-MM-DD')}</strong></Col>
              <Col span={5}>등록자: <strong>{detailData.created_by}</strong></Col>
              {detailData.plan_no && (
                <Col span={4}>출처: <Tag color="purple">{detailData.plan_no}</Tag></Col>
              )}
            </Row>
            {detailData.expected_qty != null && detailData.status === 'PENDING' && (
              <div style={{ marginBottom: 8, color: '#fa8c16', fontWeight: 500 }}>
                예상 수량: {fmt(detailData.expected_qty)}개
              </div>
            )}
            {detailData.memo && <div style={{ marginBottom: 8, color: '#666' }}>비고: {detailData.memo}</div>}
            {detailData.status === 'COMPLETED' && (
              <>
                <Table dataSource={detailData.items || []} columns={detailItemCols} rowKey="item_id"
                  size="small" pagination={false} loading={detailLoading} />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                  <span>총 품목: <strong>{(detailData.items || []).length}</strong>건</span>
                  <span>총 수량: <strong>{fmt((detailData.items || []).reduce((s: number, i: InboundItem) => s + i.qty, 0))}</strong>개</span>
                </div>
              </>
            )}
            {detailData.status === 'PENDING' && (
              <>
                <div style={{ padding: 16, background: '#fffbe6', borderRadius: 8, textAlign: 'center', color: '#fa8c16' }}>
                  입고확정 버튼을 눌러 품목을 추가하고 재고를 반영하세요.
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 입고확정 모달 */}
      <Modal
        title={confirmRecord ? `입고확정 — ${confirmRecord.inbound_no}` : '입고확정'}
        open={confirmOpen} onCancel={() => setConfirmOpen(false)} width={900}
        footer={
          <Space>
            <Button onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button type="primary" icon={<CheckCircleOutlined />}
              onClick={handleConfirm} loading={confirmLoading}
              disabled={confirmItems.length === 0}>
              입고확정 ({confirmTotalQty}개)
            </Button>
          </Space>
        }
      >
        {confirmRecord && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={6}><Tag color="blue">{confirmRecord.inbound_no}</Tag></Col>
              <Col span={6}>거래처: <strong>{confirmRecord.partner_name}</strong></Col>
              <Col span={6}>입고일: <strong>{dayjs(confirmRecord.inbound_date).format('YYYY-MM-DD')}</strong></Col>
              {confirmRecord.expected_qty != null && (
                <Col span={6}>예상 수량: <strong style={{ color: '#fa8c16' }}>{fmt(confirmRecord.expected_qty)}개</strong></Col>
              )}
            </Row>
            {confirmRecord.memo && <div style={{ marginBottom: 12, color: '#666' }}>비고: {confirmRecord.memo}</div>}

            {/* 상품 검색 */}
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <SearchOutlined style={{ color: '#1890ff' }} />
              <Select
                showSearch
                value={null as any}
                placeholder="품번 / 상품명 / SKU 입력하여 추가"
                style={{ flex: 1 }}
                filterOption={false}
                onSearch={handleVariantSearch}
                onSelect={handleVariantSelect}
                loading={searchLoading}
                options={variantOptions}
                notFoundContent={searchLoading ? '검색 중...' : '검색어를 입력하세요'}
              />
            </div>

            {/* 품목 목록 */}
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              입고 품목 ({confirmItems.length}건) — 총 {fmt(confirmTotalQty)}개
            </div>
            <Table dataSource={confirmItems} columns={confirmItemCols} rowKey="key"
              size="small" scroll={{ x: 700 }} pagination={false} />
          </div>
        )}
      </Modal>
    </div>
  );
}
