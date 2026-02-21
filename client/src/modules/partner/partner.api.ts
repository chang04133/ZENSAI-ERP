import { createCrudApi } from '../../core/crud.api';
import type { Partner } from '../../../../shared/types/partner';

export const partnerApi = createCrudApi<Partner>('/api/partners');
