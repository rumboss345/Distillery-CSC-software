import { compareStoredDatesDesc } from './date-input';

/** Working pages keep this many finished records. Older ones stay on Reports. */
export const RECENT_COMPLETED_LIMIT = 10;

export function latestCompleted<T>(
  items: T[],
  dateOf: (item: T) => string | null | undefined,
  idOf?: (item: T) => number,
  limit = RECENT_COMPLETED_LIMIT,
): { shown: T[]; total: number; hiddenCount: number } {
  const sorted = [...items].sort((a, b) => {
    const byDate = compareStoredDatesDesc(dateOf(a) ?? '', dateOf(b) ?? '');
    if (byDate !== 0) return byDate;
    if (!idOf) return 0;
    return idOf(b) - idOf(a);
  });
  const shown = sorted.slice(0, Math.max(0, limit));
  return {
    shown,
    total: items.length,
    hiddenCount: Math.max(0, items.length - shown.length),
  };
}
