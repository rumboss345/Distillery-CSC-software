import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import {
  getHoldingTankContents,
  getHoldingTankOnHand,
  getHoldingTankVolumeVariances,
  holdingTankContentsLabel,
  holdingTankProductName,
  saveHoldingTankOnHand,
  saveHoldingTankTransfer,
} from './queries';
import { tankLiquidOptionGroups } from '../lib/tank-liquid-options';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'Tails tank', 'holding_tank', 500, 'in_use'),
                 (2, 1, 'Spare tank', 'holding_tank', 500, 'empty'),
                 (3, 1, 'Gold tank', 'holding_tank', 500, 'empty'),
                 (4, 1, 'Still', 'still', 500, 'in_use')`);
  db.run(`INSERT INTO distillation_runs (id, batch_number, run_type, still_name, run_date, status)
          VALUES (1, 'D-1', 'vodka', 'Still', '2026-11-01', 'complete')`);
  db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv, holding_tank_equipment_id)
          VALUES (1, 'hearts', '2026-11-01 10:00:00', 50, 80, 1)`);
});

describe('setting a tank volume', () => {
  it('requires saying what is in the tank', () => {
    expect(() => saveHoldingTankOnHand({
      tankEquipmentId: 1, volumeGal: 60, abv: 60, recordedAt: '2026-11-02',
      notes: 'Dipped the tank', changedBy: 'Ben',
    })).toThrow('Enter what is in the tank.');
  });

  it('names the tank with what was entered and keeps it on the reading', () => {
    saveHoldingTankOnHand({
      tankEquipmentId: 1, volumeGal: 60, abv: 60, recordedAt: '2026-11-02',
      notes: 'Dipped the tank', changedBy: 'Ben', liquidLabel: 'Rum Run · Tails',
    });
    expect(getHoldingTankContents(1).volume_gal).toBeCloseTo(60);
    expect(holdingTankContentsLabel(1)).toBe('Rum Run · Tails');
    expect(getHoldingTankOnHand(1)?.liquid_label).toBe('Rum Run · Tails');
    expect(getHoldingTankVolumeVariances()[0].liquid_label).toBe('Rum Run · Tails');
  });

  it('carries the name with liquid transferred out, and later fills join it', () => {
    db.run(`UPDATE holding_tank_opening_balances SET labelled_at = '2026-11-02 08:00:00'`);
    saveHoldingTankTransfer({
      source_tank_equipment_id: 1,
      dest_tank_equipment_id: 2,
      volume_gal: 20,
      abv: 60,
      transfer_date: '2026-11-03',
      notes: '',
    });
    db.run(`UPDATE holding_tank_transfers SET created_at = '2026-11-03 09:00:00'`);
    expect(holdingTankContentsLabel(2)).toBe('Rum Run · Tails');

    db.run(`INSERT INTO distillation_runs (id, batch_number, run_type, still_name, run_date, status)
            VALUES (2, 'D-2', 'gin', 'Still', '2026-11-04', 'complete')`);
    db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv, holding_tank_equipment_id)
            VALUES (2, 'hearts', '2026-11-04 10:00:00', 10, 80, 1)`);
    expect(holdingTankContentsLabel(1)).toBe('Gin Run · Hearts, Rum Run · Tails');
  });

  it('treats a blend name as a blend, even when the gallons match the records', () => {
    db.run(`INSERT INTO holding_tank_transfers
              (spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, created_at)
            VALUES ('high_wines', 1, 3, 30, 60, '2026-11-05', '2026-11-05 09:00:00')`);
    const before = getHoldingTankContents(3);
    saveHoldingTankOnHand({
      tankEquipmentId: 3, volumeGal: before.volume_gal, abv: before.abv, recordedAt: '2026-11-06',
      changedBy: 'Ben', liquidLabel: 'Blended · Gold Rum',
    });
    expect(getHoldingTankContents(3).volume_gal).toBeCloseTo(before.volume_gal);
    expect(holdingTankContentsLabel(3)).toBe('Blended · Gold Rum');
    expect(holdingTankProductName(3)).toBe('Gold Rum');
  });

  it('does not ask what is in an empty tank', () => {
    expect(() => saveHoldingTankOnHand({
      tankEquipmentId: 2, volumeGal: 0, abv: 0, recordedAt: '2026-11-07',
      notes: 'Tank drained and checked', changedBy: 'Ben',
    })).not.toThrow();
  });
});

describe('tankLiquidOptionGroups', () => {
  it('offers what is in the tank now, every run and cut, and finished blends', () => {
    const groups = tankLiquidOptionGroups({
      stillageTank: false,
      currentLabel: 'Rum Run · Tails',
      blendNames: ['Gold Rum', 'Gold Rum', 'Dark Rum'],
    });
    expect(groups.map((g) => g.label)).toEqual(['In the tank now', 'Distilled spirit', 'Finished blends']);
    expect(groups[1].options).toContain('Vodka Run · Hearts');
    expect(groups[1].options).not.toContain('Rum Run · Tails');
    expect(groups[2].options).toEqual(['Blended · Dark Rum', 'Blended · Gold Rum']);
  });

  it('offers stillage for stillage tanks', () => {
    const groups = tankLiquidOptionGroups({ stillageTank: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toContain('Rum Run · Stillage');
  });
});
