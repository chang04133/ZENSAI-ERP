import { useState } from 'react';
import { Modal, Table, Tag, Button, Timeline, Space, Input, Select, message } from 'antd';
import { PrinterOutlined, CheckCircleOutlined, ClockCircleOutlined, SendOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { STATUS_COLORS, STATUS_LABELS } from './ShipmentConstants';
import { shipmentApi } from '../../modules/shipment/shipment.api';

interface Props {
  open: boolean;
  detail: any;
  onClose: () => void;
  onUpdate?: (updated: any) => void;
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
  if (status === 'DISCREPANCY') {
    return (
      <Timeline items={[
        { color: 'gray', dot: <ClockCircleOutlined />, children: '의뢰등록' },
        { color: 'blue', dot: <SendOutlined />, children: '출고확인' },
        { color: 'orange', dot: <ExclamationCircleOutlined />, children: <strong>수량불일치</strong> },
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

const CARRIERS = [
  { value: 'CJ대한통운', label: 'CJ대한통운' },
  { value: '한진택배', label: '한진택배' },
  { value: '롯데택배', label: '롯데택배' },
  { value: '로젠택배', label: '로젠택배' },
  { value: '우체국택배', label: '우체국택배' },
];

function TrackingSection({ detail, onUpdate }: { detail: any; onUpdate?: (d: any) => void }) {
  const [trackingNo, setTrackingNo] = useState(detail.tracking_number || '');
  const [carrier, setCarrier] = useState(detail.carrier || '');
  const [saving, setSaving] = useState(false);
  const hasTracking = !!detail.tracking_number;

  const handleSave = async () => {
    if (!trackingNo.trim()) { message.warning('송장번호를 입력해주세요.'); return; }
    setSaving(true);
    try {
      const result = await shipmentApi.updateTracking(detail.request_id, {
        tracking_number: trackingNo.trim(), carrier: carrier || undefined,
      });
      message.success(result.notified ? '송장번호 저장 + 알림톡 발송 완료' : '송장번호 저장 완료');
      onUpdate?.(result.data);
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  if (!['SHIPPED', 'RECEIVED', 'DISCREPANCY'].includes(detail.status)) return null;

  return (
    <div style={{ marginTop: 12, padding: '10px 12px', background: '#f0f5ff', borderRadius: 6, border: '1px solid #adc6ff' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#1d39c4' }}>송장정보</div>
      {hasTracking ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13 }}>
          <div><strong>택배사:</strong> {detail.carrier || '-'}</div>
          <div><strong>송장번호:</strong> {detail.tracking_number}</div>
          <div>
            <strong>알림톡:</strong>{' '}
            {detail.tracking_notified
              ? <Tag color="green">발송완료</Tag>
              : <Tag color="default">미발송</Tag>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select
            placeholder="택배사" value={carrier || undefined} onChange={setCarrier}
            options={CARRIERS} style={{ width: 130 }} allowClear
          />
          <Input
            placeholder="송장번호 입력" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)}
            style={{ flex: 1 }} onPressEnter={handleSave}
          />
          <Button type="primary" loading={saving} onClick={handleSave}>저장</Button>
        </div>
      )}
    </div>
  );
}

export default function ShipmentDetailModal({ open, detail, onClose, onUpdate }: Props) {
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
              {detail.is_customer_claim && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff1f0', borderRadius: 6, border: '1px solid #ffa39e' }}>
                  <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 4 }}>고객 클레임/AS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13 }}>
                    <div><strong>유형:</strong> {{ DEFECT: '불량', EXCHANGE: '교환', AS: 'A/S', COMPLAINT: '컴플레인' }[detail.claim_type as string] || detail.claim_type || '-'}</div>
                    <div><strong>고객명:</strong> {detail.customer_name || '-'}</div>
                    <div><strong>연락처:</strong> {detail.customer_phone || '-'}</div>
                    <div><strong>사유:</strong> {detail.claim_reason || '-'}</div>
                  </div>
                </div>
              )}
              <TrackingSection detail={detail} onUpdate={onUpdate} />
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
