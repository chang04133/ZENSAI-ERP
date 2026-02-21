import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Tag, Popconfirm, Upload, Modal, Switch, message, Alert } from 'antd';
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
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [seasonFilter, setSeasonFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [fitFilter, setFitFilter] = useState<string | undefined>();
  const [subCategoryFilter, setSubCategoryFilter] = useState<string | undefined>();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [allCategoryCodes, setAllCategoryCodes] = useState<any[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [fitOptions, setFitOptions] = useState<{ label: string; value: string }[]>([]);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((data: any[]) => {
      setAllCategoryCodes(data);
      setCategoryOptions(data.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch((e: any) => { message.error('카테고리 로드 실패: ' + e.message); });
    codeApi.getByType('FIT').then((data: any[]) => {
      setFitOptions(data.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch((e: any) => { message.error('핏 옵션 로드 실패: ' + e.message); });
  }, []);

  const load = () => {
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (search) params.search = search;
    if (categoryFilter) params.category = categoryFilter;
    if (subCategoryFilter) params.sub_category = subCategoryFilter;
    if (seasonFilter) params.season = seasonFilter;
    if (statusFilter) params.sale_status = statusFilter;
    if (fitFilter) params.fit = fitFilter;
    fetchProducts(params);
  };

  useEffect(() => { load(); }, [page, categoryFilter, subCategoryFilter, seasonFilter, statusFilter, fitFilter]);

  const handleCategoryFilterChange = (value: string | undefined) => {
    setCategoryFilter(value);
    setSubCategoryFilter(undefined);
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

  const handleToggleAlert = async (code: string, checked: boolean) => {
    try {
      await productApi.update(code, { low_stock_alert: checked });
      load();
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

  const columns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code',
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '카테고리', dataIndex: 'category', key: 'category' },
    { title: '세부카테고리', dataIndex: 'sub_category', key: 'sub_category', render: (v: string) => v || '-' },
    { title: '브랜드', dataIndex: 'brand', key: 'brand' },
    { title: '시즌', dataIndex: 'season', key: 'season' },
    { title: '핏', dataIndex: 'fit', key: 'fit', render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: '기장', dataIndex: 'length', key: 'length', render: (v: string) => v ? <Tag color="volcano">{v}</Tag> : '-' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price',
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    { title: '매입가', dataIndex: 'cost_price', key: 'cost_price',
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    { title: '할인가', dataIndex: 'discount_price', key: 'discount_price',
      render: (v: number) => v ? <span style={{ color: '#f5222d' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '행사가', dataIndex: 'event_price', key: 'event_price',
      render: (v: number) => v ? <span style={{ color: '#fa8c16' }}>{Number(v).toLocaleString()}원</span> : '-',
    },
    { title: '판매상태', dataIndex: 'sale_status', key: 'sale_status',
      render: (v: string) => <Tag color={SALE_STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    { title: '재고', dataIndex: 'total_inv_qty', key: 'total_inv_qty', width: 80,
      render: (v: number) => {
        const qty = Number(v || 0);
        return <Tag color={qty > 10 ? 'blue' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag>;
      },
    },
    { title: '부족알림', key: 'low_stock_alert', width: 90,
      render: (_: any, record: any) => (
        <Switch
          size="small"
          checked={record.low_stock_alert}
          onChange={(checked) => handleToggleAlert(record.product_code, checked)}
          disabled={!canWrite}
        />
      ),
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions',
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
        <Select placeholder="카테고리" allowClear value={categoryFilter} onChange={handleCategoryFilterChange} style={{ width: 120 }}
          options={categoryOptions} />
        <Select placeholder="세부카테고리" allowClear value={subCategoryFilter} onChange={(v) => { setSubCategoryFilter(v); setPage(1); }} style={{ width: 140 }}
          options={subCategoryOptions} disabled={!categoryFilter} />
        <Select placeholder="시즌" allowClear value={seasonFilter} onChange={(v) => { setSeasonFilter(v); setPage(1); }} style={{ width: 120 }}
          options={[{ label: '2026SS', value: '2026SS' }, { label: '2025FW', value: '2025FW' }, { label: '2025SS', value: '2025SS' }]} />
        <Select placeholder="핏" allowClear value={fitFilter} onChange={(v) => { setFitFilter(v); setPage(1); }} style={{ width: 130 }}
          options={fitOptions} />
        <Select placeholder="판매상태" allowClear value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }}
          options={[{ label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} />
        <Button onClick={load}>조회</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={products}
        rowKey="product_code"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
      />

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
