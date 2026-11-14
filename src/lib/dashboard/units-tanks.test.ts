import { describe, expect, it } from 'vitest';
import {
  formatPureAlcoholInUnit,
  formatVolumeInUnit,
  imperialGalFromUsGal,
  litersFromUsGal,
  LITERS_PER_IMPERIAL_GALLON,
  LITERS_PER_US_GALLON,
  usGalFromLiters,
  volumeInUnit,
} from '../reporting/alcohol-units';
import { buildTankStatusRows, nextActionFor, type TankStatusSource } from './tanks';

describe('display units', () => {
  it('uses the legal gallon definitions', () => {
    expect(LITERS_PER_US_GALLON).toBeCloseTo(3.785411784, 9);
    expect(LITERS_PER_IMPERIAL_GALLON).toBe(4.54609);
  });

  it('converts US gallons for display without changing the record', () => {
    expect(litersFromUsGal(100)).toBeCloseTo(378.54, 2);
    expect(usGalFromLiters(litersFromUsGal(42))).toBeCloseTo(42, 9);
    expect(imperialGalFromUsGal(100)).toBeCloseTo(83.27, 2);
    expect(volumeInUnit(10, 'us_gal')).toBe(10);
    expect(formatVolumeInUnit(100, 'l')).toBe('378.5 L');
    expect(formatPureAlcoholInUnit(1, 'l')).toBe('3.79 L pure alcohol');
  });
});

function source(overrides: Partial<TankStatusSource>): TankStatusSource {
  return {
    id: 1,
    name: 'Tank 1',
    equipment_type: 'holding_tank',
    status: 'available',
    capacity_gal: 500,
    maintenance_status: null,
    volume_gal: 0,
    abv: null,
    contents: '',
    batch_number: null,
    mash_batch_id: null,
    mash_status: null,
    latest_brix: null,
    still_run_status: null,
    holds_blend: false,
    last_measured_at: null,
    ...overrides,
  };
}

describe('tank status', () => {
  it('works out the next step only from records', () => {
    expect(nextActionFor(source({ maintenance_status: 'broken' }), 2).label).toBe('Repair before use');
    expect(nextActionFor(source({ status: 'cleaning' }), 2).label).toBe('Clean and mark clean');
    expect(nextActionFor(source({ volume_gal: 510 }), 2).tone).toBe('urgent');
    expect(nextActionFor(source({ volume_gal: 200, holds_blend: true }), 2).href).toBe('/bottling?tank=1');
    expect(nextActionFor(source({ volume_gal: 0 }), 2).tone).toBe('idle');
  });

  it('sends a fermenter to distillation once it reaches the ready Brix', () => {
    const fermenter = source({ equipment_type: 'fermenter', mash_batch_id: 4, mash_status: 'fermenting', latest_brix: 6 });
    expect(nextActionFor(fermenter, 2).href).toBe('/fermentation?wash=4&logsEquipment=1');
    expect(nextActionFor({ ...fermenter, latest_brix: 1.5 }, 2).label).toBe('Ready to distil');
  });

  it('shows book volume, fill and pure alcohol, and leaves out pumps and fittings', () => {
    const rows = buildTankStatusRows([
      source({ volume_gal: 250, abv: 60 }),
      source({ id: 2, name: 'Pump', equipment_type: 'pump' }),
    ], 2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ book_volume_gal: 250, fill_pct: 50, laa_gal: 150, stage: 'storage', status_label: 'In use' });
  });
});
