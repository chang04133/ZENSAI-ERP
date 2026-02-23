import { useEffect, useState } from 'react';
import { Table, Button, Input, InputNumber, Space, Tag, Modal, Alert, Popconfirm, DatePicker, Tabs, Select, Radio, message } from 'antd';
import { SearchOutlined, FireOutlined, TagsOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { SIZE_ORDER } from '../../utils/size-order';
import dayjs from 'dayjs';

/* ── 사이즈 칩 시각화 ── */
function SizeChips({ sizeDetail }: { sizeDetail?: Array<{ size: string; stock: number }> }) {
  if (!sizeDetail || sizeDetail.length === 0) return <span style={{ color: '#aaa' }}>-</span>;
  const stocked = sizeDetail.filter((s) => s.stock > 0);
  if (stocked.length === 0) return <span style={{ color: '#aaa' }}>전체 품절</span>;
  const minOrder = Math.min(...stocked.map((s) => SIZE_ORDER[s.size] ?? 99));
  const maxOrder = Math.max(...stocked.map((s) => SIZE_ORDER[s.size] ?? 0));

  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {sizeDetail.map((s) => {
        const order = SIZE_ORDER[s.size] ?? 99;
        const isBroken = s.stock === 0 && order > minOrder && order < maxOrder;
        return (
          <Tag
            key={s.size}
            color={s.stock > 0 ? 'green' : isBroken ? 'red' : 'default'}
            style={{ fontSize: 11, margin: 0, lineHeight: '18px', padding: '0 4px' }}
          >
            {s.size}({s.stock})
          </Tag>
        );
      })}
    </div>
  );
}

