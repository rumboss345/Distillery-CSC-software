import type { InventoryCostChange } from '../types';
import { isIsoDate, parseStoredDate } from './date-input';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Moment a production event happened. A date-only event covers the whole day,
 * so a cost changed at any time that day already applies to it.
 */
export function eventMoment(occurredAt: string | null | undefined): number | null {
  const trimmed = occurredAt?.trim() ?? '';
  if (!trimmed) return null;
  const parsed = parseStoredDate(trimmed);
  if (!parsed) return null;
  return isIsoDate(trimmed) ? parsed.getTime() + DAY_MS - 1 : parsed.getTime();
}

/**
 * Unit cost in effect for an item at a moment.
 * `changes` must be oldest first. With no logged change the current cost has always applied.
 * Before the first logged change, the cost it replaced applies.
 */
export function inventoryCostAt(
  currentCost: number | null,
  changes: readonly InventoryCostChange[],
  occurredAt: string | null | undefined,
): number | null {
  if (changes.length === 0) return currentCost;
  const moment = eventMoment(occurredAt);
  if (moment == null) return currentCost;
  let cost: number | null = changes[0].previous_cost;
  for (const change of changes) {
    const changedAt = parseStoredDate(change.changed_at)?.getTime();
    if (changedAt == null || changedAt > moment) break;
    cost = change.new_cost;
  }
  return cost != null && cost >= 0 ? cost : null;
}
