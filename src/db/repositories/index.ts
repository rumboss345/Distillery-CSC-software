import { isServerAuthoritative } from '../production-mode';
import { localInventoryRepository } from './local-inventory-repository';
import { masterDataRepository } from './master-data-repository';
import { recipesRepository } from './recipes-repository';
import { liquidInventoryRepository } from './liquid-ledger-repository';
import { productionOrdersRepository } from './production-orders-repository';
import { materialInventoryRepository } from './material-inventory-repository';
import { purchasingRepository } from './purchasing-repository';
import type { InventoryRepository } from './types';

export function getInventoryRepository(): InventoryRepository {
  if (isServerAuthoritative()) {
    throw new Error('Server-authoritative mode requires the production API (Step 1A).');
  }
  return localInventoryRepository;
}

export {
  masterDataRepository,
  recipesRepository,
  liquidInventoryRepository,
  productionOrdersRepository,
  materialInventoryRepository,
  purchasingRepository,
};
export { CostingRepository } from './costing-repository';
export { finishedGoodsRepository } from './finished-goods-repository';
export { barrelAgingRepository } from './barrel-aging-repository';
export { multiLocationRepository } from './multi-location-repository';
export type { InventoryRepository } from './types';
