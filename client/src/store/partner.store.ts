import { create } from 'zustand';
import { getPartnersApi } from '../api/partner.api';

interface Partner {
  partner_code: string;
  partner_name: string;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  contact: string | null;
  partner_type: string;
  is_active: boolean;
}

interface PartnerState {
  partners: Partner[];
  total: number;
  loading: boolean;
  fetchPartners: (params?: Record<string, string>) => Promise<void>;
}

export const usePartnerStore = create<PartnerState>((set) => ({
  partners: [],
  total: 0,
  loading: false,
  fetchPartners: async (params) => {
    set({ loading: true });
    try {
      const result = await getPartnersApi(params);
      set({ partners: result.data, total: result.total });
    } finally {
      set({ loading: false });
    }
  },
}));
