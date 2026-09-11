import { isServerAuthoritative } from '../production-mode';
import { localInventoryRepository } from './local-inventory-repository';
import { masterDataRepository } from './master-data-repository';
import { recipesRepository } from './recipes-repository';
import type { InventoryRepository } from './types';

export function getInventoryRepository(): InventoryRepository {
  if (isServerAuthoritative()) {
    throw new Error('Server-authoritative mode requires the production API (Step 1A).');
  }
  return localInventoryRepository;
}

export { masterDataRepository, recipesRepository };
export type { InventoryRepository } from './types';
