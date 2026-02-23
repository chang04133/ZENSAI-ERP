import { Modal, Table, Tag, Button, Timeline, Space } from 'antd';
import { PrinterOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { STATUS_COLORS, STATUS_LABELS } from './ShipmentConstants';

interface Props {
  open: boolean;
  detail: any;
  onClose: () => void;
}

const TIMELINE_STEPS = [
  { status: 'PENDING', label: '의뢰등록', icon: <ClockCircleOutlined />, color: 'gray' },
  { status: 'SHIPPED', label: '출고확인', icon: <SendOutlined />, color: 'blue' },
  { status: 'RECEIVED', label: '수령완료', icon: <CheckCircleOutlined />, color: 'green' },
];

function StatusTimeline({ status }: { status: string }) {
  if (status === 'CANCELLED') {
    return (
      <Timeline items={[
        { color: 'gray', children: '의뢰등록' },
        { color: 'red', dot: <CloseCircleOutlined />, children: <strong>취소됨</strong> },
      ]} />
    );
  }
  const currentIdx = TIMELINE_STEPS.findIndex(s => s.status === status);
  return (
    <Timeline items={TIMELINE_STEPS.map((step, i) => ({
      color: i <= currentIdx ? step.color : 'gray',
      dot: i <= currentIdx ? step.icon : undefined,
      children: <span style={{ fontWeight: i === currentIdx ? 700 : 400 }}>{step.label}</span>,
    }))} />
  );
}

function handlePrint(detail: any) {
  const itemsHtml = (detail.items || []).map((item: any) =>
    `<tr><td>${item.sku || ''}</td><td>${item.product_name || ''}</td><td>${item.color || ''}</td><td>${item.size || ''}</td><td style="text-align:right">${item.request_qty}</td><td style="text-align:right">${item.shipped_qty}</td><td style="text-align:right">${item.received_qty}</td></tr>`,
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>출고의뢰서 - ${detail.request_no}</title>
    <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}th{background:#f5f5f5}h2{margin-bottom:8px}.info{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;font-size:13px}</style>
    </head><body><h2>출고의뢰서 - ${detail.request_no}</h2>
    <div class="info"><div><b>유형:</b> ${detail.request_type}</div><div><b>상태:</b> ${STATUS_LABELS[detail.status]}</div>
    <div><b>출발:</b> ${detail.from_partner_name || '-'}</div><div><b>도착:</b> ${detail.to_partner_name || '-'}</div>
    <div><b>의뢰일:</b> ${detail.request_date ? new Date(detail.request_date).toLocaleDateString('ko-KR') : '-'}</div>
    <div><b>메모:</b> ${detail.memo || '-'}</div></div>
    <table><thead><tr><th>SKU</th><th>상품명</th><th>색상</th><th>사이즈</th><th>요청</th><th>출고</th><th>수령</th></tr></thead><tbody>${itemsHtml}</tbody></table>
    <p style="margin-top:24px;font-size:11px;color:#888">인쇄일시: ${new Date().toLocaleString('ko-KR')}</p>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

export default function ShipmentDetailModal({ open, detail, onClose }: Props) {
  return (
    <Modal
      title={`의뢰 상세 - ${detail?.request_no || ''}`}
      open={open}
      onCancel={onClose}
      width={750}
      footer={detail ? (
        <Button icon={<PrinterOutlined />} onClick={() => handlePrint(detail)}>인쇄</Button>
      ) : null}
    >
      {detail && (
        <div>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><strong>유형:</strong> {detail.request_type}</div>
                <div><strong>상태:</strong> <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag></div>
                <div><strong>출발:</strong> {detail.from_partner_name || '-'}</div>
                <div><strong>도착:</strong> {detail.to_partner_name || '-'}</div>
                <div><strong>의뢰일:</strong> {detail.request_date ? new Date(detail.request_date).toLocaleDateString('ko-KR') : '-'}</div>
                <div><strong>메모:</strong> {detail.memo || '-'}</div>
              </div>
            </div>
            <div style={{ minWidth: 140 }}>
              <StatusTimeline status={detail.status} />
            </div>
          </div>
          {detail.items?.length > 0 ? (
            <Table size="small" dataSource={detail.items} rowKey="item_id" pagination={false}
              columns={[
                { title: 'SKU', dataIndex: 'sku' },
                { title: '상품명', dataIndex: 'product_name' },
                { title: '색상', dataIndex: 'color' },
                { title: '사이즈', dataIndex: 'size' },
                { title: '요청', dataIndex: 'request_qty' },
                { title: '출고', dataIndex: 'shipped_qty' },
                { title: '수령', dataIndex: 'received_qty' },
              ]} />
          ) : <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>등록된 품목이 없습니다.</div>}
        </div>
      )}
    </Modal>
  );
}
