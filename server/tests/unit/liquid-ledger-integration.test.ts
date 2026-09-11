import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { computeLpa } from '../../../shared/liquid-ledger/balance';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import {
  createBlend,
  createLot,
  getReconciliations,
  getTankBalance,
  postOpeningBalance,
  postTransaction,
  previewReconciliation,
  reconcileTank,
  saveTank,
  seedLiquidLedgerLookupsIfEmpty,
} from '../../../src/db/liquid-ledger-queries';
import { LIQUID_LEDGER_SCHEMA } from '../../../src/db/liquid-ledger-schema';
import { COSTING_SCHEMA } from '../../../src/db/costing-schema';
import { RECIPES_SCHEMA } from '../../../src/db/recipes-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockBrowserStorage(): void {
  const store: Record<string, string> = {};
  const storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (_i: number) => null,
    length: 0,
  };
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = storage as Storage;
  (globalThis as typeof globalThis & { sessionStorage: Storage }).sessionStorage = storage as Storage;
}

const FLOOR_EQUIPMENT_STUB = `
CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_plan_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL DEFAULT 'holding_tank',
  pos_x_ft REAL DEFAULT 0,
  pos_y_ft REAL DEFAULT 0,
  width_ft REAL DEFAULT 8,
  depth_ft REAL DEFAULT 8,
  capacity_gal REAL DEFAULT 100,
  status TEXT DEFAULT 'empty',
  linked_mash_batch_id INTEGER,
  notes TEXT DEFAULT '',
  tracking_mode TEXT NOT NULL DEFAULT 'LEGACY',
  created_at TEXT DEFAULT (datetime('now'))
);
`;

async function createIntegrationDb(): Promise<Database> {
  mockBrowserStorage();
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  db.run(RECIPES_SCHEMA);
  db.run(FLOOR_EQUIPMENT_STUB);
  db.run(LIQUID_LEDGER_SCHEMA);
  db.run(COSTING_SCHEMA);
  __injectDatabaseForTests(db);
  seedLiquidLedgerLookupsIfEmpty();
  return db;
}

function countTable(table: string): number {
  return queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0;
}

function seedLotInTank(
  tankId: number,
  volumeLitres: number,
  abv: number,
  description: string,
): number {
  const lotId = createLot({
    lot_type: 'Hearts',
    product_id: null,
    bulk_spirit_id: null,
    recipe_version_id: null,
    description,
    initial_volume_litres: volumeLitres,
    initial_abv: abv,
    status: 'Active',
    source_type: 'Manual',
    source_reference_id: null,
    parent_lot_id: null,
    notes: '',
  });
  postTransaction({
    transaction_type: 'Bulk Spirit Receipt',
    transaction_timestamp: new Date().toISOString(),
    source_tank_id: null,
    destination_tank_id: tankId,
    source_lot_id: null,
    destination_lot_id: lotId,
    volume_litres: volumeLitres,
    abv,
    reason_code: null,
    source_document_type: null,
    source_document_id: null,
    notes: description,
    created_by: null,
  });
  return lotId;
}

function createLedgerTank(name: string, capacityLitres: number): number {
  return saveTank({
    name,
    tank_type: 'Spirit Holding',
    capacity_litres: capacityLitres,
    minimum_working_volume_litres: null,
    location_id: null,
    floor_equipment_id: null,
    tracking_mode: 'LEDGER',
    status: 'Active',
    notes: '',
  });
}

describe('liquid ledger integration — reconciliation posting', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createIntegrationDb();
  });

  afterEach(() => {
    __injectDatabaseForTests(null);
  });

  it('preview leaves balance unchanged; post creates record and adjusts to measured volume', () => {
    const tankId = createLedgerTank('Recon Tank', 5000);
    const abv = 40;
    postOpeningBalance({
      tankId,
      lotType: 'Finished Spirit',
      description: 'Seed balance',
      volumeLitres: 1250,
      abv,
      effectiveDate: '2026-01-01',
      notes: 'setup',
    });

    const before = getTankBalance(tankId);
    assert.equal(before.volumeLitres, 1250);
    assert.equal(before.abv, abv);
    assert.equal(before.lpa, computeLpa(1250, abv));

    const preview = previewReconciliation(tankId, 1243.5);
    assert.equal(preview.calculatedVolumeLitres, 1250);
    assert.equal(preview.measuredVolumeLitres, 1243.5);
    assert.equal(preview.varianceLitres, -6.5);

    const afterPreview = getTankBalance(tankId);
    assert.equal(afterPreview.volumeLitres, 1250);
    assert.equal(afterPreview.lpa, before.lpa);

    const result = reconcileTank({
      tankId,
      measuredVolumeLitres: 1243.5,
      reasonCode: 'Measurement Correction',
      notes: 'Dip tape variance',
      createdBy: 'test@example.com',
    });

    assert.ok(result.reconciliationId > 0);
    assert.ok(result.transactionId != null);

    const records = getReconciliations(tankId);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.variance_litres, -6.5);
    assert.equal(records[0]?.adjustment_transaction_id, result.transactionId);

    const adjustment = queryOne<{
      transaction_type: string;
      volume_litres: number;
      abv: number;
      lpa: number;
      reason_code: string | null;
      notes: string;
    }>('SELECT transaction_type, volume_litres, abv, lpa, reason_code, notes FROM liq_transactions WHERE id = ?', [
      result.transactionId!,
    ]);
    assert.equal(adjustment?.transaction_type, 'Manual Adjustment Decrease');
    assert.equal(adjustment?.volume_litres, 6.5);
    assert.equal(adjustment?.abv, abv);
    assert.equal(adjustment?.reason_code, 'Measurement Correction');
    assert.ok(adjustment?.notes.includes('Dip tape variance'));

    const after = getTankBalance(tankId);
    assert.equal(after.volumeLitres, 1243.5);
    assert.equal(after.abv, abv);
    assert.ok(Math.abs(after.lpa - computeLpa(1243.5, abv)) < 1e-9);
  });
});

