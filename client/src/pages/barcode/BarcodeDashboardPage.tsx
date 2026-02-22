import { useEffect, useState, useRef } from 'react';
import {
  Card, Input, Table, Tag, Space, Row, Col, Statistic, message, Spin,
  Modal, Button, Badge, Descriptions, Divider,
} from 'antd';
import {
  BarcodeOutlined, SearchOutlined, CheckCircleOutlined,
  WarningOutlined, EditOutlined, ShoppingCartOutlined,
  TagOutlined, SkinOutlined, InboxOutlined,
} from '@ant-design/icons';
import { productApi } from '../../modules/product/product.api';
import { salesApi } from '../../modules/sales/sales.api';

const fmt = (v: number) => Number(v).toLocaleString();
const CAT_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};

interface ScanResult {
  variant_id: number;
  sku: string;
  color: string;
  size: string;
  barcode: string | null;
  product_code: string;
  product_name: string;
  category: string;
  base_price: number;
  discount_price: number | null;
  event_price: number | null;
  current_stock?: number;
}

interface VariantRow {
  variant_id: number;
  sku: string;
  color: string;
  size: string;
  barcode: string | null;
  product_code: string;
  product_name: string;
  category: string;
  sub_category: string | null;
  base_price: number;
  discount_price: number | null;
  stock_qty: number;
}

