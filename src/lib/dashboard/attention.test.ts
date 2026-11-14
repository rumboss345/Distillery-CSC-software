import { describe, expect, it } from 'vitest';
import type { BlendReportRow } from '../reporting/blend-rows';
import type { BottlingReportRow } from '../reporting/bottling-rows';
import {
  attentionForUser,
  buildNeedsAttention,
  countBySeverity,
  equipmentAttention,
  fermenterCheckAttention,
  incompleteRecordAttention,
  inventoryAttention,
  isLowStock,
  varianceAttention,
  type AttentionInput,
} from './attention';
import { DEFAULT_DASHBOARD_THRESHOLDS } from './thresholds';

const NOW = new Date('2026-11-14T12:00:00');

function blend(overrides: Partial<BlendReportRow> = {}): BlendReportRow {
  return {
    blend_id: 1,
    batch_number: 'BL-1',
    product_name: 'Gold Rum',
    blend_date: '2026-11-10',
    executed_at: '2026-11-10',
    status: 'complete',
    source_count: 1,
    spirit_draw_gal: 50,
    spirit_laa_gal: 35,
    final_volume_gal: 87.5,
    final_abv: 40,
    final_laa_gal: 35,
    theoretical_volume_gal: 87.5,
    theoretical_abv: 40,
    actual_volume_gal: 87.5,
    volume_variance_gal: 0,
    volume_variance_pct: 0,
    planned_abv: 40,
    measured_abv: 40,
    abv_variance_points: 0,
    output_tank: 'Tank 1',
    operator: 'Sam',
    ...overrides,
  };
}

function bottling(overrides: Partial<BottlingReportRow> = {}): BottlingReportRow {
  return {
    bottling_id: 7,
    batch_number: 'BT-7',
    product_name: 'Gold Rum',
    bottling_date: '2026-11-12',
    lot_number: 'L1',
    source_type: 'tank',
    source_label: 'Tank 1',
    tank_draw_gal: 20,
    expected_gal: 20,
    bottled_gal: 20,
    volume_variance_pct: 0,
    source_abv: 40,
    final_abv: 40,
    measured_abv: null,
    abv_variance_points: null,
    operator: 'Sam',
    bottled_laa_gal: 8,
    bottle_count: 100,
    bottle_sizes: [{ sizeMl: 750, count: 100 }],
    packaging_summary: '',
    volume_variance_gal: 0,
    alcohol_variance_gal: 0,
    ...overrides,
  } as BottlingReportRow;
}

describe('inventory alerts', () => {
  it('uses the same at-or-below reorder level rule as the Low Stock card', () => {
    expect(isLowStock({ quantity: 10, reorder_level: 10 })).toBe(true);
    expect(isLowStock({ quantity: 10.01, reorder_level: 10 })).toBe(false);
  });

  it('flags out of stock as critical and links to the item', () => {
    const items = inventoryAttention([
      { id: 3, name: 'Yeast', unit: 'kg', quantity: 0, reorder_level: 2 },
      { id: 4, name: 'Corks', unit: 'each', quantity: 50, reorder_level: 100 },
      { id: 5, name: 'Sugar', unit: 'lb', quantity: 500, reorder_level: 100 },
    ]);
    expect(items.map((item) => item.key)).toEqual(['inventory:3', 'inventory:4']);
    expect(items[0].severity).toBe('critical');
    expect(items[1].severity).toBe('warning');
    expect(items[0].href).toBe('/inventory?item=3');
    expect(items.every((item) => item.permission === 'inventory')).toBe(true);
  });
});

describe('fermenter checks', () => {
  const vessel = {
    batchId: 11,
    batchNumber: 'W-11',
    equipmentId: 21,
    equipmentName: 'Fermenter 1',
    startedAt: '2026-11-12T08:00:00',
    lastLogAt: '2026-11-13T14:00:00',
  };

  it('ignores a vessel checked within the window', () => {
    expect(fermenterCheckAttention([vessel], NOW, 24)).toEqual([]);
  });

  it('warns after the window and is critical after twice the window', () => {
    const warn = fermenterCheckAttention([{ ...vessel, lastLogAt: '2026-11-13T10:00:00' }], NOW, 24);
    expect(warn[0].severity).toBe('warning');
    expect(warn[0].href).toBe('/fermentation?wash=11&logsEquipment=21');
    const critical = fermenterCheckAttention([{ ...vessel, lastLogAt: '2026-11-12T10:00:00' }], NOW, 24);
    expect(critical[0].severity).toBe('critical');
  });

  it('flags a vessel never logged once the window passes from the start', () => {
    expect(fermenterCheckAttention([{ ...vessel, lastLogAt: null, startedAt: '2026-11-14T06:00:00' }], NOW, 24)).toEqual([]);
    const items = fermenterCheckAttention([{ ...vessel, lastLogAt: null }], NOW, 24);
    expect(items[0].title).toContain('no fermentation log');
  });
});

