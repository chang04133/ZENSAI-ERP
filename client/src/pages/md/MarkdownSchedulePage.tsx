import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, Popconfirm, message, Card, Row, Col, Checkbox } from 'antd';
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, UndoOutlined, BulbOutlined, ArrowLeftOutlined, PlusCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { markdownApi } from '../../modules/md/markdown.api';
import { codeApi } from '../../modules/code/code.api';
import type { MarkdownSchedule } from '../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

const STATUS_COLOR: Record<string, string> = { DRAFT: 'default', APPLIED: 'green', REVERTED: 'orange' };
const STATUS_LABEL: Record<string, string> = { DRAFT: '초안', APPLIED: '적용됨', REVERTED: '복원됨' };

interface ProductOption { product_code: string; product_name: string; category: string; base_price: number; event_price: number | null; season_code: string; }
interface RecommendedProduct {
  product_code: string; product_name: string; category: string; base_price: number; season_code: string;
  stock_qty: number; sold_90d: number; sold_total: number; last_sale_date: string | null;
  sell_through_pct: number; days_of_supply: number;
}

export default function MarkdownSchedulePage() {
  const [data, setData] = useState<MarkdownSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSeason, setFilterSeason] = useState<string>();
  const [filterStatus, setFilterStatus] = useState<string>();
  const [seasonOpts, setSeasonOpts] = useState<{ label: string; value: string }[]>([]);
  const [categoryOpts, setCategoryOpts] = useState<{ label: string; value: string }[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Product selection
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [prodCategory, setProdCategory] = useState<string>();
  const [prodLoading, setProdLoading] = useState(false);

  // 추천 상품 상세 뷰
  const [detailSchedule, setDetailSchedule] = useState<MarkdownSchedule | null>(null);
  const [recProducts, setRecProducts] = useState<RecommendedProduct[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recSelected, setRecSelected] = useState<string[]>([]);
  const [recCategory, setRecCategory] = useState<string>();
  const [addingToSchedule, setAddingToSchedule] = useState(false);

  // Load master codes
  useEffect(() => {
    codeApi.getByType('SEASON').then((d: any[]) =>
      setSeasonOpts(d.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCategoryOpts(d.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await markdownApi.list(filterSeason, filterStatus)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [filterSeason, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Load products for selection
  const loadProducts = async (cat?: string) => {
    setProdLoading(true);
    try {
      const seasonCode = form.getFieldValue('season_code');
      setProducts(await markdownApi.getProducts(cat, seasonCode));
    } catch (e: any) { message.error(e.message); }
    finally { setProdLoading(false); }
  };

  // 스케줄 클릭 → 추천 상품 상세 뷰
  const openDetail = async (schedule: MarkdownSchedule) => {
    setDetailSchedule(schedule);
    setRecSelected([]);
    setRecCategory(undefined);
    setRecLoading(true);
    try {
      // 이미 스케줄에 포함된 상품코드 가져오기
      const detail = await markdownApi.get(schedule.schedule_id);
      const existingCodes = (detail.items || []).map((i: any) => i.product_code);
      const recs = await markdownApi.recommend(schedule.season_code, undefined, existingCodes);
      setRecProducts(recs);
    } catch (e: any) { message.error(e.message); }
    finally { setRecLoading(false); }
  };

  const loadRec = async (cat?: string) => {
    if (!detailSchedule) return;
    setRecLoading(true);
    try {
      const detail = await markdownApi.get(detailSchedule.schedule_id);
      const existingCodes = (detail.items || []).map((i: any) => i.product_code);
      const recs = await markdownApi.recommend(detailSchedule.season_code, cat || undefined, existingCodes);
      setRecProducts(recs);
    } catch (e: any) { message.error(e.message); }
    finally { setRecLoading(false); }
  };

  // 추천 상품 → 스케줄에 추가
  const addRecommended = async () => {
    if (!detailSchedule || !recSelected.length) return;
    if (detailSchedule.status !== 'DRAFT') { message.warning('DRAFT 상태에서만 상품을 추가할 수 있습니다.'); return; }
    setAddingToSchedule(true);
    try {
      const detail = await markdownApi.get(detailSchedule.schedule_id);
      const existingItems = (detail.items || []).map((i: any) => ({
        product_code: i.product_code,
        original_price: Number(i.original_price),
        markdown_price: Number(i.markdown_price),
      }));
      const discountRate = Number(detailSchedule.discount_rate) / 100;
      const newItems = recSelected.map(code => {
        const prod = recProducts.find(p => p.product_code === code);
        const basePrice = Number(prod?.base_price) || 0;
        return {
          product_code: code,
          original_price: Math.round(basePrice),
          markdown_price: Math.round(basePrice * (1 - discountRate)),
        };
      });
      await markdownApi.update(detailSchedule.schedule_id, {
        items: [...existingItems, ...newItems],
      });
      message.success(`${recSelected.length}건 추가 완료`);
      setRecSelected([]);
      load();
      // 추천 목록 새로고침 (추가된 상품 제거)
      loadRec(recCategory);
    } catch (e: any) { message.error(e.message); }
    finally { setAddingToSchedule(false); }
  };

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ markdown_round: 1, discount_rate: 20 });
    setSelectedCodes([]);
    setProducts([]);
    setModalOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const detail = await markdownApi.get(id);
      setEditId(id);
      form.setFieldsValue({
        schedule_name: detail.schedule_name,
        season_code: detail.season_code,
        markdown_round: detail.markdown_round,
        discount_rate: Number(detail.discount_rate),
        date_range: detail.start_date ? [dayjs(detail.start_date), detail.end_date ? dayjs(detail.end_date) : null] : undefined,
      });
      setSelectedCodes(detail.items?.map((i: any) => i.product_code) || []);
      // Load products for that season
      const prods = await markdownApi.getProducts(undefined, detail.season_code);
      setProducts(prods);
      setModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedCodes.length) { message.warning('대상 상품을 선택하세요.'); return; }
      setSubmitting(true);

      const discountRate = values.discount_rate / 100;
      const items = selectedCodes.map(code => {
        const prod = products.find(p => p.product_code === code);
        const basePrice = prod?.base_price || 0;
        return {
          product_code: code,
          original_price: Math.round(basePrice),
          markdown_price: Math.round(basePrice * (1 - discountRate)),
        };
      });

      const body = {
        schedule_name: values.schedule_name,
        season_code: values.season_code,
        markdown_round: values.markdown_round,
        discount_rate: values.discount_rate,
        start_date: values.date_range?.[0]?.format('YYYY-MM-DD') || '',
        end_date: values.date_range?.[1]?.format('YYYY-MM-DD') || undefined,
        items,
      };

      if (editId) {
        await markdownApi.update(editId, body);
        message.success('스케줄이 수정되었습니다.');
      } else {
        await markdownApi.create(body);
        message.success('스케줄이 생성되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return; // form validation
      message.error(e.message);
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await markdownApi.remove(id);
      message.success('삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleApply = async (id: number) => {
    try {
      await markdownApi.apply(id);
      message.success('마크다운이 적용되었습니다. (상품 행사가 반영)');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleRevert = async (id: number) => {
    try {
      await markdownApi.revert(id);
      message.success('마크다운이 복원되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns: any[] = [
    { title: '스케줄명', dataIndex: 'schedule_name', ellipsis: true, render: (v: string, r: MarkdownSchedule) => <a onClick={() => openDetail(r)} style={{ cursor: 'pointer', fontWeight: 500 }}>{v}</a> },
    { title: '시즌', dataIndex: 'season_code', width: 80, align: 'center' as const },
    { title: '차수', dataIndex: 'markdown_round', width: 60, align: 'center' as const, render: (v: number) => `${v}차` },
    { title: '할인율', dataIndex: 'discount_rate', width: 80, align: 'center' as const, render: (v: number) => `${v}%` },
    { title: '시작일', dataIndex: 'start_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '종료일', dataIndex: 'end_date', width: 110, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '상품수', dataIndex: 'item_count', width: 70, align: 'right' as const, render: (v: number) => `${v}건` },
    {
      title: '상태', dataIndex: 'status', width: 90, align: 'center' as const,
      render: (v: string) => <Tag color={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Tag>,
    },
    { title: '적용일시', dataIndex: 'applied_at', width: 140, render: (v: string) => v?.slice(0, 16).replace('T', ' ') || '-' },
    {
      title: '액션', width: 200, fixed: 'right' as const,
      render: (_: any, r: MarkdownSchedule) => (
        <Space size={4}>
          {r.status === 'DRAFT' && (
            <>
              <Button size="small" onClick={() => openEdit(r.schedule_id)}>수정</Button>
              <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.schedule_id)}>
                <Button size="small" danger>삭제</Button>
              </Popconfirm>
              <Popconfirm title="마크다운을 적용합니다. 상품 행사가가 변경됩니다." onConfirm={() => handleApply(r.schedule_id)}>
                <Button size="small" type="primary" icon={<CheckCircleOutlined />}>적용</Button>
              </Popconfirm>
            </>
          )}
          {r.status === 'APPLIED' && (
            <Popconfirm title="마크다운을 복원합니다. 행사가가 원래대로 되돌아갑니다." onConfirm={() => handleRevert(r.schedule_id)}>
              <Button size="small" icon={<UndoOutlined />}>복원</Button>
            </Popconfirm>
          )}
          {r.status === 'REVERTED' && <Tag>복원완료</Tag>}
        </Space>
      ),
    },
  ];

  // Product selection table inside modal
  const prodColumns: any[] = [
    {
      title: <Checkbox
        checked={products.length > 0 && selectedCodes.length === products.length}
        indeterminate={selectedCodes.length > 0 && selectedCodes.length < products.length}
        onChange={e => setSelectedCodes(e.target.checked ? products.map(p => p.product_code) : [])}
      />,
      width: 40,
      render: (_: any, r: ProductOption) => (
        <Checkbox
          checked={selectedCodes.includes(r.product_code)}
          onChange={e => {
            setSelectedCodes(prev => e.target.checked ? [...prev, r.product_code] : prev.filter(c => c !== r.product_code));
          }}
        />
      ),
    },
    { title: '상품코드', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', width: 80 },
    { title: '정가', dataIndex: 'base_price', width: 100, align: 'right' as const, render: (v: number) => fmt(v) },
    {
      title: '마크다운가', width: 110, align: 'right' as const,
      render: (_: any, r: ProductOption) => {
        const rate = form.getFieldValue('discount_rate') || 0;
        return <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{fmt(Math.round(r.base_price * (1 - rate / 100)))}</span>;
      },
    },
  ];

  // 추천 상품 테이블 컬럼
  const recColumns: any[] = [
    {
      title: <Checkbox
        checked={recProducts.length > 0 && recSelected.length === recProducts.length}
        indeterminate={recSelected.length > 0 && recSelected.length < recProducts.length}
        onChange={(e: any) => setRecSelected(e.target.checked ? recProducts.map(p => p.product_code) : [])}
      />,
      width: 40,
      render: (_: any, r: RecommendedProduct) => (
        <Checkbox checked={recSelected.includes(r.product_code)}
          onChange={(e: any) => setRecSelected(prev => e.target.checked ? [...prev, r.product_code] : prev.filter(c => c !== r.product_code))} />
      ),
    },
    { title: '상품코드', dataIndex: 'product_code', width: 120, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '정가', dataIndex: 'base_price', width: 90, align: 'right' as const, render: (v: number) => fmt(Number(v)) },
    {
      title: '마크다운가', width: 100, align: 'right' as const,
      render: (_: any, r: RecommendedProduct) => {
        const rate = Number(detailSchedule?.discount_rate) || 0;
        return <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{fmt(Math.round(Number(r.base_price) * (1 - rate / 100)))}</span>;
      },
    },
    { title: '재고', dataIndex: 'stock_qty', width: 70, align: 'right' as const, render: (v: number) => <span style={{ color: v > 50 ? '#ff4d4f' : '#666', fontWeight: v > 50 ? 700 : 400 }}>{fmt(v)}</span> },
    { title: '90일 판매', dataIndex: 'sold_90d', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? fmt(v) : <span style={{ color: '#ff4d4f' }}>0</span> },
    {
      title: '판매율', dataIndex: 'sell_through_pct', width: 80, align: 'center' as const,
      render: (v: number) => <Tag color={Number(v) < 30 ? 'red' : Number(v) < 60 ? 'orange' : 'green'}>{v}%</Tag>,
    },
    {
      title: '재고일수', dataIndex: 'days_of_supply', width: 85, align: 'right' as const,
      render: (v: number) => v >= 9999 ? <Tag color="red">무한</Tag> : <span style={{ color: v > 180 ? '#ff4d4f' : v > 90 ? '#faad14' : '#52c41a', fontWeight: 600 }}>{v}일</span>,
    },
  ];

  // ── 추천 상세 뷰 ──
  if (detailSchedule) {
    const ds = detailSchedule;
    const filteredRec = recProducts;
    return (
      <div>
        <PageHeader title="마크다운 추천 상품" />
        <Button icon={<ArrowLeftOutlined />} onClick={() => setDetailSchedule(null)} style={{ marginBottom: 12 }}>목록으로</Button>

        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}><div style={{ fontSize: 11, color: '#888' }}>스케줄</div><div style={{ fontSize: 16, fontWeight: 700 }}>{ds.schedule_name}</div></Col>
            <Col span={3}><div style={{ fontSize: 11, color: '#888' }}>시즌</div><div style={{ fontSize: 16, fontWeight: 700 }}>{ds.season_code}</div></Col>
            <Col span={3}><div style={{ fontSize: 11, color: '#888' }}>차수</div><div style={{ fontSize: 16, fontWeight: 700 }}>{ds.markdown_round}차</div></Col>
            <Col span={3}><div style={{ fontSize: 11, color: '#888' }}>할인율</div><div style={{ fontSize: 16, fontWeight: 700 }}>{ds.discount_rate}%</div></Col>
            <Col span={3}><div style={{ fontSize: 11, color: '#888' }}>기존 상품</div><div style={{ fontSize: 16, fontWeight: 700 }}>{ds.item_count || 0}건</div></Col>
            <Col span={3}><div style={{ fontSize: 11, color: '#888' }}>상태</div><Tag color={STATUS_COLOR[ds.status]}>{STATUS_LABEL[ds.status]}</Tag></Col>
            <Col span={3}><div style={{ fontSize: 11, color: '#888' }}>기간</div><div style={{ fontSize: 12 }}>{ds.start_date?.slice(0, 10)}</div></Col>
          </Row>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <BulbOutlined style={{ color: '#faad14', fontSize: 16 }} />
            <span style={{ fontWeight: 600 }}>추천 상품 — 재고 많고 판매 느린 순</span>
            <span style={{ fontSize: 12, color: '#888' }}>({filteredRec.length}건)</span>
          </div>
          <Space>
            <Select value={recCategory} onChange={v => { setRecCategory(v); loadRec(v); }} placeholder="카테고리" allowClear options={categoryOpts} style={{ width: 120 }} />
            {ds.status === 'DRAFT' && (
              <Button type="primary" icon={<PlusCircleOutlined />} disabled={!recSelected.length} loading={addingToSchedule}
                onClick={addRecommended}>
                {recSelected.length ? `선택 ${recSelected.length}건 추가` : '상품 선택 후 추가'}
              </Button>
            )}
          </Space>
        </div>

        <Table dataSource={filteredRec} columns={recColumns} rowKey="product_code" size="small" loading={recLoading}
          scroll={{ x: 1000, y: 'calc(100vh - 380px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />

        <Card size="small" style={{ marginTop: 12, background: '#fafafa' }}>
          <div style={{ fontSize: 12, color: '#666' }}>
            <b>추천 기준</b> — 재고가 있고, 행사가 미적용 상품 중 마크다운이 필요한 순서로 정렬
            <br />• <b>판매율</b> = 총판매수량 / (재고 + 총판매수량) — 낮을수록 재고 체류
            <br />• <b>재고일수</b> = 현재 재고 / 일평균 판매(최근90일) — 높을수록 소진까지 오래 걸림
            <br />• <b>90일 판매 = 0</b>인 상품 → 재고일수 "무한" 표시 (가장 시급)
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="마크다운 스케줄" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>새 스케줄</Button>} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={filterSeason} onChange={setFilterSeason} placeholder="시즌" allowClear options={seasonOpts} style={{ width: 120 }} />
        <Select value={filterStatus} onChange={setFilterStatus} placeholder="상태" allowClear style={{ width: 120 }}
          options={[{ label: '초안', value: 'DRAFT' }, { label: '적용됨', value: 'APPLIED' }, { label: '복원됨', value: 'REVERTED' }]} />
        <Button onClick={load} icon={<SearchOutlined />} loading={loading}>조회</Button>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
          <div style={{ fontSize: 11, color: '#888' }}>전체 스케줄</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{data.length}건</div>
        </Card></Col>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #52c41a' }}>
          <div style={{ fontSize: 11, color: '#888' }}>적용중</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a' }}>{data.filter(d => d.status === 'APPLIED').length}건</div>
        </Card></Col>
        <Col xs={8}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
          <div style={{ fontSize: 11, color: '#888' }}>초안</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#722ed1' }}>{data.filter(d => d.status === 'DRAFT').length}건</div>
        </Card></Col>
      </Row>

      <Table dataSource={data} columns={columns} rowKey="schedule_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
        pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />

      <Modal
        title={editId ? '마크다운 스케줄 수정' : '새 마크다운 스케줄'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={submitting}
        width={900}
        okText={editId ? '수정' : '생성'}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="schedule_name" label="스케줄명" rules={[{ required: true, message: '스케줄명을 입력하세요' }]}>
                <Input placeholder="예: 25FW 1차 마크다운 (20% OFF)" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="season_code" label="시즌 코드" rules={[{ required: true, message: '시즌을 선택하세요' }]}>
                <Select options={seasonOpts} placeholder="시즌" onChange={() => { setProducts([]); setSelectedCodes([]); }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="markdown_round" label="차수" rules={[{ required: true }]}>
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="discount_rate" label="할인율 (%)" rules={[{ required: true }]}>
                <InputNumber min={1} max={90} style={{ width: '100%' }} addonAfter="%" />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item name="date_range" label="마크다운 기간" rules={[{ required: true, message: '기간을 선택하세요' }]}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>대상 상품 선택 ({selectedCodes.length}건)</span>
            <Space>
              <Select value={prodCategory} onChange={v => { setProdCategory(v); loadProducts(v); }} placeholder="카테고리" allowClear
                options={categoryOpts} style={{ width: 120 }} />
              <Button size="small" onClick={() => loadProducts(prodCategory)} loading={prodLoading}>상품 조회</Button>
            </Space>
          </div>
          <Table dataSource={products} columns={prodColumns} rowKey="product_code" size="small" loading={prodLoading}
            scroll={{ y: 300 }} pagination={false} />
        </div>
      </Modal>
    </div>
  );
}
