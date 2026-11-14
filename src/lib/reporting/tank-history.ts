import { MOVEMENT_TYPE_LABELS, type LiquidMovementRow } from './movements';

export const TANK_HISTORY_COLLAPSED_COUNT = 10;

export type TankHistoryDirection = 'in' | 'out';

export interface TankHistoryEntry {
  key: string;
  occurred_at: string;
  tank_id: number;
  tank_name: string;
  direction: TankHistoryDirection;
  /** Where the liquid came from (in) or went to (out). */
  counterpart: string;
  movement_label: string;
  what: string;
  batch_ref: string;
  volume_gal: number;
  abv: number;
  laa_gal: number;
  user_label: string;
  reference: string;
  notes: string;
}

/**
 * Splits liquid movements into one entry per tank side: the tank the liquid
 * left gets an "out" entry and the tank it went into gets an "in" entry.
 * A tank-to-tank transfer therefore shows on both tanks.
 */
export function buildTankHistory(
  movements: LiquidMovementRow[],
  tanks: { id: number; name: string }[],
  tankId: number | null = null,
): TankHistoryEntry[] {
  const names = new Map(tanks.map((t) => [t.id, t.name]));
  const entries: TankHistoryEntry[] = [];
  for (const m of movements) {
    const sides: [TankHistoryDirection, number | null, string][] = [
      ['out', m.source_tank_id, m.dest_label],
      ['in', m.dest_tank_id, m.source_label],
    ];
    for (const [direction, id, counterpart] of sides) {
      if (id == null || !names.has(id)) continue;
      if (tankId != null && id !== tankId) continue;
      entries.push({
        key: `${m.row_key}:${direction}`,
        occurred_at: m.occurred_at,
        tank_id: id,
        tank_name: names.get(id)!,
        direction,
        counterpart,
        movement_label: MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type,
        what: m.product_liquid,
        batch_ref: m.batch_ref,
        volume_gal: m.volume_gal,
        abv: m.abv,
        laa_gal: m.laa_gal,
        user_label: m.user_label,
        reference: m.reference,
        notes: m.notes,
      });
    }
  }
  return entries;
}

export function tankHistoryTotals(entries: TankHistoryEntry[]): { in_gal: number; out_gal: number } {
  let inGal = 0;
  let outGal = 0;
  for (const e of entries) {
    if (e.direction === 'in') inGal += e.volume_gal;
    else outGal += e.volume_gal;
  }
  return { in_gal: Math.round(inGal * 100) / 100, out_gal: Math.round(outGal * 100) / 100 };
}

export function visibleTankHistory(
  entries: TankHistoryEntry[],
  expanded: boolean,
  collapsedCount = TANK_HISTORY_COLLAPSED_COUNT,
): TankHistoryEntry[] {
  return expanded ? entries : entries.slice(0, collapsedCount);
}
