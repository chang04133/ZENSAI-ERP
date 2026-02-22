import { useEffect, useState } from 'react';
import { Card, Table, Tag, DatePicker, Space, Spin, message, Typography, Row, Col, Collapse, Button, Segmented } from 'antd';
import {
  CalendarOutlined, ShoppingCartOutlined, DollarOutlined,
  ShopOutlined, TagOutlined, LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import { salesApi } from '../../modules/sales/sales.api';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

const CAT_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};
const SALE_TYPE_COLORS: Record<string, string> = {
  '정상': 'blue', '할인': 'orange', '행사': 'green',
};

const fmt = (v: number) => Number(v).toLocaleString();

type ViewMode = 'daily' | 'weekly' | 'monthly';

function getRange(mode: ViewMode, ref: Dayjs): { from: string; to: string; label: string } {
  if (mode === 'daily') {
    const d = ref.format('YYYY-MM-DD');
    return { from: d, to: d, label: `${ref.format('YYYY.MM.DD')} (${ref.format('ddd')})` };
  }
  if (mode === 'weekly') {
    const start = ref.startOf('isoWeek');
    const end = ref.endOf('isoWeek');
    const endCapped = end.isAfter(dayjs()) ? dayjs() : end;
    return {
      from: start.format('YYYY-MM-DD'),
      to: endCapped.format('YYYY-MM-DD'),
      label: `${start.format('MM.DD')} ~ ${endCapped.format('MM.DD')}`,
    };
  }
  // monthly
  const start = ref.startOf('month');
  const end = ref.endOf('month');
  const endCapped = end.isAfter(dayjs()) ? dayjs() : end;
  return {
    from: start.format('YYYY-MM-DD'),
    to: endCapped.format('YYYY-MM-DD'),
    label: `${ref.format('YYYY년 MM월')}`,
  };
}

function moveRef(mode: ViewMode, ref: Dayjs, dir: number): Dayjs {
  if (mode === 'daily') return ref.add(dir, 'day');
  if (mode === 'weekly') return ref.add(dir, 'week');
  return ref.add(dir, 'month');
}

