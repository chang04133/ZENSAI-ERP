import { useEffect, useState, useCallback } from 'react';
import { Button, Card, Input, Modal, Table, Tag, message, Form, Select, Space, InputNumber, Radio } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, TrophyOutlined } from '@ant-design/icons';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsQcInspection } from '../../../../shared/types/outsource';
import dayjs from 'dayjs';

const RESULT_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '대기', color: 'warning' },
  PASS: { label: '채택', color: 'success' },
  FAIL: { label: '탈락', color: 'error' },
};
const BLAME_PARTY_MAP: Record<string, string> = { GAP: '갑 (브랜드)', EUL: '을 (외주)' };
const BLAME_REASON_MAP: Record<string, string> = {
  SPEC_ERROR: '스펙 오류', DIMENSION_ERROR: '치수 오류', MATERIAL_MIS_ORDER: '소재 오발주',
  BRIEF_CHANGE: '브리프 변경', WO_MODIFICATION: '작업지시서 수정',
};

export default function FinalSelectPage() {
  const [data, setData] = useState<OsQcInspection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<string>('');
  const [createModal, setCreateModal] = useState(false);
  const [resultModal, setResultModal] = useState<number | null>(null);
  const [createForm] = Form.useForm();
  const [resultForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50', qc_type: 'FINAL' };
      if (search) params.search = search;
      if (resultFilter) params.result = resultFilter;
      const res = await outsourceApi.listQc(params);
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [search, resultFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      values.qc_type = 'FINAL';
      await outsourceApi.createQc(values);
      message.success('최종 셀렉이 등록되었습니다.');
      setCreateModal(false);
      createForm.resetFields();
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
  };

  const handleResult = async () => {
    if (!resultModal) return;
    try {
      const values = await resultForm.validateFields();
      await outsourceApi.submitQcResult(resultModal, values);
      const msg = values.result === 'PASS'
        ? '최종 채택 처리되었습니다. 결제가 생성되었습니다.'
        : '탈락 처리되었습니다.';
      message.success(msg);
      setResultModal(null);
      resultForm.resetFields();
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const resultValue = Form.useWatch('result', resultForm);

  const columns = [
    { title: '셀렉번호', dataIndex: 'qc_no', width: 130 },
    { title: '작업지시서', dataIndex: 'wo_no', width: 130 },
    { title: '브리프', dataIndex: 'brief_title', ellipsis: true },
    {
      title: '결과', dataIndex: 'result', width: 80,
      render: (s: string) => <Tag color={RESULT_MAP[s]?.color}>{RESULT_MAP[s]?.label || s}</Tag>,
    },
    { title: '검수량', dataIndex: 'inspected_qty', width: 80, align: 'right' as const },
    { title: '채택', dataIndex: 'passed_qty', width: 70, align: 'right' as const },
    { title: '탈락', dataIndex: 'defect_qty', width: 70, align: 'right' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : v },
    { title: '귀책', dataIndex: 'blame_party', width: 90, render: (v: string) => v ? BLAME_PARTY_MAP[v] : '-' },
    { title: '셀렉일', dataIndex: 'inspected_at', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    {
      title: '관리', width: 100, fixed: 'right' as const,
      render: (_: any, r: OsQcInspection) =>
        r.result === 'PENDING' ? (
          <Button size="small" type="primary" onClick={() => { setResultModal(r.qc_id); resultForm.resetFields(); }}>결과 등록</Button>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Card
        title={<><TrophyOutlined style={{ marginRight: 8, color: '#faad14' }} />최종 셀렉</>}
        size="small"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateModal(true); }}>셀렉 등록</Button>}
      >
        <Space style={{ marginBottom: 12 }}>
          <Input.Search placeholder="검색..." allowClear onSearch={setSearch} style={{ width: 250 }} />
          <Select placeholder="결과" allowClear style={{ width: 120 }} value={resultFilter || undefined} onChange={(v) => setResultFilter(v || '')}>
            {Object.entries(RESULT_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
          </Select>
        </Space>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="qc_id"
          loading={loading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
          pagination={{ pageSize: 50, total, showTotal: (t) => `총 ${t}건` }}
        />
      </Card>

      {/* 셀렉 등록 모달 */}
      <Modal title="최종 셀렉 등록" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="등록">
        <Form form={createForm} layout="vertical">
          <Form.Item name="wo_id" label="작업지시서 ID" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Space>
            <Form.Item name="inspected_qty" label="검수수량"><InputNumber min={0} /></Form.Item>
            <Form.Item name="passed_qty" label="채택수량"><InputNumber min={0} /></Form.Item>
            <Form.Item name="defect_qty" label="탈락수량"><InputNumber min={0} /></Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 결과 등록 모달 */}
      <Modal title="최종 셀렉 결과" open={!!resultModal} onOk={handleResult} onCancel={() => { setResultModal(null); resultForm.resetFields(); }} okText="확인" width={560}>
        <Form form={resultForm} layout="vertical">
          <Form.Item name="result" label="결과" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="PASS"><CheckCircleOutlined style={{ color: '#52c41a' }} /> 채택</Radio.Button>
              <Radio.Button value="FAIL"><CloseCircleOutlined style={{ color: '#ff4d4f' }} /> 탈락</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Space>
            <Form.Item name="inspected_qty" label="검수수량"><InputNumber min={0} /></Form.Item>
            <Form.Item name="passed_qty" label="채택수량"><InputNumber min={0} /></Form.Item>
            <Form.Item name="defect_qty" label="탈락수량"><InputNumber min={0} /></Form.Item>
          </Space>
          {resultValue === 'FAIL' && (
            <>
              <Form.Item name="blame_party" label="귀책" rules={[{ required: true, message: '귀책을 선택하세요' }]}>
                <Select options={Object.entries(BLAME_PARTY_MAP).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
              <Form.Item name="blame_reason" label="귀책 사유">
                <Select options={Object.entries(BLAME_REASON_MAP).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
              <Form.Item name="blame_memo" label="귀책 비고">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="rework_cost" label="재작업 비용">
                <InputNumber min={0} style={{ width: 200 }} />
              </Form.Item>
            </>
          )}
          <Form.Item name="defect_details" label="상세 (JSON)">
            <Input.TextArea rows={2} placeholder='[{"type":"디자인 불일치","qty":5}]' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
