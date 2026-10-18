import { describe, expect, it } from 'vitest';
import { formatTankVolumeVariance } from '../tank-volume-variance';
import {
  VOLUME_CHANGE_KINDS,
  describeWateredDownChange,
  formatVolumeVarianceAbv,
  groupVolumeChanges,
  totalVolumeVarianceAbv,
  totalVolumeVarianceGal,
  type VolumeChangeRow,
} from './volume-changes';

function row(partial: Partial<VolumeChangeRow> & Pick<VolumeChangeRow, 'key' | 'kind'>): VolumeChangeRow {
  return {
    occurred_at: '2026-10-01',
    place: 'Tank',
    change: 'change',
    why: 'why',
    who: 'who',
    gallons: null,
    abvPoints: null,
    ...partial,
  };
}

describe('watering down', () => {
  it('keeps the alcohol and records the water as a blend, not a loss', () => {
    const described = describeWateredDownChange({
      spirit_volume_gal: 10,
      spirit_abv: 80,
      water_gal: 12,
      finished_volume_gal: 20,
      finished_abv: 40,
    });
    expect(described.change).toContain('Alcohol stays 8.00 gal');
    expect(described.change).toContain('Blended 12.00 gal water');
    expect(described.why).toMatch(/not lost/);
    expect(described.gallons).toBe(10);
    const rows = [
      row({
        key: 'water',
        kind: VOLUME_CHANGE_KINDS.wateredDown,
        gallons: described.gallons,
        abvPoints: null,
      }),
      row({ key: 'loss', kind: VOLUME_CHANGE_KINDS.distillation, gallons: -1.5, abvPoints: -8 }),
    ];
    expect(totalVolumeVarianceGal(rows)).toBe(-1.5);
    expect(totalVolumeVarianceAbv(rows)).toBe(-8);
  });
});

describe('volume change groups', () => {
  it('groups by kind in a fixed order and totals the gallons', () => {
    const groups = groupVolumeChanges([
      row({
        key: 'loss-new',
        kind: VOLUME_CHANGE_KINDS.distillation,
        occurred_at: '2026-10-08',
        gallons: -1.5,
      }),
      row({
        key: 'set-old',
        kind: VOLUME_CHANGE_KINDS.setVolume,
        occurred_at: '2026-10-02',
        gallons: -0.4,
      }),
      row({
        key: 'set-new',
        kind: VOLUME_CHANGE_KINDS.setVolume,
        occurred_at: '2026-10-07',
        gallons: 1.25,
      }),
      row({
        key: 'left',
        kind: VOLUME_CHANGE_KINDS.leftovers,
        gallons: 3,
      }),
      row({
        key: 'sent',
        kind: VOLUME_CHANGE_KINDS.bottlingToTank,
        gallons: 2.5,
      }),
    ]);

    expect(groups.map((group) => group.kind)).toEqual([
      VOLUME_CHANGE_KINDS.leftovers,
      VOLUME_CHANGE_KINDS.setVolume,
      VOLUME_CHANGE_KINDS.bottlingToTank,
      VOLUME_CHANGE_KINDS.distillation,
    ]);
    expect(groups[1].rows.map((entry) => entry.key)).toEqual(['set-new', 'set-old']);
    expect(groups[0].totalLabel).toBe('3.00 gal');
    expect(groups[1].totalLabel).toBe(formatTankVolumeVariance(0.85));
    expect(groups[2].totalLabel).toBe('2.50 gal sent');
    expect(groups[3].totalLabel).toBe(formatTankVolumeVariance(-1.5));
  });

  it('counts a kind that has no gallon amount', () => {
    const groups = groupVolumeChanges([
      row({ key: 'blend', kind: VOLUME_CHANGE_KINDS.blend, gallons: null }),
    ]);
    expect(groups[0].totalLabel).toBe('1 change');
  });

  it('adds set volume, bottling, blend, and distillation into the summary total', () => {
    const rows = [
      row({ key: 'set', kind: VOLUME_CHANGE_KINDS.setVolume, gallons: 1.25 }),
      row({ key: 'bottle', kind: VOLUME_CHANGE_KINDS.bottlingVariance, gallons: -0.4 }),
      row({ key: 'blend', kind: VOLUME_CHANGE_KINDS.blend, gallons: 0.2 }),
      row({ key: 'loss', kind: VOLUME_CHANGE_KINDS.distillation, gallons: -1.5 }),
      row({ key: 'left', kind: VOLUME_CHANGE_KINDS.leftovers, gallons: 10 }),
      row({ key: 'sent', kind: VOLUME_CHANGE_KINDS.bottlingToTank, gallons: 4 }),
      row({ key: 'water', kind: VOLUME_CHANGE_KINDS.wateredDown, gallons: 12, abvPoints: -20 }),
    ];
    expect(totalVolumeVarianceGal(rows)).toBe(-0.45);
    expect(formatTankVolumeVariance(totalVolumeVarianceGal(rows))).toBe('-0.45 gal');
  });

  it('adds set-volume and blend ABV into the summary and leaves tank returns out', () => {
    const rows = [
      row({ key: 'set', kind: VOLUME_CHANGE_KINDS.setVolume, gallons: 0.2, abvPoints: 1.5 }),
      row({ key: 'blend', kind: VOLUME_CHANGE_KINDS.blend, gallons: null, abvPoints: -0.4 }),
      row({ key: 'sent', kind: VOLUME_CHANGE_KINDS.bottlingToTank, gallons: 4, abvPoints: 8 }),
      row({ key: 'left', kind: VOLUME_CHANGE_KINDS.leftovers, gallons: 1, abvPoints: 3 }),
    ];
    expect(totalVolumeVarianceAbv(rows)).toBeCloseTo(1.1, 5);
    expect(formatVolumeVarianceAbv(totalVolumeVarianceAbv(rows))).toBe('+1.1% ABV');
    expect(formatVolumeVarianceAbv(0)).toBe('0.0% ABV');
    expect(formatVolumeVarianceAbv(-0.25)).toBe('-0.3% ABV');
    const setGroup = groupVolumeChanges(rows).find((group) => group.kind === VOLUME_CHANGE_KINDS.setVolume);
    expect(setGroup?.totalLabel).toBe('+0.20 gal, +1.5% ABV');
  });

  it('includes the ABV of alcohol left in the stillage in the summary', () => {
    const rows = [
      row({ key: 'set', kind: VOLUME_CHANGE_KINDS.setVolume, gallons: 0.2, abvPoints: 1.5 }),
      row({ key: 'loss', kind: VOLUME_CHANGE_KINDS.distillation, gallons: -7.2, abvPoints: -8 }),
    ];
    expect(totalVolumeVarianceGal(rows)).toBeCloseTo(-7, 5);
    expect(totalVolumeVarianceAbv(rows)).toBeCloseTo(-6.5, 5);
    expect(formatVolumeVarianceAbv(totalVolumeVarianceAbv(rows))).toBe('-6.5% ABV');
  });
});
