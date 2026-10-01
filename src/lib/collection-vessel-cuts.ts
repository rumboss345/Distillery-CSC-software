import type { CutType } from '../types';

/** Cut type of the spirit still in a vessel, or mixed when heads, hearts, and tails share it. */
export type StoredCutType = CutType | 'mixed';

export interface VesselInflow {
  /** Gallons added. Newest inflows are listed first. */
  volumeGal: number;
  cutType: CutType | null;
  /** Spent wash from a distillation, not a spirit cut. */
  stillage?: boolean;
}

/** True when the gallons still in the vessel are stillage and nothing else. */
export function inflowsAreStillageOnly(
  inflowsNewestFirst: VesselInflow[],
  volumeGal: number,
): boolean {
  if (!(volumeGal > 0.05)) return false;
  let left = volumeGal;
  let sawStillage = false;
  let sawOther = false;
  for (const inflow of inflowsNewestFirst) {
    if (left <= 0.05) break;
    if (!(inflow.volumeGal > 0)) continue;
    const take = Math.min(inflow.volumeGal, left);
    if (take > 0.05) {
      if (inflow.stillage) sawStillage = true;
      else sawOther = true;
    }
    left -= inflow.volumeGal;
  }
  if (left > 0.05) return false;
  return sawStillage && !sawOther;
}

/** True when any of the gallons still in the vessel are not stillage. */
export function inflowsIncludeNonStillage(
  inflowsNewestFirst: VesselInflow[],
  volumeGal: number,
): boolean {
  if (!(volumeGal > 0.05)) return false;
  let left = volumeGal;
  for (const inflow of inflowsNewestFirst) {
    if (left <= 0.05) break;
    if (!(inflow.volumeGal > 0)) continue;
    const take = Math.min(inflow.volumeGal, left);
    if (take > 0.05 && !inflow.stillage) return true;
    left -= inflow.volumeGal;
  }
  return false;
}

/**
 * Cut type that still accounts for the gallons in the vessel.
 * An empty vessel is unlocked. Spirit from any run is fine when the cut matches.
 */
export function storedCutTypeFromInflows(
  inflowsNewestFirst: VesselInflow[],
  volumeGal: number,
): StoredCutType | null {
  if (!(volumeGal > 0.05)) return null;

  let left = volumeGal;
  const types = new Set<CutType | 'unknown'>();
  for (const inflow of inflowsNewestFirst) {
    if (left <= 0.05) break;
    if (!(inflow.volumeGal > 0)) continue;
    const take = Math.min(inflow.volumeGal, left);
    if (take > 0.05) types.add(inflow.cutType ?? 'unknown');
    left -= inflow.volumeGal;
  }

  const known = [...types].filter((type): type is CutType => type !== 'unknown');
  if (types.has('unknown')) return 'mixed';
  if (known.length === 1) return known[0];
  if (known.length > 1) return 'mixed';
  return null;
}

export function collectionVesselAcceptsIncomingCut(
  stored: StoredCutType | null,
  incoming: CutType,
): boolean {
  return stored == null || stored === incoming;
}

/** What a collection vessel currently holds, for the process-view label. */
export function collectionVesselContentsLabel(input: {
  volumeGal: number;
  stored: StoredCutType | null;
  stillageGal: number;
}): string | null {
  if (!(input.volumeGal > 0.05)) return null;
  if (input.stored === 'heads' || input.stored === 'hearts' || input.stored === 'tails') {
    return input.stored.charAt(0).toUpperCase() + input.stored.slice(1);
  }
  if (input.stillageGal >= input.volumeGal - 0.05) return 'Stillage';
  if (input.stored === 'mixed') return 'Mixed';
  return null;
}

export function collectionVesselCutMixMessage(stored: StoredCutType, incoming: CutType): string {
  if (stored === 'mixed') {
    return 'This collection vessel already holds more than one cut. Empty it before adding heads, hearts, or tails.';
  }
  return `This collection vessel already holds ${stored}. It can take more ${stored} from any run, but not ${incoming}.`;
}
