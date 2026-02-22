import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Modal, Form, Input, Select, InputNumber, Space, Popconfirm, Tabs, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { materialApi } from '../../modules/production/material.api';
import type { Material } from '../../../../shared/types/production';

const TYPE_LABELS: Record<string, string> = { FABRIC: '원단', ACCESSORY: '부자재', PACKAGING: '포장재' };
const TYPE_COLORS: Record<string, string> = { FABRIC: 'blue', ACCESSORY: 'orange', PACKAGING: 'green' };
const MATERIAL_TYPES = ['FABRIC', 'ACCESSORY', 'PACKAGING'] as const;

export default function MaterialManagePage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<Material | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [lowStock, setLowStock] = useState<Material[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (typeFilter) params.material_type = typeFilter;
      if (search) params.search = search;
      const result = await materialApi.list(params);
      setMaterials(result.data); setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, typeFilter, search]);

  const loadExtra = async () => {
    try {
      const [ls, sm] = await Promise.all([materialApi.lowStock(), materialApi.summary()]);
      setLowStock(ls); setSummary(sm);
    } catch (e: any) { console.error('부자재 부가정보 로드 실패:', e); }
  };

  useEffect(() => { load(); loadExtra(); }, [load]);

  const openCreate = () => {
    setEditItem(null); form.resetFields(); setFormOpen(true);
  };

  const openEdit = (item: Material) => {
    setEditItem(item);
    form.setFieldsValue({
      material_name: item.material_name, material_type: item.material_type,
      unit: item.unit, unit_price: item.unit_price, min_stock_qty: item.min_stock_qty,
      supplier: item.supplier, memo: item.memo,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editItem) {
        await materialApi.update(editItem.material_id, values);
        message.success('수정되었습니다.');
      } else {
        const code = await materialApi.generateCode();
        await materialApi.create({ ...values, material_code: code });
        message.success('등록되었습니다.');
      }
      setFormOpen(false); load(); loadExtra();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDelete = async (id: number) => {
    try {
      await materialApi.remove(id);
      message.success('삭제되었습니다.'); load(); loadExtra();
    } catch (e: any) { message.error(e.message); }
  };

  const handleAdjust = async () => {
    if (!adjustItem || adjustQty === 0) return;
    try {
      await materialApi.adjustStock(adjustItem.material_id, adjustQty);
      message.success('재고가 조정되었습니다.');
      setAdjustOpen(false); load(); loadExtra();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '자재코드', dataIndex: 'material_code', key: 'code', width: 100 },
    { title: '자재명', dataIndex: 'material_name', key: 'name', ellipsis: true },
    { title: '유형', dataIndex: 'material_type', key: 'type', width: 70,
      render: (v: string) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] || v}</Tag> },
    { title: '단위', dataIndex: 'unit', key: 'unit', width: 50 },
    { title: '단가', dataIndex: 'unit_price', key: 'price', width: 80,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '재고', dataIndex: 'stock_qty', key: 'stock', width: 80,
      render: (v: number, r: Material) => (
        <span style={{ color: v <= r.min_stock_qty ? '#ef4444' : '#333', fontWeight: v <= r.min_stock_qty ? 700 : 400 }}>
          {v} {r.unit}
        </span>
      )},
    { title: '최소재고', dataIndex: 'min_stock_qty', key: 'min', width: 80,
      render: (v: number, r: Material) => `${v} ${r.unit}` },
    { title: '공급처', dataIndex: 'supplier', key: 'supplier', width: 120, ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '관리', key: 'action', width: 180, render: (_: any, r: Material) => (
      <Space size="small">
        <Button size="small" onClick={() => { setAdjustItem(r); setAdjustQty(0); setAdjustOpen(true); }}>입출고</Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.material_id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      <Tabs defaultActiveKey="list" items={[
        { key: 'list', label: '자재 목록', children: (
          <Card extra={
            <Space>
              <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 100 }} allowClear placeholder="유형">
                {MATERIAL_TYPES.map(t => <Select.Option key={t} value={t}>{TYPE_LABELS[t]}</Select.Option>)}
              </Select>
              <Input.Search placeholder="검색" onSearch={setSearch} allowClear style={{ width: 160 }} />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>자재 등록</Button>
            </Space>
          }>
            <Table columns={columns} dataSource={materials} rowKey="material_id" loading={loading}
              size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
              pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />
          </Card>
        )},
        { key: 'lowstock', label: (
          <span><WarningOutlined style={{ color: '#ef4444' }} /> 부족 자재 {lowStock.length > 0 && <Tag color="red">{lowStock.length}</Tag>}</span>
        ), children: (
          <Card>
            <Table columns={[
              { title: '자재코드', dataIndex: 'material_code', key: 'code', width: 100 },
              { title: '자재명', dataIndex: 'material_name', key: 'name' },
              { title: '유형', dataIndex: 'material_type', key: 'type', width: 70, render: (v: string) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] || v}</Tag> },
              { title: '현재 재고', key: 'stock', width: 100, render: (_: any, r: Material) => (
                <span style={{ color: r.stock_qty === 0 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                  {r.stock_qty} {r.unit}
                </span>
              )},
              { title: '최소 재고', key: 'min', width: 100, render: (_: any, r: Material) => `${r.min_stock_qty} ${r.unit}` },
              { title: '부족량', key: 'diff', width: 100, render: (_: any, r: Material) => {
                const diff = r.min_stock_qty - r.stock_qty;
                return diff > 0 ? <Tag color="red">-{diff} {r.unit}</Tag> : <Tag color="green">충분</Tag>;
              }},
              { title: '공급처', dataIndex: 'supplier', key: 'supplier', width: 120, render: (v: string) => v || '-' },
              { title: '입고', key: 'action', width: 80, render: (_: any, r: Material) => (
                <Button size="small" type="primary" onClick={() => { setAdjustItem(r); setAdjustQty(0); setAdjustOpen(true); }}>입고</Button>
              )},
            ]} dataSource={lowStock} rowKey="material_id" pagination={false} size="small" />
          </Card>
        )},
        { key: 'summary', label: '유형별 요약', children: (
          <Card>
            <Table columns={[
              { title: '유형', dataIndex: 'material_type', key: 'type', render: (v: string) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] || v}</Tag> },
              { title: '등록 수', dataIndex: 'count', key: 'cnt', render: (v: number) => `${v}종` },
              { title: '재고 가치', dataIndex: 'total_value', key: 'value', render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
              { title: '부족 자재', dataIndex: 'low_stock_count', key: 'low', render: (v: number) => v > 0 ? <Tag color="red">{v}건</Tag> : <Tag color="green">없음</Tag> },
            ]} dataSource={summary} rowKey="material_type" pagination={false} size="small" />
          </Card>
        )},
      ]} />

      {/* 등록/수정 모달 */}
      <Modal title={editItem ? '자재 수정' : '자재 등록'} open={formOpen} onCancel={() => setFormOpen(false)}
        onOk={handleSave} okText={editItem ? '수정' : '등록'}>
        <Form form={form} layout="vertical">
          <Form.Item name="material_name" label="자재명" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="material_type" label="유형" rules={[{ required: true }]} style={{ width: 140 }}>
              <Select placeholder="유형">
                {MATERIAL_TYPES.map(t => <Select.Option key={t} value={t}>{TYPE_LABELS[t]}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="unit" label="단위" initialValue="ea" style={{ width: 100 }}>
              <Select>
                {['ea', 'm', 'yard', 'kg', 'roll'].map(u => <Select.Option key={u} value={u}>{u}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="unit_price" label="단가">
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="min_stock_qty" label="최소 재고" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="supplier" label="공급처"><Input /></Form.Item>
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 입출고 모달 */}
      <Modal title={`재고 조정 - ${adjustItem?.material_name || ''}`} open={adjustOpen}
        onCancel={() => setAdjustOpen(false)} onOk={handleAdjust} okText="적용">
        {adjustItem && (
          <div>
            <p>현재 재고: <strong>{adjustItem.stock_qty} {adjustItem.unit}</strong></p>
            <p>
              <span>조정 수량: </span>
              <InputNumber value={adjustQty} onChange={(v) => setAdjustQty(v || 0)}
                style={{ width: 200 }} />
              <span style={{ marginLeft: 8, color: '#888' }}>
                {adjustQty > 0 ? `(+${adjustQty} 입고)` : adjustQty < 0 ? `(${adjustQty} 출고)` : ''}
              </span>
            </p>
            <p style={{ color: '#888' }}>
              조정 후: <strong>{Math.max(0, adjustItem.stock_qty + adjustQty)} {adjustItem.unit}</strong>
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