export default function DailySalesPage() {
  const [mode, setMode] = useState<ViewMode>('daily');
  const [refDate, setRefDate] = useState<Dayjs>(dayjs());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const range = getRange(mode, refDate);

  const load = async (m: ViewMode, ref: Dayjs) => {
    setLoading(true);
    try {
      const r = getRange(m, ref);
      const result = await salesApi.productsByRange(r.from, r.to);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(mode, refDate); }, []);

  const handleModeChange = (v: string) => {
    const m = v as ViewMode;
    setMode(m);
    load(m, refDate);
  };

  const handleMove = (dir: number) => {
    const next = moveRef(mode, refDate, dir);
    setRefDate(next);
    load(mode, next);
  };

  const handleDatePick = (d: Dayjs | null) => {
    if (d) { setRefDate(d); load(mode, d); }
  };

  const isForwardDisabled = () => {
    const next = moveRef(mode, refDate, 1);
    const nextRange = getRange(mode, next);
    return nextRange.from > dayjs().format('YYYY-MM-DD');
  };

  const totals = data?.totals || {};
  const summary = data?.summary || [];
  const details = data?.details || [];

  const pickerType = mode === 'monthly' ? 'month' : mode === 'weekly' ? 'week' : undefined;

  return (
    <div>
      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>판매 리스트</span>
          </Space>
        }
        extra={
          <Space wrap>
            <Segmented
              value={mode}
              onChange={handleModeChange}
              options={[
                { label: '일별', value: 'daily' },
                { label: '주별', value: 'weekly' },
                { label: '월별', value: 'monthly' },
              ]}
              size="small"
            />
            <Button size="small" icon={<LeftOutlined />} onClick={() => handleMove(-1)} />
            <DatePicker
              value={refDate}
              onChange={handleDatePick}
              picker={pickerType}
              allowClear={false}
              style={{ width: mode === 'monthly' ? 130 : 150 }}
              size="small"
            />
            <Button size="small" icon={<RightOutlined />} onClick={() => handleMove(1)}
              disabled={isForwardDisabled()} />
            <Tag color="blue" style={{ fontSize: 12, padding: '1px 8px', margin: 0 }}>
              {range.label}
            </Tag>
          </Space>
        }
      >
        {loading && !data ? (
          <Spin style={{ display: 'block', margin: '60px auto' }} />
        ) : (
          <>
            {/* 요약 카드 */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              {[
                { label: '총 매출', value: `${fmt(totals.total_amount || 0)}원`, icon: <DollarOutlined />, color: '#1890ff', bg: '#e6f7ff' },
                { label: '판매 수량', value: `${fmt(totals.total_qty || 0)}개`, icon: <ShoppingCartOutlined />, color: '#52c41a', bg: '#f6ffed' },
                { label: '판매 건수', value: `${totals.sale_count || 0}건`, icon: <TagOutlined />, color: '#fa8c16', bg: '#fff7e6' },
                { label: '거래처', value: `${totals.partner_count || 0}곳`, icon: <ShopOutlined />, color: '#722ed1', bg: '#f9f0ff' },
              ].map((item) => (
                <Col xs={12} sm={6} key={item.label}>
                  <div style={{ background: item.bg, borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 22, color: item.color }}>{item.icon}</div>
                      <div>
                        <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                      </div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>

            {/* 상품별 요약 테이블 */}
            <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
              상품별 판매 현황 ({summary.length}개 상품)
            </Typography.Text>

            <Table
              columns={[
                { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110 },
                { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                  render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
                  filters: Object.entries(CAT_COLORS).map(([k]) => ({ text: k, value: k })),
                  onFilter: (v: any, r: any) => r.category === v },
                { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 80,
                  render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                { title: '핏', dataIndex: 'fit', key: 'fit', width: 80,
                  render: (v: string) => v || '-' },
                { title: '기장', dataIndex: 'length', key: 'len', width: 80,
                  render: (v: string) => v || '-' },
                { title: '판매수량', dataIndex: 'total_qty', key: 'qty', width: 80, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}</strong>,
                  sorter: (a: any, b: any) => a.total_qty - b.total_qty },
                { title: '매출액', dataIndex: 'total_amount', key: 'amt', width: 110, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}원</strong>,
                  sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                  defaultSortOrder: 'descend' as const },
                { title: '건수', dataIndex: 'sale_count', key: 'cnt', width: 60, align: 'center' as const },
                { title: '거래처', dataIndex: 'partner_count', key: 'pc', width: 65, align: 'center' as const,
                  render: (v: number) => v > 1 ? <Tag color="purple">{v}곳</Tag> : `${v}곳` },
              ]}
              dataSource={summary}
              rowKey="product_code"
              pagination={summary.length > 50 ? { pageSize: 50, size: 'small', showTotal: (t: number) => `총 ${t}개 상품` } : false}
              size="small"
              loading={loading}
              scroll={{ x: 900 }}
              summary={() => {
                if (summary.length === 0) return null;
                const totalQty = summary.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                const totalAmt = summary.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
                return (
                  <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={6}>합계</Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">{fmt(totalQty)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">{fmt(totalAmt)}원</Table.Summary.Cell>
                    <Table.Summary.Cell index={8} colSpan={2} />
                  </Table.Summary.Row>
                );
              }}
            />

            {/* 상세 판매 내역 (접이식) */}
            {details.length > 0 && (
              <Collapse
                style={{ marginTop: 16 }}
                items={[{
                  key: 'details',
                  label: <Typography.Text strong>상세 판매 내역 ({details.length}건)</Typography.Text>,
                  children: (
                    <Table
                      columns={[
                        ...(mode !== 'daily' ? [{ title: '날짜', dataIndex: 'sale_date', key: 'date', width: 100,
                          render: (v: string) => v ? dayjs(v).format('MM.DD(ddd)') : '-',
                          sorter: (a: any, b: any) => a.sale_date.localeCompare(b.sale_date) }] : []),
                        { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 100, ellipsis: true,
                          filters: [...new Set(details.map((d: any) => d.partner_name))].map((v: any) => ({ text: v, value: v })),
                          onFilter: (v: any, r: any) => r.partner_name === v },
                        { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                        { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
                        { title: '컬러', dataIndex: 'color', key: 'color', width: 70 },
                        { title: '사이즈', dataIndex: 'size', key: 'size', width: 65 },
                        { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                          render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
                          filters: [...new Set(details.map((d: any) => d.category))].map((v: any) => ({ text: v, value: v })),
                          onFilter: (v: any, r: any) => r.category === v },
                        { title: '유형', dataIndex: 'sale_type', key: 'type', width: 60, align: 'center' as const,
                          render: (v: string) => <Tag color={SALE_TYPE_COLORS[v] || 'default'}>{v}</Tag>,
                          filters: [{ text: '정상', value: '정상' }, { text: '할인', value: '할인' }, { text: '행사', value: '행사' }],
                          onFilter: (v: any, r: any) => r.sale_type === v },
                        { title: '수량', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' as const,
                          sorter: (a: any, b: any) => a.qty - b.qty },
                        { title: '단가', dataIndex: 'unit_price', key: 'price', width: 90, align: 'right' as const,
                          render: (v: number) => `${fmt(v)}원` },
                        { title: '매출액', dataIndex: 'total_price', key: 'total', width: 100, align: 'right' as const,
                          render: (v: number) => <strong>{fmt(v)}원</strong>,
                          sorter: (a: any, b: any) => Number(a.total_price) - Number(b.total_price) },
                      ]}
                      dataSource={details}
                      rowKey="sale_id"
                      pagination={details.length > 50 ? { pageSize: 50, size: 'small' } : false}
                      size="small"
                      scroll={{ x: 1000 }}
                    />
                  ),
                }]}
              />
            )}

            {summary.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                해당 기간에 판매 내역이 없습니다.
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
