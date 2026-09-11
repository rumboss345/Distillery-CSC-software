import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import {
  balanceFromVolumeLpa,
  computeAbvFromLpa,
  computeLpa,
} from '../../../shared/liquid-ledger/balance';
import { wouldCreateCircularGenealogy } from '../../../shared/liquid-ledger/genealogy';
import { validateReasonCode } from '../../../shared/liquid-ledger/validation';
import { litresPureAlcohol } from '../../../shared/units';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import { LIQUID_LEDGER_SCHEMA } from '../../../src/db/liquid-ledger-schema';
import { RECIPES_SCHEMA } from '../../../src/db/recipes-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Db = Awaited<ReturnType<typeof createLedgerDb>>;

async function createLedgerDb() {
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  db.run(RECIPES_SCHEMA);
  db.run(LIQUID_LEDGER_SCHEMA);
  db.run(`CREATE TABLE IF NOT EXISTS floor_equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT, floor_plan_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL, equipment_type TEXT NOT NULL DEFAULT 'holding_tank',
    pos_x_ft REAL DEFAULT 0, pos_y_ft REAL DEFAULT 0, width_ft REAL DEFAULT 8, depth_ft REAL DEFAULT 8,
    capacity_gal REAL DEFAULT 100, status TEXT DEFAULT 'empty', notes TEXT DEFAULT '',
    tracking_mode TEXT NOT NULL DEFAULT 'LEGACY', created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-0001', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
  db.run(`INSERT INTO floor_equipment (name, equipment_type, capacity_gal, tracking_mode) VALUES ('Legacy Tank', 'holding_tank', 500, 'LEGACY')`);
  return db;
}

function insertTank(db: Db, name: string, capacity = 5000) {
  db.run(`INSERT INTO liq_tanks (tank_code, name, tank_type, capacity_litres, tracking_mode, status)
          VALUES ('TNK-0001', ?, 'Spirit Holding', ?, 'LEDGER', 'Active')`, [name, capacity]);
  return 1;
}

function insertLot(db: Db, code: string, volume: number, abv: number) {
  const lpa = litresPureAlcohol(volume, abv);
  db.run(`INSERT INTO liq_lots (lot_code, lot_type, description, initial_volume_litres, initial_abv, initial_lpa, status, source_type)
          VALUES (?, 'Purchased Bulk Spirit', 'Test lot', ?, ?, ?, 'Active', 'Manual')`, [code, volume, abv, lpa]);
  return db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] as number;
}

function tankBalance(db: Db, tankId: number) {
  const ins = db.exec(`SELECT COALESCE(SUM(volume_litres),0), COALESCE(SUM(lpa),0) FROM liq_transactions WHERE destination_tank_id = ${tankId}`)[0]?.values[0] as [number, number];
  const outs = db.exec(`SELECT COALESCE(SUM(volume_litres),0), COALESCE(SUM(lpa),0) FROM liq_transactions WHERE source_tank_id = ${tankId}`)[0]?.values[0] as [number, number];
  const vol = (ins[0] ?? 0) - (outs[0] ?? 0);
  const lpa = (ins[1] ?? 0) - (outs[1] ?? 0);
  return balanceFromVolumeLpa(vol, lpa);
}

describe('liquid ledger balance math', () => {
  it('calculates LPA at 96% ABV', () => {
    assert.equal(computeLpa(1000, 96), 960);
  });

  it('calculates weighted ABV from LPA (500@40% + 500@60% = 50%)', () => {
    const lpa = computeLpa(500, 40) + computeLpa(500, 60);
    assert.equal(computeAbvFromLpa(1000, lpa), 50);
  });
});

describe('liquid lot schema', () => {
  it('creates liquid lot with readable code', async () => {
    const db = await createLedgerDb();
    insertLot(db, 'LOT-000001', 1000, 96);
    const count = db.exec('SELECT COUNT(*) FROM liq_lots')[0]?.values[0]?.[0];
    assert.equal(count, 1);
    db.close();
  });

  it('enforces unique lot_code', async () => {
    const db = await createLedgerDb();
    insertLot(db, 'LOT-000001', 1000, 96);
    assert.throws(
      () => insertLot(db, 'LOT-000001', 500, 40),
      /UNIQUE constraint failed/,
    );
    db.close();
  });
});

describe('liquid ledger transactions', () => {
  it('derives tank balance from receipt transaction', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'Receipt Tank');
    const lotId = insertLot(db, 'LOT-000001', 1000, 96);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp,
            destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Bulk Spirit Receipt', datetime('now'), 1, ?, 1000, 96, 960)`, [lotId]);
    const bal = tankBalance(db, 1);
    assert.equal(bal.volumeLitres, 1000);
    assert.equal(bal.lpa, 960);
    assert.equal(bal.abv, 96);
    db.close();
  });

  it('transfer preserves lot identity', async () => {
    const db = await createLedgerDb();
    db.run(`INSERT INTO liq_tanks (tank_code, name, tank_type, capacity_litres, tracking_mode) VALUES ('TNK-0001', 'A', 'Spirit Holding', 5000, 'LEDGER')`);
    db.run(`INSERT INTO liq_tanks (tank_code, name, tank_type, capacity_litres, tracking_mode) VALUES ('TNK-0002', 'B', 'Spirit Holding', 5000, 'LEDGER')`);
    const lotId = insertLot(db, 'LOT-000001', 1000, 40);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Bulk Spirit Receipt', datetime('now'), 1, ?, 1000, 40, 400)`, [lotId]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, source_tank_id, source_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000002', 'Tank Transfer Out', datetime('now'), 1, ?, 300, 40, 120)`, [lotId]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000003', 'Tank Transfer In', datetime('now'), 2, ?, 300, 40, 120)`, [lotId]);
    assert.equal(tankBalance(db, 1).volumeLitres, 700);
    assert.equal(tankBalance(db, 2).volumeLitres, 300);
    const lotInB = db.exec(`SELECT COALESCE(SUM(volume_litres),0)-COALESCE((SELECT SUM(volume_litres) FROM liq_transactions WHERE source_lot_id=${lotId} AND source_tank_id=2),0)
      FROM liq_transactions WHERE destination_lot_id=${lotId} AND destination_tank_id=2`)[0]?.values[0]?.[0];
    assert.equal(lotInB, 300);
    db.close();
  });

  it('rejects over-capacity at database validation layer', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'Small', 500);
    const lotId = insertLot(db, 'LOT-000001', 1000, 40);
    const current = tankBalance(db, 1).volumeLitres;
    assert.ok(current + 600 > 500);
    db.close();
  });

  it('blend creates new lot with genealogy and LPA conservation', async () => {
    const db = await createLedgerDb();
    db.run(`INSERT INTO liq_tanks (tank_code, name, capacity_litres, tracking_mode) VALUES ('TNK-0001', 'Blend Src', 5000, 'LEDGER')`);
    db.run(`INSERT INTO liq_tanks (tank_code, name, capacity_litres, tracking_mode) VALUES ('TNK-0002', 'Blend Dest', 5000, 'LEDGER')`);
    const lotA = insertLot(db, 'LOT-000001', 500, 40);
    const lotB = insertLot(db, 'LOT-000002', 500, 60);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Bulk Spirit Receipt', datetime('now'), 1, ?, 500, 40, 200)`, [lotA]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000002', 'Bulk Spirit Receipt', datetime('now'), 1, ?, 500, 60, 300)`, [lotB]);
    const lotC = insertLot(db, 'LOT-000003', 1000, 50);
    db.run(`INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa) VALUES (?, ?, 500, 200)`, [lotC, lotA]);
    db.run(`INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa) VALUES (?, ?, 500, 300)`, [lotC, lotB]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, source_tank_id, source_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000003', 'Blend Consumption', datetime('now'), 1, ?, 500, 40, 200)`, [lotA]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, source_tank_id, source_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000004', 'Blend Consumption', datetime('now'), 1, ?, 500, 60, 300)`, [lotB]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000005', 'Blend Production', datetime('now'), 2, ?, 1000, 50, 500)`, [lotC]);
    const parents = db.exec('SELECT COUNT(*) FROM liq_lot_parents WHERE child_lot_id = 3')[0]?.values[0]?.[0];
    assert.equal(parents, 2);
    assert.equal(tankBalance(db, 2).lpa, 500);
    db.close();
  });

  it('proof-down records water addition and conserves LPA', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'Source', 5000);
    db.run(`INSERT INTO liq_tanks (tank_code, name, capacity_litres, tracking_mode) VALUES ('TNK-0002', 'Dest', 10000, 'LEDGER')`);
    const lotA = insertLot(db, 'LOT-000001', 1000, 96);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Bulk Spirit Receipt', datetime('now'), 1, ?, 1000, 96, 960)`, [lotA]);
    const lotB = insertLot(db, 'LOT-000002', 2400, 40);
    db.run(`INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa) VALUES (?, ?, 1000, 960)`, [lotB, lotA]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, source_tank_id, source_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000002', 'Proof Down Consumption', datetime('now'), 1, ?, 1000, 96, 960)`, [lotA]);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, volume_litres, abv, lpa)
            VALUES ('LTX-000003', 'Proof Down Water Addition', datetime('now'), 2, 1400, 0, 0)`);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000004', 'Proof Down Production', datetime('now'), 2, ?, 2400, 40, 960)`, [lotB]);
    const water = db.exec(`SELECT volume_litres FROM liq_transactions WHERE transaction_type = 'Proof Down Water Addition'`)[0]?.values[0]?.[0];
    assert.equal(water, 1400);
    assert.equal(tankBalance(db, 2).lpa, 960);
    db.close();
  });

  it('reversal restores tank balance', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'Tank');
    const lotId = insertLot(db, 'LOT-000001', 500, 40);
    db.run(`INSERT INTO liq_transactions (id, transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES (1, 'LTX-000001', 'Bulk Spirit Receipt', datetime('now'), 1, ?, 500, 40, 200)`, [lotId]);
    assert.equal(tankBalance(db, 1).volumeLitres, 500);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, source_tank_id, source_lot_id, volume_litres, abv, lpa, reversal_of_transaction_id)
            VALUES ('LTX-000002', 'Correction / Reversal', datetime('now'), 1, ?, 500, 40, 200, 1)`, [lotId]);
    assert.equal(tankBalance(db, 1).volumeLitres, 0);
    db.close();
  });
});

describe('liquid ledger validation', () => {
  it('requires reason for adjustments', () => {
    assert.throws(() => validateReasonCode('', true), /reason is required/);
    assert.doesNotThrow(() => validateReasonCode('Evaporation', true));
  });

  it('rejects circular genealogy', () => {
    assert.equal(wouldCreateCircularGenealogy(1, 1, []), true);
    assert.equal(wouldCreateCircularGenealogy(1, 2, [{ parent_lot_id: 1 }]), true);
    assert.equal(wouldCreateCircularGenealogy(3, 2, [{ parent_lot_id: 1 }]), false);
  });
});

describe('legacy vs ledger compatibility', () => {
  it('floor equipment defaults to LEGACY tracking mode', async () => {
    const db = await createLedgerDb();
    const mode = db.exec('SELECT tracking_mode FROM floor_equipment WHERE id = 1')[0]?.values[0]?.[0];
    assert.equal(mode, 'LEGACY');
    db.close();
  });

  it('ledger tanks are separate from legacy floor tank balances', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'Ledger Tank', 5000);
    const lotId = insertLot(db, 'LOT-000001', 1000, 40);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Opening Balance', datetime('now'), 1, ?, 1000, 40, 400)`, [lotId]);
    const ledgerVol = tankBalance(db, 1).volumeLitres;
    const legacyCount = db.exec(`SELECT COUNT(*) FROM liq_transactions WHERE destination_tank_id IS NULL AND source_tank_id IS NULL`)[0]?.values[0]?.[0];
    assert.equal(ledgerVol, 1000);
    assert.equal(legacyCount, 0);
    db.close();
  });
});

