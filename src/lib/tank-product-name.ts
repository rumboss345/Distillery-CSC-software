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

export interface TankLot {
  at: string;
  volumeGal: number;
  kind: 'cut' | 'transfer' | 'blend' | 'stillage' | 'opening' | 'return';
  productName?: string | null;
  sourceTankId?: number | null;
}

export interface TankWithdrawal {
  at: string;
  volumeGal: number;
}

function storedTime(value: string): number {
  return parseStoredDate(value)?.getTime() ?? 0;
}

/**
 * Gallons still in the tank. Withdrawals take the oldest liquid first,
 * so a blend that has already left does not stay on the label.
 */
export function applyTankWithdrawals(ins: TankLot[], outs: TankWithdrawal[]): TankLot[] {
  const lots = ins.filter((lot) => lot.volumeGal > 0.001).map((lot) => ({ ...lot }));
  lots.sort((a, b) => storedTime(a.at) - storedTime(b.at));
  const removals = outs
    .filter((out) => out.volumeGal > 0.001)
    .map((out) => ({ ...out }))
    .sort((a, b) => storedTime(a.at) - storedTime(b.at));

  const consume = (volumeGal: number, onlyLotsAlreadyThere: boolean, at: string) => {
    let left = volumeGal;
    const cutoff = storedTime(at);
    for (const lot of lots) {
      if (left <= 0.001) break;
      if (onlyLotsAlreadyThere && storedTime(lot.at) > cutoff) continue;
      if (lot.volumeGal <= 0.001) continue;
      const take = Math.min(lot.volumeGal, left);
      lot.volumeGal -= take;
      left -= take;
    }
    return left;
  };

  for (const out of removals) {
    const leftover = consume(out.volumeGal, true, out.at);
    if (leftover > 0.001) consume(leftover, false, out.at);
  }
  return lots.filter((lot) => lot.volumeGal > 0.05);
}

/** Product names for blend lots that still have gallons, newest first. */
export function productNamesFromRemainingLots(lots: TankLot[]): string | null {
  const named = lots
    .filter((lot) => lot.volumeGal > 0.05 && lot.productName?.trim())
    .sort((a, b) => storedTime(b.at) - storedTime(a.at));
  const unique: string[] = [];
  for (const lot of named) {
    const name = lot.productName?.trim() ?? '';
    if (name && !unique.includes(name)) unique.push(name);
  }
  return unique.length > 0 ? unique.join(' · ') : null;
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
