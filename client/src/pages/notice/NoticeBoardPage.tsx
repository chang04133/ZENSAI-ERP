import { useState } from 'react';
import { Table, Card, Tag, Button, Space, Input, Modal, Form, Select, message, Badge, Typography } from 'antd';
import { PlusOutlined, PushpinOutlined, BellOutlined, EyeOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const TYPE_COLOR: Record<string, string> = { NOTICE: 'blue', URGENT: 'red', EVENT: 'green', SYSTEM: 'purple', HR: 'orange' };
const TYPE_LABEL: Record<string, string> = { NOTICE: '공지', URGENT: '긴급', EVENT: '행사', SYSTEM: '시스템', HR: '인사' };

const mockNotices = [
  { id: 1, type: 'URGENT', title: '26SS 신상품 입고 안내 - 전 매장 필독', author: '관리자', date: '2026-02-26', views: 42, pinned: true, content: '26SS 신상품이 2월 28일부터 순차 입고됩니다. 각 매장은 진열 준비를 완료해 주세요.\n\n- 입고일: 2월 28일 ~ 3월 5일\n- 대상: 아우터 20종, 상의 25종, 하의 18종\n- 진열 가이드는 별도 배포 예정' },
  { id: 2, type: 'NOTICE', title: '3월 매장 영업시간 변경 안내', author: '관리자', date: '2026-02-25', views: 38, pinned: true, content: '3월 1일부터 매장 영업시간이 변경됩니다.\n\n- 평일: 10:30 ~ 21:00 (기존 10:00 ~ 20:30)\n- 주말: 10:00 ~ 21:30' },
  { id: 3, type: 'EVENT', title: '봄맞이 프로모션 진행 안내 (3/1~3/15)', author: '마케팅팀', date: '2026-02-24', views: 55, pinned: false, content: '봄맞이 프로모션이 3월 1일부터 15일까지 진행됩니다.\n\n할인율:\n- 26SS 신상품: 10% OFF\n- 25FW 이월상품: 30~50% OFF' },
  { id: 4, type: 'HR', title: '2월 급여 지급일 안내', author: '인사팀', date: '2026-02-20', views: 30, pinned: false, content: '2월 급여는 2월 25일(수) 지급 예정입니다.' },
  { id: 5, type: 'SYSTEM', title: '재고관리 시스템 업데이트 안내 (2/27)', author: '시스템관리자', date: '2026-02-19', views: 25, pinned: false, content: '2월 27일 02:00~04:00 시스템 점검이 있습니다.\n해당 시간에는 재고관리 기능 사용이 제한됩니다.' },
  { id: 6, type: 'NOTICE', title: '매장 클린데이 실시 안내 (매주 월요일)', author: '운영팀', date: '2026-02-18', views: 20, pinned: false, content: '매주 월요일 오전 9시~10시는 매장 클린데이입니다.\n전 직원은 매장 정리정돈에 참여해 주세요.' },
  { id: 7, type: 'EVENT', title: 'VIP 고객 초청 행사 안내 (3/20)', author: '마케팅팀', date: '2026-02-15', views: 18, pinned: false, content: '3월 20일 VIP 고객 초청 행사가 강남점에서 진행됩니다.\n참석 대상: VVIP, VIP 등급 고객' },
  { id: 8, type: 'HR', title: '신규 직원 교육 일정 안내', author: '인사팀', date: '2026-02-12', views: 15, pinned: false, content: '3월 신규 입사자 교육이 3월 3일부터 5일까지 진행됩니다.\n장소: 본사 교육실' },
  { id: 9, type: 'NOTICE', title: '반품 처리 절차 변경 안내', author: '운영팀', date: '2026-02-10', views: 28, pinned: false, content: '3월부터 반품 처리 절차가 변경됩니다.\n자세한 내용은 첨부 매뉴얼을 참고하세요.' },
];

export default function NoticeBoardPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const filtered = mockNotices.filter(n => {
    const matchSearch = n.title.includes(search) || n.content.includes(search);
    const matchType = !typeFilter || n.type === typeFilter;
    return matchSearch && matchType;
  });

  // Sort: pinned first, then by date
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.date.localeCompare(a.date);
  });

  const columns = [
    {
      title: '', dataIndex: 'pinned', width: 30,
      render: (v: boolean) => v ? <PushpinOutlined style={{ color: '#ff4d4f' }} /> : null,
    },
    { title: '구분', dataIndex: 'type', width: 70, render: (v: string) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v]}</Tag> },
    {
      title: '제목', dataIndex: 'title', ellipsis: true,
      render: (v: string, r: any) => (
        <a onClick={() => { setSelected(r); setDetailModal(true); }} style={{ fontWeight: r.pinned ? 600 : 400 }}>
          {v}
        </a>
      ),
    },
    { title: '작성자', dataIndex: 'author', width: 100 },
    { title: '작성일', dataIndex: 'date', width: 110 },
    { title: '조회', dataIndex: 'views', width: 60, align: 'right' as const, render: (v: number) => <span style={{ color: '#888' }}>{v}</span> },
  ];

  return (
    <div>
      <PageHeader title="공지사항" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>작성</Button>
      } />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="제목/내용 검색" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select value={typeFilter} onChange={v => setTypeFilter(v)} style={{ width: 120 }}
            options={[{ label: '전체 보기', value: '' }, ...Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))]} /></div>
        <Button onClick={() => {}}>조회</Button>
      </div>

      <Card size="small">
        <Table dataSource={sorted} columns={columns} rowKey="id" size="small"
          scroll={{ y: 'calc(100vh - 240px)' }}
          pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
      </Card>

      <Modal title={selected?.title || ''} open={detailModal} onCancel={() => setDetailModal(false)} width={700} footer={null}>
        {selected && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tag color={TYPE_COLOR[selected.type]}>{TYPE_LABEL[selected.type]}</Tag>
              <span style={{ color: '#888' }}>{selected.author} | {selected.date} | 조회 {selected.views}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14 }}>
              {selected.content}
            </div>
          </div>
        )}
      </Modal>

      <Modal title="공지사항 작성" open={createModal} onCancel={() => setCreateModal(false)} onOk={() => { message.success('공지가 등록되었습니다'); setCreateModal(false); }} okText="등록" width={700}>
        <Form layout="vertical">
          <Form.Item label="구분" required>
            <Select options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item label="제목" required><Input /></Form.Item>
          <Form.Item label="내용" required><Input.TextArea rows={8} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
