import { useEffect, useState } from 'react';
import { Card, Table, Tag, DatePicker, Space, Spin, Select, Input, message, Row, Col, Button } from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, SearchOutlined,
  ShopOutlined, TagOutlined, SkinOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { codeApi } from '../../modules/code/code.api';
import { productApi } from '../../modules/product/product.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import dayjs, { Dayjs } from 'dayjs';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

const CAT_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};

const fmt = (v: number) => Number(v).toLocaleString();

export default function ProductSalesPage() {
  const user = useAuthStore((s) => s.user);
  const isHQ = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);

  // 필터 상태
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [fitFilter, setFitFilter] = useState('');
  const [lengthFilter, setLengthFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');

  // 옵션 데이터
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [lengthOptions, setLengthOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  // 옵션 로드
  useEffect(() => {
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setAllCategoryCodes(data);
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('FIT').then((data: any[]) => {
      setFitOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('LENGTH').then((data: any[]) => {
      setLengthOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    if (isHQ) {
      partnerApi.list({ limit: '1000' }).then((r: any) => {
        setPartners(r.data || []);
      }).catch(() => {});
    }
  }, []);

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setSubCategoryFilter('');
    if (!value) { setSubCategoryOptions([]); return; }
    const parent = allCategoryCodes.find((c: any) => c.code_value === value && !c.parent_code);
    if (parent) {
      setSubCategoryOptions(
        allCategoryCodes.filter((c: any) => c.parent_code === parent.code_id && c.is_active)
          .map((c: any) => ({ label: c.code_label, value: c.code_value })),
      );
    } else {
      setSubCategoryOptions([]);
    }
  };

  const buildFilters = () => {
    const f: Record<string, string> = {};
    if (search) f.search = search;
    if (categoryFilter) f.category = categoryFilter;
    if (subCategoryFilter) f.sub_category = subCategoryFilter;
    if (seasonFilter) f.season = seasonFilter;
    if (fitFilter) f.fit = fitFilter;
    if (lengthFilter) f.length = lengthFilter;
    if (colorFilter) f.color = colorFilter;
    if (sizeFilter) f.size = sizeFilter;
    if (partnerFilter) f.partner_code = partnerFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  };

  const load = async (from: Dayjs, to: Dayjs) => {
    setLoading(true);
    try {
      const result = await salesApi.productsByRange(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), buildFilters());
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(range[0], range[1]); }, []);

  const handleSearch = () => load(range[0], range[1]);

  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    load(from, to);
  };
  const today = dayjs();

  const totals = data?.totals || {};
  const summary = data?.summary || [];

  // 활성 필터 개수
  const activeFilterCount = [categoryFilter, subCategoryFilter, seasonFilter, fitFilter, lengthFilter, colorFilter, sizeFilter, partnerFilter, search].filter(Boolean).length;

  return (
    <div>
      <PageHeader title="종합매출" />

      {/* 기간 + 빠른 선택 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginBottom: 8, padding: '10px 14px',
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
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" type="primary" ghost onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month'))}>전월</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('year'), today)}>올해</Button>
        </Space>
      </div>

      {/* 세부 필터 바 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input
            placeholder="코드 또는 이름 검색"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: '100%' }}
          /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={categoryFilter} onChange={handleCategoryChange} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...categoryOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>세부</div>
          <Select value={subCategoryFilter} onChange={setSubCategoryFilter} style={{ width: 140 }}
            options={[{ label: '전체', value: '' }, ...subCategoryOptions]} disabled={!categoryFilter} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select value={seasonFilter} onChange={setSeasonFilter} style={{ width: 120 }}
            options={[
              { label: '전체', value: '' },
              { label: '26 봄/가을', value: '2026SA' }, { label: '26 여름', value: '2026SM' }, { label: '26 겨울', value: '2026WN' },
              { label: '25 봄/가을', value: '2025SA' }, { label: '25 여름', value: '2025SM' }, { label: '25 겨울', value: '2025WN' },
            ]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>핏</div>
          <Select value={fitFilter} onChange={setFitFilter} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...fitOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기장</div>
          <Select value={lengthFilter} onChange={setLengthFilter} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...lengthOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select showSearch optionFilterProp="label" value={colorFilter}
            onChange={setColorFilter} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, ...colorOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select showSearch optionFilterProp="label" value={sizeFilter}
            onChange={setSizeFilter} style={{ width: 100 }}
            options={[{ label: '전체', value: '' }, ...sizeOptions]} /></div>
        {isHQ && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
            <Select showSearch optionFilterProp="label" value={partnerFilter}
              onChange={setPartnerFilter} style={{ width: 160 }}
              options={[{ label: '전체', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
        )}
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>검색</Button>
        {activeFilterCount > 0 && (
          <Button size="small" onClick={() => {
            setSearch(''); setCategoryFilter(''); setSubCategoryFilter(''); setSubCategoryOptions([]);
            setSeasonFilter(''); setFitFilter(''); setLengthFilter('');
            setColorFilter(''); setSizeFilter(''); setPartnerFilter('');
          }}>필터 초기화 ({activeFilterCount})</Button>
        )}
      </div>

      {/* 기간 표시 */}
      <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
        조회기간: <b>{range[0].format('YYYY-MM-DD')}</b> ~ <b>{range[1].format('YYYY-MM-DD')}</b>
        {activeFilterCount > 0 && <Tag color="blue" style={{ marginLeft: 8 }}>필터 {activeFilterCount}개 적용중</Tag>}
      </div>

      {loading && !data ? (
        <Spin style={{ display: 'block', margin: '60px auto' }} />
      ) : (
        <>
          {/* 요약 카드 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: '총 매출', value: `${fmt(totals.total_amount || 0)}원`, icon: <DollarOutlined />, color: '#1890ff', bg: '#e6f7ff' },
              { label: '판매 수량', value: `${fmt(totals.total_qty || 0)}개`, icon: <ShoppingCartOutlined />, color: '#52c41a', bg: '#f6ffed' },
              { label: '판매 상품', value: `${summary.length}종`, icon: <SkinOutlined />, color: '#fa8c16', bg: '#fff7e6' },
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

          {/* 상품별 매출 테이블 */}
          <Card size="small" title={<><TagOutlined style={{ marginRight: 6 }} />상품별 매출 현황 ({summary.length}개 상품)</>}>
            <Table
              columns={[
                { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110 },
                { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true },
                { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                  render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
                  filters: Object.keys(CAT_COLORS).map(k => ({ text: k, value: k })),
                  onFilter: (v: any, r: any) => r.category === v },
                { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 90,
                  render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                { title: '핏', dataIndex: 'fit', key: 'fit', width: 80, render: (v: string) => v || '-' },
                { title: '기장', dataIndex: 'length', key: 'len', width: 70, render: (v: string) => v || '-' },
                { title: '시즌', dataIndex: 'season_type', key: 'season', width: 75, render: (v: string) => v || '-' },
                { title: '판매수량', dataIndex: 'total_qty', key: 'qty', width: 90, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}</strong>,
                  sorter: (a: any, b: any) => a.total_qty - b.total_qty },
                { title: '매출금액', dataIndex: 'total_amount', key: 'amt', width: 130, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}원</strong>,
                  sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                  defaultSortOrder: 'descend' as const },
                { title: '평균단가', key: 'avg', width: 110, align: 'right' as const,
                  render: (_: any, r: any) => {
                    const avg = r.total_qty > 0 ? Math.round(Number(r.total_amount) / r.total_qty) : 0;
                    return `${fmt(avg)}원`;
                  },
                },
                { title: '건수', dataIndex: 'sale_count', key: 'cnt', width: 60, align: 'center' as const },
                { title: '거래처', dataIndex: 'partner_count', key: 'pc', width: 65, align: 'center' as const,
                  render: (v: number) => v > 1 ? <Tag color="purple">{v}곳</Tag> : `${v}곳` },
              ]}
              dataSource={summary}
              rowKey="product_code"
              loading={loading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
              pagination={{
                pageSize: 50,
                showTotal: (t) => `총 ${t}건`,
              }}
              summary={() => {
                if (summary.length === 0) return null;
                const totalQty = summary.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                const totalAmt = summary.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
                const avgPrice = totalQty > 0 ? Math.round(totalAmt / totalQty) : 0;
                return (
                  <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={7}>합계</Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">{fmt(totalQty)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">{fmt(totalAmt)}원</Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">{fmt(avgPrice)}원</Table.Summary.Cell>
                    <Table.Summary.Cell index={10} colSpan={2} />
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>

          {summary.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              해당 기간에 판매 내역이 없습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
