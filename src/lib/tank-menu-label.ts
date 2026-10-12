import {
  getCollectionVesselStoredCutType,
  getHoldingTankContents,
  getHoldingTankIntakeHistory,
} from '../db/queries';

/** What is in the tank, without a gallon amount. Null when the tank is empty. */
export function tankContentsPhrase(tankId: number): string | null {
  if (getHoldingTankContents(tankId).volume_gal <= 0.001) return null;
  const intake = getHoldingTankIntakeHistory(tankId, 1)[0]?.summary?.trim();
  if (intake) return intake;
  const cutType = getCollectionVesselStoredCutType(tankId);
  if (cutType === 'mixed') return 'Mixed cuts';
  if (cutType) return cutType.charAt(0).toUpperCase() + cutType.slice(1);
  return 'Spirit';
}

/** Dropdown text: tank name and what it holds. Volumes stay off the menu. */
export function formatTankMenuLabel(name: string, contents: string | null): string {
  const product = contents?.trim();
  return product ? `${name} — ${product}` : `${name} (empty)`;
}

export function tankDropdownLabel(name: string, tankId: number): string {
  return formatTankMenuLabel(name, tankContentsPhrase(tankId));
}
