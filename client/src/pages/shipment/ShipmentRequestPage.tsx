import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Tag, Modal, Form, Popconfirm, InputNumber, Upload, DatePicker, message } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { STATUS_COLORS, STATUS_LABELS } from '../../components/shipment/ShipmentConstants';
import ShipmentDetailModal from '../../components/shipment/ShipmentDetailModal';
import ShippedQtyModal from '../../components/shipment/ShippedQtyModal';
import ReceivedQtyModal from '../../components/shipment/ReceivedQtyModal';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { apiFetch, getToken } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';
import * as XLSX from 'xlsx';

import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

interface ItemRow {
  variant_id: number;
  request_qty: number;
  sku: string;
  product_name: string;
  color: string;
  size: string;
}

export default function ShipmentRequestPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  // 등록 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [excelLoading, setExcelLoading] = useState(false);

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // 출고확인 모달
  const [shippedModalOpen, setShippedModalOpen] = useState(false);
  const [shippedTarget, setShippedTarget] = useState<any>(null);
  const [shippedQtys, setShippedQtys] = useState<Record<number, number>>({});

  // 수령확인 모달
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50', request_type: '출고' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      if (isStore && user?.partnerCode) params.partner = user.partnerCode;
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => { setPage(1); load(1); }, [statusFilter]);
  useEffect(() => { if (dateRange) { setPage(1); load(1); } }, [dateRange]);
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

  // ── 품목 검색/추가 ──
  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) {
      try { setVariantOptions(await productApi.searchVariants(value)); }
      catch { setVariantOptions([]); }
    }
  };

  const handleAddItem = (variantId: number) => {
    const v = variantOptions.find(o => o.variant_id === variantId);
    if (!v) return;
    if (items.find(i => i.variant_id === variantId)) { message.warning('이미 추가된 품목입니다'); return; }
    setItems([...items, { variant_id: variantId, request_qty: 1, sku: v.sku, product_name: v.product_name, color: v.color, size: v.size }]);
  };

  // ── 의뢰 등록 ──
  const handleCreate = async (values: any) => {
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    try {
      const body: any = {
        ...values,
        request_type: '출고',
        items: items.map(({ variant_id, request_qty }) => ({ variant_id, request_qty })),
      };
      if (isStore && user?.partnerCode) body.to_partner = user.partnerCode;
      await shipmentApi.create(body);
      message.success('출고의뢰가 등록되었습니다.');
      setModalOpen(false); form.resetFields(); setItems([]); load();
    } catch (e: any) { message.error(e.message); }
  };

  // ── 엑셀 양식 다운로드 ──
  const handleDownloadTemplate = () => {
    // 서버 엑셀 템플릿 시도, 실패시 클라이언트 생성
    const token = getToken();
    fetch(shipmentApi.templateUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('server template failed');
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'shipment_template.xlsx'; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([{ 'SKU': 'ZS26SS-T001-BK-M', '수량': 5 }]);
        ws['!cols'] = [{ wch: 24 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, ws, '출고품목');
        XLSX.writeFile(wb, 'shipment_template.xlsx');
      });
  };

  // ── 엑셀 업로드 ──
  const handleExcelUpload = async (file: File) => {
    setExcelLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      if (rows.length === 0) { message.error('엑셀에 데이터가 없습니다.'); return; }

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
              foundItems.push({ variant_id: exact.variant_id, request_qty: requestQty, sku: exact.sku, product_name: exact.product_name, color: exact.color, size: exact.size });
            }
          }
        } catch { /* skip */ }
      }

      if (foundItems.length === 0) { message.error('일치하는 상품을 찾을 수 없습니다.'); }
      else {
        setItems(prev => {
          const merged = [...prev];
          for (const fi of foundItems) { if (!merged.find(m => m.variant_id === fi.variant_id)) merged.push(fi); }
          return merged;
        });
        message.success(`${foundItems.length}개 상품이 추가되었습니다.`);
        if (!modalOpen) { form.resetFields(); setModalOpen(true); }
      }
    } catch { message.error('엑셀 파일을 읽는 중 오류가 발생했습니다.'); }
    finally { setExcelLoading(false); }
    return false;
  };

  // ── 취소 ──
  const handleCancel = async (id: number) => {
    try {
      await shipmentApi.update(id, { status: 'CANCELLED' });
      message.success('취소되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  // ── 상세 ──
  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); }
    catch (e: any) { message.error(e.message); }
  };

  // ── 출고확인 (PENDING → SHIPPED) ──
  const handleOpenShippedModal = async (record: any) => {
    try {
      const d = await shipmentApi.get(record.request_id);
      setShippedTarget(d);
      const qtys: Record<number, number> = {};
      (d as any).items?.forEach((item: any) => { qtys[item.variant_id] = item.shipped_qty || item.request_qty; });
      setShippedQtys(qtys);
      setShippedModalOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const handleConfirmShipped = async () => {
    if (!shippedTarget) return;
    try {
      const sItems = (shippedTarget as any).items.map((item: any) => ({
        variant_id: item.variant_id, shipped_qty: shippedQtys[item.variant_id] || 0,
      }));
      await shipmentApi.updateShippedQty(shippedTarget.request_id, sItems);
      await shipmentApi.update(shippedTarget.request_id, { status: 'SHIPPED' });
      message.success('출고 처리가 완료되었습니다.');
      setShippedModalOpen(false); setShippedTarget(null); load();
    } catch (e: any) { message.error(e.message); }
  };

  // ── 수령확인 (SHIPPED → RECEIVED) ──
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
        variant_id: item.variant_id, received_qty: receivedQtys[item.variant_id] || 0,
      }));
      await shipmentApi.receive(receiveTarget.request_id, rItems);
      message.success('수령 확인이 완료되었습니다.');
      setReceiveModalOpen(false); setReceiveTarget(null); load();
    } catch (e: any) { message.error(e.message); }
  };

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no', width: 140 },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '출고처', dataIndex: 'from_partner_name', key: 'from_partner_name', render: (v: string) => v || '-' },
    ...(!isStore ? [{ title: '입고처', dataIndex: 'to_partner_name', key: 'to_partner_name', render: (v: string) => v || '-' }] : []),
    { title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', key: 'memo', render: (v: string) => v || '-', ellipsis: true },
    { title: '관리', key: 'action', width: 240, render: (_: any, record: any) => {
      const canShip = record.status === 'PENDING' && isAdmin;
      const canReceive = record.status === 'SHIPPED' && (isAdmin || record.to_partner === user?.partnerCode);
      const canCancelRow = record.status === 'PENDING' && isAdmin;
      return (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
          {canShip && (
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleOpenShippedModal(record)}>출고확인</Button>
          )}
          {canReceive && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ background: '#13c2c2' }}
              onClick={() => handleOpenReceiveModal(record)}>수령확인</Button>
          )}
          {canCancelRow && (
            <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(record.request_id)}>
              <Button size="small" danger icon={<CloseOutlined />}>취소</Button>
            </Popconfirm>
          )}
        </Space>
      );
    }},
  ];

  return (
    <div>
      <PageHeader title="출고의뢰" extra={
        <Space>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>엑셀폼</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleExcelUpload as any}>
            <Button size="small" icon={<UploadOutlined />} loading={excelLoading}>엑셀 업로드</Button>
          </Upload>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => {
            form.resetFields();
            if (isStore && user?.partnerCode) form.setFieldsValue({ to_partner: user.partnerCode });
            setItems([]); setModalOpen(true);
          }}>의뢰 등록</Button>
        </Space>
      } />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input size="small" placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search}
          onChange={(e) => setSearch(e.target.value)} onPressEnter={() => { setPage(1); load(1); }} style={{ width: 200 }} />
        <Select size="small" placeholder="상태" allowClear value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 120 }}
          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
        <RangePicker size="small" presets={datePresets} value={dateRange} onChange={(v) => setDateRange(v as any)} />
        <Button size="small" onClick={() => { setPage(1); load(1); }}>조회</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />

      {/* 등록 모달 */}
      <Modal title="출고의뢰 등록" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="등록" cancelText="취소" width={700}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="from_partner" label="출고처 (출발)" rules={[{ required: true, message: '출고처를 선택해주세요' }]}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
          </Form.Item>
          {!isStore ? (
            <Form.Item name="to_partner" label="입고처 (도착)">
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" allowClear options={partnerOptions} />
            </Form.Item>
          ) : null}
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
      <ShipmentDetailModal open={detailOpen} detail={detail} onClose={() => setDetailOpen(false)} />

      {/* 출고수량 입력 모달 */}
      <ShippedQtyModal open={shippedModalOpen} detail={shippedTarget} qtys={shippedQtys}
        onQtyChange={(vid, qty) => setShippedQtys({ ...shippedQtys, [vid]: qty })}
        onConfirm={handleConfirmShipped} onCancel={() => setShippedModalOpen(false)} />

      {/* 수령확인 모달 */}
      <ReceivedQtyModal open={receiveModalOpen} detail={receiveTarget} qtys={receivedQtys}
        onQtyChange={(vid, qty) => setReceivedQtys({ ...receivedQtys, [vid]: qty })}
        onConfirm={handleConfirmReceive} onCancel={() => setReceiveModalOpen(false)} />
    </div>
  );
}
