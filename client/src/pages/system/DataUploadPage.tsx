import { useState } from 'react';
import { Button, Upload, Modal, message, Alert } from 'antd';
import { UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { getToken } from '../../core/api.client';

export default function DataUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

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
        }
      }
    } catch {
      message.error('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
    return false;
  };

  return (
    <div>
      <PageHeader title="데이터 올리기" />
      <div style={{ maxWidth: 600 }}>
        <h3>상품 엑셀 업로드</h3>
        <p style={{ color: '#666', marginBottom: 16 }}>엑셀 파일을 통해 상품을 일괄 등록할 수 있습니다.</p>

        <div style={{ marginBottom: 24 }}>
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
      </div>
    </div>
  );
}
