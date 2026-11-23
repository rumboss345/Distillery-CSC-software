import { describe, expect, it } from 'vitest';
import type { BottlingRunView } from '../types';
import { matchingBottlingRunsForBlend, primaryBottlingRunIdForBlend } from './blend-bottling-link';

const blend = {
  id: 1,
  batch_number: 'BL-2026-010',
  product_name: 'Spiced Gold',
  output_holding_tank_equipment_id: 5,
  executed_at: '2026-11-01 14:00:00',
  blend_date: '2026-11-01',
  status: 'bottled' as const,
};

function run(partial: Partial<BottlingRunView> & Pick<BottlingRunView, 'id'>): BottlingRunView {
  return {
    id: partial.id,
    batch_number: partial.batch_number ?? `BT-${partial.id}`,
    source_barrel_id: null,
    source_holding_tank_equipment_id: partial.source_holding_tank_equipment_id ?? 5,
    source_volume_gal: 100,
    source_abv: 40,
    bottled_volume_gal: 90,
    volume_variance_gal: null,
    alcohol_variance_gal: null,
    variance_reason: '',
    variance_changed_by: null,
    return_holding_tank_equipment_id: null,
    return_volume_gal: null,
    source_run_id: null,
    bottling_date: partial.bottling_date ?? '2026-11-02',
    packaging_bottle: '',
    bottle_size_ml: 750,
    bottle_count: 100,
    final_abv: 40,
    measured_abv: null,
    measured_abv_observed: null,
    measured_temp_f: null,
    assigned_user_id: null,
    assigned_user_name: null,
    product_name: partial.product_name ?? 'Spiced Gold',
    lot_number: partial.lot_number ?? '',
    notes: '',
    status: partial.status ?? 'complete',
    created_at: '',
    lines: [],
    returns: [],
    equipment_ids: [],
  };
}

describe('blend-bottling-link', () => {
  it('matches by blend lot on the bottling run', () => {
    const runs = [
      run({ id: 7, lot_number: 'BL-2026-010', bottling_date: '2026-11-03' }),
      run({ id: 8, lot_number: 'OTHER', product_name: 'Spiced Gold', bottling_date: '2026-11-04' }),
    ];
    expect(matchingBottlingRunsForBlend(blend, runs).map((r) => r.id)).toEqual([7, 8]);
    expect(primaryBottlingRunIdForBlend(blend, runs)).toBe(7);
  });

  it('ignores runs before blend production or still planned', () => {
    const runs = [
      run({ id: 2, lot_number: 'BL-2026-010', bottling_date: '2026-10-30' }),
      run({ id: 3, lot_number: 'BL-2026-010', status: 'planned' }),
    ];
    expect(matchingBottlingRunsForBlend(blend, runs)).toEqual([]);
  });

  it('matches when the blend batch appears on the bottling product name even from another tank', () => {
    const banana = {
      ...blend,
      batch_number: 'BL-2026-012',
      product_name: 'GR Banana Rum',
      output_holding_tank_equipment_id: 3,
    };
    const runs = [
      run({
        id: 12,
        source_holding_tank_equipment_id: 8,
        product_name: 'GR Banana Rum · BL-2026-012',
        lot_number: '',
        bottling_date: '2026-11-20',
      }),
    ];
    expect(primaryBottlingRunIdForBlend(banana, runs)).toBe(12);
  });

  it('matches related product names from the blend output tank', () => {
    const runs = [
      run({
        id: 4,
        product_name: 'Spiced Gold Rum',
        lot_number: '',
        bottling_date: '2026-11-05',
      }),
    ];
    expect(primaryBottlingRunIdForBlend(blend, runs)).toBe(4);
  });
});