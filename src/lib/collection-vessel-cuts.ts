import type { CutType } from '../types';

/** Cut type of the spirit still in a vessel, or mixed when heads, hearts, and tails share it. */
export type StoredCutType = CutType | 'mixed';

export interface VesselInflow {
  /** Gallons added. Newest inflows are listed first. */
  volumeGal: number;
  cutType: CutType | null;
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

export function collectionVesselCutMixMessage(stored: StoredCutType, incoming: CutType): string {
  if (stored === 'mixed') {
    return 'This collection vessel already holds more than one cut. Empty it before adding heads, hearts, or tails.';
  }
  return `This collection vessel already holds ${stored}. It can take more ${stored} from any run, but not ${incoming}.`;
}
