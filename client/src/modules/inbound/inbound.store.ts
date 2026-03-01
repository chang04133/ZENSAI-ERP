import { createCrudStore } from '../../core/crud.store';
import { inboundApi } from './inbound.api';

export const useInboundStore = createCrudStore(inboundApi);
