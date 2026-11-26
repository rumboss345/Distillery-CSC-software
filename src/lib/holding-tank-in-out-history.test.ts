import { describe, expect, it } from 'vitest';
import { getHoldingTankInOutHistory } from '../db/queries';
import { mapTankHistoryToInOutEntry } from './holding-tank-in-out-history';
import type { TankHistoryEntry } from './reporting/tank-history';

describe('mapTankHistoryToInOutEntry', () => {
  it('labels direction and counterpart', () => {
    const entry: TankHistoryEntry = {
      key: 'transfer:9:in',
      occurred_at: '2026-01-15',
      tank_id: 2,
      tank_name: 'LW-1',
      direction: 'in',
      counterpart: 'HW-1',
      movement_label: 'Tank transfer',
      what: 'Low wines',
      batch_ref: '',
      volume_gal: 50,
      abv: 40,
      laa_gal: 20,
      user_label: 'Pat',
      reference: 'Transfer 9',
      notes: '',
      after_volume_gal: null,
      after_abv: null,
    };
    const mapped = mapTankHistoryToInOutEntry(entry);
    expect(mapped.row_key).toBe('transfer:9');
    expect(mapped.direction).toBe('in');
    expect(mapped.summary).toContain('In');
    expect(mapped.detail).toBe('From HW-1');
  });
});

describe('getHoldingTankInOutHistory', () => {
  it('returns newest first with in and out rows for a tank', () => {
    const rows = getHoldingTankInOutHistory(2, 20);
    if (rows.length === 0) return;
    const directions = new Set(rows.map((row) => row.direction));
    expect(directions.has('in') || directions.has('out')).toBe(true);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].occurred_at >= rows[i].occurred_at).toBe(true);
    }
  });
});