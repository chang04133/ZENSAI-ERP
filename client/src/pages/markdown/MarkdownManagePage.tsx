import { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Space, Row, Col, Statistic, Modal, Form, Input, Select, DatePicker, Descriptions, Tabs, Progress, message, InputNumber, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, ThunderboltOutlined, RollbackOutlined, BarChartOutlined, TagsOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { markdownApi } from '../../modules/markdown/markdown.api';
import { seasonApi } from '../../modules/season/season.api';

const STATUS_COLOR: Record<string, string> = { DRAFT: 'default', SCHEDULED: 'blue', ACTIVE: 'green', COMPLETED: 'purple', CANCELLED: 'red' };
const STATUS_LABEL: Record<string, string> = { DRAFT: '초안', SCHEDULED: '예약', ACTIVE: '적용중', COMPLETED: '완료', CANCELLED: '취소' };

const fmt = (v: number) => (v ?? 0).toLocaleString();

export default function MarkdownManagePage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string | undefined>();
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [form] = Form.useForm();

  const loadSchedules = async () => {
    setLoading(true);
    try { setSchedules(await markdownApi.list(seasonFilter)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    seasonApi.list().then(setSeasons).catch(() => {});
    loadSchedules();
  }, []);

  useEffect(() => { loadSchedules(); }, [seasonFilter]);

  const openDetail = async (record: any) => {
    try {
      const detail = await markdownApi.getById(record.schedule_id);
      setSelected(detail);
      setDetailModal(true);
      setImpact(null);
      if (detail.status === 'ACTIVE' || detail.status === 'COMPLETED') {
        markdownApi.impact(record.schedule_id).then(setImpact).catch(() => {});
      }
    } catch (e: any) { message.error(e.message); }
  };

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      await markdownApi.create({
        schedule_name: vals.schedule_name,
        season_code: vals.season_code,
        markdown_round: vals.markdown_round || 1,
        discount_rate: vals.discount_rate,
        start_date: vals.dates[0].format('YYYY-MM-DD'),
        end_date: vals.dates[1].format('YYYY-MM-DD'),
        target_filter: vals.category ? { category: vals.category } : undefined,
      });
      message.success('마크다운 스케줄이 생성되었습니다');
      setCreateModal(false);
      form.resetFields();
      loadSchedules();
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const handleApply = async (id: number) => {
    try {
      const result = await markdownApi.apply(id);
      message.success(`${result.applied_count}개 상품에 마크다운이 적용되었습니다`);
      loadSchedules();
      if (selected?.schedule_id === id) openDetail({ schedule_id: id });
    } catch (e: any) { message.error(e.message); }
  };

  const handleRevert = async (id: number) => {
    try {
      const result = await markdownApi.revert(id);
      message.success(`${result.reverted_count}개 상품의 마크다운이 복원되었습니다`);
      loadSchedules();
      if (selected?.schedule_id === id) openDetail({ schedule_id: id });
    } catch (e: any) { message.error(e.message); }
  };

  const columns: any[] = [
    { title: '스케줄명', dataIndex: 'schedule_name', ellipsis: true, render: (v: string, r: any) => <a onClick={() => openDetail(r)}><strong>{v}</strong></a> },
    { title: '시즌', dataIndex: 'season_code', width: 80 },
    { title: '라운드', dataIndex: 'markdown_round', width: 70, align: 'center' as const, render: (v: number) => `${v}차` },
    { title: '할인율', dataIndex: 'discount_rate', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{v}%</span> },
    { title: '시작일', dataIndex: 'start_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '종료일', dataIndex: 'end_date', width: 110, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] || v}</Tag> },
    { title: '대상상품', dataIndex: 'item_count', width: 80, align: 'right' as const, render: (v: number) => `${v}개` },
    { title: '적용상품', dataIndex: 'applied_count', width: 80, align: 'right' as const, render: (v: number) => `${v}개` },
    { title: '액션', key: 'action', width: 120, render: (_: any, r: any) => (
      <Space size={4}>
        {(r.status === 'DRAFT' || r.status === 'SCHEDULED') && (
          <Popconfirm title="마크다운을 적용하시겠습니까?" onConfirm={() => handleApply(r.schedule_id)} okText="적용" cancelText="취소">
            <Button size="small" type="primary" icon={<ThunderboltOutlined />}>적용</Button>
          </Popconfirm>
        )}
        {r.status === 'ACTIVE' && (
          <Popconfirm title="마크다운을 복원하시겠습니까?" onConfirm={() => handleRevert(r.schedule_id)} okText="복원" cancelText="취소">
            <Button size="small" danger icon={<RollbackOutlined />}>복원</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  const activeCount = schedules.filter(s => s.status === 'ACTIVE').length;
  const totalItems = schedules.reduce((sum: number, s: any) => sum + Number(s.item_count || 0), 0);
  const avgRate = schedules.length > 0 ? (schedules.reduce((sum: number, s: any) => sum + Number(s.discount_rate || 0), 0) / schedules.length).toFixed(1) : '0';

  return (
    <div>
      <PageHeader title="마크다운 관리" extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSchedules}>새로고침</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>새 마크다운</Button>
        </Space>
      } />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="전체 스케줄" value={schedules.length} suffix="건" prefix={<TagsOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="적용중" value={activeCount} suffix="건" valueStyle={{ color: '#52c41a' }} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="대상 상품" value={totalItems} suffix="개" prefix={<BarChartOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="평균 할인율" value={avgRate} suffix="%" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Card size="small" title={
        <Space>
          <span>마크다운 스케줄</span>
          <Select allowClear placeholder="시즌 필터" style={{ width: 120 }} value={seasonFilter} onChange={setSeasonFilter}
            options={seasons.map((s: any) => ({ value: s.season_code, label: s.season_code }))} />
        </Space>
      }>
        <Table dataSource={schedules} columns={columns} rowKey="schedule_id" loading={loading}
          size="small" scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      {/* 상세 모달 */}
      <Modal title={`마크다운 상세 - ${selected?.schedule_name || ''}`} open={detailModal}
        onCancel={() => { setDetailModal(false); setSelected(null); setImpact(null); }} width={900} footer={null}>
        {selected && (
          <Tabs items={[
            { key: 'info', label: '스케줄 정보', children: (
              <div>
                <Descriptions bordered size="small" column={3}>
                  <Descriptions.Item label="스케줄명">{selected.schedule_name}</Descriptions.Item>
                  <Descriptions.Item label="시즌">{selected.season_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="상태"><Tag color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</Tag></Descriptions.Item>
                  <Descriptions.Item label="라운드">{selected.markdown_round}차</Descriptions.Item>
                  <Descriptions.Item label="할인율"><span style={{ color: '#ff4d4f', fontWeight: 600 }}>{selected.discount_rate}%</span></Descriptions.Item>
                  <Descriptions.Item label="대상상품">{selected.items?.length || 0}개</Descriptions.Item>
                  <Descriptions.Item label="시작일">{selected.start_date?.slice(0, 10)}</Descriptions.Item>
                  <Descriptions.Item label="종료일">{selected.end_date?.slice(0, 10) || '-'}</Descriptions.Item>
                  <Descriptions.Item label="적용일시">{selected.applied_at?.slice(0, 19).replace('T', ' ') || '-'}</Descriptions.Item>
                </Descriptions>
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  {(selected.status === 'DRAFT' || selected.status === 'SCHEDULED') && (
                    <Popconfirm title="마크다운을 적용하시겠습니까?" onConfirm={() => handleApply(selected.schedule_id)} okText="적용">
                      <Button type="primary" icon={<ThunderboltOutlined />}>마크다운 적용</Button>
                    </Popconfirm>
                  )}
                  {selected.status === 'ACTIVE' && (
                    <Popconfirm title="마크다운을 복원하시겠습니까?" onConfirm={() => handleRevert(selected.schedule_id)} okText="복원">
                      <Button danger icon={<RollbackOutlined />}>마크다운 복원</Button>
                    </Popconfirm>
                  )}
                </div>
              </div>
            )},
            { key: 'items', label: `대상 상품 (${selected.items?.length || 0})`, children: (
              <Table
                dataSource={selected.items || []}
                rowKey="item_id"
                size="small"
                scroll={{ y: 400 }}
                pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }}
                columns={[
                  { title: '상품코드', dataIndex: 'product_code', width: 120 },
                  { title: '상품명', dataIndex: 'product_name', ellipsis: true },
                  { title: '카테고리', dataIndex: 'category', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                  { title: '원가', dataIndex: 'original_price', width: 100, align: 'right' as const, render: (v: number) => fmt(v) + '원' },
                  { title: '할인가', dataIndex: 'markdown_price', width: 100, align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{fmt(v)}원</span> },
                  { title: '할인액', key: 'diff', width: 90, align: 'right' as const, render: (_: any, r: any) => <span style={{ color: '#1890ff' }}>-{fmt(r.original_price - r.markdown_price)}원</span> },
                  { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => {
                    const c = v === 'APPLIED' ? 'green' : v === 'REVERTED' ? 'purple' : 'default';
                    return <Tag color={c}>{v === 'APPLIED' ? '적용' : v === 'REVERTED' ? '복원' : '대기'}</Tag>;
                  }},
                ]}
              />
            )},
            { key: 'impact', label: '임팩트 분석', children: impact ? (
              <div>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small" title={<span style={{ fontSize: 12 }}>적용 전 ({impact.period?.before?.from} ~ {impact.period?.before?.to})</span>}>
                      <Statistic title="판매수량" value={Number(impact.before?.sold_qty || 0)} suffix="개" />
                      <Statistic title="매출" value={Number(impact.before?.revenue || 0)} suffix="원" style={{ marginTop: 8 }} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title={<span style={{ fontSize: 12 }}>적용 후 ({impact.period?.after?.from} ~ {impact.period?.after?.to})</span>}>
                      <Statistic title="판매수량" value={Number(impact.after?.sold_qty || 0)} suffix="개"
                        valueStyle={{ color: Number(impact.after?.sold_qty || 0) > Number(impact.before?.sold_qty || 0) ? '#52c41a' : '#ff4d4f' }} />
                      <Statistic title="매출" value={Number(impact.after?.revenue || 0)} suffix="원" style={{ marginTop: 8 }}
                        valueStyle={{ color: Number(impact.after?.revenue || 0) > Number(impact.before?.revenue || 0) ? '#52c41a' : '#ff4d4f' }} />
                    </Card>
                  </Col>
                </Row>
                <div style={{ marginTop: 12, textAlign: 'center', color: '#888', fontSize: 12 }}>
                  대상: {impact.product_count}개 상품 | 할인율: {impact.discount_rate}%
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>
                {selected.status === 'DRAFT' ? '마크다운 적용 후 분석 가능' : '로딩중...'}
              </div>
            )},
          ]} />
        )}
      </Modal>

      {/* 생성 모달 */}
      <Modal title="새 마크다운 스케줄" open={createModal} onCancel={() => { setCreateModal(false); form.resetFields(); }}
        onOk={handleCreate} okText="생성" width={600}>
        <Form form={form} layout="vertical">
          <Form.Item label="스케줄명" name="schedule_name" rules={[{ required: true }]}>
            <Input placeholder="예: 26SS 1차 마크다운" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="시즌" name="season_code">
                <Select allowClear placeholder="전체" options={seasons.map((s: any) => ({ value: s.season_code, label: s.season_code }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="라운드" name="markdown_round" initialValue={1}>
                <InputNumber style={{ width: '100%' }} min={1} max={5} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="할인율 (%)" name="discount_rate" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={90} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="기간" name="dates" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="대상 카테고리 (미선택시 전체)" name="category">
            <Input placeholder="예: 아우터" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
