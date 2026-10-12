import {
  getCollectionVesselStoredCutType,
  getHoldingTankContents,
  getHoldingTankIntakeHistory,
  holdingTankProductName,
} from '../db/queries';

/** What is in the tank, without a gallon amount. Null when the tank is empty. */
export function tankContentsPhrase(tankId: number): string | null {
  if (getHoldingTankContents(tankId).volume_gal <= 0.001) return null;
  const product = holdingTankProductName(tankId);
  if (product) return product;
  const intake = getHoldingTankIntakeHistory(tankId, 1)[0]?.summary?.trim();
  if (intake) return intake;
  const cutType = getCollectionVesselStoredCutType(tankId);
  if (cutType === 'mixed') return 'Mixed cuts';
  if (cutType) return cutType.charAt(0).toUpperCase() + cutType.slice(1);
  return 'Spirit';
}

/** Dropdown text: tank name, what it holds, and the proof. Gallons stay off the menu. */
export function formatTankMenuLabel(name: string, contents: string | null, abv?: number | null): string {
  const product = contents?.trim();
  if (!product) return `${name} (empty)`;
  const proof = abv != null && Number.isFinite(abv) ? `${abv.toFixed(1)}% ABV` : null;
  return proof ? `${name} — ${product} · ${proof}` : `${name} — ${product}`;
}

export function tankDropdownLabel(name: string, tankId: number): string {
  const ledger = getHoldingTankContents(tankId);
  if (!(ledger.volume_gal > 0.001)) return formatTankMenuLabel(name, null);
  return formatTankMenuLabel(name, tankContentsPhrase(tankId), ledger.abv);
}
