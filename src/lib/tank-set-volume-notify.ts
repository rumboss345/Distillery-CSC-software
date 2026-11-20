import { isAdminRole, isOwnerRole } from './roles';

export type TankSetVolumeAction = 'set' | 'clear';

export interface TankSetVolumeNotice {
  action: TankSetVolumeAction;
  tankName: string;
  changedBy: string;
  recordedAt?: string;
  volumeGal?: number;
  abv?: number;
  bookVolumeGal?: number;
  bookAbv?: number;
  notes?: string;
}

/** Set volume is owner policy; staff may still save and owners are messaged to review. */
export function tankSetVolumeRequiresOwnerAck(role: string | null | undefined): boolean {
  if (isOwnerRole(role) || isAdminRole(role)) return false;
  return true;
}

export function formatTankSetVolumeOwnerApprovalMessage(notice: TankSetVolumeNotice): string {
  const who = notice.changedBy.trim() || 'A staff member';
  const tank = notice.tankName.trim() || 'a tank';
  if (notice.action === 'clear') {
    const why = notice.notes?.trim() ? ` Reason: ${notice.notes.trim()}` : '';
    return `${who} cleared the on-hand volume reading on ${tank} and returned the tank to production records only.${why} Please review on Tank Transfer or Reports → Volume changes.`;
  }
  const vol = notice.volumeGal != null && Number.isFinite(notice.volumeGal)
    ? `${notice.volumeGal.toFixed(1)} gal`
    : 'a new volume';
  const abv = notice.abv != null && Number.isFinite(notice.abv)
    ? ` at ${notice.abv.toFixed(1)}% ABV`
    : '';
  const book = notice.bookVolumeGal != null && Number.isFinite(notice.bookVolumeGal)
    ? ` (records showed ${notice.bookVolumeGal.toFixed(1)} gal`
      + (notice.bookAbv != null ? ` at ${notice.bookAbv.toFixed(1)}% ABV` : '')
      + ')'
    : '';
  const when = notice.recordedAt?.trim() ? ` Date: ${notice.recordedAt.trim()}.` : '';
  const why = notice.notes?.trim() ? ` Notes: ${notice.notes.trim()}.` : '';
  return `${who} set tank volume on ${tank} to ${vol}${abv}${book}.${when}${why} Please approve or correct if needed.`;
}