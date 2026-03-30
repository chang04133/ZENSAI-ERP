import { useEffect, useState } from 'react';
import { Button, DatePicker, Space, Modal, Table, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { datePresets } from '../../utils/date-presets';
import { fmt } from '../../utils/format';

const { RangePicker } = DatePicker;

interface PartnerRow {
  partner_code: string;
  partner_name: string;
  prev_year_amount: number;
  prev_month_amount: number;
  normal_amount: number;
  discount_amount: number;
  event_amount: number;
  cur_amount: number;
  cur_qty: number;
  mtd_amount: number;
  mtd_qty: number;
}

/* 증감 표시 */
function Change({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev;
  const pct = prev > 0 ? ((diff / prev) * 100).toFixed(0) : cur > 0 ? '∞' : '0';
  const color = diff > 0 ? '#1677ff' : diff < 0 ? '#ff4d4f' : '#999';
  return (
    <span style={{ color, fontSize: 11 }}>
      {diff > 0 ? '+' : ''}{fmt(diff)}
      <span style={{ marginLeft: 2 }}>({diff > 0 ? '+' : ''}{pct}%)</span>
    </span>
  );
}

/* 금액 + 증감 2줄 렌더 */
function AmtWithChange({ amt, prev, bold, color }: { amt: number; prev?: number; bold?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontWeight: bold ? 700 : 400, color }}>{fmt(amt)}</div>
      {prev !== undefined && <Change cur={amt} prev={prev} />}
    </div>
  );
}

const ZERO_ROW = {
  prev_year_amount: 0, prev_month_amount: 0,
  normal_amount: 0, discount_amount: 0, event_amount: 0,
  cur_amount: 0, cur_qty: 0, mtd_amount: 0, mtd_qty: 0,
};

