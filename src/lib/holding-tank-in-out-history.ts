import type { TankHistoryEntry } from './reporting/tank-history';
import type { HoldingTankInOutEntry } from '../types';

export function holdingTankInOutKey(entry: Pick<HoldingTankInOutEntry, 'key'>): string {
  return entry.key;
}

function rowKeyParts(historyKey: string): { row_key: string; direction: 'in' | 'out' } {
  if (historyKey.endsWith(':in')) {
    return { row_key: historyKey.slice(0, -3), direction: 'in' };
  }
  if (historyKey.endsWith(':out')) {
    return { row_key: historyKey.slice(0, -4), direction: 'out' };
  }
  return { row_key: historyKey, direction: 'in' };
}

function movementTypeFromRowKey(row_key: string): string {
  const colon = row_key.indexOf(':');
  return colon > 0 ? row_key.slice(0, colon) : 'movement';
}

export function mapTankHistoryToInOutEntry(entry: TankHistoryEntry): HoldingTankInOutEntry {
  const { row_key, direction } = rowKeyParts(entry.key);
  const counterpart = entry.counterpart?.trim() || '—';
  const ref = entry.batch_ref?.trim();
  const summaryParts = [
    direction === 'in' ? 'In' : 'Out',
    entry.movement_label,
    ref || entry.what?.trim() || null,
  ].filter(Boolean);
  const detail = direction === 'in'
    ? `From ${counterpart}`
    : `To ${counterpart}`;

  return {
    key: entry.key,
    row_key,
    direction,
    movement_type: movementTypeFromRowKey(row_key),
    movement_label: entry.movement_label,
    occurred_at: entry.occurred_at,
    volume_gal: entry.volume_gal,
    abv: entry.abv,
    laa_gal: entry.laa_gal,
    summary: summaryParts.join(' · '),
    detail,
    notes: entry.notes?.trim() || undefined,
    counterpart,
    batch_ref: ref || undefined,
    product_liquid: entry.what?.trim() || undefined,
    user_label: entry.user_label?.trim() || undefined,
    reference: entry.reference?.trim() || undefined,
  };
}