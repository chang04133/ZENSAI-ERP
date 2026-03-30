export const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red', DISCREPANCY: 'orange', REJECTED: 'volcano',
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '수령완료', CANCELLED: '취소', DISCREPANCY: '문제확인중', REJECTED: '거절',
};

/** 유형 + 수신자 여부에 따른 상태 라벨 반환 */
export function getStatusLabel(status: string, requestType?: string, isReceiver?: boolean): string {
  if (requestType === '반품') {
    if (isReceiver) {
      const map: Record<string, string> = { PENDING: '대기', SHIPPED: '반품수령대기', RECEIVED: '반품수령완료', CANCELLED: '취소', DISCREPANCY: '수량불일치' };
      return map[status] || status;
    }
    const map: Record<string, string> = { PENDING: '대기', SHIPPED: '반품출고', RECEIVED: '반품수령', CANCELLED: '취소', DISCREPANCY: '수량불일치' };
    return map[status] || status;
  }
  if (requestType === '수평이동') {
    if (isReceiver) {
      const map: Record<string, string> = { PENDING: '대기', SHIPPED: '수령대기', RECEIVED: '수령완료', CANCELLED: '취소', DISCREPANCY: '수량불일치' };
      return map[status] || status;
    }
    const map: Record<string, string> = { PENDING: '대기', SHIPPED: '이동완료', RECEIVED: '수령완료', CANCELLED: '취소', DISCREPANCY: '수량불일치' };
    return map[status] || status;
  }
  if (requestType === '출고요청') {
    const map: Record<string, string> = { PENDING: '요청중', SHIPPED: '수령대기', RECEIVED: '수령완료', CANCELLED: '취소', DISCREPANCY: '수량불일치', REJECTED: '거절됨' };
    return map[status] || status;
  }
  // 일반 출고
  if (isReceiver) {
    const map: Record<string, string> = { PENDING: '대기', SHIPPED: '수령대기', RECEIVED: '수령완료', CANCELLED: '취소', DISCREPANCY: '수량불일치' };
    return map[status] || status;
  }
  return STATUS_LABELS[status] || status;
}