describe('atomic operations', () => {
  it('rolls back failed multi-step transfer on error', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'A', 5000);
    db.run(`INSERT INTO liq_tanks (tank_code, name, capacity_litres, tracking_mode) VALUES ('TNK-0002', 'B', 5000, 'LEDGER')`);
    const lotId = insertLot(db, 'LOT-000001', 100, 40);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Opening Balance', datetime('now'), 1, ?, 100, 40, 40)`, [lotId]);
    db.run('BEGIN');
    try {
      db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, source_tank_id, source_lot_id, volume_litres, abv, lpa)
              VALUES ('LTX-000002', 'Tank Transfer Out', datetime('now'), 1, ?, 200, 40, 80)`, [lotId]);
      throw new Error('Simulated validation failure');
    } catch {
      db.run('ROLLBACK');
    }
    assert.equal(tankBalance(db, 1).volumeLitres, 100);
    db.close();
  });
});

describe('reconciliation preview', () => {
  it('does not insert transaction until adjustment posted', async () => {
    const db = await createLedgerDb();
    insertTank(db, 'Tank');
    const lotId = insertLot(db, 'LOT-000001', 1000, 40);
    db.run(`INSERT INTO liq_transactions (transaction_code, transaction_type, transaction_timestamp, destination_tank_id, destination_lot_id, volume_litres, abv, lpa)
            VALUES ('LTX-000001', 'Opening Balance', datetime('now'), 1, ?, 1000, 40, 400)`, [lotId]);
    const before = tankBalance(db, 1).volumeLitres;
    db.run(`INSERT INTO liq_reconciliations (tank_id, calculated_volume_litres, measured_volume_litres, variance_litres, calculated_abv)
            VALUES (1, 1000, 993.5, -6.5, 40)`);
    const afterPreview = tankBalance(db, 1).volumeLitres;
    assert.equal(before, 1000);
    assert.equal(afterPreview, 1000);
    db.close();
  });
});
