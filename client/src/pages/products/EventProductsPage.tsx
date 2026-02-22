import { useEffect, useState, useRef } from 'react';
import { Table, Button, Input, InputNumber, Space, Tag, Modal, Alert, Popconfirm, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

export default function EventProductsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkPrice, setBulkPrice] = useState<number | null>(null);

  // 인라인 편집 중인 행사가 (blur 시 저장)
  const [editingPrices, setEditingPrices] = useState<Record<string, number | null>>({});

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      const result = await productApi.listEventProducts(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const handleSearch = () => { setPage(1); load(1); };

  const handlePriceBlur = async (code: string) => {
    const newPrice = editingPrices[code];
    if (newPrice === undefined) return;
    try {
      await productApi.updateEventPrice(code, newPrice);
      message.success('행사가가 수정되었습니다.');
      setEditingPrices((prev) => { const next = { ...prev }; delete next[code]; return next; });
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleClearSingle = async (code: string) => {
    try {
      await productApi.updateEventPrice(code, null);
      message.success('행사가가 해제되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleBulkClear = async () => {
    const updates = selectedRowKeys.map((key) => ({ product_code: key as string, event_price: null as number | null }));
    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품의 행사가가 해제되었습니다.`);
      setSelectedRowKeys([]);
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleBulkSet = async () => {
    if (!bulkPrice || bulkPrice <= 0) {
      message.error('행사가를 입력해주세요.');
      return;
    }
    const updates = selectedRowKeys.map((key) => ({ product_code: key as string, event_price: bulkPrice }));
    try {
      await productApi.bulkUpdateEventPrices(updates);
      message.success(`${updates.length}개 상품의 행사가가 설정되었습니다.`);
      setSelectedRowKeys([]);
      setBulkModalOpen(false);
      setBulkPrice(null);
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

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
        if (!canWrite) {
          return <span style={{ color: '#fa8c16', fontWeight: 600 }}>{Number(v).toLocaleString()}원</span>;
        }
        const editVal = editingPrices[record.product_code];
        return (
          <InputNumber
            size="small"
            min={0}
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

  return (
    <div>
      <PageHeader
        title="행사 상품"
        extra={canWrite && selectedRowKeys.length > 0 && (
          <Space>
            <Popconfirm title={`${selectedRowKeys.length}개 상품의 행사가를 해제하시겠습니까?`} onConfirm={handleBulkClear}>
              <Button danger>선택 행사가 해제 ({selectedRowKeys.length})</Button>
            </Popconfirm>
            <Button type="primary" onClick={() => { setBulkPrice(null); setBulkModalOpen(true); }}>
              선택 행사가 설정 ({selectedRowKeys.length})
            </Button>
          </Space>
        )}
      />

      {!canWrite && (
        <Alert
          message="현재 행사가가 설정된 상품 목록입니다. 매출등록 시 '행사' 유형을 선택하면 행사가가 자동 적용됩니다."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="상품코드 또는 상품명 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 250 }}
        />
        <Button onClick={handleSearch}>조회</Button>
      </Space>

      <Table
        rowSelection={canWrite ? { selectedRowKeys, onChange: setSelectedRowKeys } : undefined}
        columns={columns}
        dataSource={data}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 900, y: 'calc(100vh - 280px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
      />

      <Modal
        title={`선택 상품 행사가 일괄 설정 (${selectedRowKeys.length}개)`}
        open={bulkModalOpen}
        onOk={handleBulkSet}
        onCancel={() => setBulkModalOpen(false)}
        okText="적용"
        cancelText="취소"
      >
        <div style={{ marginBottom: 12 }}>선택된 {selectedRowKeys.length}개 상품에 동일한 행사가를 설정합니다.</div>
        <InputNumber
          value={bulkPrice}
          onChange={(v) => setBulkPrice(v)}
          placeholder="행사가 입력"
          style={{ width: '100%' }}
          min={0}
          formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
          parser={(val) => Number((val || '').replace(/,/g, ''))}
          addonAfter="원"
        />
      </Modal>
    </div>
  );
}
