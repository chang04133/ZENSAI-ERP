import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Card, Select, Input, Space, Tag, Statistic, Row, Col, Button, message, Segmented,
} from 'antd';
import {
  ShopOutlined, InboxOutlined, TagOutlined, WarningOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { CAT_TAG_COLORS, renderQty } from './InventoryStatusPage';

interface PartnerInventory {
  partner_code: string;
  partner_name: string;
  partner_type: string;
  total_qty: number;
  sku_count: number;
  product_count: number;
  zero_stock_count: number;
}

export default function StoreInventoryPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PartnerInventory[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── 매장 상세 뷰 ── */
  const [selectedPartner, setSelectedPartner] = useState<PartnerInventory | null>(null);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailSumQty, setDetailSumQty] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailView, setDetailView] = useState<'size' | 'product' | 'color'>('size');
  const detailRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await inventoryApi.byPartner();
      setData(result);
    } catch (e: any) {
      message.error('데이터 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── 매장 상세 재고 로드 ── */
  const loadDetail = useCallback(async (partnerCode: string, page: number, searchStr?: string) => {
    setDetailLoading(true);
    try {
      const params: Record<string, string> = {
        partner_code: partnerCode, page: String(page), limit: '50',
      };
      if (searchStr) params.search = searchStr;
      const result = await inventoryApi.list(params);
      setDetailData(result.data);
      setDetailTotal(result.total);
      setDetailSumQty(result.sumQty);
    } catch (e: any) { message.error(e.message); }
    finally { setDetailLoading(false); }
  }, []);

  const handleSelectPartner = (partner: PartnerInventory) => {
    setSelectedPartner(partner);
    setDetailPage(1);
    setDetailSearch('');
    setDetailView('size');
    loadDetail(partner.partner_code, 1);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  useEffect(() => {
    if (selectedPartner) loadDetail(selectedPartner.partner_code, detailPage, detailSearch || undefined);
  }, [detailPage]);

  const handleDetailSearch = () => {
    if (!selectedPartner) return;
    setDetailPage(1);
    loadDetail(selectedPartner.partner_code, 1, detailSearch || undefined);
  };

  /* ── 뷰 모드별 데이터 가공 ── */
  const detailDisplayData = (() => {
    if (detailView === 'size') return detailData.map((r: any) => ({ ...r, _rowKey: `${r.inventory_id}` }));
    if (detailView === 'product') {
      const map: Record<string, any> = {};
      detailData.forEach((r: any) => {
        const key = r.product_code;
        if (!map[key]) map[key] = { ...r, total_qty: 0, variant_count: 0, _variants: [], _rowKey: key };
        map[key].total_qty += Number(r.qty || 0);
        map[key].variant_count += 1;
        map[key]._variants.push(r);
      });
      return Object.values(map);
    }
    // color
    const map: Record<string, any> = {};
    detailData.forEach((r: any) => {
      const key = `${r.product_code}__${r.color || '-'}`;
      if (!map[key]) map[key] = { ...r, _color: r.color || '-', color_qty: 0, variant_count: 0, _variants: [], _rowKey: key };
      map[key].color_qty += Number(r.qty || 0);
      map[key].variant_count += 1;
      map[key]._variants.push(r);
    });
    return Object.values(map);
  })();

  const detailExpandedRow = (record: any) => {
    const variants = record._variants || [];
    if (!variants.length) return null;
    return <Table columns={[
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: '색상', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, render: (v: number) => renderQty(Number(v)) },
    ]} dataSource={variants} rowKey="inventory_id" pagination={false} size="small" />;
  };

  const totalQty = data.reduce((s, r) => s + r.total_qty, 0);
  const totalSku = data.reduce((s, r) => s + r.sku_count, 0);
  const totalZero = data.reduce((s, r) => s + r.zero_stock_count, 0);

  const typeColor: Record<string, string> = {
    '본사': '#fa541c', '직영': '#1677ff', '가맹': '#52c41a', '온라인': '#722ed1',
    '대리점': '#fa8c16', '백화점': '#13c2c2', '아울렛': '#eb2f96',
  };

  const columns = [
    {
      title: '거래처', dataIndex: 'partner_name', width: 160,
      render: (v: string, r: PartnerInventory) => (
        <Space>
          <Tag color={typeColor[r.partner_type] || '#595959'}>{r.partner_type}</Tag>
          <strong style={{ color: '#1677ff', cursor: 'pointer' }}>{v}</strong>
        </Space>
      ),
    },
    {
      title: '거래처코드', dataIndex: 'partner_code', width: 110,
      render: (v: string) => <span style={{ color: '#888' }}>{v}</span>,
    },
    {
      title: '총 재고수량', dataIndex: 'total_qty', width: 130, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.total_qty - b.total_qty,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <strong>{v.toLocaleString()}</strong>,
    },
    {
      title: '상품수', dataIndex: 'product_count', width: 100, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.product_count - b.product_count,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'SKU수', dataIndex: 'sku_count', width: 100, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.sku_count - b.sku_count,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '품절 SKU', dataIndex: 'zero_stock_count', width: 100, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.zero_stock_count - b.zero_stock_count,
      render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0',
    },
    {
      title: '점유율', key: 'share', width: 100, align: 'right' as const,
      render: (_: any, r: PartnerInventory) => {
        const pct = totalQty > 0 ? ((r.total_qty / totalQty) * 100).toFixed(1) : '0';
        return `${pct}%`;
      },
    },
  ];

  /* ── 상세 뷰 컬럼 ── */
  const sizeColumns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 150, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 65, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '재고', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => renderQty(Number(v)) },
  ];

  const productColumns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '옵션수', dataIndex: 'variant_count', key: 'vc', width: 70, align: 'center' as const,
      render: (v: number) => <Tag>{v}</Tag> },
    { title: '총 재고', dataIndex: 'total_qty', key: 'total_qty', width: 100, align: 'right' as const,
      sorter: (a: any, b: any) => a.total_qty - b.total_qty, defaultSortOrder: 'descend' as const,
      render: (v: number) => renderQty(v) },
  ];

  const colorColumns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '색상', dataIndex: '_color', key: '_color', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 85,
      render: (v: string) => v ? <Tag color={CAT_TAG_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '옵션수', dataIndex: 'variant_count', key: 'vc', width: 70, align: 'center' as const,
      render: (v: number) => <Tag>{v}</Tag> },
    { title: '재고', dataIndex: 'color_qty', key: 'color_qty', width: 100, align: 'right' as const,
      sorter: (a: any, b: any) => a.color_qty - b.color_qty, defaultSortOrder: 'descend' as const,
      render: (v: number) => renderQty(v) },
  ];

  return (
    <div>
      <PageHeader title="매장별 재고 현황" />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="거래처 수" value={data.length} prefix={<ShopOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="총 재고수량" value={totalQty} prefix={<InboxOutlined />} suffix="개" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="총 SKU" value={totalSku} prefix={<TagOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="품절 SKU" value={totalZero} prefix={<WarningOutlined />} valueStyle={{ color: totalZero > 0 ? '#ff4d4f' : undefined }} /></Card>
        </Col>
      </Row>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="partner_code"
        size="small"
        loading={loading}
        scroll={{ x: 900, y: selectedPartner ? 'calc(50vh - 200px)' : 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        onRow={(record) => ({
          onClick: () => handleSelectPartner(record),
          style: {
            cursor: 'pointer',
            background: selectedPartner?.partner_code === record.partner_code ? '#e6f4ff' : undefined,
          },
        })}
      />

      {/* ── 매장 상세 재고 ── */}
      {selectedPartner && (
        <div ref={detailRef} style={{ marginTop: 16 }}>
          <Card
            size="small"
            style={{ borderRadius: 10, border: `2px solid ${typeColor[selectedPartner.partner_type] || '#1677ff'}` }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setSelectedPartner(null)}>닫기</Button>
                <Tag color={typeColor[selectedPartner.partner_type] || '#595959'}>{selectedPartner.partner_type}</Tag>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{selectedPartner.partner_name}</span>
                <span style={{ fontSize: 12, color: '#888' }}>({selectedPartner.partner_code})</span>
                <Tag color="blue">{detailTotal}건</Tag>
                <Tag>{detailSumQty.toLocaleString()}개</Tag>
              </div>
            }
            extra={
              <Space size="middle" wrap>
                <Input.Search
                  placeholder="상품명/SKU 검색" allowClear size="small" style={{ width: 200 }}
                  value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)}
                  onSearch={handleDetailSearch}
                />
                <Segmented
                  size="small"
                  value={detailView}
                  onChange={(v) => setDetailView(v as 'size' | 'product' | 'color')}
                  options={[
                    { label: '사이즈별', value: 'size' },
                    { label: '품번별', value: 'product' },
                    { label: '컬러별', value: 'color' },
                  ]}
                />
              </Space>
            }
          >
            <Table
              columns={detailView === 'product' ? productColumns : detailView === 'color' ? colorColumns : sizeColumns}
              dataSource={detailDisplayData}
              rowKey="_rowKey"
              loading={detailLoading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 400px)' }}
              pagination={{
                current: detailPage,
                total: detailView === 'size' ? detailTotal : undefined,
                pageSize: detailView === 'size' ? 50 : 100,
                onChange: (p) => setDetailPage(p),
                showTotal: (t) => `총 ${t}건`,
              }}
              expandable={detailView !== 'size' ? {
                expandedRowRender: detailExpandedRow,
                rowExpandable: (r: any) => r._variants && r._variants.length > 0,
              } : undefined}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
