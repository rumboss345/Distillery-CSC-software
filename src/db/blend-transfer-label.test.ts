import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import {
  getHoldingTankIntakeHistory,
  holdingTankContentsLabel,
  holdingTankProductName,
  saveHoldingTankTransfer,
} from './queries';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'Blend Tank', 'holding_tank', 500, 'in_use'),
                 (2, 1, 'Storage Tank', 'holding_tank', 500, 'empty')`);
  db.run(`INSERT INTO blend_products
            (id, batch_number, product_name, blend_date, status, final_volume_gal, final_abv,
             output_holding_tank_equipment_id, executed_at, created_at)
          VALUES (1, 'BL-1', 'Gold Rum', '2026-11-10', 'executed', 100, 40, 1,
                  '2026-11-10 09:00:00', '2026-11-10 09:00:00')`);
});

describe('a finished blend moved to another tank', () => {
  it('shows the blend tank as blended with the blend name', () => {
    expect(holdingTankContentsLabel(1)).toBe('Blended · Gold Rum');
    expect(holdingTankProductName(1)).toBe('Gold Rum');
  });

  it('keeps the blend name and blended spirit type in the new tank', () => {
    saveHoldingTankTransfer({
      source_tank_equipment_id: 1,
      dest_tank_equipment_id: 2,
      volume_gal: 60,
      abv: 40,
      transfer_date: '2026-11-12',
      notes: '',
    });
    db.run(`UPDATE holding_tank_transfers SET created_at = '2026-11-12 10:00:00' WHERE id = 1`);
    expect(holdingTankContentsLabel(2)).toBe('Blended · Gold Rum');
    expect(holdingTankProductName(2)).toBe('Gold Rum');
    expect(holdingTankContentsLabel(1)).toBe('Blended · Gold Rum');

    const stored = db.exec('SELECT spirit_type, liquid_label FROM holding_tank_transfers')[0].values[0];
    expect(stored).toEqual(['blended', 'Gold Rum']);

    const [intake] = getHoldingTankIntakeHistory(2, 5);
    expect(intake.kind).toBe('transfer');
    expect(intake.spiritType).toBe('blended');
    expect(intake.detail).toBe('Blended transfer');
    expect(intake.summary).toBe('Gold Rum from Blend Tank');
  });

  it('carries the name through a second transfer', () => {
    db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
            VALUES (3, 1, 'Tank 3', 'holding_tank', 500, 'empty')`);
    saveHoldingTankTransfer({
      source_tank_equipment_id: 2,
      dest_tank_equipment_id: 3,
      volume_gal: 20,
      abv: 40,
      transfer_date: '2026-11-13',
      notes: '',
    });
    db.run(`UPDATE holding_tank_transfers SET created_at = '2026-11-13 10:00:00' WHERE id = 2`);
    expect(holdingTankContentsLabel(3)).toBe('Blended · Gold Rum');
    expect(holdingTankProductName(3)).toBe('Gold Rum');
    expect(holdingTankProductName(2)).toBe('Gold Rum');
  });

  it('keeps the saved blend name when the source tank history cannot be traced', () => {
    db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
            VALUES (4, 1, 'Old Tank', 'holding_tank', 500, 'empty'),
                   (5, 1, 'Tank 5', 'holding_tank', 500, 'empty')`);
    db.run(`INSERT INTO holding_tank_transfers
              (spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, notes, liquid_label, created_at)
            VALUES ('blended', 4, 5, 10, 40, '2026-11-13', '', 'Silver Rum', '2026-11-13 11:00:00')`);
    expect(holdingTankContentsLabel(5)).toBe('Blended · Silver Rum');
    expect(holdingTankProductName(5)).toBe('Silver Rum');
  });
});
