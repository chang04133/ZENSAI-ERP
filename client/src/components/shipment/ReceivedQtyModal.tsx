import { useMemo } from 'react';
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
  confirmLoading?: boolean;
  readOnly?: boolean;
}

export default function ReceivedQtyModal({
  open, detail, qtys, onQtyChange, onConfirm, onCancel,
  title = '수령확인',
  alertMessage = '수령한 실제 수량을 입력하세요. 확인 시 도착지 재고가 증가합니다.',
  okText = '수령확인',
  confirmLoading = false,
  readOnly = false,
}: Props) {
  const hasMismatch = useMemo(() => {
    if (!detail?.items) return false;
    return detail.items.some((item: any) => {
      const recv = qtys[item.variant_id] ?? 0;
      return recv !== item.shipped_qty;
    });
  }, [detail, qtys]);

  const effectiveOkText = hasMismatch ? '수량불일치 신고' : okText;

  return (
    <Modal title={title} open={open} onCancel={onCancel} onOk={onConfirm}
      okText={effectiveOkText} cancelText="닫기" width={650} confirmLoading={confirmLoading}
      okButtonProps={hasMismatch ? { style: { background: '#fa8c16', borderColor: '#fa8c16' } } : undefined}
    >
      <Alert message={alertMessage} type="info" showIcon style={{ marginBottom: 12 }} />
      {hasMismatch && (
        <Alert
          message="출고수량과 수령수량이 다릅니다. 확인 시 '수량불일치' 상태로 전환되며, 관리자가 최종 처리합니다."
          type="warning" showIcon style={{ marginBottom: 12 }}
        />
      )}
      {detail && (
        <>
          <div style={{ marginBottom: 12, padding: 8, background: '#f5f5f5', borderRadius: 6 }}>
            <strong>의뢰번호:</strong> {detail.request_no || '-'} &nbsp;|&nbsp;
            <strong>유형:</strong> {detail.request_type || '-'} &nbsp;|&nbsp;
            <strong>출발:</strong> {detail.from_partner_name} → <strong>도착:</strong> {detail.to_partner_name}
            {detail.request_date && <> &nbsp;|&nbsp; <strong>요청일:</strong> {detail.request_date}</>}
          </div>
          <Table size="small" dataSource={detail.items || []} rowKey="variant_id" pagination={false}
            columns={[
              { title: 'SKU', dataIndex: 'sku', width: 120 },
              { title: '상품명', dataIndex: 'product_name', ellipsis: true },
              { title: '색상', dataIndex: 'color', width: 60 },
              { title: '사이즈', dataIndex: 'size', width: 60 },
              { title: '출고수량', dataIndex: 'shipped_qty', width: 70 },
              { title: '수령수량', key: 'received', width: 120, render: (_: any, record: any) => {
                const recv = qtys[record.variant_id] ?? 0;
                const mismatch = recv !== record.shipped_qty;
                return (
                  <InputNumber min={0} value={recv}
                    onChange={(v) => onQtyChange(record.variant_id, v || 0)}
                    disabled={readOnly}
                    style={{ width: '100%', ...(mismatch ? { borderColor: '#fa8c16' } : {}) }}
                    status={mismatch ? 'warning' : undefined}
                  />
                );
              }},
            ]} />
        </>
      )}
    </Modal>
  );
}
