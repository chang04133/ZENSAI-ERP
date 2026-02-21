import { createCrudStore } from '../../core/crud.store';
import { userApi } from './user.api';

export const useUserStore = createCrudStore(userApi);
