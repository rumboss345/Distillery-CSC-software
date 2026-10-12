import { parseStoredDate } from './date-input';
import { runTypeLabel } from './distillation-run-types';

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
  cutType?: string | null;
  runType?: string | null;
  /** Cut and distillation already resolved for liquid that arrived by transfer. */
  distillationLabel?: string | null;
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

/** One second before a stored time, so a withdrawal is not counted as already gone. */
export function instantBefore(value: string): string {
  const parsed = parseStoredDate(value);
  if (!parsed) return value;
  return new Date(parsed.getTime() - 1000).toISOString();
}

/** Oldest gallons a withdrawal takes. Those are the gallons that leave the tank. */
export function consumeOldestLots(lots: TankLot[], volumeGal: number): TankLot[] {
  const ordered = lots
    .filter((lot) => lot.volumeGal > 0.001)
    .map((lot) => ({ ...lot }))
    .sort((a, b) => storedTime(a.at) - storedTime(b.at));
  let left = volumeGal;
  const taken: TankLot[] = [];
  for (const lot of ordered) {
    if (left <= 0.001) break;
    const take = Math.min(lot.volumeGal, left);
    left -= take;
    if (take > 0.05) taken.push({ ...lot, volumeGal: take });
  }
  return taken;
}

const CUT_LABELS: Record<string, string> = {
  heads: 'Heads',
  hearts: 'Hearts',
  tails: 'Tails',
};

function cutLabel(cutType: string | null | undefined): string | null {
  const cut = cutType?.trim().toLowerCase() ?? '';
  if (!cut) return null;
  return CUT_LABELS[cut] ?? cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** Distillation type, then the cut. A blend name is not a distillation. */
export function distillationLotLabel(lot: Pick<TankLot, 'kind' | 'cutType' | 'runType' | 'distillationLabel'>): string | null {
  const resolved = lot.distillationLabel?.trim();
  if (resolved) return resolved;
  const run = lot.runType?.trim() ? runTypeLabel(lot.runType) : null;
  if (lot.kind === 'stillage') return run ? `${run} · Stillage` : 'Stillage';
  const cut = cutLabel(lot.cutType);
  if (run && cut) return `${run} · ${cut}`;
  return run || cut;
}

/** Distillation and cut for gallons that are not a blend, newest first. */
export function distillationLabelsFromLots(lots: TankLot[]): string | null {
  const ordered = lots
    .filter((lot) => lot.volumeGal > 0.05 && !lot.productName?.trim())
    .sort((a, b) => storedTime(b.at) - storedTime(a.at));
  const unique: string[] = [];
  for (const lot of ordered) {
    const label = distillationLotLabel(lot);
    if (label && !unique.includes(label)) unique.push(label);
  }
  return unique.length > 0 ? unique.join(', ') : null;
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
