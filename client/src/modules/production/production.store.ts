import { createCrudStore } from '../../core/crud.store';
import { productionApi } from './production.api';

export const useProductionStore = createCrudStore(productionApi);
