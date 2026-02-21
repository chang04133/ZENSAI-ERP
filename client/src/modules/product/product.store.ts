import { createCrudStore } from '../../core/crud.store';
import { productApi } from './product.api';

export const useProductStore = createCrudStore(productApi);
