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

/** Set volume applies only after owner approval for roles below owner/admin. */
export function tankSetVolumeRequiresOwnerAck(role: string | null | undefined): boolean {
  if (isOwnerRole(role) || isAdminRole(role)) return false;
  return true;
}

export function formatTankSetVolumeOwnerApprovalMessage(
  notice: TankSetVolumeNotice,
  requestId?: number,
): string {
  const who = notice.changedBy.trim() || 'A staff member';
  const tank = notice.tankName.trim() || 'a tank';
  const ref = requestId ? ` Request #${requestId}.` : '';
  const where = ' Approve or reject on Tank Transfer → Pending set volume.';
  if (notice.action === 'clear') {
    const why = notice.notes?.trim() ? ` Reason: ${notice.notes.trim()}.` : '';
    return `${who} asked to clear the on-hand volume reading on ${tank}.${why} The tank is unchanged until you approve.${ref}${where}`;
  }
  const vol = notice.volumeGal != null && Number.isFinite(notice.volumeGal)
    ? `${notice.volumeGal.toFixed(1)} gal`
    : 'a new volume';
  const abv = notice.abv != null && Number.isFinite(notice.abv)
    ? ` at ${notice.abv.toFixed(1)}% ABV`
    : '';
  const book = notice.bookVolumeGal != null && Number.isFinite(notice.bookVolumeGal)
    ? ` (records show ${notice.bookVolumeGal.toFixed(1)} gal`
      + (notice.bookAbv != null ? ` at ${notice.bookAbv.toFixed(1)}% ABV` : '')
      + ')'
    : '';
  const when = notice.recordedAt?.trim() ? ` Reading date: ${notice.recordedAt.trim()}.` : '';
  const why = notice.notes?.trim() ? ` Notes: ${notice.notes.trim()}.` : '';
  return `${who} asked to set ${tank} to ${vol}${abv}${book}.${when}${why} Nothing has changed on the tank yet.${ref}${where}`;
}