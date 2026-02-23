import { Modal, Table, InputNumber, Alert } from 'antd';

interface Props {
  open: boolean;
  detail: any;
  qtys: Record<number, number>;
  onQtyChange: (variantId: number, qty: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  alertMessage?: string;
  okText?: string;
}

export default function ReceivedQtyModal({
  open, detail, qtys, onQtyChange, onConfirm, onCancel,
  title = '수령확인',
  alertMessage = '수령한 실제 수량을 입력하세요. 확인 시 도착지 재고가 증가합니다.',
  okText = '수령확인',
}: Props) {
  return (
    <Modal title={title} open={open} onCancel={onCancel} onOk={onConfirm} okText={okText} cancelText="취소" width={650}>
      <Alert message={alertMessage} type="info" showIcon style={{ marginBottom: 16 }} />
      {detail && (
        <>
          <div style={{ marginBottom: 12, padding: 8, background: '#f5f5f5', borderRadius: 6 }}>
            <strong>출발:</strong> {detail.from_partner_name} → <strong>도착:</strong> {detail.to_partner_name}
          </div>
          <Table size="small" dataSource={detail.items || []} rowKey="variant_id" pagination={false}
            columns={[
              { title: 'SKU', dataIndex: 'sku', width: 140 },
              { title: '상품명', dataIndex: 'product_name' },
              { title: '출고수량', dataIndex: 'shipped_qty', width: 80 },
              { title: '수령수량', key: 'received', width: 120, render: (_: any, record: any) => (
                <InputNumber min={0} max={record.shipped_qty} value={qtys[record.variant_id] || 0}
                  onChange={(v) => onQtyChange(record.variant_id, v || 0)} style={{ width: '100%' }} />
              )},
            ]} />
        </>
      )}
    </Modal>
  );
}
