import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, Button, Table, Space, Modal, InputNumber, Tag, Popconfirm, message, Card, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { apiFetch, safeJson } from '../../core/api.client';
import { vmdApi } from '../../modules/vmd/vmd.api';
import type { StoreFixture, FixtureSalesMap } from '../../../../shared/types/vmd';

interface StockProduct { product_code: string; product_name: string; category?: string; total_qty: number }

function formatWon(n: number): string {
  if (n >= 10000) return `₩${Math.round(n / 10000)}만`;
  if (n >= 1000) return `₩${(n / 1000).toFixed(0)}천`;
  return `₩${n.toLocaleString()}`;
}

export default function VmdManagePage() {
  const { user } = useAuthStore();
  const isStore = user?.role === 'STORE_MANAGER' || user?.role === 'STORE_STAFF';
  const [partnerCode, setPartnerCode] = useState<string | undefined>(
    isStore ? user?.partnerCode || undefined : undefined,
  );
  const [partners, setPartners] = useState<{ partner_code: string; partner_name: string; partner_type?: string }[]>([]);
  const [stockProducts, setStockProducts] = useState<StockProduct[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [fixtures, setFixtures] = useState<StoreFixture[]>([]);
  const [salesMap, setSalesMap] = useState<FixtureSalesMap>({});
  const [storeArea, setStoreArea] = useState<number | null>(null);
  const [areaInput, setAreaInput] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 상품 등록 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [editFixture, setEditFixture] = useState<StoreFixture | null>(null);
  const [modalFront, setModalFront] = useState<string | undefined>(undefined);
  const [modalGroup, setModalGroup] = useState<string[]>([]);

  // 거래처 로드
  useEffect(() => {
    if (isStore) return;
    partnerApi.list({ limit: '1000' }).then((r: any) => {
      setPartners((r.data || []).filter((p: any) => p.partner_type !== '본사' && p.is_active));
    }).catch(() => {});
  }, [isStore]);

  // 매장 재고 상품 로드 (product_code별 합산)
  const loadStockProducts = useCallback(async (pc: string) => {
    setLoadingStock(true);
    try {
      const res = await safeJson(await apiFetch(`/api/inventory?partner_code=${pc}&limit=200&page=1`));
      const rows: any[] = res?.data?.data || [];
      // product_code 기준 그룹핑 (variant별 재고 합산)
      const map = new Map<string, StockProduct>();
      for (const r of rows) {
        const existing = map.get(r.product_code);
        if (existing) {
          existing.total_qty += r.qty || 0;
        } else {
          map.set(r.product_code, {
            product_code: r.product_code,
            product_name: r.product_name || r.product_code,
            category: r.category,
            total_qty: r.qty || 0,
          });
        }
      }
      // 재고 있는 것만 + 재고 내림차순
      setStockProducts([...map.values()].filter(p => p.total_qty > 0).sort((a, b) => b.total_qty - a.total_qty));
    } catch { setStockProducts([]); }
    setLoadingStock(false);
  }, []);

  // 매출 fetch
  const fetchSales = useCallback(async (fxs: StoreFixture[]) => {
    if (!partnerCode) return;
    const allCodes = new Set<string>();
    for (const f of fxs) {
      if (f.products) for (const pc of f.products) allCodes.add(pc);
    }
    if (!allCodes.size) { setSalesMap({}); return; }
    try {
      setSalesMap(await vmdApi.fixtureSales(partnerCode, [...allCodes]));
    } catch { setSalesMap({}); }
  }, [partnerCode]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!partnerCode) { setFixtures([]); setSalesMap({}); setStoreArea(null); setAreaInput(null); setStockProducts([]); return; }
    setLoading(true);
    try {
      const [fxs, area] = await Promise.all([
        vmdApi.fixtures(partnerCode),
        vmdApi.getStoreArea(partnerCode),
      ]);
      setFixtures(fxs);
      setStoreArea(area);
      setAreaInput(area);
      fetchSales(fxs);
      loadStockProducts(partnerCode);
    } catch { setFixtures([]); }
    setLoading(false);
  }, [partnerCode, fetchSales, loadStockProducts]);

  useEffect(() => { loadData(); }, [loadData]);

  // 평수 저장
  const saveArea = async () => {
    if (!partnerCode) return;
    try {
      await vmdApi.saveStoreArea(partnerCode, areaInput);
      setStoreArea(areaInput);
      message.success('평수 저장 완료');
    } catch (e: any) { message.error(e.message); }
  };

  // 행거/마네킹 추가
  const addFixture = async (type: 'HANGER' | 'MANNEQUIN') => {
    if (!partnerCode) return;
    try {
      const f = await vmdApi.addFixture({ partner_code: partnerCode, fixture_type: type });
      setFixtures(prev => [...prev, f]);
      message.success(`${type === 'HANGER' ? '행거' : '마네킹'} 추가 완료`);
    } catch (e: any) { message.error(e.message); }
  };

  // 삭제
  const deleteFixture = async (id: number) => {
    try {
      await vmdApi.deleteFixture(id);
      const updated = fixtures.filter(f => f.fixture_id !== id);
      setFixtures(updated);
      fetchSales(updated);
      message.success('삭제 완료');
    } catch (e: any) { message.error(e.message); }
  };

  // 모달 열기
  const openModal = (f: StoreFixture) => {
    setEditFixture(f);
    setModalFront(f.products?.[0] || undefined);
    setModalGroup(f.products?.slice(1) || []);
    setModalOpen(true);
  };

  // 모달 저장
  const handleModalSave = async () => {
    if (!editFixture) return;
    const allProducts: string[] = [];
    if (modalFront) allProducts.push(modalFront);
    for (const g of modalGroup) {
      if (g !== modalFront) allProducts.push(g);
    }
    try {
      const updated = await vmdApi.updateFixture(editFixture.fixture_id, { products: allProducts });
      const newList = fixtures.map(f => f.fixture_id === updated.fixture_id ? updated : f);
      setFixtures(newList);
      fetchSales(newList);
      setModalOpen(false);
      message.success('상품 등록 완료');
    } catch (e: any) { message.error(e.message); }
  };

  // 상품 옵션 (재고 있는 상품만)
  const productOptions = useMemo(() =>
    stockProducts.map(p => ({
      value: p.product_code,
      label: `${p.product_name} (${p.product_code}) — 재고 ${p.total_qty}`,
    })),
  [stockProducts]);

  // 행거/마네킹 분리
  const hangers = fixtures.filter(f => f.fixture_type === 'HANGER');
  const mannequins = fixtures.filter(f => f.fixture_type === 'MANNEQUIN');

  // 테이블 컬럼
  const columns = [
    {
      title: '이름', dataIndex: 'fixture_name', key: 'name', width: 120,
      render: (v: string, r: StoreFixture) => (
        <span style={{ fontWeight: 600 }}>{v || `${r.fixture_type === 'HANGER' ? '행거' : '마네킹'}`}</span>
      ),
    },
    {
      title: '맨앞 상품', key: 'front', width: 200,
      render: (_: any, r: StoreFixture) => {
        const pc = r.products?.[0];
        if (!pc) return <span style={{ color: '#bbb' }}>미등록</span>;
        const s = salesMap[pc];
        return s ? s.product_name : pc;
      },
    },
    {
      title: '상품군', key: 'group', width: 80, align: 'center' as const,
      render: (_: any, r: StoreFixture) => {
        const cnt = r.products?.length || 0;
        return cnt > 0 ? <Tag>{cnt}개</Tag> : <span style={{ color: '#bbb' }}>-</span>;
      },
    },
    {
      title: '판매수량', key: 'qty', width: 90, align: 'right' as const,
      render: (_: any, r: StoreFixture) => {
        if (!r.products?.length) return <span style={{ color: '#bbb' }}>-</span>;
        let total = 0;
        for (const pc of r.products) { total += salesMap[pc]?.qty || 0; }
        return total > 0 ? `${total}개` : <span style={{ color: '#bbb' }}>0</span>;
      },
    },
    {
      title: '매출(30일)', key: 'revenue', width: 110, align: 'right' as const,
      render: (_: any, r: StoreFixture) => {
        if (!r.products?.length) return <span style={{ color: '#bbb' }}>-</span>;
        let total = 0;
        for (const pc of r.products) { total += salesMap[pc]?.revenue || 0; }
        return total > 0
          ? <span style={{ fontWeight: 700, color: '#cf1322' }}>{formatWon(total)}</span>
          : <span style={{ color: '#bbb' }}>₩0</span>;
      },
    },
    {
      title: '', key: 'actions', width: 80, align: 'center' as const,
      render: (_: any, r: StoreFixture) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => deleteFixture(r.fixture_id)} okText="삭제" cancelText="취소">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderSection = (title: string, icon: string, data: StoreFixture[], type: 'HANGER' | 'MANNEQUIN') => (
    <Card
      size="small"
      title={<span>{icon} {title} ({data.length}개)</span>}
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={() => addFixture(type)}>
          추가
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      <Table
        size="small"
        dataSource={data}
        columns={columns}
        rowKey="fixture_id"
        pagination={false}
        locale={{ emptyText: `${title}이 없습니다. 추가해주세요.` }}
        onRow={r => ({ onDoubleClick: () => openModal(r), style: { cursor: 'pointer' } })}
      />
    </Card>
  );

  return (
    <div>
      <PageHeader title="VMD 진열관리" />

      {/* 매장 선택 + 평수 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {!isStore && (
            <Select
              placeholder="매장 선택" allowClear showSearch
              style={{ width: 200 }} optionFilterProp="label"
              value={partnerCode} onChange={v => setPartnerCode(v)}
              options={partners.map(p => ({ value: p.partner_code, label: p.partner_name }))}
            />
          )}
          {partnerCode && (
            <>
              <span style={{ color: '#666', fontSize: 13 }}>매장 평수:</span>
              <InputNumber
                value={areaInput}
                onChange={v => setAreaInput(v)}
                min={0} max={9999}
                style={{ width: 100 }}
                addonAfter="평"
              />
              <Button size="small" onClick={saveArea} disabled={areaInput === storeArea}>
                저장
              </Button>
            </>
          )}
        </div>
      </Card>

      {!partnerCode ? (
        <Empty description="매장을 선택하세요" style={{ padding: 60 }} />
      ) : (
        <>
          {renderSection('행거', '🏗', hangers, 'HANGER')}
          {renderSection('마네킹', '🧍', mannequins, 'MANNEQUIN')}
        </>
      )}

      {/* 상품 등록 모달 */}
      <Modal
        title={editFixture ? `${editFixture.fixture_name} — 상품 등록` : '상품 등록'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleModalSave}
        okText="저장"
        cancelText="취소"
        width={500}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>맨앞 진열 상품</label>
          <Select
            placeholder={loadingStock ? '재고 불러오는 중...' : '상품 선택 (재고 있는 상품)'}
            loading={loadingStock}
            allowClear showSearch optionFilterProp="label"
            style={{ width: '100%' }}
            value={modalFront}
            onChange={v => setModalFront(v)}
            options={productOptions}
            notFoundContent={loadingStock ? '로딩 중...' : '재고 있는 상품이 없습니다'}
          />
          <span style={{ fontSize: 11, color: '#999' }}>매장에 재고가 있는 상품만 표시됩니다</span>
        </div>
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>상품군 (나머지 상품)</label>
          <Select
            mode="multiple"
            placeholder={loadingStock ? '재고 불러오는 중...' : '상품 여러개 선택'}
            loading={loadingStock}
            allowClear showSearch optionFilterProp="label"
            style={{ width: '100%' }}
            value={modalGroup}
            onChange={v => setModalGroup(v)}
            options={productOptions}
            notFoundContent={loadingStock ? '로딩 중...' : '재고 있는 상품이 없습니다'}
          />
          <span style={{ fontSize: 11, color: '#999' }}>같은 행거에 걸려 있는 다른 상품들</span>
        </div>
        {/* 매출 미리보기 */}
        {(modalFront || modalGroup.length > 0) && (
          <div style={{ marginTop: 16, padding: 10, background: '#fafafa', borderRadius: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>매출 현황 (최근 30일)</span>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[...(modalFront ? [modalFront] : []), ...modalGroup.filter(g => g !== modalFront)].map(pc => {
                const si = salesMap[pc];
                return (
                  <Tag key={pc} style={{ margin: 0 }}>
                    {si ? `${si.product_name}: ${si.qty}개 / ₩${si.revenue.toLocaleString()}` : `${pc}: 데이터 없음`}
                  </Tag>
                );
              })}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
