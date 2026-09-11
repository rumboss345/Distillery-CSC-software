import { getInventoryItems } from '../queries';
import type { InventoryRepository } from './types';

export const localInventoryRepository: InventoryRepository = {
  listItems: () => getInventoryItems(),
};
