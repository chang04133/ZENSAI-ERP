import { useEffect, useState, useRef } from 'react';
import { Table, Button, Input, Select, Space, Tag, Modal, Form, InputNumber, Upload, Alert, message } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { apiFetch } from '../../core/api.client';
import * as XLSX from 'xlsx';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '입고완료', CANCELLED: '취소',
};

interface ItemRow { variant_id: number; request_qty: number; sku: string; product_name: string; color: string; size: string; }

export default function StoreShipmentPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  // 수령확인
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});

  // 엑셀 업로드
  const [excelLoading, setExcelLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50', request_type: '출고' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (user?.partnerCode) params.partner = user.partnerCode;
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, statusFilter]);
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/partners?limit=1000&scope=transfer');
        const json = await res.json();
        if (json.success && json.data?.data) setPartners(json.data.data);
      } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
      try { setVariantOptions(await productApi.searchVariants('')); } catch (e: any) { console.error('품목 전체 로드 실패:', e); }
    })();
  }, []);

  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) { try { setVariantOptions(await productApi.searchVariants(value)); } catch (e: any) { message.error('품목 검색 실패'); } }
  };

  const handleAddItem = (variantId: number) => {
    const v = variantOptions.find(o => o.variant_id === variantId);
    if (!v) return;
    if (items.find(i => i.variant_id === variantId)) { message.warning('이미 추가된 품목입니다'); return; }
    setItems([...items, { variant_id: variantId, request_qty: 1, sku: v.sku, product_name: v.product_name, color: v.color, size: v.size }]);
  };

  const handleCreate = async (values: any) => {
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    try {
      await shipmentApi.create({
        ...values,
        request_type: '출고',
        to_partner: user?.partnerCode,
        items: items.map(({ variant_id, request_qty }) => ({ variant_id, request_qty })),
      });
      message.success('출고의뢰가 등록되었습니다.');
      setModalOpen(false); form.resetFields(); setItems([]); load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); } catch (e: any) { message.error(e.message); }
  };

  // 수령확인
  const handleOpenReceiveModal = async (record: any) => {
    try {
      const d = await shipmentApi.get(record.request_id);
      setReceiveTarget(d);
      const qtys: Record<number, number> = {};
      (d as any).items?.forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty; });
      setReceivedQtys(qtys);
      setReceiveModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmReceive = async () => {
    if (!receiveTarget) return;
    try {
      const rItems = (receiveTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id,
        received_qty: receivedQtys[item.variant_id] || 0,
      }));
      await shipmentApi.receive(receiveTarget.request_id, rItems);
      message.success('수령 확인이 완료되었습니다.');
      setReceiveModalOpen(false); setReceiveTarget(null); load();
    } catch (e: any) { message.error(e.message); }
  };

  // 엑셀 업로드
  const handleExcelUpload = async (file: File) => {
    setExcelLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) { message.error('엑셀에 데이터가 없습니다.'); return; }

      // SKU로 variant 찾기
      const skuList = rows.map(r => String(r['SKU'] || r['sku'] || '')).filter(Boolean);
      if (skuList.length === 0) { message.error('SKU 컬럼이 필요합니다.'); return; }

      const foundItems: ItemRow[] = [];
      for (const sku of skuList) {
        try {
          const results = await productApi.searchVariants(sku);
          const exact = results.find((v: any) => v.sku === sku);
          if (exact) {
            const qty = rows.find(r => String(r['SKU'] || r['sku'] || '') === sku);
            const requestQty = Number(qty?.['수량'] || qty?.['qty'] || qty?.['QTY'] || 1);
            if (!foundItems.find(i => i.variant_id === exact.variant_id)) {
              foundItems.push({
                variant_id: exact.variant_id, request_qty: requestQty,
                sku: exact.sku, product_name: exact.product_name, color: exact.color, size: exact.size,
              });
            }
          }
        } catch (e: any) { console.error('SKU 조회 실패:', sku, e); }
      }

      if (foundItems.length === 0) {
        message.error('일치하는 상품을 찾을 수 없습니다.');
      } else {
        setItems(prev => {
          const merged = [...prev];
          for (const fi of foundItems) {
            if (!merged.find(m => m.variant_id === fi.variant_id)) merged.push(fi);
          }
          return merged;
        });
        message.success(`${foundItems.length}개 상품이 추가되었습니다.`);
        if (!modalOpen) {
          form.resetFields();
          setModalOpen(true);
        }
      }
    } catch (e: any) { message.error('엑셀 파일을 읽는 중 오류가 발생했습니다.'); }
    finally { setExcelLoading(false); }
    return false;
  };

  const partnerOptions = partners.filter(p => p.partner_code !== user?.partnerCode)
    .map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no' },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '출발(출고처)', dataIndex: 'from_partner_name', key: 'from_partner_name', render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', key: 'memo', render: (v: string) => v || '-', ellipsis: true },
    { title: '관리', key: 'action', width: 160, render: (_: any, record: any) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
        {record.status === 'SHIPPED' && (
          <Button size="small" type="primary" style={{ background: '#13c2c2' }} onClick={() => handleOpenReceiveModal(record)}>수령확인</Button>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <PageHeader title="출고관리" extra={
        <Space>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleExcelUpload as any}>
            <Button icon={<UploadOutlined />} loading={excelLoading}>엑셀 업로드</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setItems([]); setModalOpen(true); }}>출고의뢰 등록</Button>
        </Space>
      } />
      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={load} style={{ width: 200 }} />
        <Select placeholder="상태" allowClear value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }} options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
        <Button onClick={load}>조회</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />

      {/* 등록 모달 */}
      <Modal title="출고의뢰 등록" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="등록" cancelText="취소" width={700}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="from_partner" label="출고 요청처 (본사/다른매장)" rules={[{ required: true, message: '출고 요청처를 선택해주세요' }]}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
          </Form.Item>
          <Form.Item label="품목 추가">
            <Space style={{ width: '100%' }} direction="vertical">
              <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
                onSearch={handleVariantSearch} onChange={handleAddItem} value={null as any}
                notFoundContent="2자 이상 입력해주세요" style={{ width: '100%' }}>
                {variantOptions.map(v => (
                  <Select.Option key={v.variant_id} value={v.variant_id}>{v.sku} - {v.product_name} ({v.color}/{v.size})</Select.Option>
                ))}
              </Select>
              <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleExcelUpload as any}>
                <Button icon={<UploadOutlined />} size="small" loading={excelLoading}>엑셀로 품목 추가</Button>
              </Upload>
            </Space>
          </Form.Item>
          {items.length > 0 && (
            <Table size="small" dataSource={items} rowKey="variant_id" pagination={false} style={{ marginBottom: 16 }}
              columns={[
                { title: 'SKU', dataIndex: 'sku', width: 160 },
                { title: '상품명', dataIndex: 'product_name' },
                { title: '색상', dataIndex: 'color', width: 80 },
                { title: '사이즈', dataIndex: 'size', width: 80 },
                { title: '수량', key: 'qty', width: 100, render: (_: any, r: ItemRow) => (
                  <InputNumber min={1} value={r.request_qty} size="small"
                    onChange={(v) => setItems(items.map(i => i.variant_id === r.variant_id ? { ...i, request_qty: v || 1 } : i))} />
                )},
                { title: '', key: 'del', width: 40, render: (_: any, r: ItemRow) => (
                  <Button type="text" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => setItems(items.filter(i => i.variant_id !== r.variant_id))} />
                )},
              ]} />
          )}
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 상세 모달 */}
      <Modal title={`의뢰 상세 - ${detail?.request_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
              <div><strong>유형:</strong> {detail.request_type}</div>
              <div><strong>상태:</strong> <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag></div>
              <div><strong>출발:</strong> {detail.from_partner_name || '-'}</div>
              <div><strong>도착:</strong> {detail.to_partner_name || '-'}</div>
              <div><strong>의뢰일:</strong> {detail.request_date ? new Date(detail.request_date).toLocaleDateString('ko-KR') : '-'}</div>
              <div><strong>메모:</strong> {detail.memo || '-'}</div>
            </div>
            {detail.items?.length > 0 ? (
              <Table size="small" dataSource={detail.items} rowKey="item_id" pagination={false}
                columns={[
                  { title: 'SKU', dataIndex: 'sku' }, { title: '상품명', dataIndex: 'product_name' },
                  { title: '색상', dataIndex: 'color' }, { title: '사이즈', dataIndex: 'size' },
                  { title: '요청', dataIndex: 'request_qty' }, { title: '출고', dataIndex: 'shipped_qty' }, { title: '수령', dataIndex: 'received_qty' },
                ]} />
            ) : <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>등록된 품목이 없습니다.</div>}
          </div>
        )}
      </Modal>

      {/* 수령확인 모달 */}
      <Modal title="수령확인" open={receiveModalOpen} onCancel={() => setReceiveModalOpen(false)} onOk={handleConfirmReceive} okText="수령확인" cancelText="취소" width={650}>
        <Alert message="수령한 실제 수량을 입력하세요. 확인 시 재고가 증가합니다." type="info" showIcon style={{ marginBottom: 16 }} />
        {receiveTarget && (
          <Table size="small" dataSource={(receiveTarget as any).items || []} rowKey="variant_id" pagination={false}
            columns={[
              { title: 'SKU', dataIndex: 'sku', width: 140 },
              { title: '상품명', dataIndex: 'product_name' },
              { title: '출고수량', dataIndex: 'shipped_qty', width: 80 },
              { title: '수령수량', key: 'received', width: 120, render: (_: any, record: any) => (
                <InputNumber min={0} max={record.shipped_qty} value={receivedQtys[record.variant_id] || 0}
                  onChange={(v) => setReceivedQtys({ ...receivedQtys, [record.variant_id]: v || 0 })} style={{ width: '100%' }} />
              )},
            ]} />
        )}
      </Modal>
    </div>
  );
}
