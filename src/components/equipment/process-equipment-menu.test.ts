import { describe, expect, it } from 'vitest';
import {
  buildProcessEquipmentContextMenu,
  type ProcessEquipmentMenuSource,
} from './process-equipment-menu';

function source(overrides: Partial<ProcessEquipmentMenuSource> = {}): ProcessEquipmentMenuSource {
  return {
    id: 7,
    name: 'Fermentation 1',
    equipment_type: 'fermenter',
    volumeGal: 0,
    abv: null,
    ...overrides,
  };
}

function labels(items: { label: string }[]) {
  return items.map((item) => item.label);
}

describe('buildProcessEquipmentContextMenu', () => {
  it('offers the fermenter next step, add logs, and equipment maintenance', () => {
    const menu = buildProcessEquipmentContextMenu(source({
      active_batch_number: 'M-2025-002',
      active_mash_status: 'fermenting',
      active_latest_brix: 12.4,
      volumeGal: 112.5,
    }));

    expect(labels(menu.next)).toEqual(['Low wine run', 'Heavy rum', 'Transfer']);
    expect(menu.next[0]?.to).toBe('/distillation?chargeFermenter=7&runType=wash');
    expect(labels(menu.records)).toEqual(['Add logs']);
    expect(menu.records[0]?.to).toBe('/fermentation?logsEquipment=7');
    expect(menu.maintenance.to).toBe('/equipment-maintenance?equipment=7');
    expect(menu.hint).toContain('12.4');
  });

  it('uses view logs once that fermenter is complete', () => {
    const menu = buildProcessEquipmentContextMenu(source({
      active_batch_number: 'M-2025-001',
      active_mash_status: 'complete',
      volumeGal: 40,
    }));
    expect(labels(menu.records)).toEqual(['View logs']);
    expect(menu.hint).toBeNull();
  });

  it('keeps maintenance on an empty fermenter without a next step', () => {
    const menu = buildProcessEquipmentContextMenu(source());
    expect(menu.next).toEqual([]);
    expect(menu.records).toEqual([]);
    expect(menu.maintenance.label).toBe('Equipment Maintenance');
  });

  it('starts fermentation from a wash tank that is still mashing', () => {
    const menu = buildProcessEquipmentContextMenu(source({
      id: 3,
      name: 'Wash tank',
      equipment_type: 'mash_tun',
      active_mash_status: 'mashing',
      linked_mash_batch_id: 12,
    }));
    expect(menu.next).toEqual([
      { key: 'ferment', label: 'Ferment', to: '/fermentation?wash=12' },
    ]);
    expect(menu.records).toEqual([]);
  });

  it('offers spirit next steps for a holding tank and skips stillage', () => {
    const spirit = buildProcessEquipmentContextMenu(source({
      id: 9,
      name: 'Low wines storage Tank 5',
      equipment_type: 'holding_tank',
      volumeGal: 80,
      abv: 28,
      liquidName: 'Low wine',
    }));
    expect(labels(spirit.next)).toEqual(['Transfer', 'Spirit run', 'Blend', 'Bottle']);

    const stillage = buildProcessEquipmentContextMenu(source({
      id: 10,
      name: 'Stillage Storage tank',
      equipment_type: 'stillage_tank',
      volumeGal: 200,
      abv: 0,
      liquidName: 'Stillage',
    }));
    expect(labels(stillage.next)).toEqual(['Transfer']);
  });

  it('offers add cuts for a still with an open run, and maintenance when idle', () => {
    const running = buildProcessEquipmentContextMenu(source({
      id: 4,
      name: 'Vendome',
      equipment_type: 'pot_still',
      distillationRunId: 15,
    }));
    expect(running.next).toEqual([]);
    expect(running.records).toEqual([
      { key: 'cuts', label: 'Add cuts', to: '/distillation?cutsRun=15' },
    ]);
    expect(running.maintenance.label).toBe('Equipment Maintenance');

    const idle = buildProcessEquipmentContextMenu(source({
      id: 4,
      name: 'Vendome',
      equipment_type: 'column_still',
    }));
    expect(idle.records).toEqual([]);
    expect(idle.maintenance.to).toBe('/equipment-maintenance?equipment=4');
  });
});
