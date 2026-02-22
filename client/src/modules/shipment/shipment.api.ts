import { createCrudApi } from '../../core/crud.api';
import { apiFetch } from '../../core/api.client';
import type { ShipmentRequest } from '../../../../shared/types/shipment';

const crud = createCrudApi<ShipmentRequest>('/api/shipments');

export const shipmentApi = {
  ...crud,

  /** 출고수량 일괄 업데이트 */
  updateShippedQty: async (id: number, items: Array<{ variant_id: number; shipped_qty: number }>) => {
    const res = await apiFetch(`/api/shipments/${id}/shipped-qty`, {
      method: 'PUT', body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /** 수령확인 (received_qty 저장 + 상태 RECEIVED + 재고 연동) */
  receive: async (id: number, items: Array<{ variant_id: number; received_qty: number }>) => {
    const res = await apiFetch(`/api/shipments/${id}/receive`, {
      method: 'PUT', body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /** 엑셀 업로드 */
  uploadExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/shipments/excel/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data as { total: number; createdRequests: number; createdItems: number; skipped: number; errors?: string[] };
  },

  /** 엑셀 템플릿 URL */
  templateUrl: '/api/shipments/excel/template',
};
