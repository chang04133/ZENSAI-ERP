import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Tag, Popconfirm, Upload, Modal, Switch, message, Alert, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { useProductStore } from '../../modules/product/product.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { productApi } from '../../modules/product/product.api';
import { codeApi } from '../../modules/code/code.api';
import { getToken } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';

const SALE_STATUS_COLORS: Record<string, string> = {
  '판매중': 'green',
  '일시품절': 'orange',
  '단종': 'red',
  '승인대기': 'blue',
};

export default function ProductListPage() {
  const navigate = useNavigate();
  const { data: products, total, loading, fetchList: fetchProducts } = useProductStore();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fitFilter, setFitFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [variantsMap, setVariantsMap] = useState<Record<string, any[]>>({});
  const [variantsLoading, setVariantsLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | undefined>();
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setAllCategoryCodes(data);
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch((e: any) => { message.error('카테고리 로드 실패: ' + e.message); });
    codeApi.getByType('FIT').then((data: any[]) => {
      setFitOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch((e: any) => { message.error('핏 옵션 로드 실패: ' + e.message); });
    productApi.variantOptions().then((data: any) => {
      setColorOptions((data.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((data.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
  }, []);

  const load = () => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (categoryFilter) params.category = categoryFilter;
    if (subCategoryFilter) params.sub_category = subCategoryFilter;
    if (seasonFilter) params.season = seasonFilter;
    if (statusFilter) params.sale_status = statusFilter;
    if (fitFilter) params.fit = fitFilter;
    if (colorFilter) params.color = colorFilter;
    if (sizeFilter) params.size = sizeFilter;
    fetchProducts(params);
  };

  useEffect(() => { load(); }, [page, categoryFilter, subCategoryFilter, seasonFilter, statusFilter, fitFilter, colorFilter, sizeFilter]);

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value);
    setSubCategoryFilter('');
    setPage(1);
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

  const handleDelete = async (code: string) => {
    try {
      await productApi.remove(code);
      message.success('상품이 비활성화되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    try {
      let success = 0;
      for (const code of selectedRowKeys) {
        await productApi.update(code as string, { sale_status: bulkStatus });
        success++;
      }
      message.success(`${success}개 상품의 상태가 "${bulkStatus}"(으)로 변경되었습니다.`);
      setSelectedRowKeys([]);
      setBulkStatusModalOpen(false);
      setBulkStatus(undefined);
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleVariantAlert = async (variantId: number, checked: boolean, productCode: string) => {
    try {
      await productApi.toggleVariantAlert(variantId, checked);
      // variantsMap 캐시 업데이트
      setVariantsMap((prev) => {
        const variants = prev[productCode];
        if (!variants) return prev;
        return { ...prev, [productCode]: variants.map((v: any) => v.variant_id === variantId ? { ...v, low_stock_alert: checked } : v) };
      });
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDownloadTemplate = () => {
    const token = getToken();
    fetch('/api/products/excel/template', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'product_template.xlsx';
        link.click();
        URL.revokeObjectURL(url);
      });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = getToken();
      const res = await fetch('/api/products/excel/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (!data.success) {
        message.error(data.error);
        setUploadResult({ error: data.error });
      } else {
        setUploadResult(data.data);
        if (data.data.created > 0) {
          message.success(`${data.data.created}개 상품이 등록되었습니다.`);
          load();
        }
      }
    } catch (e: any) {
      message.error('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }

    return false;
  };

  const handleExpand = async (expanded: boolean, record: any) => {
    if (!expanded || variantsMap[record.product_code]) return;
    setVariantsLoading((prev) => ({ ...prev, [record.product_code]: true }));
    try {
      const data = await productApi.get(record.product_code);
      setVariantsMap((prev) => ({ ...prev, [record.product_code]: (data as any).variants || [] }));
    } catch (e: any) {
      message.error('변형 정보 로드 실패');
    } finally {
      setVariantsLoading((prev) => ({ ...prev, [record.product_code]: false }));
    }
  };

  const expandedRowRender = (record: any) => {
    const variants = variantsMap[record.product_code];
    if (variantsLoading[record.product_code]) return <Spin size="small" style={{ padding: 16 }} />;
    if (!variants || variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const variantCols = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: 'Color', dataIndex: 'color', key: 'color', width: 80 },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고수량', dataIndex: 'stock_qty', key: 'stock_qty', width: 90,
        render: (v: number) => { const qty = v ?? 0; return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>; },
      },
      { title: '바코드', dataIndex: 'barcode', key: 'barcode', width: 150, render: (v: string) => v || '-' },
      { title: '재입고 알림', dataIndex: 'low_stock_alert', key: 'low_stock_alert', width: 90,
        render: (v: boolean, row: any) => (
          <Switch size="small" checked={v !== false} onChange={(checked) => handleToggleVariantAlert(row.variant_id, checked, record.product_code)} />
        ),
      },
    ];
    return (
      <Table
        columns={variantCols}
        dataSource={variants}
        rowKey="variant_id"
        pagination={false}
        size="small"
        style={{ margin: 0 }}
      />
    );
  };

  const columns = [
    { title: '', dataIndex: 'image_url', key: 'image_url', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 150, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '세부', dataIndex: 'sub_category', key: 'sub_category', width: 90, ellipsis: true, render: (v: string) => v || '-' },
    { title: '브랜드', dataIndex: 'brand', key: 'brand', width: 80 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80 },
    { title: '핏', dataIndex: 'fit', key: 'fit', width: 70, render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: '기장', dataIndex: 'length', key: 'length', width: 65, render: (v: string) => v ? <Tag color="volcano">{v}</Tag> : '-' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    ...(!isStore ? [{ title: '매입가', dataIndex: 'cost_price', key: 'cost_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    }] : []),
    { title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 90,
      render: (v: number) => v ? <span style={{ color: '#f5222d' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '행사가', dataIndex: 'event_price', key: 'event_price', width: 90,
      render: (v: number) => v ? <span style={{ color: '#fa8c16' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '상태', dataIndex: 'sale_status', key: 'sale_status', width: 75,
      render: (v: string) => <Tag color={SALE_STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    { title: '재고', dataIndex: 'total_inv_qty', key: 'total_inv_qty', width: 80,
      render: (v: number) => {
        const qty = Number(v || 0);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/products/${record.product_code}/edit`)}>수정</Button>
          <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(record.product_code)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="상품 관리"
        extra={canWrite && (
          <Space>
            <Button icon={<UploadOutlined />} onClick={() => { setUploadModalOpen(true); setUploadResult(null); }}>
              엑셀 업로드
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>
              상품 등록
            </Button>
          </Space>
        )}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="코드 또는 이름 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          style={{ width: 250 }}
        />
        <Select value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 120 }}
          options={[{ label: '전체 보기', value: '' }, ...categoryOptions]} />
        <Select value={subCategoryFilter} onChange={(v) => { setSubCategoryFilter(v); setPage(1); }} style={{ width: 140 }}
          options={[{ label: '전체 보기', value: '' }, ...subCategoryOptions]} disabled={!categoryFilter} />
        <Select value={seasonFilter} onChange={(v) => { setSeasonFilter(v); setPage(1); }} style={{ width: 120 }}
          options={[
            { label: '전체 보기', value: '' },
            { label: '26 봄/가을', value: '2026SA' }, { label: '26 여름', value: '2026SM' }, { label: '26 겨울', value: '2026WN' },
            { label: '25 봄/가을', value: '2025SA' }, { label: '25 여름', value: '2025SM' }, { label: '25 겨울', value: '2025WN' },
          ]} />
        <Select value={fitFilter} onChange={(v) => { setFitFilter(v); setPage(1); }} style={{ width: 130 }}
          options={[{ label: '전체 보기', value: '' }, ...fitOptions]} />
        <Select showSearch optionFilterProp="label" value={colorFilter}
          onChange={(v) => { setColorFilter(v); setPage(1); }} style={{ width: 120 }}
          options={[{ label: '전체 보기', value: '' }, ...colorOptions]} />
        <Select showSearch optionFilterProp="label" value={sizeFilter}
          onChange={(v) => { setSizeFilter(v); setPage(1); }} style={{ width: 110 }}
          options={[{ label: '전체 보기', value: '' }, ...sizeOptions]} />
        <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }}
          options={[{ label: '전체 보기', value: '' }, { label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} />
        <Button onClick={load}>조회</Button>
      </Space>
      {canWrite && selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 8 }}>
          <Tag>{selectedRowKeys.length}개 선택</Tag>
          <Button size="small" onClick={() => { setBulkStatus(undefined); setBulkStatusModalOpen(true); }}>
            일괄 상태변경
          </Button>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>선택 해제</Button>
        </Space>
      )}
      <Table
        columns={columns}
        dataSource={products}
        rowKey="product_code"
        loading={loading || bulkLoading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        expandable={{ expandedRowRender, onExpand: handleExpand }}
        rowSelection={canWrite ? {
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        } : undefined}
      />

      {/* Bulk Status Modal */}
      <Modal
        title={`상품 일괄 상태변경 (${selectedRowKeys.length}개)`}
        open={bulkStatusModalOpen}
        onOk={handleBulkStatusChange}
        onCancel={() => { setBulkStatusModalOpen(false); setBulkStatus(undefined); }}
        okText="변경"
        cancelText="취소"
        confirmLoading={bulkLoading}
      >
        <p>선택된 {selectedRowKeys.length}개 상품의 판매 상태를 변경합니다.</p>
        <Select
          value={bulkStatus}
          onChange={setBulkStatus}
          placeholder="변경할 상태 선택"
          style={{ width: '100%' }}
          options={[
            { label: '판매중', value: '판매중' },
            { label: '일시품절', value: '일시품절' },
            { label: '단종', value: '단종' },
          ]}
        />
      </Modal>

      {/* Excel Upload Modal */}
      <Modal
        title="엑셀로 상품 일괄 등록"
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setUploadModalOpen(false)}>닫기</Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            엑셀 템플릿 다운로드
          </Button>
          <span style={{ marginLeft: 8, color: '#888' }}>먼저 템플릿을 다운로드하여 작성해주세요</span>
        </div>

        <Upload.Dragger
          accept=".xlsx,.xls"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => { handleUpload(file); return false; }}
          disabled={uploading}
        >
          <p style={{ fontSize: 32, color: '#1890ff' }}><UploadOutlined /></p>
          <p>{uploading ? '업로드 중...' : '클릭하거나 파일을 드래그하세요'}</p>
          <p style={{ color: '#888' }}>.xlsx, .xls 파일만 가능 (최대 5MB)</p>
        </Upload.Dragger>

        {uploadResult && !uploadResult.error && (
          <div style={{ marginTop: 16 }}>
            <Alert
              type={uploadResult.created > 0 ? 'success' : 'warning'}
              message={`처리 완료: 전체 ${uploadResult.total}개 / 등록 ${uploadResult.created}개 / 건너뜀 ${uploadResult.skipped}개`}
              style={{ marginBottom: 8 }}
            />
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <Alert
                type="warning"
                message="알림"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {uploadResult.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </div>
        )}

        {uploadResult?.error && (
          <Alert type="error" message={uploadResult.error} style={{ marginTop: 16 }} />
        )}
      </Modal>
    </div>
  );
}