export default function MonthlySalesPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return [
      from && dayjs(from).isValid() ? dayjs(from) : dayjs().startOf('month'),
      to && dayjs(to).isValid() ? dayjs(to) : dayjs(),
    ];
  });

  const load = async (from: Dayjs, to: Dayjs) => {
    setLoading(true);
    try {
      const result = await salesApi.comprehensive(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
      setData(result.map((r: any) => ({
        ...r,
        prev_year_amount: Number(r.prev_year_amount),
        prev_month_amount: Number(r.prev_month_amount),
        normal_amount: Number(r.normal_amount),
        discount_amount: Number(r.discount_amount),
        event_amount: Number(r.event_amount),
        cur_amount: Number(r.cur_amount), cur_qty: Number(r.cur_qty),
        mtd_amount: Number(r.mtd_amount), mtd_qty: Number(r.mtd_qty),
      })));
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(range[0], range[1]); }, []);

  const handleSearch = () => load(range[0], range[1]);

  /* ── 판매 상세 모달 ── */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');

  const showDetail = async (partnerCode: string | undefined, partnerName: string, saleType?: string) => {
    const typeLabel = saleType === '정상' ? '정상' : saleType === '할인' ? '할인' : saleType === '행사' ? '행사' : '전체';
    const who = partnerCode ? partnerName : '전체 매장';
    setDetailTitle(`${who} — ${typeLabel} 매출 상세`);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const result = await salesApi.comprehensiveDetail(
        range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'),
        partnerCode, saleType,
      );
      setDetailData(result || []);
    } catch (e: any) { message.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const detailColumns = [
    { title: '판매일', dataIndex: 'sale_date', width: 100,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '품번', dataIndex: 'product_code', width: 110 },
    { title: '상품명', dataIndex: 'product_name', width: 160, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    { title: '컬러', dataIndex: 'color', width: 60 },
    { title: '사이즈', dataIndex: 'size', width: 60 },
    { title: '유형', dataIndex: 'sale_type', width: 60,
      render: (v: string) => {
        const c = v === '할인' ? 'red' : v === '행사' ? 'orange' : 'blue';
        return <Tag color={c}>{v}</Tag>;
      } },
    { title: '수량', dataIndex: 'qty', width: 60, render: (v: number) => fmt(v) },
    { title: '단가', dataIndex: 'unit_price', width: 90, render: (v: number) => fmt(v) },
    { title: '금액', dataIndex: 'total_price', width: 100,
      render: (v: number) => <b>{fmt(v)}</b> },
  ];

  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    load(from, to);
  };
  const today = dayjs();

  /* 합계 계산 */
  const totals = data.reduce((acc, r) => ({
    prev_year_amount: acc.prev_year_amount + r.prev_year_amount,
    prev_month_amount: acc.prev_month_amount + r.prev_month_amount,
    normal_amount: acc.normal_amount + r.normal_amount,
    discount_amount: acc.discount_amount + r.discount_amount,
    event_amount: acc.event_amount + r.event_amount,
    cur_amount: acc.cur_amount + r.cur_amount,
    cur_qty: acc.cur_qty + r.cur_qty,
    mtd_amount: acc.mtd_amount + r.mtd_amount,
    mtd_qty: acc.mtd_qty + r.mtd_qty,
  }), { ...ZERO_ROW });

  /* 클릭 가능 셀 스타일 */
  const clickableStyle: React.CSSProperties = { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 };

  /* 메인 테이블 컬럼 */
  const columns: any[] = [
    {
      title: '거래처', dataIndex: 'partner_name', width: 140, fixed: 'left' as const,
      render: (_: string, r: PartnerRow) => (
        <div style={{ ...clickableStyle }} onClick={() => showDetail(r.partner_code, r.partner_name)}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#1677ff' }}>{r.partner_name}</div>
          <div style={{ fontSize: 10, color: '#888' }}>({r.partner_code})</div>
        </div>
      ),
    },
    {
      title: '전년동기', dataIndex: 'prev_year_amount', width: 120, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.prev_year_amount) - Number(b.prev_year_amount),
      render: (_: number, r: PartnerRow) => <AmtWithChange amt={r.prev_year_amount} />,
    },
    {
      title: '전월', dataIndex: 'prev_month_amount', width: 120, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.prev_month_amount) - Number(b.prev_month_amount),
      render: (_: number, r: PartnerRow) => <AmtWithChange amt={r.prev_month_amount} />,
    },
    {
      title: '정상', dataIndex: 'normal_amount', width: 110, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.normal_amount) - Number(b.normal_amount),
      render: (v: number, r: PartnerRow) => (
        <div style={v > 0 ? clickableStyle : undefined} onClick={() => v > 0 && showDetail(r.partner_code, r.partner_name, '정상')}>
          {fmt(v)}
        </div>
      ),
    },
    {
      title: <span style={{ color: '#f5222d' }}>할인</span>, dataIndex: 'discount_amount', width: 110, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.discount_amount) - Number(b.discount_amount),
      render: (v: number, r: PartnerRow) => (
        <div style={{ color: v > 0 ? '#f5222d' : undefined, ...(v > 0 ? clickableStyle : {}) }}
          onClick={() => v > 0 && showDetail(r.partner_code, r.partner_name, '할인')}>
          {fmt(v)}
        </div>
      ),
    },
    {
      title: <span style={{ color: '#fa8c16' }}>행사</span>, dataIndex: 'event_amount', width: 110, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.event_amount) - Number(b.event_amount),
      render: (v: number, r: PartnerRow) => (
        <div style={{ color: v > 0 ? '#fa8c16' : undefined, ...(v > 0 ? clickableStyle : {}) }}
          onClick={() => v > 0 && showDetail(r.partner_code, r.partner_name, '행사')}>
          {fmt(v)}
        </div>
      ),
    },
    {
      title: '합계', dataIndex: 'cur_amount', width: 130, align: 'right' as const,
      defaultSortOrder: 'descend' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.cur_amount) - Number(b.cur_amount),
      render: (_: number, r: PartnerRow) => (
        <div style={clickableStyle} onClick={() => showDetail(r.partner_code, r.partner_name)}>
          <div style={{ fontWeight: 700, color: '#1a3a6a' }}>{fmt(r.cur_amount)}</div>
          <Change cur={r.cur_amount} prev={r.prev_year_amount} />
        </div>
      ),
    },
    {
      title: '당월누계', dataIndex: 'mtd_amount', width: 120, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.mtd_amount) - Number(b.mtd_amount),
      render: (v: number, r: PartnerRow) => (
        <div style={{ color: '#1677ff', ...(v > 0 ? clickableStyle : {}) }}
          onClick={() => v > 0 && showDetail(r.partner_code, r.partner_name)}>
          {fmt(v)}
        </div>
      ),
    },
    {
      title: '수량', dataIndex: 'cur_qty', width: 80, align: 'right' as const,
      sorter: (a: PartnerRow, b: PartnerRow) => Number(a.cur_qty) - Number(b.cur_qty),
      render: (v: number) => fmt(v),
    },
    {
      title: '비율', width: 70, align: 'center' as const,
      render: (_: any, r: PartnerRow) => {
        const pct = totals.cur_amount > 0 ? ((r.cur_amount / totals.cur_amount) * 100).toFixed(0) : '0';
        return <span style={{ color: '#666' }}>{pct}%</span>;
      },
    },
  ];

  return (
    <div style={{ width: '100%' }}>
      <PageHeader title="종합 매출조회" />

      {/* ── 필터 바 ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginBottom: 16, padding: '10px 14px',
        background: '#f5f7fa', borderRadius: 8, border: '1px solid #e0e4ea',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>조회기간</span>
        <RangePicker
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
          presets={datePresets}
          format="YYYY-MM-DD"
          size="small"
          style={{ width: 240 }}
        />
        <Space size={4} wrap>
          <Button size="small" onClick={() => quickRange(today, today)}>오늘</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(2, 'day'), today)}>3일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month'))}>전월</Button>
          <Button size="small" type="primary" ghost onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
        </Space>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>검색</Button>
      </div>

      {/* ── 기간 표시 ── */}
      <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
        조회기간: <b>{range[0].format('YYYY-MM-DD')}</b> ~ <b>{range[1].format('YYYY-MM-DD')}</b>
        {' | '}거래처 <b>{data.length}</b>개
        {' | '}매출합계 <b style={{ color: '#1a3a6a' }}>{fmt(totals.cur_amount)}원</b>
        {' '}(정상 {fmt(totals.normal_amount)}
        {' '}/ <span style={{ color: '#f5222d' }}>할인 {fmt(totals.discount_amount)}</span>
        {' '}/ <span style={{ color: '#fa8c16' }}>행사 {fmt(totals.event_amount)}</span>)
        {' | '}당월누계 <b style={{ color: '#1677ff' }}>{fmt(totals.mtd_amount)}원</b>
      </div>

      {/* ── 메인 테이블 ── */}
      <Table
        dataSource={data}
        columns={columns}
        rowKey="partner_code"
        loading={loading}
        size="small"
        sortDirections={['descend', 'ascend', 'descend']}
        scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        summary={() => {
          if (data.length === 0) return null;
          const pctTotal = '100';
          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><b>합계</b></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><b>{fmt(totals.prev_year_amount)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><b>{fmt(totals.prev_month_amount)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><b>{fmt(totals.normal_amount)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><b style={{ color: '#f5222d' }}>{fmt(totals.discount_amount)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><b style={{ color: '#fa8c16' }}>{fmt(totals.event_amount)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <div>
                    <b style={{ color: '#1a3a6a' }}>{fmt(totals.cur_amount)}</b>
                    <div><Change cur={totals.cur_amount} prev={totals.prev_year_amount} /></div>
                  </div>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right"><b style={{ color: '#1677ff' }}>{fmt(totals.mtd_amount)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right"><b>{fmt(totals.cur_qty)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="center"><b>{pctTotal}%</b></Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />

      {/* ── 판매 상세 모달 ── */}
      <Modal title={detailTitle} open={detailOpen} onCancel={() => setDetailOpen(false)}
        width={1000} footer={null}>
        <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
          {range[0].format('YYYY-MM-DD')} ~ {range[1].format('YYYY-MM-DD')}
          {' | '}총 <b>{detailData.length}</b>건
          {' | '}합계 <b>{fmt(detailData.reduce((s, r) => s + Number(r.total_price || 0), 0))}원</b>
        </div>
        <Table dataSource={detailData} columns={detailColumns} rowKey="sale_id"
          loading={detailLoading} size="small"
          scroll={{ x: 950, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
          summary={(d) => {
            const totalQty = d.reduce((s, r) => s + Number(r.qty || 0), 0);
            const totalAmt = d.reduce((s, r) => s + Number(r.total_price || 0), 0);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7}><b>합계</b></Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right"><b>{fmt(totalQty)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right" />
                <Table.Summary.Cell index={9} align="right"><b>{fmt(totalAmt)}</b></Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      </Modal>
    </div>
  );
}
