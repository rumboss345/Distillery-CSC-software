import { parseStoredDate } from './date-input';

/** How many tanks a transfer chain may cross while looking up a blend name. */
export const TANK_PRODUCT_WALK_LIMIT = 8;

export interface TankProductIntake {
  kind: 'cut' | 'transfer' | 'blend' | 'stillage' | 'opening';
  occurredAt: string;
  productName?: string | null;
  sourceTankId?: number | null;
}

/** True when an intake happened at or before the moment liquid was transferred. */
export function intakeAtOrBefore(occurredAt: string, asOf: string): boolean {
  const occurred = parseStoredDate(occurredAt)?.getTime();
  const cutoff = parseStoredDate(asOf)?.getTime();
  if (occurred == null || cutoff == null) return occurredAt <= asOf;
  return occurred <= cutoff;
}

/**
 * Product name for the liquid these intakes describe (newest first).
 * The newest blend names the tank. Older blends stay in the history and are not added on.
 * A transfer asks the caller for the source tank's name at that time.
 * A cut, stillage, or opening balance does not use an older blend.
 */
export function productNameFromIntakes(
  entriesNewestFirst: TankProductIntake[],
  resolveTransfer: (sourceTankId: number, occurredAt: string) => string | null,
): string | null {
  const newest = entriesNewestFirst[0];
  if (!newest) return null;
  if (newest.kind === 'blend') {
    const name = newest.productName?.trim() ?? '';
    return name || null;
  }
  if (newest.kind === 'transfer' && newest.sourceTankId) {
    return resolveTransfer(newest.sourceTankId, newest.occurredAt);
  }
  return null;
}
