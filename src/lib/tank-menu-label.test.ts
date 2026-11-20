import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from '../db/schema';
import { bindSqlHandle } from '../db/sql-session';
import { formatTankMenuLabel, preferContentsSummary, tankCurrentVolumeLine, tankDropdownLabel } from './tank-menu-label';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(
    `INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
     VALUES (1, 1, 'Empty tank', 'holding_tank', 500, 'empty')`,
  );
});

describe('formatTankMenuLabel', () => {
  it('names what is in the tank and its proof, and leaves the gallons off the menu', () => {
    expect(formatTankMenuLabel('Hearts tank', 'Hearts from LW-4 (spirit run)', 75.2)).toBe(
      'Hearts tank — Hearts from LW-4 (spirit run) · 75.2% ABV',
    );
  });

  it('includes the gallons available when product is being moved', () => {
    expect(formatTankMenuLabel('Latina 500L', 'Low Wine Run · Heads', 78, 3.4)).toBe(
      'Latina 500L — Low Wine Run · Heads · 78.0% ABV · 3.4 gal available',
    );
  });

  it('names the contents when no proof is known', () => {
    expect(formatTankMenuLabel('Hearts tank', 'Hearts from LW-4 (spirit run)')).toBe(
      'Hearts tank — Hearts from LW-4 (spirit run)',
    );
  });

  it('keeps a gauge reading from hiding the liquid already in the tank', () => {
    expect(preferContentsSummary(null, [
      { kind: 'opening', summary: 'On hand' },
      { kind: 'cut', summary: 'Low Wine Run · Heads from D-2025-001' },
    ], 'heads')).toBe('Low Wine Run · Heads from D-2025-001');
  });

  it('keeps an on-hand reading when that is the only record', () => {
    expect(preferContentsSummary(null, [
      { kind: 'opening', summary: 'On hand' },
    ], null)).toBe('On hand');
  });

  it('says a tank is empty without a capacity', () => {
    expect(formatTankMenuLabel('Tails tank', null)).toBe('Tails tank (empty)');
    expect(formatTankMenuLabel('Tails tank', '  ')).toBe('Tails tank (empty)');
  });
});

describe('tankCurrentVolumeLine', () => {
  it('names an empty tank with zero gallons', () => {
    expect(tankCurrentVolumeLine(1, { volume_gal: 0, abv: 0 })).toBe(
      'Current volume: 0.0 gal (empty)',
    );
  });
});

describe('tankDropdownLabel', () => {
  it('lists zero gallons when volume option is set on an empty tank', () => {
    expect(tankDropdownLabel('Empty tank', 1, { volume: true })).toBe('Empty tank — 0.0 gal (empty)');
  });
});