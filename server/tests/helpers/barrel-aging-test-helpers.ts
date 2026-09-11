import { Database } from 'sql.js/dist/sql-wasm.js';
import { queryOne } from '../../../src/db/database';
import {
  createBarrel,
  dumpBarrel,
  fillBarrel,
  recordObservation,
} from '../../../src/db/barrel-aging-queries';
import { createCostingTestDb, seedSpiritTank } from './costing-test-helpers';
import { saveTank } from '../../../src/db/liquid-ledger-queries';

export type BarrelTestSeed = {
  barrelId: number;
  barrelCode: string;
  sourceTankId: number;
  destTankId: number;
  lotId: number;
  warehouseLocId: number;
  liquidCostKyd: number;
};

export function seedBarrelWarehouse(db: Database): number {
  db.run(
    `INSERT INTO md_storage_locations (location_code, name, location_type, active)
     VALUES ('BW-1', 'Barrel Warehouse A', 'Barrel Warehouse', 1)`,
  );
  return queryOne<{ id: number }>("SELECT id FROM md_storage_locations WHERE location_code = 'BW-1'")!.id;
}

export async function seedBarrelAgingScenario(db?: Database): Promise<BarrelTestSeed> {
  const database = db ?? (await createCostingTestDb(true));
  const { sourceTankId, destTankId, lotId } = seedSpiritTank(database);
  const warehouseLocId = seedBarrelWarehouse(database);
  const liquidCostKyd = 60000;

  const barrelId = createBarrel({
    cooperage: '53 US gal Standard',
    wood_type: 'American Oak',
    capacity_litres: 200,
    location_id: warehouseLocId,
    purchase_cost_kyd: 450,
    barcode: 'BC-000001',
  });
  const barrelCode = queryOne<{ barrel_code: string }>('SELECT barrel_code FROM brl_barrels WHERE id = ?', [barrelId])!.barrel_code;

  return {
    barrelId,
    barrelCode,
    sourceTankId,
    destTankId,
    lotId,
    warehouseLocId,
    liquidCostKyd,
  };
}

export function runBarrelFill(seed: BarrelTestSeed, volumeLitres = 190, abv = 62) {
  return fillBarrel({
    barrelId: seed.barrelId,
    sourceTankId: seed.sourceTankId,
    liquidLotId: seed.lotId,
    fillDate: '2026-02-01',
    volumeLitres,
    abv,
  });
}

export function runAngelShareObservation(fillId: number, volumeLitres: number, abv = 62) {
  return recordObservation({
    fillId,
    observationDate: '2026-06-01',
    volumeLitres,
    abv,
    notes: 'Quarterly gauge',
  });
}

export function runBarrelDump(fillId: number, destinationTankId: number) {
  return dumpBarrel({
    fillId,
    destinationTankId,
    dumpDate: '2027-01-15',
    createAgedLot: true,
    agedLotDescription: 'Aged rum from barrel',
  });
}

export function seedEmptyDumpTank(db: Database) {
  return saveTank({
    name: 'Dump Receiver',
    tank_type: 'Spirit Holding',
    capacity_litres: 10000,
    minimum_working_volume_litres: null,
    location_id: null,
    floor_equipment_id: null,
    tracking_mode: 'LEDGER',
    status: 'Active',
    notes: '',
  });
}
