import { describe, expect, it } from 'vitest';
import type { LiquidMovementRow } from './movements';
import { applyTankBalances, buildTankHistory, tankHistoryTotals, visibleTankHistory } from './tank-history';

function movement(overrides: Partial<LiquidMovementRow>): LiquidMovementRow {
  return {
    row_key: 'm:1',
    occurred_at: '2026-11-01',
    movement_type: 'tank_transfer',
    source_label: 'HT1',
    dest_label: 'HT2',
    source_tank_id: 1,
    dest_tank_id: 2,
    product_liquid: 'Hearts',
    batch_ref: '',
    volume_gal: 50,
    abv: 70,
    laa_gal: 35,
    user_label: 'Ana',
    reference: 'Transfer 1',
    notes: '',
    ...overrides,
  };
}

const tanks = [
  { id: 1, name: 'HT1' },
  { id: 2, name: 'HT2' },
];

describe('buildTankHistory', () => {
  it('shows a transfer as out of the source tank and into the destination tank', () => {
    const entries = buildTankHistory([movement({})], tanks);
    expect(entries.map((e) => [e.tank_name, e.direction, e.counterpart])).toEqual([
      ['HT1', 'out', 'HT2'],
      ['HT2', 'in', 'HT1'],
    ]);
    expect(entries[0].movement_label).toBe('Tank transfer');
  });

  it('filters to one tank', () => {
    const entries = buildTankHistory([movement({})], tanks, 2);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: 'in', counterpart: 'HT1', what: 'Hearts' });
  });

  it('skips sides that are not tanks', () => {
    const entries = buildTankHistory([
      movement({ row_key: 'cut', movement_type: 'distillation_cut', source_label: 'Still', source_tank_id: null }),
      movement({ row_key: 'bottle', movement_type: 'bottling', dest_label: 'Bottling', dest_tank_id: null }),
    ], tanks);
    expect(entries.map((e) => [e.key, e.direction])).toEqual([
      ['cut:in', 'in'],
      ['bottle:out', 'out'],
    ]);
  });

  it('totals ins and outs and limits the collapsed list', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      movement({ row_key: `m:${i}`, source_tank_id: null, volume_gal: 10 }));
    const entries = buildTankHistory(many, tanks);
    expect(tankHistoryTotals(entries)).toEqual({ in_gal: 120, out_gal: 0 });
    expect(visibleTankHistory(entries, false)).toHaveLength(10);
    expect(visibleTankHistory(entries, true)).toHaveLength(12);
  });
});

describe('applyTankBalances', () => {
  it('shows the tank total and ABV after each in and out, newest matching today', () => {
    const entries = buildTankHistory([
      movement({ row_key: 'draw', occurred_at: '2026-11-03', movement_type: 'still_charge', dest_tank_id: null, dest_label: 'Carl', volume_gal: 20, abv: 60, laa_gal: 12 }),
      movement({ row_key: 'water', occurred_at: '2026-11-02', movement_type: 'tank_dilution', source_tank_id: null, source_label: 'Water', dest_tank_id: 1, volume_gal: 20, abv: 0, laa_gal: 0 }),
      movement({ row_key: 'fill', occurred_at: '2026-11-01', movement_type: 'distillation_cut', source_tank_id: null, source_label: 'Carl', dest_tank_id: 1, volume_gal: 100, abv: 72, laa_gal: 72 }),
    ], tanks, 1);
    const balanced = applyTankBalances(entries, [{ id: 1, volume_gal: 100, abv: 60 }]);
    expect(balanced.map((e) => [e.key, e.after_volume_gal, e.after_abv])).toEqual([
      ['draw:out', 100, 60],
      ['water:in', 120, 60],
      ['fill:in', 100, 72],
    ]);
  });

  it('restores the book reading before a volume set and shows empty tanks as zero', () => {
    const entries = buildTankHistory([
      movement({ row_key: 'set', movement_type: 'tank_volume_set', source_tank_id: 1, dest_tank_id: null, dest_label: 'Volume set', volume_gal: 5, abv: 58.5, laa_gal: 2.925, book_volume_gal: 10, book_abv: 63.5 }),
      movement({ row_key: 'draw', movement_type: 'still_charge', source_tank_id: 1, dest_tank_id: null, volume_gal: 30, abv: 63.5, laa_gal: 19.05 }),
    ], tanks, 1);
    const balanced = applyTankBalances(entries, [{ id: 1, volume_gal: 5, abv: 58.5 }]);
    expect(balanced.map((e) => [e.after_volume_gal, e.after_abv])).toEqual([
      [5, 58.5],
      [10, 63.5],
    ]);
    const emptied = applyTankBalances(buildTankHistory([movement({})], tanks, 1), [{ id: 1, volume_gal: 0, abv: null }]);
    expect(emptied[0]).toMatchObject({ after_volume_gal: 0, after_abv: 0 });
  });
});
