import { createCrudStore } from '../../core/crud.store';
import { restockApi } from './restock.api';

export const useRestockStore = createCrudStore(restockApi);