export default function BarcodeDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanCode, setScanCode] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [editModal, setEditModal] = useState<{ visible: boolean; variant: VariantRow | null }>({ visible: false, variant: null });
  const [editBarcode, setEditBarcode] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const scanRef = useRef<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await productApi.barcodeDashboard();
      setStats(data.stats);
      setVariants(data.variants);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // 바코드 스캔
  const handleScan = async () => {
    const code = scanCode.trim();
    if (!code) return;
    setScanLoading(true);
    try {
      const result = await salesApi.scanProduct(code);
      setScanResult(result);
      setScanHistory(prev => {
        const filtered = prev.filter(h => h.variant_id !== result.variant_id);
        return [result, ...filtered].slice(0, 10);
      });
      message.success(`${result.product_name} (${result.color}/${result.size})`);
    } catch {
      setScanResult(null);
      message.warning('상품을 찾을 수 없습니다.');
    }
    finally {
      setScanLoading(false);
      setScanCode('');
      setTimeout(() => scanRef.current?.focus(), 100);
    }
  };

  // 바코드 등록/수정
  const handleEditBarcode = async () => {
    if (!editModal.variant) return;
    setEditLoading(true);
    try {
      await productApi.updateBarcode(editModal.variant.variant_id, editBarcode.trim() || null);
      message.success('바코드가 등록되었습니다.');
      setEditModal({ visible: false, variant: null });
      load(); // 새로고침
    } catch (e: any) { message.error(e.message); }
    finally { setEditLoading(false); }
  };

  const openEdit = (v: VariantRow) => {
    setEditBarcode(v.barcode || '');
    setEditModal({ visible: true, variant: v });
  };

  const filteredVariants = variants.filter(v => {
    if (filter === 'with') return v.barcode;
    if (filter === 'without') return !v.barcode;
    return true;
  });

  const pctWithBarcode = stats ? Math.round((stats.with_barcode / Math.max(stats.total_variants, 1)) * 100) : 0;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* 스캔 입력 */}
      <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Input
              ref={scanRef}
              size="large"
              prefix={<BarcodeOutlined style={{ color: '#fff', fontSize: 22 }} />}
              placeholder="바코드 또는 SKU를 스캔/입력하세요"
              value={scanCode}
              onChange={e => setScanCode(e.target.value)}
              onPressEnter={handleScan}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 18, height: 52 }}
              autoFocus
            />
          </Col>
          <Col>
            <Button size="large" icon={<SearchOutlined />} onClick={handleScan}
              loading={scanLoading}
              style={{ height: 52, width: 52, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff' }} />
          </Col>
        </Row>
      </Card>

      {/* 스캔 결과 */}
      {scanResult && (
        <Card size="small" style={{ marginBottom: 16, borderLeft: '4px solid #52c41a' }}>
          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <Descriptions size="small" column={{ xs: 1, sm: 2 }} labelStyle={{ fontWeight: 600, fontSize: 12 }}>
                <Descriptions.Item label="상품명">
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{scanResult.product_name}</span>
                </Descriptions.Item>
                <Descriptions.Item label="상품코드">{scanResult.product_code}</Descriptions.Item>
                <Descriptions.Item label="SKU">{scanResult.sku}</Descriptions.Item>
                <Descriptions.Item label="카테고리">
                  <Tag color={CAT_COLORS[scanResult.category] || 'default'}>{scanResult.category}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="컬러/사이즈">
                  <Tag>{scanResult.color}</Tag> <Tag>{scanResult.size}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="바코드">
                  {scanResult.barcode
                    ? <Tag color="green" icon={<CheckCircleOutlined />}>{scanResult.barcode}</Tag>
                    : <Tag color="red" icon={<WarningOutlined />}>미등록</Tag>}
                </Descriptions.Item>
              </Descriptions>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 12, color: '#888' }}>판매가</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#1890ff' }}>
                  {fmt(scanResult.discount_price || scanResult.base_price)}원
                </div>
                {scanResult.current_stock !== undefined && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: '#888' }}>매장 재고</div>
                    <div style={{
                      fontSize: 20, fontWeight: 700,
                      color: scanResult.current_stock <= 0 ? '#ff4d4f' : scanResult.current_stock <= 5 ? '#fa8c16' : '#52c41a',
                    }}>
                      {scanResult.current_stock}개
                    </div>
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* 통계 카드 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ cursor: 'pointer', borderColor: filter === 'all' ? '#1890ff' : undefined }}
            onClick={() => setFilter('all')}>
            <Statistic title="전체 상품" value={stats?.total_variants || 0} suffix="종"
              prefix={<TagOutlined style={{ color: '#1890ff' }} />} valueStyle={{ fontSize: 22 }} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ cursor: 'pointer', borderColor: filter === 'with' ? '#52c41a' : undefined }}
            onClick={() => setFilter('with')}>
            <Statistic title="바코드 등록" value={stats?.with_barcode || 0} suffix={`종 (${pctWithBarcode}%)`}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} valueStyle={{ fontSize: 22, color: '#52c41a' }} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ cursor: 'pointer', borderColor: filter === 'without' ? '#ff4d4f' : undefined }}
            onClick={() => setFilter('without')}>
            <Statistic title="바코드 미등록" value={stats?.without_barcode || 0} suffix="종"
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />} valueStyle={{ fontSize: 22, color: '#ff4d4f' }} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="최근 스캔" value={scanHistory.length} suffix="건"
              prefix={<ShoppingCartOutlined style={{ color: '#722ed1' }} />} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
      </Row>

      {/* 최근 스캔 히스토리 */}
      {scanHistory.length > 0 && (
        <Card size="small" title="최근 스캔 기록" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
            {scanHistory.map((h, i) => (
              <div key={`${h.variant_id}-${i}`} style={{
                minWidth: 140, padding: '8px 12px', background: i === 0 ? '#f0f5ff' : '#fafafa',
                borderRadius: 8, border: i === 0 ? '1px solid #91d5ff' : '1px solid #f0f0f0',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{h.product_name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{h.color} / {h.size}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{h.sku}</div>
                {h.barcode && <Tag color="green" style={{ fontSize: 10, marginTop: 4 }}>{h.barcode}</Tag>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 상품 바코드 목록 */}
      <Card size="small"
        title={
          <Space>
            <SkinOutlined />
            <span>상품 바코드 목록</span>
            <Tag color={filter === 'all' ? 'blue' : filter === 'with' ? 'green' : 'red'}>
              {filter === 'all' ? '전체' : filter === 'with' ? '등록됨' : '미등록'} {filteredVariants.length}종
            </Tag>
          </Space>
        }
      >
        <Table
          columns={[
            { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 100,
              filters: [...new Set(filteredVariants.map(v => v.product_code))].slice(0, 30).map(v => ({ text: v, value: v })),
              onFilter: (v: any, r) => r.product_code === v },
            { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
            { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
              render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
              filters: Object.keys(CAT_COLORS).map(k => ({ text: k, value: k })),
              onFilter: (v: any, r) => r.category === v },
            { title: '컬러', dataIndex: 'color', key: 'color', width: 70 },
            { title: '사이즈', dataIndex: 'size', key: 'size', width: 65 },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
            { title: '바코드', dataIndex: 'barcode', key: 'barcode', width: 150,
              render: (v: string | null) => v
                ? <Tag color="green" icon={<CheckCircleOutlined />}>{v}</Tag>
                : <Tag color="red" icon={<WarningOutlined />}>미등록</Tag>,
              filters: [{ text: '등록됨', value: 'yes' }, { text: '미등록', value: 'no' }],
              onFilter: (v: any, r) => v === 'yes' ? !!r.barcode : !r.barcode },
            { title: '재고', dataIndex: 'stock_qty', key: 'stock', width: 65, align: 'right' as const,
              render: (v: number) => (
                <span style={{ color: v <= 0 ? '#ff4d4f' : v <= 5 ? '#fa8c16' : '#52c41a', fontWeight: 600 }}>
                  {v}
                </span>
              ),
              sorter: (a, b) => a.stock_qty - b.stock_qty },
            { title: '가격', dataIndex: 'base_price', key: 'price', width: 90, align: 'right' as const,
              render: (v: number) => v ? `${fmt(v)}원` : '-' },
            { title: '', key: 'action', width: 50, align: 'center' as const,
              render: (_: any, r: VariantRow) => (
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
              ) },
          ]}
          dataSource={filteredVariants}
          rowKey="variant_id"
          pagination={{ pageSize: 30, size: 'small', showTotal: (t) => `총 ${t}종` }}
          size="small"
          scroll={{ x: 1000 }}
          loading={loading}
        />
      </Card>

      {/* 바코드 등록/수정 모달 */}
      <Modal
        title={
          <Space>
            <BarcodeOutlined />
            <span>바코드 {editModal.variant?.barcode ? '수정' : '등록'}</span>
          </Space>
        }
        open={editModal.visible}
        onCancel={() => setEditModal({ visible: false, variant: null })}
        onOk={handleEditBarcode}
        confirmLoading={editLoading}
        okText={editModal.variant?.barcode ? '수정' : '등록'}
      >
        {editModal.variant && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 16 }}
              labelStyle={{ fontWeight: 600 }}>
              <Descriptions.Item label="상품">{editModal.variant.product_name}</Descriptions.Item>
              <Descriptions.Item label="SKU">{editModal.variant.sku}</Descriptions.Item>
              <Descriptions.Item label="컬러/사이즈">
                {editModal.variant.color} / {editModal.variant.size}
              </Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ marginBottom: 8, fontWeight: 600 }}>바코드</div>
            <Input
              size="large"
              prefix={<BarcodeOutlined />}
              placeholder="바코드를 스캔하거나 입력하세요"
              value={editBarcode}
              onChange={e => setEditBarcode(e.target.value)}
              onPressEnter={handleEditBarcode}
              autoFocus
            />
          </>
        )}
      </Modal>
    </div>
  );
}