export default function EventProductsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [activeTab, setActiveTab] = useState('list');

  /* ═══════ 탭1: 행사 상품 목록 ═══════ */
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkPrice, setBulkPrice] = useState<number | null>(null);
  const [editingPrices, setEditingPrices] = useState<Record<string, number | null>>({});

  /* ═══════ 탭2: 행사 추천 ═══════ */
  const [recs, setRecs] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recCategory, setRecCategory] = useState<string>('');
  const [selectedRecKeys, setSelectedRecKeys] = useState<React.Key[]>([]);
  const [recApplyOpen, setRecApplyOpen] = useState(false);
  const [applyMode, setApplyMode] = useState<'rate' | 'fixed'>('rate');
  const [applyRate, setApplyRate] = useState<number>(30);
  const [applyFixed, setApplyFixed] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  /* ── 행사 상품 로드 ── */
  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      const result = await productApi.listEventProducts(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  /* ── 추천 로드 ── */
  const loadRecs = async () => {
    setRecLoading(true);
    try {
      const result = await productApi.eventRecommendations({
        category: recCategory || undefined,
      });
      setRecs(result);
      // 카테고리 목록 추출
      const cats = [...new Set(result.map((r: any) => r.category).filter(Boolean))] as string[];
      if (cats.length > 0 && categories.length === 0) setCategories(cats);
    } catch (e: any) { message.error(e.message); }
    finally { setRecLoading(false); }
  };

  useEffect(() => { if (activeTab === 'recommend') loadRecs(); }, [activeTab, recCategory]);

  /* ── 기존 행사 기능들 ── */
  const handleSearch = () => { setPage(1); load(1); };

  const handlePriceBlur = async (code: string) => {
    const newPrice = editingPrices[code];
    if (newPrice === undefined) return;
    try {
      await productApi.updateEventPrice(code, newPrice);
      message.success('행사가가 수정되었습니다.');
      setEditingPrices((prev) => { const next = { ...prev }; delete next[code]; return next; });
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDateChange = async (code: string, type: 'start' | 'end', date: any) => {
    try {
      const item = data.find((d: any) => d.product_code === code);
      const startDate = type === 'start' ? (date ? date.format('YYYY-MM-DD') : null) : (item?.event_start_date || null);
      const endDate = type === 'end' ? (date ? date.format('YYYY-MM-DD') : null) : (item?.event_end_date || null);
      await productApi.updateEventPrice(code, item?.event_price, startDate, endDate);
      message.success('행사 기간이 수정되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleClearSingle = async (code: string) => {
    try {
      await productApi.updateEventPrice(code, null);
      message.success('행사가가 해제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleBulkClear = async () => {
    const updates = selectedRowKeys.map((key) => ({ product_code: key as string, event_price: null as number | null }));
    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품의 행사가가 해제되었습니다.`);
      setSelectedRowKeys([]);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleBulkSet = async () => {
    if (!bulkPrice || bulkPrice <= 0) { message.error('행사가를 입력해주세요.'); return; }
    const updates = selectedRowKeys.map((key) => ({ product_code: key as string, event_price: bulkPrice }));
    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품의 행사가가 설정되었습니다.`);
      setSelectedRowKeys([]);
      setBulkModalOpen(false);
      setBulkPrice(null);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ── 추천 → 행사가 일괄 적용 ── */
  const handleRecApply = async () => {
    const selected = recs.filter((r) => selectedRecKeys.includes(r.product_code));
    if (selected.length === 0) return;

    let updates: Array<{ product_code: string; event_price: number | null }>;
    if (applyMode === 'rate') {
      if (!applyRate || applyRate <= 0 || applyRate >= 100) { message.error('할인율을 1~99 사이로 입력해주세요.'); return; }
      updates = selected.map((r) => ({
        product_code: r.product_code,
        event_price: Math.round(Number(r.base_price) * (1 - applyRate / 100) / 100) * 100,
      }));
    } else {
      if (!applyFixed || applyFixed <= 0) { message.error('행사가를 입력해주세요.'); return; }
      updates = selected.map((r) => ({ product_code: r.product_code, event_price: applyFixed }));
    }

    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품에 행사가가 설정되었습니다.`);
      setSelectedRecKeys([]);
      setRecApplyOpen(false);
      loadRecs();
      load();
    } catch (e: any) { message.error(e.message); }
  };

  /* ═══════ 탭1 컬럼 ═══════ */
  const columns = [
    {
      title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 160,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 100 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 90 },
    {
      title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 110,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    {
      title: '행사가', dataIndex: 'event_price', key: 'event_price', width: 140,
      render: (v: number, record: any) => {
        if (!canWrite) return <span style={{ color: '#fa8c16', fontWeight: 600 }}>{Number(v).toLocaleString()}원</span>;
        const editVal = editingPrices[record.product_code];
        return (
          <InputNumber
            size="small" min={0}
            value={editVal !== undefined ? editVal : Number(v)}
            style={{ width: 120, color: '#fa8c16' }}
            formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
            parser={(val) => Number((val || '').replace(/,/g, ''))}
            onChange={(val) => setEditingPrices((prev) => ({ ...prev, [record.product_code]: val }))}
            onBlur={() => handlePriceBlur(record.product_code)}
            onPressEnter={() => handlePriceBlur(record.product_code)}
          />
        );
      },
    },
    {
      title: '할인율', key: 'discount_rate', width: 80,
      render: (_: any, record: any) => {
        const base = Number(record.base_price);
        const event = Number(record.event_price);
        if (!base || !event) return '-';
        const rate = Math.round((1 - event / base) * 100);
        return <Tag color={rate >= 30 ? 'red' : rate >= 10 ? 'orange' : 'default'}>{rate}%</Tag>;
      },
    },
    {
      title: '시작일', dataIndex: 'event_start_date', key: 'event_start_date', width: 130,
      render: (v: string, record: any) => {
        if (!canWrite) return v ? dayjs(v).format('YYYY-MM-DD') : '-';
        return (
          <DatePicker size="small" value={v ? dayjs(v) : null}
            onChange={(d) => handleDateChange(record.product_code, 'start', d)}
            placeholder="시작일" style={{ width: 120 }} />
        );
      },
    },
    {
      title: '종료일', dataIndex: 'event_end_date', key: 'event_end_date', width: 130,
      render: (v: string, record: any) => {
        const expired = v && dayjs(v).isBefore(dayjs(), 'day');
        if (!canWrite) return v ? <span style={expired ? { color: '#ff4d4f' } : {}}>{dayjs(v).format('YYYY-MM-DD')}{expired ? ' (만료)' : ''}</span> : '-';
        return (
          <DatePicker size="small" value={v ? dayjs(v) : null}
            onChange={(d) => handleDateChange(record.product_code, 'end', d)}
            placeholder="종료일" style={{ width: 120 }} status={expired ? 'error' : undefined} />
        );
      },
    },
    {
      title: '재고', dataIndex: 'total_inv_qty', key: 'total_inv_qty', width: 80,
      render: (v: number) => {
        const qty = Number(v || 0);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 80,
      render: (_: any, record: any) => (
        <Popconfirm title="행사가를 해제하시겠습니까?" onConfirm={() => handleClearSingle(record.product_code)}>
          <Button size="small" danger>해제</Button>
        </Popconfirm>
      ),
    }] : []),
  ];

  /* ═══════ 탭2 컬럼 ═══════ */
  const recColumns = [
    {
      title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 150,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 160, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80 },
    {
      title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 100, align: 'right' as const,
      render: (v: number) => v ? `${Number(v).toLocaleString()}` : '-',
    },
    {
      title: '총재고', dataIndex: 'total_stock', key: 'total_stock', width: 70, align: 'right' as const,
      render: (v: number) => {
        const n = Number(v || 0);
        return <span style={{ color: n <= 5 ? '#ff4d4f' : n <= 20 ? '#fa8c16' : '#333', fontWeight: 600 }}>{n}</span>;
      },
    },
    {
      title: '판매량', dataIndex: 'total_sold', key: 'total_sold', width: 70, align: 'right' as const,
      render: (v: number) => <span style={{ color: Number(v || 0) === 0 ? '#ff4d4f' : '#333' }}>{Number(v || 0)}</span>,
    },
    {
      title: '사이즈 현황', key: 'size_detail', width: 200,
      render: (_: any, record: any) => <SizeChips sizeDetail={record.size_detail} />,
    },
    {
      title: '깨짐', dataIndex: 'broken_count', key: 'broken_count', width: 55, align: 'center' as const,
      render: (v: number) => {
        const n = Number(v || 0);
        return n > 0 ? <Tag color="red">{n}</Tag> : <span style={{ color: '#ccc' }}>0</span>;
      },
    },
    {
      title: '추천점수', dataIndex: 'recommendation_score', key: 'recommendation_score', width: 85, align: 'center' as const,
      sorter: (a: any, b: any) => Number(a.recommendation_score) - Number(b.recommendation_score),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => {
        const n = Number(v || 0);
        const color = n >= 70 ? '#ff4d4f' : n >= 40 ? '#fa8c16' : '#1890ff';
        return <span style={{ color, fontWeight: 700, fontSize: 14 }}>{n}</span>;
      },
    },
  ];

  /* ═══════ 탭1 콘텐츠 ═══════ */
  const listTab = (
    <>
      {!canWrite && (
        <Alert
          message="현재 행사가가 설정된 상품 목록입니다. 매출등록 시 '행사' 유형을 선택하면 행사가가 자동 적용됩니다."
          type="info" showIcon style={{ marginBottom: 16 }}
        />
      )}

      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="상품코드 또는 상품명 검색" prefix={<SearchOutlined />}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={handleSearch} style={{ width: 250 }} />
        <Button onClick={handleSearch}>조회</Button>
      </Space>

      {canWrite && selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <Popconfirm title={`${selectedRowKeys.length}개 상품의 행사가를 해제하시겠습니까?`} onConfirm={handleBulkClear}>
            <Button danger>선택 행사가 해제 ({selectedRowKeys.length})</Button>
          </Popconfirm>
          <Button type="primary" onClick={() => { setBulkPrice(null); setBulkModalOpen(true); }}>
            선택 행사가 설정 ({selectedRowKeys.length})
          </Button>
        </Space>
      )}

      <Table
        rowSelection={canWrite ? { selectedRowKeys, onChange: setSelectedRowKeys } : undefined}
        columns={columns} dataSource={data} rowKey="product_code"
        loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
      />
    </>
  );

  /* ═══════ 탭2 콘텐츠 ═══════ */
  const recommendTab = (
    <>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Select
          placeholder="카테고리 필터"
          allowClear
          value={recCategory || undefined}
          onChange={(v) => setRecCategory(v || '')}
          style={{ width: 160 }}
          options={categories.map((c) => ({ label: c, value: c }))}
        />
        <Button onClick={loadRecs} loading={recLoading}>새로고침</Button>
        {canWrite && selectedRecKeys.length > 0 && (
          <Button type="primary" icon={<FireOutlined />}
            onClick={() => { setApplyMode('rate'); setApplyRate(30); setApplyFixed(null); setRecApplyOpen(true); }}>
            선택 상품 행사가 설정 ({selectedRecKeys.length})
          </Button>
        )}
        <span style={{ color: '#888', fontSize: 12 }}>
          <Tag color="green" style={{ fontSize: 11 }}>재고있음</Tag>
          <Tag color="red" style={{ fontSize: 11 }}>깨짐(중간품절)</Tag>
          <Tag style={{ fontSize: 11 }}>품절(양끝)</Tag>
        </span>
      </div>

      <Table
        rowSelection={canWrite ? { selectedRowKeys: selectedRecKeys, onChange: setSelectedRecKeys } : undefined}
        columns={recColumns} dataSource={recs} rowKey="product_code"
        loading={recLoading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
    </>
  );

  return (
    <div>
      <PageHeader title="행사 상품" />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'list', label: <span><TagsOutlined /> 행사 상품</span>, children: listTab },
          { key: 'recommend', label: <span><FireOutlined /> 행사 추천</span>, children: recommendTab },
        ]}
      />

      {/* 기존 행사가 일괄 설정 모달 */}
      <Modal
        title={`선택 상품 행사가 일괄 설정 (${selectedRowKeys.length}개)`}
        open={bulkModalOpen} onOk={handleBulkSet}
        onCancel={() => setBulkModalOpen(false)} okText="적용" cancelText="취소"
      >
        <div style={{ marginBottom: 12 }}>선택된 {selectedRowKeys.length}개 상품에 동일한 행사가를 설정합니다.</div>
        <InputNumber
          value={bulkPrice} onChange={(v) => setBulkPrice(v)}
          placeholder="행사가 입력" style={{ width: '100%' }} min={0}
          formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
          parser={(val) => Number((val || '').replace(/,/g, ''))}
          addonAfter="원"
        />
      </Modal>

      {/* 추천 → 행사가 적용 모달 */}
      <Modal
        title={`추천 상품 행사가 설정 (${selectedRecKeys.length}개)`}
        open={recApplyOpen}
        onOk={handleRecApply}
        onCancel={() => setRecApplyOpen(false)}
        okText="행사가 적용"
        cancelText="취소"
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          선택된 <strong>{selectedRecKeys.length}</strong>개 상품에 행사가를 설정합니다.
        </div>

        <Radio.Group value={applyMode} onChange={(e) => setApplyMode(e.target.value)}
          style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
          <Radio value="rate">할인율 적용</Radio>
          <Radio value="fixed">고정 행사가</Radio>
        </Radio.Group>

        {applyMode === 'rate' ? (
          <div>
            <InputNumber
              min={1} max={99} value={applyRate}
              onChange={(v) => v !== null && setApplyRate(v)}
              addonAfter="% 할인"
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#666' }}>
              <div>각 상품의 기본가 기준 {applyRate}% 할인가 적용 (100원 단위 반올림)</div>
              {selectedRecKeys.length > 0 && selectedRecKeys.length <= 5 && (
                <div style={{ marginTop: 6 }}>
                  {recs.filter((r) => selectedRecKeys.includes(r.product_code)).map((r) => (
                    <div key={r.product_code}>
                      {r.product_code}: {Number(r.base_price).toLocaleString()}원 → <strong>{(Math.round(Number(r.base_price) * (1 - applyRate / 100) / 100) * 100).toLocaleString()}원</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <InputNumber
            min={0} value={applyFixed}
            onChange={(v) => setApplyFixed(v)}
            placeholder="행사가 입력"
            style={{ width: '100%' }}
            formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
            parser={(val) => Number((val || '').replace(/,/g, ''))}
            addonAfter="원"
          />
        )}
      </Modal>
    </div>
  );
}
