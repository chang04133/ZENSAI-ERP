import { createCrudStore } from '../../core/crud.store';
import { materialApi } from './material.api';

export const useMaterialStore = createCrudStore(materialApi);
