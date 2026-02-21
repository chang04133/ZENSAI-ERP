import { createCrudStore } from '../../core/crud.store';
import { shipmentApi } from './shipment.api';

export const useShipmentStore = createCrudStore(shipmentApi);
