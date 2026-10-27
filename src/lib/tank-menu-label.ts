import {
  getCollectionVesselStoredCutType,
  getHoldingTankContents,
  getHoldingTankIntakeHistory,
  holdingTankDistillationContents,
  holdingTankProductName,
} from '../db/queries';

const GENERIC_ON_HAND = /^on hand( cleared)?$/i;

export interface TankContentsEntry {
  kind: string;
  summary?: string | null;
}

/**
 * What the dropdown should name. A gauge reading of "On hand" is not the liquid,
 * so a cut, transfer, or blend already in the history is used instead.
 */
export function preferContentsSummary(
  productName: string | null | undefined,
  entries: TankContentsEntry[],
  cutType: string | null | undefined,
): string {
  const product = productName?.trim();
  if (product) return product;
  for (const entry of entries) {
    const summary = entry.summary?.trim() ?? '';
    if (!summary) continue;
    if (entry.kind === 'opening' && GENERIC_ON_HAND.test(summary)) continue;
    return summary;
  }
  if (cutType === 'mixed') return 'Mixed cuts';
  if (cutType) return cutType.charAt(0).toUpperCase() + cutType.slice(1);
  const opening = entries.find((entry) => entry.kind === 'opening')?.summary?.trim();
  if (opening) return opening;
  return 'Spirit';
}

function tankHistoryPhrase(tankId: number): string | null {
  const phrase = preferContentsSummary(
    null,
    getHoldingTankIntakeHistory(tankId, 12),
    getCollectionVesselStoredCutType(tankId),
  );
  return phrase && phrase !== 'Spirit' ? phrase : null;
}

function originIntakeAbv(tankId: number): number | null {
  for (const entry of getHoldingTankIntakeHistory(tankId, 12)) {
    if (entry.kind === 'stillage') continue;
    if (Number.isFinite(entry.abv) && entry.abv > 0) return entry.abv;
  }
  return null;
}

/** What is in the tank, without a gallon amount. Null when the tank is empty. */
export function tankContentsPhrase(tankId: number): string | null {
  const ledger = getHoldingTankContents(tankId);
  if (!(ledger.volume_gal > 0.001)) return null;
  const product = holdingTankProductName(tankId, ledger.volume_gal);
  if (product) return product;
  const distilled = holdingTankDistillationContents(tankId, ledger.volume_gal);
  if (distilled) return distilled;
  return preferContentsSummary(
    null,
    getHoldingTankIntakeHistory(tankId, 12),
    getCollectionVesselStoredCutType(tankId),
  );
}

/** What the liquid was and the proof it arrived at, even after the tank is emptied. */
export function tankOriginDetail(tankId: number): {
  phrase: string | null;
  currentAbv: number | null;
  previousAbv: number | null;
} {
  const ledger = getHoldingTankContents(tankId);
  const live = tankContentsPhrase(tankId);
  return {
    phrase: live ?? tankHistoryPhrase(tankId),
    currentAbv: ledger.volume_gal > 0.001 && Number.isFinite(ledger.abv) ? ledger.abv : null,
    previousAbv: originIntakeAbv(tankId),
  };
}

/** Dropdown text: tank name, what it holds, and the proof. Gallons are included when moving. */
export function formatTankMenuLabel(
  name: string,
  contents: string | null,
  abv?: number | null,
  volumeGal?: number | null,
): string {
  const product = contents?.trim();
  if (!product) return `${name} (empty)`;
  const parts = [product];
  if (abv != null && Number.isFinite(abv)) parts.push(`${abv.toFixed(1)}% ABV`);
  if (volumeGal != null && Number.isFinite(volumeGal) && volumeGal > 0.001) {
    parts.push(`${volumeGal.toFixed(1)} gal available`);
  }
  return `${name} — ${parts.join(' · ')}`;
}

export function tankDropdownLabel(
  name: string,
  tankId: number,
  options?: { volume?: boolean },
): string {
  const ledger = getHoldingTankContents(tankId);
  if (!(ledger.volume_gal > 0.001)) return formatTankMenuLabel(name, null);
  return formatTankMenuLabel(
    name,
    tankContentsPhrase(tankId),
    ledger.abv,
    options?.volume ? ledger.volume_gal : undefined,
  );
}
