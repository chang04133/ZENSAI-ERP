import { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Button, Input, Space, Select, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, SearchOutlined, StarFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { usePartnerStore } from '../../modules/partner/partner.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { warehouseApi } from '../../modules/warehouse/warehouse.api';
import { ROLES } from '../../../../shared/constants/roles';

export default function PartnerListPage() {
  const navigate = useNavigate();
  const { data: partners, total, loading, fetchList: fetchPartners } = usePartnerStore();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [partnerType, setPartnerType] = useState('');
  const [isActive, setIsActive] = useState('true');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 창고 코드 목록
  const [warehouseCodes, setWarehouseCodes] = useState<Set<string>>(new Set());
  const [defaultWarehouse, setDefaultWarehouse] = useState<string | null>(null);

  const canWrite = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const canDelete = user && [ROLES.ADMIN, ROLES.SYS_ADMIN].includes(user.role as any);
  const isAdmin = user && [ROLES.ADMIN, ROLES.SYS_ADMIN].includes(user.role as any);

  const load = useCallback(() => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (partnerType) params.partner_type = partnerType;
    params.is_active = isActive || 'all';
    fetchPartners(params);
  }, [page, search, partnerType, isActive, fetchPartners]);

  const loadWarehouses = async () => {
    try {
      const list = await warehouseApi.list();
      const codes = new Set<string>(list.map((w: any) => w.warehouse_code));
      setWarehouseCodes(codes);
      const def = list.find((w: any) => w.is_default);
      setDefaultWarehouse(def?.warehouse_code || null);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadWarehouses(); }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); }, 500);
  };

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

  const handleReactivate = async (code: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await partnerApi.update(code, { is_active: true });
      message.success('거래처가 재활성화되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // 창고 토글
  const handleToggleWarehouse = async (code: string, name: string, isWarehouse: boolean) => {
    try {
      if (isWarehouse) {
        // 창고 해제 — 기본 창고면 불가
        if (code === defaultWarehouse) {
          message.warning('기본 창고는 해제할 수 없습니다. 다른 창고를 기본으로 지정한 후 해제하세요.');
          return;
        }
        await warehouseApi.remove(code);
        message.success(`${name} 창고 해제`);
      } else {
        // 창고 등록
        await warehouseApi.create({ warehouse_code: code, warehouse_name: name });
        message.success(`${name} 창고 등록`);
      }
      loadWarehouses();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 기본 창고 설정
  const handleSetDefault = async (code: string) => {
    try {
      await warehouseApi.setDefault(code);
      message.success('기본 창고가 변경되었습니다.');
      loadWarehouses();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '거래처코드', dataIndex: 'partner_code', key: 'partner_code', width: 120 },
    { title: '거래처명', dataIndex: 'partner_name', key: 'partner_name' },
    { title: '거래유형', dataIndex: 'partner_type', key: 'partner_type', width: 90 },
    {
      title: '창고', key: 'warehouse', width: 80, align: 'center' as const,
      render: (_: any, r: any) => {
        const isWh = warehouseCodes.has(r.partner_code);
        const isDef = r.partner_code === defaultWarehouse;
        if (!isAdmin) {
          return isWh
            ? <span>{isDef ? <StarFilled style={{ color: '#faad14', marginRight: 4 }} /> : null}<Tag color="blue">O</Tag></span>
            : <Tag>X</Tag>;
        }
        return (
          <Space size={2}>
            {isWh ? (
              <>
                {isDef
                  ? <StarFilled style={{ color: '#faad14', cursor: 'default' }} title="기본 창고" />
                  : <StarFilled style={{ color: '#d9d9d9', cursor: 'pointer' }} title="기본 창고로 설정" onClick={() => handleSetDefault(r.partner_code)} />
                }
                <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => handleToggleWarehouse(r.partner_code, r.partner_name, true)}>O</Tag>
              </>
            ) : (
              <Tag style={{ cursor: 'pointer' }} onClick={() => handleToggleWarehouse(r.partner_code, r.partner_name, false)}>X</Tag>
            )}
          </Space>
        );
      },
    },
    { title: '사업자번호', dataIndex: 'business_number', key: 'business_number', width: 130, render: (v: string) => v || '-' },
    { title: '대표자', dataIndex: 'representative', key: 'representative', width: 90, render: (v: string) => v || '-' },
    { title: '연락처', dataIndex: 'contact', key: 'contact', width: 120, render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'is_active', key: 'is_active', width: 70,
      render: (v: boolean) => v === false
        ? <Tag color="red">비활성</Tag>
        : <Tag color="green">활성</Tag>,
    },
    ...(canWrite ? [{
      title: '관리', key: 'actions', width: 160,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/partners/${record.partner_code}/edit`)}>수정</Button>
          {canDelete && record.is_active !== false && (
            <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(record.partner_code)}>
              <Button size="small" danger loading={deleting}>비활성화</Button>
            </Popconfirm>
          )}
          {canDelete && record.is_active === false && (
            <Popconfirm title="재활성화하시겠습니까?" onConfirm={() => handleReactivate(record.partner_code)}>
              <Button size="small" type="primary" ghost loading={deleting}>재활성화</Button>
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
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select
            value={isActive}
            onChange={(v) => { setIsActive(v); setPage(1); }}
            style={{ width: 110 }}
            options={[
              { label: '전체', value: '' },
              { label: '활성', value: 'true' },
              { label: '비활성', value: 'false' },
            ]}
          /></div>
        <Button onClick={handleSearchEnter}>조회</Button>
        {isAdmin && defaultWarehouse && (
          <span style={{ fontSize: 12, color: '#888' }}>
            <StarFilled style={{ color: '#faad14' }} /> 기본 창고: 출고/입고/생산 시 자동 사용
          </span>
        )}
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
