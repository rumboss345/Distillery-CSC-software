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
  /** Volume sets only: the tank reading before it was set. */
  book_volume_gal?: number;
  book_abv?: number;
  /** Tank total after this in or out. Null until balances are applied. */
  after_volume_gal: number | null;
  after_abv: number | null;
}

const TANK_EMPTY_GAL = 0.05;

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
        book_volume_gal: m.book_volume_gal,
        book_abv: m.book_abv,
        after_volume_gal: null,
        after_abv: null,
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

function roundBalance(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Tank total and ABV after each entry. Walks back from what each tank holds
 * now, so the newest entry matches the tank's current reading. Entries must
 * be the full history for those tanks, newest first. A volume set restores
 * the reading the tank had before it was set.
 */
export function applyTankBalances(
  entries: TankHistoryEntry[],
  current: { id: number; volume_gal: number; abv: number | null }[],
): TankHistoryEntry[] {
  const state = new Map(current.map((t) => {
    const volume = Math.max(0, t.volume_gal);
    return [t.id, { volume, laa: volume * Math.max(0, t.abv ?? 0) / 100 }];
  }));
  return entries.map((e) => {
    const tank = state.get(e.tank_id) ?? { volume: 0, laa: 0 };
    const empty = tank.volume <= TANK_EMPTY_GAL;
    const after = {
      ...e,
      after_volume_gal: empty ? 0 : roundBalance(tank.volume),
      after_abv: empty ? 0 : roundBalance((tank.laa / tank.volume) * 100),
    };
    let volume: number;
    let laa: number;
    if (e.book_volume_gal != null) {
      volume = e.book_volume_gal;
      laa = e.book_volume_gal * (e.book_abv ?? 0) / 100;
    } else {
      const sign = e.direction === 'in' ? -1 : 1;
      volume = tank.volume + sign * e.volume_gal;
      laa = tank.laa + sign * e.laa_gal;
    }
    state.set(e.tank_id, { volume: Math.max(0, volume), laa: Math.max(0, laa) });
    return after;
  });
}
