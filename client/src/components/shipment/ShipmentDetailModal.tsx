import { Modal, Table, Tag } from 'antd';
import { STATUS_COLORS, STATUS_LABELS } from './ShipmentConstants';

interface Props {
  open: boolean;
  detail: any;
  onClose: () => void;
}

export default function ShipmentDetailModal({ open, detail, onClose }: Props) {
  return (
    <Modal title={`의뢰 상세 - ${detail?.request_no || ''}`} open={open} onCancel={onClose} footer={null} width={700}>
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