describe('incomplete records', () => {
  const base = { now: NOW, thresholds: DEFAULT_DASHBOARD_THRESHOLDS, runs: [], washes: [], blends: [], bottlings: [] };

  it('flags finished runs with no hearts or charge, and long-running runs', () => {
    const items = incompleteRecordAttention({
      ...base,
      runs: [
        { id: 1, batch_number: 'R1', status: 'complete', run_date: '2026-11-10', charge_volume_gal: 300, hearts_gal: 0 },
        { id: 2, batch_number: 'R2', status: 'running', run_date: '2026-11-10', charge_volume_gal: 0, hearts_gal: 0 },
        { id: 3, batch_number: 'R3', status: 'complete', run_date: '2026-11-10', charge_volume_gal: 300, hearts_gal: 40 },
      ],
    });
    expect(items.map((item) => item.key).sort()).toEqual(['run-long:2', 'run-no-charge:2', 'run-no-hearts:1']);
    expect(items.every((item) => item.href.startsWith('/distillation?record='))).toBe(true);
  });

  it('flags blends without finished figures and bottling with no bottles', () => {
    const items = incompleteRecordAttention({
      ...base,
      washes: [{ id: 9, batch_number: 'W9', status: 'complete', completedOn: '2026-11-11', actual_final_brix: null }],
      blends: [blend({ measured_abv: null })],
      bottlings: [bottling({ bottle_count: 0, bottled_gal: 0 })],
    });
    expect(items.map((item) => item.href)).toEqual(['/wash?record=9', '/blending?record=1', '/bottling?record=7']);
  });
});

describe('variance alerts', () => {
  it('uses the administrator limits', () => {
    const items = varianceAttention(
      [
        blend({ blend_id: 1, volume_variance_pct: -4.9 }),
        blend({ blend_id: 2, volume_variance_pct: -6 }),
        blend({ blend_id: 3, volume_variance_pct: 12, abv_variance_points: -0.5 }),
      ],
      [
        bottling({ bottling_id: 1, volume_variance_gal: -0.1, alcohol_variance_gal: -0.05 }),
        bottling({ bottling_id: 2, volume_variance_gal: -0.3, alcohol_variance_gal: -0.12 }),
        bottling({ bottling_id: 3, measured_abv: 39.5, abv_variance_points: -0.5 }),
      ],
      DEFAULT_DASHBOARD_THRESHOLDS,
    );
    const keys = items.map((item) => `${item.key}:${item.severity}`);
    expect(keys).toEqual([
      'blend-volume:2:warning',
      'blend-volume:3:critical',
      'blend-abv:3:warning',
      'bottling-variance:2:warning',
      'bottling-abv:3:warning',
    ]);
  });
});

describe('equipment alerts', () => {
  it('flags tanks over capacity, broken equipment and long-dirty equipment', () => {
    const items = equipmentAttention(
      [
        { id: 1, name: 'Tank 1', capacity_gal: 100, volume_gal: 100.4 },
        { id: 2, name: 'Tank 2', capacity_gal: 100, volume_gal: 102 },
      ],
      [
        { id: 5, name: 'Still', daysDirty: null, maintenance_status: 'broken' },
        { id: 6, name: 'Fermenter 2', daysDirty: 1, maintenance_status: null },
        { id: 7, name: 'Fermenter 3', daysDirty: 3, maintenance_status: null },
      ],
    );
    expect(items.map((item) => item.key)).toEqual(['tank-overfill:2', 'equipment-down:5', 'equipment-dirty:7']);
    expect(items[0].href).toBe('/floor-plan?equipment=2');
  });
});

describe('needs attention panel', () => {
  const input: AttentionInput = {
    now: NOW,
    thresholds: DEFAULT_DASHBOARD_THRESHOLDS,
    inventory: [{ id: 3, name: 'Yeast', unit: 'kg', quantity: 0, reorder_level: 2 }],
    fermenting: [],
    overdueFermentations: [],
    runs: [{ id: 1, batch_number: 'R1', status: 'complete', run_date: '2026-11-10', charge_volume_gal: 300, hearts_gal: 0 }],
    washes: [{ id: 9, batch_number: 'W9', status: 'complete', completedOn: '2026-11-11', actual_final_brix: null }],
    blends: [],
    bottlings: [],
    tanks: [],
    equipment: [],
  };

  it('sorts critical first and every alert links to a record', () => {
    const items = buildNeedsAttention(input);
    expect(items.map((item) => item.severity)).toEqual(['critical', 'warning', 'info']);
    expect(items.every((item) => item.href.startsWith('/') && item.href.includes('='))).toBe(true);
    expect(countBySeverity(items)).toEqual({ critical: 1, warning: 1, info: 1 });
  });

  it('hides alerts for pages the person cannot open', () => {
    const items = buildNeedsAttention(input);
    const visible = attentionForUser(items, (key) => key === 'wash');
    expect(visible.map((item) => item.key)).toEqual(['wash-no-final-brix:9']);
  });
});
