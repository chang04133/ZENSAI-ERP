import { createCrudStore } from '../../core/crud.store';
import { partnerApi } from './partner.api';

export const usePartnerStore = createCrudStore(partnerApi);
