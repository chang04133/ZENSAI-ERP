import { createCrudStore } from '../../core/crud.store';
import { inventoryApi } from './inventory.api';

export const useInventoryStore = createCrudStore(inventoryApi);
