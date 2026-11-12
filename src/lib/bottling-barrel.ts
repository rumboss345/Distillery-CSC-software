import { normalizeBottlingStatus, totalVolumeGal, type BottlingLineAmount } from './bottling-lines';
import { localIsoDate } from './planned-event-date';

/** Gallons drawn from a barrel once a bottling run leaves planned. */
export function barrelBottlingDrawGal(
  status: string | null | undefined,
  bottledVolumeGal: number | null | undefined,
): number {
  if (normalizeBottlingStatus(status) === 'planned') return 0;
  const gallons = bottledVolumeGal ?? 0;
  return gallons > 0.001 ? gallons : 0;
}

export function bottledVolumeFromBottlingLines(lines: BottlingLineAmount[]): number | null {
  const volume = totalVolumeGal(lines.filter((line) => line.bottle_count > 0 && line.bottle_size_ml > 0));
  return volume > 0.001 ? volume : null;
}

/** Headroom before restore on edit: same barrel adds back the previous draw. */
export function barrelBottlingHeadroomGal(
  currentVolumeGal: number,
  previousDrawGal: number,
  sameBarrelAsBefore: boolean,
): number {
  const restored = sameBarrelAsBefore ? currentVolumeGal + Math.max(0, previousDrawGal) : currentVolumeGal;
  return Math.max(0, restored);
}

export function barrelVolumeAfterRestore(currentVolumeGal: number, restoreGal: number): number {
  return Math.round((currentVolumeGal + restoreGal) * 1000) / 1000;
}

export function barrelVolumeAfterDraw(currentVolumeGal: number, drawGal: number): number {
  return Math.round((currentVolumeGal - drawGal) * 1000) / 1000;
}

export function barrelStatusAfterVolume(volumeGal: number): 'aging' | 'empty' {
  return volumeGal <= 0.01 ? 'empty' : 'aging';
}

/** Aging time on the floor plan is based on fill_date; zero it when the barrel is emptied. */
export function barrelFillDateWhenEmptied(): string {
  return localIsoDate();
}

export function barrelFillDateAfterSoleraTop(
  volumeBeforeGal: number,
  existingFillDate: string,
): string {
  return volumeBeforeGal <= 0.01 ? barrelFillDateWhenEmptied() : existingFillDate;
}
