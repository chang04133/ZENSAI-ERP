import { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Modal, Form, Input, Select, DatePicker, Descriptions, Tabs, Progress, message, InputNumber } from 'antd';
import { PlusOutlined, CalendarOutlined, TagsOutlined, BarChartOutlined, FireOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { seasonApi } from '../../modules/season/season.api';

const STATUS_COLOR: Record<string, string> = { PLANNING: 'default', CONFIRMED: 'blue', IN_SEASON: 'green', MARKDOWN: 'orange', CLOSED: 'red' };
const STATUS_LABEL: Record<string, string> = { PLANNING: '기획중', CONFIRMED: '확정', IN_SEASON: '시즌중', MARKDOWN: '마크다운', CLOSED: '종료' };
const STATUS_ORDER = ['PLANNING', 'CONFIRMED', 'IN_SEASON', 'MARKDOWN', 'CLOSED'];
const NEXT_STATUS: Record<string, string> = { PLANNING: 'CONFIRMED', CONFIRMED: 'IN_SEASON', IN_SEASON: 'MARKDOWN', MARKDOWN: 'CLOSED' };
const NEXT_LABEL: Record<string, string> = { PLANNING: '확정', CONFIRMED: '시즌 시작', IN_SEASON: '마크다운 전환', MARKDOWN: '종료' };

export default function SeasonManagePage() {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setSeasons(await seasonApi.list()); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (record: any) => {
    setSelected(record);
    setDetailModal(true);
    try {
      const [prods, anal] = await Promise.all([
        seasonApi.getProducts(record.season_code),
        seasonApi.getAnalytics(record.season_code),
      ]);
      setProducts(prods);
      setAnalytics(anal);
    } catch (e: any) { message.error(e.message); }
  };

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      const seasonCode = `${String(vals.year).slice(2)}${vals.season_type}`;
      await seasonApi.create({
        season_code: seasonCode,
        season_name: vals.season_name || `${vals.year} ${vals.season_type === 'SS' ? 'Spring/Summer' : vals.season_type === 'FW' ? 'Fall/Winter' : vals.season_type}`,
        plan_start_date: vals.dates?.[0]?.format('YYYY-MM-DD'),
        plan_end_date: vals.dates?.[1]?.format('YYYY-MM-DD'),
        target_styles: vals.target_styles,
        target_qty: vals.target_qty,
        target_revenue: vals.target_revenue,
        memo: vals.memo,
      });
      message.success('시즌이 등록되었습니다');
      setCreateModal(false);
      form.resetFields();
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const handleStatusChange = async (code: string, newStatus: string) => {
    try {
      await seasonApi.update(code, { status: newStatus });
      message.success(`상태가 ${STATUS_LABEL[newStatus]}(으)로 변경되었습니다`);
      load();
      if (selected?.season_code === code) setSelected({ ...selected, status: newStatus });
    } catch (e: any) { message.error(e.message); }
  };

  const currentSeason = seasons.find(s => s.status === 'IN_SEASON');

  const columns: any[] = [
    { title: '시즌코드', dataIndex: 'season_code', width: 90, render: (v: string, r: any) => <a onClick={() => openDetail(r)}><strong>{v}</strong></a> },
    { title: '시즌명', dataIndex: 'season_name', width: 180, ellipsis: true },
    { title: '상태', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] || v}</Tag>,
      filters: STATUS_ORDER.map(s => ({ text: STATUS_LABEL[s], value: s })), onFilter: (val: any, r: any) => r.status === val },
    { title: '시작일', dataIndex: 'plan_start_date', width: 110, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '종료일', dataIndex: 'plan_end_date', width: 110, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '스타일수', dataIndex: 'total_styles', width: 80, align: 'right' as const },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => Number(v) > 0 ? Number(v).toLocaleString() : '-' },
    { title: '판매율', dataIndex: 'sell_through', width: 100, render: (v: number) => {
      const n = Number(v);
      return n > 0 ? <Progress percent={n} size="small" status={n >= 80 ? 'success' : n >= 60 ? 'normal' : 'exception'} /> : '-';
    }},
    { title: '매출', dataIndex: 'revenue', width: 130, align: 'right' as const, render: (v: number) => {
      const n = Number(v);
      return n > 0 ? (n >= 100000000 ? (n / 100000000).toFixed(1) + '억' : (n / 10000).toFixed(0) + '만') : '-';
    }},
    { title: 'MD율', dataIndex: 'markdown_rate', width: 70, align: 'right' as const, render: (v: number) => Number(v) > 0 ? <span style={{ color: '#ff4d4f' }}>{Number(v)}%</span> : '-' },
    { title: '상태변경', key: 'action', width: 110, render: (_: any, r: any) => {
      const next = NEXT_STATUS[r.status];
      if (!next) return <Tag color="default">종료</Tag>;
      return <Button size="small" type="link" onClick={() => handleStatusChange(r.season_code, next)}>{NEXT_LABEL[r.status]} →</Button>;
    }},
  ];

  const productCols: any[] = [
    { title: '상품코드', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '정가', dataIndex: 'base_price', width: 90, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
    { title: '행사가', dataIndex: 'event_price', width: 90, align: 'right' as const, render: (v: number) => v ? <span style={{ color: '#ff4d4f' }}>{Number(v).toLocaleString()}</span> : '-' },
    { title: '현재고', dataIndex: 'current_stock', width: 70, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
    { title: '판매수량', dataIndex: 'sold_qty', width: 80, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
    { title: '판매율', dataIndex: 'sell_through_rate', width: 100, render: (v: number) => {
      const n = Number(v);
      return <Progress percent={n} size="small" status={n >= 70 ? 'success' : n >= 40 ? 'normal' : 'exception'} />;
    }},
  ];

  const categoryCols: any[] = [
    { title: '카테고리', dataIndex: 'category', width: 100 },
    { title: '스타일수', dataIndex: 'styles', width: 80, align: 'right' as const },
    { title: '판매율', dataIndex: 'sell_through_rate', width: 120, render: (v: number) => <Progress percent={Number(v)} size="small" /> },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
    { title: '매출', dataIndex: 'revenue', width: 120, align: 'right' as const, render: (v: number) => Number(v).toLocaleString() + '원' },
  ];

  return (
    <div>
      <PageHeader title="시즌/컬렉션 관리" extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>신규 시즌</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="현재 시즌" value={currentSeason?.season_code || '-'} prefix={<CalendarOutlined />} valueStyle={{ color: '#1890ff', fontSize: 24 }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="시즌 스타일" value={currentSeason?.total_styles || 0} suffix="개" prefix={<TagsOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="현재 판매율" value={currentSeason?.sell_through || 0} suffix="%" prefix={<BarChartOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="시즌 매출" value={currentSeason?.revenue ? (Number(currentSeason.revenue) >= 100000000 ? (Number(currentSeason.revenue) / 100000000).toFixed(1) : (Number(currentSeason.revenue) / 10000).toFixed(0)) : '0'} suffix={currentSeason?.revenue && Number(currentSeason.revenue) >= 100000000 ? '억' : '만'} prefix={<FireOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <Table dataSource={seasons} columns={columns} rowKey="season_config_id" loading={loading}
          size="small" scroll={{ x: 1400, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      {/* 시즌 상세 모달 */}
      <Modal title={`시즌 상세 - ${selected?.season_code || ''}`} open={detailModal} onCancel={() => { setDetailModal(false); setProducts([]); setAnalytics(null); }} width={1000} footer={null}>
        {selected && (
          <Tabs items={[
            {
              key: 'info', label: '시즌정보', children: (
                <Descriptions bordered size="small" column={3}>
                  <Descriptions.Item label="시즌코드">{selected.season_code}</Descriptions.Item>
                  <Descriptions.Item label="시즌명">{selected.season_name}</Descriptions.Item>
                  <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
                  <Descriptions.Item label="시작일">{selected.plan_start_date?.slice(0, 10) || '-'}</Descriptions.Item>
                  <Descriptions.Item label="종료일">{selected.plan_end_date?.slice(0, 10) || '-'}</Descriptions.Item>
                  <Descriptions.Item label="스타일수">{selected.total_styles}개</Descriptions.Item>
                  <Descriptions.Item label="목표수량">{(selected.target_qty || 0).toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="판매수량">{Number(selected.sold_qty || 0).toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="판매율">{selected.sell_through || 0}%</Descriptions.Item>
                  <Descriptions.Item label="매출" span={2}>{Number(selected.revenue || 0).toLocaleString()}원</Descriptions.Item>
                  <Descriptions.Item label="마크다운율">{selected.markdown_rate || 0}%</Descriptions.Item>
                  {selected.memo && <Descriptions.Item label="메모" span={3}>{selected.memo}</Descriptions.Item>}
                </Descriptions>
              ),
            },
            {
              key: 'products', label: `상품 (${products.length})`, children: (
                <Table dataSource={products} columns={productCols} rowKey="product_code" size="small"
                  scroll={{ y: 400 }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
              ),
            },
            {
              key: 'analytics', label: '분석', children: analytics ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>카테고리별 판매율</div>
                  <Table dataSource={analytics.byCategory} columns={categoryCols} rowKey="category" size="small" pagination={false} />
                  {analytics.monthlyTrend?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>월별 매출 추이</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 150, padding: '0 8px' }}>
                        {analytics.monthlyTrend.map((m: any) => {
                          const maxRev = Math.max(...analytics.monthlyTrend.map((x: any) => Number(x.revenue)), 1);
                          const h = Math.max((Number(m.revenue) / maxRev) * 120, Number(m.revenue) > 0 ? 4 : 0);
                          return (
                            <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                              title={`${m.month}: ${Number(m.revenue).toLocaleString()}원 (${m.sold_qty}개)`}>
                              <div style={{ fontSize: 9, color: '#555' }}>{Number(m.sold_qty) > 0 ? Number(m.sold_qty).toLocaleString() : ''}</div>
                              <div style={{ width: '80%', maxWidth: 40, height: h, background: 'linear-gradient(180deg, #6366f1, #818cf8)', borderRadius: 3 }} />
                              <div style={{ fontSize: 9, color: '#bbb' }}>{m.month.slice(5)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>로딩중...</div>,
            },
          ]} />
        )}
      </Modal>

      {/* 신규 시즌 모달 */}
      <Modal title="신규 시즌 등록" open={createModal} onCancel={() => { setCreateModal(false); form.resetFields(); }} onOk={handleCreate} okText="등록" width={600}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}><Form.Item label="연도" name="year" rules={[{ required: true }]}><Select options={[{ value: 2025, label: '2025' }, { value: 2026, label: '2026' }, { value: 2027, label: '2027' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item label="시즌" name="season_type" rules={[{ required: true }]}><Select options={[{ value: 'SS', label: 'Spring/Summer' }, { value: 'FW', label: 'Fall/Winter' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item label="시즌명" name="season_name"><Input placeholder="자동 생성" /></Form.Item></Col>
          </Row>
          <Form.Item label="기간" name="dates"><DatePicker.RangePicker style={{ width: '100%' }} /></Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item label="목표 스타일수" name="target_styles"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item label="목표 수량" name="target_qty"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item label="목표 매출" name="target_revenue"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Form.Item label="메모" name="memo"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
