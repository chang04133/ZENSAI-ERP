import { useEffect, useState, useCallback } from 'react';
import {
  Card, Tabs, Select, Space, Button, Statistic, Row, Col, Table, Tag,
  Modal, Form, Input, InputNumber, DatePicker, message, Spin, Popconfirm,
} from 'antd';
import {
  DollarOutlined, FundOutlined, LineChartOutlined, InboxOutlined,
  PlusOutlined, SyncOutlined, FileTextOutlined, BankOutlined,
  ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { financialApi } from '../../modules/fund/financial.api';
import dayjs from 'dayjs';

const { Option } = Select;

const ML = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

// 금액 포맷
const fmtW = (v: number) => Math.round(v / 10000).toLocaleString() + '만원';
const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + '천원';
const fmtN = (v: number) => v.toLocaleString();

// 증감 색상
const growColor = (v: number | null) => {
  if (v === null) return '#888';
  return v >= 0 ? '#3f8600' : '#cf1322';
};
const growIcon = (v: number | null) => {
  if (v === null) return null;
  return v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;
};

const statusColor: Record<string, string> = {
  PENDING: 'blue', PARTIAL: 'orange', PAID: 'green', OVERDUE: 'red',
};
const statusLabel: Record<string, string> = {
  PENDING: '미결', PARTIAL: '부분결제', PAID: '완료', OVERDUE: '연체',
};

export default function FinancialStatementsPage() {
  const curYear = new Date().getFullYear();
  const [year, setYear] = useState(curYear);
  const [month, setMonth] = useState<number | null>(null);
  const [tab, setTab] = useState('pl');
  const [loading, setLoading] = useState(false);

  // Tab 1: P&L
  const [plData, setPlData] = useState<any>(null);
  // Tab 2: Balance Sheet
  const [bsData, setBsData] = useState<any>(null);
  // Tab 3: Cash Flow
  const [cfData, setCfData] = useState<any>(null);
  // Tab 4: Inventory Valuation
  const [invData, setInvData] = useState<any[]>([]);
  // Tab 5: COGS Detail
  const [cogsData, setCogsData] = useState<any[]>([]);
  // Tab 6: AR/AP
  const [arData, setArData] = useState<any[]>([]);
  const [apData, setApData] = useState<any[]>([]);
  const [arModal, setArModal] = useState(false);
  const [apModal, setApModal] = useState(false);
  const [arForm] = Form.useForm();
  const [apForm] = Form.useForm();

  // 로드 함수들
  const loadPL = useCallback(async () => {
    setLoading(true);
    try { setPlData(await financialApi.incomeStatement(year, month || undefined)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [year, month]);

  const loadBS = useCallback(async () => {
    setLoading(true);
    try { setBsData(await financialApi.balanceSheet()); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadCF = useCallback(async () => {
    setLoading(true);
    try { setCfData(await financialApi.cashFlow(year)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [year]);

  const loadInv = useCallback(async () => {
    setLoading(true);
    try { setInvData(await financialApi.inventoryValuation()); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadCogs = useCallback(async () => {
    setLoading(true);
    try { setCogsData(await financialApi.cogsDetail(year, month || undefined)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [year, month]);

  const loadAR = useCallback(async () => {
    try { setArData(await financialApi.listAR()); } catch (e: any) { message.error(e.message); }
  }, []);

  const loadAP = useCallback(async () => {
    try { setApData(await financialApi.listAP()); } catch (e: any) { message.error(e.message); }
  }, []);

  useEffect(() => {
    if (tab === 'pl') loadPL();
    else if (tab === 'bs') loadBS();
    else if (tab === 'cf') loadCF();
    else if (tab === 'inv') loadInv();
    else if (tab === 'cogs') loadCogs();
    else if (tab === 'arap') { loadAR(); loadAP(); }
  }, [tab, year, month]);

  // AR/AP 등록
  const handleCreateAR = async (values: any) => {
    try {
      await financialApi.createAR({
        ...values,
        ar_date: values.ar_date?.format('YYYY-MM-DD'),
        due_date: values.due_date?.format('YYYY-MM-DD'),
      });
      message.success('미수금 등록 완료');
      setArModal(false); arForm.resetFields(); loadAR();
    } catch (e: any) { message.error(e.message); }
  };

  const handleCreateAP = async (values: any) => {
    try {
      await financialApi.createAP({
        ...values,
        ap_date: values.ap_date?.format('YYYY-MM-DD'),
        due_date: values.due_date?.format('YYYY-MM-DD'),
      });
      message.success('미지급금 등록 완료');
      setApModal(false); apForm.resetFields(); loadAP();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDeleteAR = async (id: number) => {
    try { await financialApi.deleteAR(id); message.success('삭제 완료'); loadAR(); }
    catch (e: any) { message.error(e.message); }
  };

  const handleDeleteAP = async (id: number) => {
    try { await financialApi.deleteAP(id); message.success('삭제 완료'); loadAP(); }
    catch (e: any) { message.error(e.message); }
  };

  const handlePayAR = async (id: number, amount: number) => {
    try {
      await financialApi.updateAR(id, { paid_amount: amount, status: 'PAID' });
      message.success('결제 완료 처리'); loadAR();
    } catch (e: any) { message.error(e.message); }
  };

  const handlePayAP = async (id: number, amount: number) => {
    try {
      await financialApi.updateAP(id, { paid_amount: amount, status: 'PAID' });
      message.success('결제 완료 처리'); loadAP();
    } catch (e: any) { message.error(e.message); }
  };

  // 연도/월 선택 컴포넌트
  const yearMonthSelector = (
    <Space>
      <Select value={year} onChange={setYear} style={{ width: 100 }}>
        {Array.from({ length: 5 }, (_, i) => curYear - 2 + i).map(y => (
          <Option key={y} value={y}>{y}년</Option>
        ))}
      </Select>
      <Select value={month ?? 0} onChange={v => setMonth(v || null)} style={{ width: 100 }}>
        <Option value={0}>연간</Option>
        {ML.map((l, i) => <Option key={i + 1} value={i + 1}>{l}</Option>)}
      </Select>
      <Button icon={<SyncOutlined />} onClick={() => {
        if (tab === 'pl') loadPL();
        else if (tab === 'cf') loadCF();
        else if (tab === 'cogs') loadCogs();
      }}>조회</Button>
    </Space>
  );

  // ── Tab 1: 손익계산서 ──
  const renderPL = () => {
    if (!plData) return null;
    const d = plData;
    return (
      <>
        <div style={{ marginBottom: 16 }}>{yearMonthSelector}</div>

        {/* Summary Cards */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={8} md={4}>
            <Card size="small"><Statistic title="순매출액" value={d.revenue.net} formatter={() => fmtW(d.revenue.net)} valueStyle={{ color: '#1677ff', fontSize: 18 }} /></Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small"><Statistic title="매출원가" value={d.cogs} formatter={() => fmtW(d.cogs)} valueStyle={{ fontSize: 18 }} /></Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small"><Statistic title="매출총이익" value={d.grossProfit} formatter={() => fmtW(d.grossProfit)} suffix={<Tag color={d.grossMargin >= 50 ? 'green' : 'orange'}>{d.grossMargin}%</Tag>} valueStyle={{ color: growColor(d.grossProfit), fontSize: 18 }} /></Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small"><Statistic title="판관비" value={d.sga.total} formatter={() => fmtW(d.sga.total)} valueStyle={{ color: '#cf1322', fontSize: 18 }} /></Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small"><Statistic title="영업이익" value={d.operatingProfit} formatter={() => fmtW(d.operatingProfit)} suffix={<Tag color={d.operatingMargin >= 20 ? 'green' : d.operatingMargin >= 0 ? 'blue' : 'red'}>{d.operatingMargin}%</Tag>} valueStyle={{ color: growColor(d.operatingProfit), fontSize: 18 }} /></Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small"><Statistic title="전년 대비" value={d.yoyGrowth} formatter={() => d.yoyGrowth !== null ? `${d.yoyGrowth > 0 ? '+' : ''}${d.yoyGrowth}%` : '-'} prefix={growIcon(d.yoyGrowth)} valueStyle={{ color: growColor(d.yoyGrowth), fontSize: 18 }} /></Card>
          </Col>
        </Row>

        {/* P&L 상세 테이블 */}
        <Card size="small" title="손익계산서 상세" style={{ marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f7fa', borderBottom: '2px solid #1a3a6a' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#1a3a6a' }}>항목</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#1a3a6a' }}>금액</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#1a3a6a' }}>비율</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ fontWeight: 700, background: '#e8edf5' }}>
                <td style={{ padding: '6px 12px' }}>I. 매출액</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtK(d.revenue.gross)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>-</td>
              </tr>
              {d.revenue.breakdown.map((r: any) => (
                <tr key={r.sale_type}>
                  <td style={{ padding: '4px 12px 4px 28px', color: '#666' }}>{r.sale_type} ({fmtN(r.qty)}건)</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right' }}>{fmtK(Number(r.amount))}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#888' }}>
                    {d.revenue.gross > 0 ? (Number(r.amount) / d.revenue.gross * 100).toFixed(1) + '%' : '-'}
                  </td>
                </tr>
              ))}
              {d.revenue.returns > 0 && (
                <tr>
                  <td style={{ padding: '4px 12px 4px 28px', color: '#cf1322' }}>(-) 반품 ({d.revenue.returnQty}건)</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#cf1322' }}>-{fmtK(d.revenue.returns)}</td>
                  <td />
                </tr>
              )}
              <tr style={{ fontWeight: 600, borderTop: '1px solid #ddd' }}>
                <td style={{ padding: '6px 12px' }}>순매출액</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1677ff' }}>{fmtK(d.revenue.net)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>100%</td>
              </tr>

              <tr style={{ fontWeight: 700, background: '#e8edf5' }}>
                <td style={{ padding: '6px 12px' }}>II. 매출원가</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtK(d.cogs)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                  {d.revenue.net > 0 ? (d.cogs / d.revenue.net * 100).toFixed(1) + '%' : '-'}
                </td>
              </tr>

              <tr style={{ fontWeight: 700, background: '#f0fff0' }}>
                <td style={{ padding: '6px 12px' }}>III. 매출총이익</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#3f8600' }}>{fmtK(d.grossProfit)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{d.grossMargin}%</td>
              </tr>

              <tr style={{ fontWeight: 700, background: '#e8edf5' }}>
                <td style={{ padding: '6px 12px' }}>IV. 판매비와관리비</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtK(d.sga.total)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                  {d.revenue.net > 0 ? (d.sga.total / d.revenue.net * 100).toFixed(1) + '%' : '-'}
                </td>
              </tr>
              {d.sga.breakdown.map((s: any) => (
                <tr key={s.category_name}>
                  <td style={{ padding: '4px 12px 4px 28px', color: '#666' }}>{s.category_name}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right' }}>{fmtK(Number(s.amount))}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#888' }}>
                    {d.sga.total > 0 ? (Number(s.amount) / d.sga.total * 100).toFixed(1) + '%' : '-'}
                  </td>
                </tr>
              ))}

              <tr style={{ fontWeight: 700, background: d.operatingProfit >= 0 ? '#f0fff0' : '#fff0f0', borderTop: '2px solid #333' }}>
                <td style={{ padding: '8px 12px', fontSize: 14 }}>V. 영업이익</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 14, color: d.operatingProfit >= 0 ? '#3f8600' : '#cf1322' }}>{fmtK(d.operatingProfit)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{d.operatingMargin}%</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* 월별 추이 */}
        {d.monthlyTrend && d.monthlyTrend.length > 0 && (
          <Card size="small" title="월별 매출 추이">
            <Table size="small" dataSource={d.monthlyTrend} rowKey="m" pagination={false}
              columns={[
                { title: '월', dataIndex: 'm', width: 60, render: (v: number) => `${v}월` },
                { title: '매출', dataIndex: 'revenue', render: (v: number) => fmtK(Number(v)), align: 'right' as const },
                { title: '반품', dataIndex: 'returns', render: (v: number) => Number(v) > 0 ? <span style={{ color: '#cf1322' }}>-{fmtK(Number(v))}</span> : '-', align: 'right' as const },
              ]}
            />
          </Card>
        )}
      </>
    );
  };

  // ── Tab 2: 대차대조표 ──
  const renderBS = () => {
    if (!bsData) return null;
    const d = bsData;
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <Button icon={<SyncOutlined />} onClick={loadBS}>새로고침</Button>
        </div>

        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={8}><Card size="small"><Statistic title="자산 총계" value={d.assets.total} formatter={() => fmtW(d.assets.total)} valueStyle={{ color: '#1677ff', fontSize: 20 }} prefix={<BankOutlined />} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title="부채 총계" value={d.liabilities.total} formatter={() => fmtW(d.liabilities.total)} valueStyle={{ color: '#cf1322', fontSize: 20 }} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title="자본 (자산-부채)" value={d.equity} formatter={() => fmtW(d.equity)} valueStyle={{ color: d.equity >= 0 ? '#3f8600' : '#cf1322', fontSize: 20 }} /></Card></Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Card size="small" title="자산 (Assets)" style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <Statistic title="재고자산 (원가 기준)" value={d.assets.inventory.costValue} formatter={() => fmtW(d.assets.inventory.costValue)} />
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  정가 기준: {fmtW(d.assets.inventory.retailValue)} / 총 {fmtN(d.assets.inventory.totalQty)}점
                </div>
              </div>

              {d.assets.inventory.byLocation.length > 0 && (
                <Table size="small" dataSource={d.assets.inventory.byLocation} rowKey="location" pagination={false}
                  columns={[
                    { title: '위치', dataIndex: 'location', width: 120 },
                    { title: '수량', dataIndex: 'qty', render: (v: number) => fmtN(Number(v)), align: 'right' as const },
                    { title: '원가평가', dataIndex: 'cost_value', render: (v: number) => fmtK(Number(v)), align: 'right' as const },
                  ]}
                />
              )}

              <div style={{ marginTop: 16 }}>
                <Statistic title="매출채권" value={d.assets.accountsReceivable.balance}
                  formatter={() => fmtW(d.assets.accountsReceivable.balance)}
                  suffix={<Tag>{d.assets.accountsReceivable.count}건</Tag>} />
              </div>
            </Card>
          </Col>

          <Col span={12}>
            <Card size="small" title="부채 (Liabilities)" style={{ marginBottom: 16 }}>
              <Statistic title="매입채무" value={d.liabilities.accountsPayable.balance}
                formatter={() => fmtW(d.liabilities.accountsPayable.balance)}
                suffix={<Tag>{d.liabilities.accountsPayable.count}건</Tag>}
                valueStyle={{ color: '#cf1322' }} />
            </Card>

            <Card size="small" title="자본 (Equity)">
              <Statistic title="순자산" value={d.equity}
                formatter={() => fmtW(d.equity)}
                valueStyle={{ color: d.equity >= 0 ? '#3f8600' : '#cf1322', fontWeight: 700 }} />
            </Card>
          </Col>
        </Row>
      </>
    );
  };

  // ── Tab 3: 현금흐름표 ──
  const renderCF = () => {
    if (!cfData) return null;
    const d = cfData;
    const s = d.summary;
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Select value={year} onChange={setYear} style={{ width: 100 }}>
              {Array.from({ length: 5 }, (_, i) => curYear - 2 + i).map(y => (
                <Option key={y} value={y}>{y}년</Option>
              ))}
            </Select>
            <Button icon={<SyncOutlined />} onClick={loadCF}>조회</Button>
          </Space>
        </div>

        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="매출 유입" value={s.operatingInflow} formatter={() => fmtW(s.operatingInflow)} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="비용 유출" value={s.operatingOutflow} formatter={() => fmtW(s.operatingOutflow)} valueStyle={{ color: '#cf1322' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="생산 투자" value={s.investingOutflow} formatter={() => fmtW(s.investingOutflow)} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="순 현금흐름" value={s.netCashFlow} formatter={() => fmtW(s.netCashFlow)} valueStyle={{ color: s.netCashFlow >= 0 ? '#3f8600' : '#cf1322', fontSize: 20, fontWeight: 700 }} prefix={<DollarOutlined />} /></Card></Col>
        </Row>

        <Card size="small" title="월별 현금흐름">
          <Table size="small" dataSource={d.monthly} rowKey="month" pagination={false}
            scroll={{ x: 900 }}
            columns={[
              { title: '월', dataIndex: 'month', width: 60, render: (v: number) => `${v}월`, fixed: 'left' as const },
              { title: '매출 유입', dataIndex: 'operatingInflow', render: (v: number) => fmtK(v), align: 'right' as const },
              { title: '비용 유출', dataIndex: 'operatingOutflow', render: (v: number) => v > 0 ? <span style={{ color: '#cf1322' }}>{fmtK(v)}</span> : '-', align: 'right' as const },
              { title: '영업 순', dataIndex: 'operatingNet', render: (v: number) => <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>{fmtK(v)}</span>, align: 'right' as const },
              { title: '생산 투자', dataIndex: 'investingOutflow', render: (v: number) => v > 0 ? fmtK(v) : '-', align: 'right' as const },
              { title: '순 현금흐름', dataIndex: 'net', render: (v: number) => <span style={{ fontWeight: 600, color: v >= 0 ? '#3f8600' : '#cf1322' }}>{fmtK(v)}</span>, align: 'right' as const },
            ]}
            summary={() => (
              <Table.Summary.Row style={{ background: '#e8edf5', fontWeight: 700 }}>
                <Table.Summary.Cell index={0}>합계</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">{fmtK(s.operatingInflow)}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><span style={{ color: '#cf1322' }}>{fmtK(s.operatingOutflow)}</span></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><span style={{ color: s.operatingNet >= 0 ? '#3f8600' : '#cf1322' }}>{fmtK(s.operatingNet)}</span></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">{fmtK(s.investingOutflow)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><span style={{ color: s.netCashFlow >= 0 ? '#3f8600' : '#cf1322', fontWeight: 700 }}>{fmtK(s.netCashFlow)}</span></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>
      </>
    );
  };

  // ── Tab 4: 재고자산 평가 ──
  const invColumns: ColumnsType<any> = [
    { title: '거래처', dataIndex: 'partner_name', width: 140, fixed: 'left' },
    { title: '카테고리', dataIndex: 'category', width: 100 },
    { title: '상품수', dataIndex: 'product_count', width: 80, align: 'right', render: fmtN },
    { title: 'SKU수', dataIndex: 'variant_count', width: 80, align: 'right', render: fmtN },
    { title: '수량', dataIndex: 'total_qty', width: 90, align: 'right', render: (v: number) => fmtN(Number(v)) },
    { title: '정가 평가', dataIndex: 'retail_value', width: 130, align: 'right', render: (v: number) => fmtK(Number(v)) },
    { title: '원가 평가', dataIndex: 'cost_value', width: 130, align: 'right', fixed: 'right', render: (v: number) => <span style={{ fontWeight: 600, color: '#1677ff' }}>{fmtK(Number(v))}</span> },
  ];

  const renderInv = () => {
    const totalRetail = invData.reduce((s, r) => s + Number(r.retail_value), 0);
    const totalCost = invData.reduce((s, r) => s + Number(r.cost_value), 0);
    const totalQty = invData.reduce((s, r) => s + Number(r.total_qty), 0);
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <Button icon={<SyncOutlined />} onClick={loadInv}>새로고침</Button>
          <span style={{ marginLeft: 16, fontSize: 13, color: '#666' }}>
            총 {fmtN(totalQty)}점 / 정가 {fmtW(totalRetail)} / <strong style={{ color: '#1677ff' }}>원가 {fmtW(totalCost)}</strong>
          </span>
        </div>
        <Table size="small" dataSource={invData} rowKey={(r, i) => `${r.partner_name}-${r.category}-${i}`}
          columns={invColumns} scroll={{ x: 900, y: 'calc(100vh - 300px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </>
    );
  };

  // ── Tab 5: 매출원가 명세 ──
  const cogsColumns: ColumnsType<any> = [
    { title: '카테고리', dataIndex: 'category', width: 120, fixed: 'left' },
    { title: '판매수량', dataIndex: 'sold_qty', width: 100, align: 'right', render: (v: number) => fmtN(Number(v)) },
    { title: '매출액', dataIndex: 'revenue', width: 130, align: 'right', render: (v: number) => fmtK(Number(v)) },
    { title: '매출원가', dataIndex: 'cogs', width: 130, align: 'right', render: (v: number) => fmtK(Number(v)) },
    { title: '매출총이익', dataIndex: 'gross_profit', width: 130, align: 'right', render: (v: number) => <span style={{ color: Number(v) >= 0 ? '#3f8600' : '#cf1322' }}>{fmtK(Number(v))}</span> },
    { title: '이익률', dataIndex: 'margin_pct', width: 100, align: 'right', render: (v: number) => <Tag color={Number(v) >= 50 ? 'green' : Number(v) >= 30 ? 'blue' : 'orange'}>{Number(v)}%</Tag> },
  ];

  const renderCogs = () => {
    const totalRev = cogsData.reduce((s, r) => s + Number(r.revenue), 0);
    const totalCogs = cogsData.reduce((s, r) => s + Number(r.cogs), 0);
    const totalProfit = totalRev - totalCogs;
    const totalMargin = totalRev > 0 ? (totalProfit / totalRev * 100).toFixed(1) : '0';
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          {yearMonthSelector}
          <span style={{ marginLeft: 16, fontSize: 13, color: '#666' }}>
            매출 {fmtW(totalRev)} / 원가 {fmtW(totalCogs)} / <strong style={{ color: '#3f8600' }}>이익 {fmtW(totalProfit)} ({totalMargin}%)</strong>
          </span>
        </div>
        <Table size="small" dataSource={cogsData} rowKey="category"
          columns={cogsColumns} scroll={{ x: 800, y: 'calc(100vh - 300px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </>
    );
  };

  // ── Tab 6: 미수금/미지급금 ──
  const arColumns: ColumnsType<any> = [
    { title: '거래처', dataIndex: 'partner_name', width: 120 },
    { title: '발생일', dataIndex: 'ar_date', width: 100, render: (v: string) => v?.slice(0, 10) },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right', render: (v: number) => fmtK(Number(v)) },
    { title: '결제액', dataIndex: 'paid_amount', width: 110, align: 'right', render: (v: number) => Number(v) > 0 ? fmtK(Number(v)) : '-' },
    { title: '잔액', width: 110, align: 'right', render: (_: any, r: any) => fmtK(Number(r.amount) - Number(r.paid_amount)) },
    { title: '마감일', dataIndex: 'due_date', width: 100, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', ellipsis: true },
    {
      title: '', width: 80, render: (_: any, r: any) => (
        <Space size={4}>
          {r.status !== 'PAID' && (
            <Popconfirm title="결제 완료 처리하시겠습니까?" onConfirm={() => handlePayAR(r.ar_id, Number(r.amount))}>
              <Button type="link" size="small" icon={<EditOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDeleteAR(r.ar_id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const apColumns: ColumnsType<any> = [
    { title: '협력업체', dataIndex: 'partner_name', width: 120, render: (v: string) => v || '-' },
    { title: '발생일', dataIndex: 'ap_date', width: 100, render: (v: string) => v?.slice(0, 10) },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right', render: (v: number) => fmtK(Number(v)) },
    { title: '결제액', dataIndex: 'paid_amount', width: 110, align: 'right', render: (v: number) => Number(v) > 0 ? fmtK(Number(v)) : '-' },
    { title: '잔액', width: 110, align: 'right', render: (_: any, r: any) => fmtK(Number(r.amount) - Number(r.paid_amount)) },
    { title: '분류', dataIndex: 'category', width: 90, render: (v: string) => v || '-' },
    { title: '마감일', dataIndex: 'due_date', width: 100, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', ellipsis: true },
    {
      title: '', width: 80, render: (_: any, r: any) => (
        <Space size={4}>
          {r.status !== 'PAID' && (
            <Popconfirm title="결제 완료 처리하시겠습니까?" onConfirm={() => handlePayAP(r.ap_id, Number(r.amount))}>
              <Button type="link" size="small" icon={<EditOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDeleteAP(r.ap_id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const arTotal = arData.filter(r => r.status !== 'PAID').reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);
  const apTotal = apData.filter(r => r.status !== 'PAID').reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0);

  const renderARAP = () => (
    <>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setArModal(true)}>미수금 등록</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setApModal(true)}>미지급금 등록</Button>
          <Button icon={<SyncOutlined />} onClick={() => { loadAR(); loadAP(); }}>새로고침</Button>
        </Space>
      </div>

      <Card size="small" title={<span>미수금 (Accounts Receivable) <Tag color="blue">잔액 {fmtW(arTotal)}</Tag></span>} style={{ marginBottom: 16 }}>
        <Table size="small" dataSource={arData} rowKey="ar_id" columns={arColumns}
          scroll={{ x: 1000 }} pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Card size="small" title={<span>미지급금 (Accounts Payable) <Tag color="red">잔액 {fmtW(apTotal)}</Tag></span>}>
        <Table size="small" dataSource={apData} rowKey="ap_id" columns={apColumns}
          scroll={{ x: 1100 }} pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }} />
      </Card>

      {/* AR Modal */}
      <Modal title="미수금 등록" open={arModal}
        onCancel={() => { setArModal(false); arForm.resetFields(); }} footer={null}>
        <Form form={arForm} onFinish={handleCreateAR} layout="vertical">
          <Form.Item label="거래처 코드" name="partner_code" rules={[{ required: true, message: '거래처 코드 필수' }]}>
            <Input placeholder="ex: GANGNAM" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="발생일" name="ar_date" rules={[{ required: true, message: '발생일 필수' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="마감일" name="due_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="금액" name="amount" rules={[{ required: true, message: '금액 필수' }]}>
            <InputNumber style={{ width: '100%' }} min={0} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          </Form.Item>
          <Form.Item label="메모" name="memo">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">등록</Button>
            <Button onClick={() => { setArModal(false); arForm.resetFields(); }}>취소</Button>
          </Space>
        </Form>
      </Modal>

      {/* AP Modal */}
      <Modal title="미지급금 등록" open={apModal}
        onCancel={() => { setApModal(false); apForm.resetFields(); }} footer={null}>
        <Form form={apForm} onFinish={handleCreateAP} layout="vertical">
          <Form.Item label="협력업체 코드" name="partner_code">
            <Input placeholder="선택사항" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="발생일" name="ap_date" rules={[{ required: true, message: '발생일 필수' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="마감일" name="due_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="금액" name="amount" rules={[{ required: true, message: '금액 필수' }]}>
            <InputNumber style={{ width: '100%' }} min={0} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          </Form.Item>
          <Form.Item label="분류" name="category">
            <Select placeholder="선택" allowClear>
              <Option value="MATERIAL">부자재</Option>
              <Option value="PRODUCTION">생산비</Option>
              <Option value="EXPENSE">경비</Option>
            </Select>
          </Form.Item>
          <Form.Item label="메모" name="memo">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">등록</Button>
            <Button onClick={() => { setApModal(false); apForm.resetFields(); }}>취소</Button>
          </Space>
        </Form>
      </Modal>
    </>
  );

  const tabItems = [
    { key: 'pl', label: <span><LineChartOutlined /> 손익계산서</span>, children: <Spin spinning={loading && tab === 'pl'}>{renderPL()}</Spin> },
    { key: 'bs', label: <span><BankOutlined /> 재무상태표</span>, children: <Spin spinning={loading && tab === 'bs'}>{renderBS()}</Spin> },
    { key: 'cf', label: <span><FundOutlined /> 현금흐름표</span>, children: <Spin spinning={loading && tab === 'cf'}>{renderCF()}</Spin> },
    { key: 'inv', label: <span><InboxOutlined /> 재고자산 평가</span>, children: <Spin spinning={loading && tab === 'inv'}>{renderInv()}</Spin> },
    { key: 'cogs', label: <span><FileTextOutlined /> 매출원가 명세</span>, children: <Spin spinning={loading && tab === 'cogs'}>{renderCogs()}</Spin> },
    { key: 'arap', label: <span><DollarOutlined /> 미수금/미지급금</span>, children: <Spin spinning={loading && tab === 'arap'}>{renderARAP()}</Spin> },
  ];

  return (
    <div>
      <PageHeader title="재무제표" />
      <Card size="small">
        <Tabs activeKey={tab} onChange={setTab} items={tabItems} />
      </Card>
    </div>
  );
}