describe('liquid ledger integration — failed blend atomic rollback', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createIntegrationDb();
  });

  afterEach(() => {
    __injectDatabaseForTests(null);
  });

  it('rolls back all blend rows when destination capacity exceeded after consumptions validated', () => {
    const sourceTankId = createLedgerTank('Blend Source', 5000);
    const destTankId = createLedgerTank('Blend Dest', 100);
    const lotA = seedLotInTank(sourceTankId, 500, 40, 'Lot A');
    const lotB = seedLotInTank(sourceTankId, 500, 60, 'Lot B');

    const txBefore = countTable('liq_transactions');
    const lotsBefore = countTable('liq_lots');
    const parentsBefore = countTable('liq_lot_parents');
    const sourceBefore = getTankBalance(sourceTankId);

    assert.throws(
      () => createBlend({
        sourceTankId,
        destinationTankId: destTankId,
        consumptions: [
          { lotId: lotA, volumeLitres: 500 },
          { lotId: lotB, volumeLitres: 500 },
        ],
        outputLotType: 'Blend',
        outputDescription: 'Should fail — dest capacity 100 L',
      }),
      /capacity would be exceeded/i,
    );

    assert.equal(countTable('liq_transactions'), txBefore);
    assert.equal(countTable('liq_lots'), lotsBefore);
    assert.equal(countTable('liq_lot_parents'), parentsBefore);
    assert.equal(getTankBalance(sourceTankId).volumeLitres, sourceBefore.volumeLitres);
    assert.equal(getTankBalance(sourceTankId).lpa, sourceBefore.lpa);

    const partialGroups = queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT transaction_group_id) AS count FROM liq_transactions
       WHERE transaction_group_id IS NOT NULL`,
    )?.count ?? 0;
    assert.equal(partialGroups, 0);
  });

  it('rolls back when source lot has insufficient volume for blend contribution', () => {
    const sourceTankId = createLedgerTank('Blend Source 2', 5000);
    const destTankId = createLedgerTank('Blend Dest 2', 5000);
    const lotA = seedLotInTank(sourceTankId, 200, 40, 'Small lot');
    const lotB = seedLotInTank(sourceTankId, 500, 60, 'Other lot');

    const txBefore = countTable('liq_transactions');
    const lotsBefore = countTable('liq_lots');

    assert.throws(
      () => createBlend({
        sourceTankId,
        destinationTankId: destTankId,
        consumptions: [
          { lotId: lotA, volumeLitres: 250 },
          { lotId: lotB, volumeLitres: 100 },
        ],
        outputLotType: 'Blend',
        outputDescription: 'Insufficient lot A',
      }),
      /insufficient volume/i,
    );

    assert.equal(countTable('liq_transactions'), txBefore);
    assert.equal(countTable('liq_lots'), lotsBefore);
    assert.equal(getTankBalance(sourceTankId).volumeLitres, 700);
  });
});

describe('liquid ledger integration — opening balance conflict', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createIntegrationDb();
  });

  afterEach(() => {
    __injectDatabaseForTests(null);
  });

  it('rejects second Opening Balance and leaves tank balance unchanged', () => {
    const tankId = createLedgerTank('Opening Tank', 5000);
    postOpeningBalance({
      tankId,
      lotType: 'Finished Spirit',
      description: 'Initial position',
      volumeLitres: 800,
      abv: 45,
      effectiveDate: '2026-01-01',
    });

    const lotsAfterFirst = countTable('liq_lots');
    const txAfterFirst = countTable('liq_transactions');
    const balanceAfterFirst = getTankBalance(tankId);

    assert.throws(
      () => postOpeningBalance({
        tankId,
        lotType: 'Finished Spirit',
        description: 'Duplicate opening',
        volumeLitres: 500,
        abv: 40,
        effectiveDate: '2026-02-01',
      }),
      /already has ledger activity|adjustment/i,
    );

    assert.equal(countTable('liq_lots'), lotsAfterFirst);
    assert.equal(countTable('liq_transactions'), txAfterFirst);
    const balanceAfterAttempt = getTankBalance(tankId);
    assert.equal(balanceAfterAttempt.volumeLitres, balanceAfterFirst.volumeLitres);
    assert.equal(balanceAfterAttempt.lpa, balanceAfterFirst.lpa);
  });
});
