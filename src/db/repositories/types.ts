import type { InventoryItem } from '../../types';

/** Repository abstraction — UI calls repositories, not sql.js directly (cutover-safe). */
export interface InventoryRepository {
  listItems(): InventoryItem[];
}
