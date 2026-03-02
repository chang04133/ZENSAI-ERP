export const STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SHIPPED: '출고완료', RECEIVED: '입고완료', CANCELLED: '취소',
};

/** 유형에 따른 상태 라벨 반환 */
export function getStatusLabel(status: string, requestType?: string): string {
  if (requestType === '반품') {
    const map: Record<string, string> = { PENDING: '대기', SHIPPED: '반품출고', RECEIVED: '반품수령', CANCELLED: '취소' };
    return map[status] || status;
  }
  if (requestType === '수평이동') {
    const map: Record<string, string> = { PENDING: '대기', SHIPPED: '이동출고', RECEIVED: '이동완료', CANCELLED: '취소' };
    return map[status] || status;
  }
  return STATUS_LABELS[status] || status;
}
