import { isSpiritLedgerEquipmentType } from './equipment';
import { roundAbv, roundVolume } from './reporting/alcohol-units';

/** Holding tanks, stillage tanks, then collection vessels. */
const SOURCE_TANK_TYPE_ORDER = ['holding_tank', 'stillage_tank', 'collection_vessel'] as const;

/** Spirit-ledger equipment types that are present, in display order. */
export function distillationSourceTypeChoices(equipmentTypes: readonly string[]): string[] {
  const present = new Set(equipmentTypes.filter((type) => isSpiritLedgerEquipmentType(type)));
  return SOURCE_TANK_TYPE_ORDER.filter((type) => present.has(type));
}

/** Types a distillation can charge. Stillage tanks are not a charge source. */
export function distillationChargeTypeChoices(equipmentTypes: readonly string[]): string[] {
  return distillationSourceTypeChoices(equipmentTypes).filter((type) => type !== 'stillage_tank');
}

export function tanksOfEquipmentType<T extends { equipment_type: string }>(
  tanks: readonly T[],
  equipmentType: string,
): T[] {
  if (!equipmentType) return [];
  return tanks.filter((tank) => tank.equipment_type === equipmentType);
}

export interface DistillationTankPull {
  tankId: number;
  volumeGal: number;
  abv: number;
  tankName?: string;
}

/** Gallons and ABV of spirit pulled from one or more tanks. */
export function blendDistillationTankPulls(pulls: readonly DistillationTankPull[]): {
  volumeGal: number;
  abv: number | null;
} {
  let volume = 0;
  let alcohol = 0;
  for (const pull of pulls) {
    if (!(pull.tankId > 0) || !(pull.volumeGal > 0)) continue;
    volume += pull.volumeGal;
    alcohol += pull.volumeGal * (Number.isFinite(pull.abv) ? pull.abv : 0);
  }
  if (!(volume > 0)) return { volumeGal: 0, abv: null };
  return { volumeGal: roundVolume(volume), abv: roundAbv(alcohol / volume) };
}

export function distillationTankPullError(
  pulls: readonly DistillationTankPull[],
  availableGalByTank: ReadonlyMap<number, number>,
): string | null {
  const active = pulls.filter((pull) => pull.tankId > 0);
  if (active.length === 0) return 'Select a source tank to charge from.';
  const seen = new Set<number>();
  for (const pull of active) {
    const name = pull.tankName?.trim() || 'that tank';
    if (seen.has(pull.tankId)) return 'Each tank can be chosen once.';
    seen.add(pull.tankId);
    if (!(pull.volumeGal > 0)) return `Enter the gallons drawn from ${name}.`;
    const available = availableGalByTank.get(pull.tankId);
    if (available != null && pull.volumeGal > available + 0.01) {
      return `Only ${available.toFixed(1)} gal available in ${name}.`;
    }
  }
  return null;
}

export function distillationSourceSummary(names: readonly string[]): string {
  const labels = names.map((name) => name.trim()).filter(Boolean);
  return labels.join(' + ');
}

/**
 * Keep the tanks the user chose, but draw only `targetGal` of spirit.
 * Extra gallons already entered are left in the later tanks. If the entered
 * pulls are short of the target, the remainder comes from those same tanks
 * up to the gallons still available.
 */
export function fitDistillationTankPulls(
  pulls: readonly DistillationTankPull[],
  targetGal: number,
  availableGalByTank?: ReadonlyMap<number, number>,
): DistillationTankPull[] {
  const active = pulls.filter((pull) => pull.tankId > 0 && pull.volumeGal > 0);
  if (active.length === 0 || !(targetGal > 0)) return [];
  let remaining = roundVolume(targetGal);
  const fitted: DistillationTankPull[] = [];
  const take = (pull: DistillationTankPull, wanted: number) => {
    const already = fitted.find((row) => row.tankId === pull.tankId)?.volumeGal ?? 0;
    const cap = availableGalByTank?.get(pull.tankId) ?? pull.volumeGal;
    return roundVolume(Math.min(Math.max(0, wanted), Math.max(0, cap - already), remaining));
  };
  for (const pull of active) {
    if (!(remaining > 0)) break;
    const volumeGal = take(pull, pull.volumeGal);
    if (!(volumeGal > 0)) continue;
    fitted.push({ ...pull, volumeGal });
    remaining = roundVolume(remaining - volumeGal);
  }
  if (remaining > 0.01) {
    for (const pull of active) {
      if (!(remaining > 0)) break;
      const extra = take(pull, remaining);
      if (!(extra > 0)) continue;
      const existing = fitted.find((row) => row.tankId === pull.tankId);
      if (existing) existing.volumeGal = roundVolume(existing.volumeGal + extra);
      else fitted.push({ ...pull, volumeGal: extra });
      remaining = roundVolume(remaining - extra);
    }
  }
  return fitted;
}
