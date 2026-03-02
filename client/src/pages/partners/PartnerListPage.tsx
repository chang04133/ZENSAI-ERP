import { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Button, Input, Space, Select, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { usePartnerStore } from '../../modules/partner/partner.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';

export default function PartnerListPage() {
  const navigate = useNavigate();
  const { data: partners, total, loading, fetchList: fetchPartners } = usePartnerStore();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [partnerType, setPartnerType] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const canDelete = user && [ROLES.ADMIN, ROLES.SYS_ADMIN].includes(user.role as any);

  const load = useCallback(() => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (partnerType) params.partner_type = partnerType;
    fetchPartners(params);
  }, [page, search, partnerType, fetchPartners]);

  useEffect(() => { load(); }, [load]);

  // 검색어 변경 시 디바운스 자동 조회
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); }, 500);
  };

  // Enter 즉시 조회
  const handleSearchEnter = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPage(1);
  };

  const handleDelete = async (code: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await partnerApi.remove(code);
      message.success('거래처가 비활성화되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { title: '거래처코드', dataIndex: 'partner_code', key: 'partner_code' },
    { title: '거래처명', dataIndex: 'partner_name', key: 'partner_name' },
    { title: '사업자번호', dataIndex: 'business_number', key: 'business_number', render: (v: string) => v || '-' },
    { title: '대표자', dataIndex: 'representative', key: 'representative', render: (v: string) => v || '-' },
    { title: '연락처', dataIndex: 'contact', key: 'contact', render: (v: string) => v || '-' },
    { title: '거래유형', dataIndex: 'partner_type', key: 'partner_type' },
    { title: '상태', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => v === false
        ? <Tag color="red">비활성</Tag>
        : <Tag color="green">활성</Tag>,
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/partners/${record.partner_code}/edit`)}>수정</Button>
          {canDelete && record.is_active !== false && (
            <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(record.partner_code)}>
              <Button size="small" danger loading={deleting}>비활성화</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        extra={canWrite && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/partners/new')}>
            거래처 등록
          </Button>
        )}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input
            placeholder="코드 또는 이름 검색"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onPressEnter={handleSearchEnter}
            allowClear
            style={{ width: '100%' }}
          /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select
            value={partnerType}
            onChange={(v) => { setPartnerType(v); setPage(1); }}
            style={{ width: 130 }}
            options={[
              { label: '전체 보기', value: '' },
              { label: '본사', value: '본사' },
              { label: '대리점', value: '대리점' },
              { label: '직영점', value: '직영점' },
              { label: '백화점', value: '백화점' },
              { label: '아울렛', value: '아울렛' },
              { label: '온라인', value: '온라인' },
              { label: '직영', value: '직영' },
              { label: '가맹', value: '가맹' },
            ]}
          /></div>
        <Button onClick={handleSearchEnter}>조회</Button>
      </div>
      <Table
        columns={columns}
        dataSource={partners}
        rowKey="partner_code"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
      />
    </div>
  );
}
