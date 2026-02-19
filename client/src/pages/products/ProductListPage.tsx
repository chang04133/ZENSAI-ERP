import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Tag, Popconfirm, Upload, Modal, message, Alert } from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { useProductStore } from '../../store/product.store';
import { useAuthStore } from '../../store/auth.store';
import { deleteProductApi } from '../../api/product.api';
import { getToken } from '../../api/client';
import { ROLES } from '../../constants/roles';

export default function ProductListPage() {
  const navigate = useNavigate();
  const { products, total, loading, fetchProducts } = useProductStore();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);

  const load = () => {
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (search) params.search = search;
    fetchProducts(params);
  };

  useEffect(() => { load(); }, [page]);

  const handleDelete = async (code: string) => {
    try {
      await deleteProductApi(code);
      message.success('상품이 비활성화되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDownloadTemplate = () => {
    const token = getToken();
    const link = document.createElement('a');
    link.href = `/api/products/excel/template`;
    // Use fetch to add auth header
    fetch('/api/products/excel/template', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
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

    return false; // prevent default upload
  };

  const columns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code',
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '카테고리', dataIndex: 'category', key: 'category' },
    { title: '브랜드', dataIndex: 'brand', key: 'brand' },
    { title: '시즌', dataIndex: 'season', key: 'season' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price',
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
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
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="코드 또는 이름 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          style={{ width: 250 }}
        />
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
