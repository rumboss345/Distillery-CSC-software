/**
 * Phase 1J barrel aging & maturation.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  computeFillPosition,
  createBarrel,
  dumpBarrel,
  fillBarrel,
  getBarrel,
  getBarrelGenealogy,
  listAngelShareEvents,
  listObservations,
  recordObservation,
  reverseBarrelFill,
} from '../../../src/db/barrel-aging-queries';
import { getLiquidPositionCost, getLiquidPositionCostForVolume } from '../../../src/db/liquid-cost-movement-queries';
import { getLotVolumeInTank } from '../../../src/db/liquid-ledger-queries';
import { createCostingTestDb, teardownTestDb } from '../helpers/costing-test-helpers';
import {
  runAngelShareObservation,
  runBarrelDump,
  runBarrelFill,
  seedBarrelAgingScenario,
  seedEmptyDumpTank,
} from '../helpers/barrel-aging-test-helpers';

describe('Phase 1J barrel aging', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('creates barrel master with BRL code and asset cost separate from liquid', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const barrel = getBarrel(seed.barrelId)!;
    assert.match(barrel.barrel_code, /^BRL-\d{6}$/);
    assert.equal(barrel.cooperage, '53 US gal Standard');
    assert.equal(barrel.wood_type, 'American Oak');
    assert.equal(barrel.fill_count, 0);
    assert.equal(barrel.purchase_cost_kyd, 450);
    assert.equal(barrel.barcode, 'BC-000001');
    assert.equal(barrel.status, 'Empty');
  });

  it('fill withdraws liquid from tank and records initial observation', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const beforeTank = getLotVolumeInTank(seed.lotId, seed.sourceTankId).volumeLitres;
    const fillId = runBarrelFill(seed, 190, 62);

    const fill = queryOne<{ liquid_cost_kyd: number; fill_code: string }>(
      'SELECT liquid_cost_kyd, fill_code FROM brl_fills WHERE id = ?',
      [fillId],
    )!;
    assert.match(fill.fill_code, /^BFL-\d{6}$/);
    assert.ok(fill.liquid_cost_kyd > 0);

    const afterTank = getLotVolumeInTank(seed.lotId, seed.sourceTankId).volumeLitres;
    assert.equal(afterTank, beforeTank - 190);

    const barrel = getBarrel(seed.barrelId)!;
    assert.equal(barrel.status, 'Aging');
    assert.equal(barrel.fill_count, 1);

    const obs = listObservations(fillId);
    assert.equal(obs.length, 1);
    assert.equal(obs[0]!.is_fill_event, 1);
    assert.equal(obs[0]!.volume_litres, 190);
  });

  it('observation history is append-only with volume ABV and LPA', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed);
    recordObservation({
      fillId,
      observationDate: '2026-03-01',
      volumeLitres: 188,
      abv: 61.5,
    });

    const obs = listObservations(fillId);
    assert.equal(obs.length, 2);
    assert.equal(obs[1]!.sequence_number, 2);
    assert.ok(obs[1]!.lpa > 0);
    assert.equal(obs[1]!.abv, 61.5);
  });

  it('angel share conserves liquid cost on remaining volume', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed, 200, 60);
    const fillCost = queryOne<{ liquid_cost_kyd: number }>(
      'SELECT liquid_cost_kyd FROM brl_fills WHERE id = ?',
      [fillId],
    )!.liquid_cost_kyd;

    runAngelShareObservation(fillId, 180, 60);
    const events = listAngelShareEvents(fillId);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.volume_lost_litres, 20);
    assert.equal(events[0]!.liquid_cost_before_kyd, fillCost);
    assert.equal(events[0]!.liquid_cost_after_kyd, fillCost);

    const position = computeFillPosition(fillId);
    assert.equal(position.liquidCostKyd, fillCost);
    assert.ok(position.costPerLitreKyd! > fillCost / 200);
  });

  it('dump returns liquid to tank with genealogy', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed, 190, 62);
    runAngelShareObservation(fillId, 175, 62);
    const dumpTankId = seedEmptyDumpTank(db);
    const dumpId = runBarrelDump(fillId, dumpTankId);

    const dump = queryOne<{ destination_lot_id: number; liquid_cost_kyd: number }>(
      'SELECT destination_lot_id, liquid_cost_kyd FROM brl_dumps WHERE id = ?',
      [dumpId],
    )!;
    const tankVol = getLotVolumeInTank(dump.destination_lot_id, dumpTankId).volumeLitres;
    assert.equal(tankVol, 175);

    const genealogy = getBarrelGenealogy(fillId);
    assert.equal(genealogy.length, 1);
    assert.equal(genealogy[0]!.contributedVolumeLitres, 175);

    const barrel = getBarrel(seed.barrelId)!;
    assert.equal(barrel.status, 'Empty');

    const positionCost = getLiquidPositionCost(dump.destination_lot_id, dumpTankId);
    assert.ok(Math.abs(positionCost - dump.liquid_cost_kyd) < 0.01);
  });

  it('refill increments fill count after dump', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed, 180, 60);
    const dumpTankId = seedEmptyDumpTank(db);
    runBarrelDump(fillId, dumpTankId);

    const refillId = fillBarrel({
      barrelId: seed.barrelId,
      sourceTankId: seed.sourceTankId,
      liquidLotId: seed.lotId,
      fillDate: '2027-02-01',
      volumeLitres: 170,
      abv: 58,
    });

    const barrel = getBarrel(seed.barrelId)!;
    assert.equal(barrel.fill_count, 2);
    assert.equal(barrel.status, 'Aging');
    const fillNumber = queryOne<{ fill_number: number }>(
      'SELECT fill_number FROM brl_fills WHERE id = ?',
      [refillId],
    )!.fill_number;
    assert.equal(fillNumber, 2);
  });

  it('reversal blocked after observation or dump', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed, 150, 60);

    runAngelShareObservation(fillId, 145, 60);
    assert.throws(() => reverseBarrelFill(fillId), /additional observations/i);

    const fillId2 = fillBarrel({
      barrelId: createBarrel({ cooperage: '30 US gal', wood_type: 'French Oak', capacity_litres: 120 }),
      sourceTankId: seed.sourceTankId,
      liquidLotId: seed.lotId,
      fillDate: '2026-04-01',
      volumeLitres: 100,
      abv: 55,
    });
    const dumpTankId = seedEmptyDumpTank(db);
    runBarrelDump(fillId2, dumpTankId);
    assert.throws(() => reverseBarrelFill(fillId2), /active fills/i);
  });

  it('barrel asset purchase cost never added to liquid cost', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed, 190, 62);
    const position = computeFillPosition(fillId);
    const barrel = getBarrel(seed.barrelId)!;
    assert.equal(barrel.purchase_cost_kyd, 450);
    assert.ok(position.liquidCostKyd > 0);
    assert.notEqual(position.liquidCostKyd, barrel.purchase_cost_kyd);
  });

  it('duplicate reversal blocked on fill', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedBarrelAgingScenario(db);
    const fillId = runBarrelFill(seed, 120, 58);
    reverseBarrelFill(fillId);
    assert.throws(() => reverseBarrelFill(fillId), /active fills/i);
  });
});
