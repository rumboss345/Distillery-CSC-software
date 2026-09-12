/**
 * Phase 1G liquid transfer cost persistence — 25 requirement-mapped tests.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  createLiquidCostLayer,
  getLiquidLotTotalCost,
  listLiquidValuationPositions,
  listLiquidValuations,
  getLiquidCostTraceability,
  rebuildLiquidTransferCostMovements,
} from '../../../src/db/costing-queries';
import {
  getLiquidLotEconomicCost,
  getLiquidLotPositionCostTotal,
  getLiquidPositionCost,
  listLiquidCostMovements,
} from '../../../src/db/liquid-cost-movement-queries';
import {
  createLot,
  postOpeningBalance,
  postProcessLoss,
  postTransaction,
  reverseTransaction,
  saveTank,
  transferLiquid,
} from '../../../src/db/liquid-ledger-queries';
import {
  completeBatch,
  createOrder,
  planOrder,
  recordInput,
  releaseOrder,
  startBatch,
} from '../../../src/db/production-orders-queries';
import {
  createCostingTestDb,
  seedBlendScenario,
  seedProofDownScenario,
  seedSpiritTank,
  teardownTestDb,
} from '../helpers/costing-test-helpers';

describe('Phase 1G liquid transfer cost persistence', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  function setupTwoTankLot(costKyd = 5000, volume = 1000) {
    const tankA = saveTank({
      name: 'Tank A',
      tank_type: 'Spirit Holding',
      capacity_litres: 10000,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEDGER',
      status: 'Active',
      notes: '',
    });
    const tankB = saveTank({
      name: 'Tank B',
      tank_type: 'Spirit Holding',
      capacity_litres: 10000,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEDGER',
      status: 'Active',
      notes: '',
    });
    const tankC = saveTank({
      name: 'Tank C',
      tank_type: 'Spirit Holding',
      capacity_litres: 10000,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEDGER',
      status: 'Active',
      notes: '',
    });
    postOpeningBalance({
      tankId: tankA,
      lotType: 'Purchased Bulk Spirit',
      description: 'Test lot',
      volumeLitres: volume,
      abv: 96,
      effectiveDate: '2026-01-01',
    });
    const lotId = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
    createLiquidCostLayer({
      liquidLotId: lotId,
      sourceType: 'Opening Cost',
      effectiveDate: '2026-01-01',
      volumeLitres: volume,
      lpa: volume * 0.96,
      inputCostKyd: costKyd,
    });
    return { tankA, tankB, tankC, lotId, costKyd, volume };
  }

  it('1. full transfer preserves company value', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId, costKyd, volume } = setupTwoTankLot();
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: volume, sourceLotId: lotId });
    assert.equal(getLiquidLotEconomicCost(lotId), costKyd);
    assert.equal(getLiquidPositionCost(lotId, tankA), 0);
    assert.equal(getLiquidPositionCost(lotId, tankB), costKyd);
  });

  it('2. partial transfer', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(5000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    assert.equal(getLiquidPositionCost(lotId, tankA), 4000);
    assert.equal(getLiquidPositionCost(lotId, tankB), 1000);
  });

  it('3. multiple partial transfers', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, tankC, lotId } = setupTwoTankLot(5000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankC, volumeLitres: 300, sourceLotId: lotId });
    assert.equal(getLiquidPositionCost(lotId, tankA), 2500);
    assert.equal(getLiquidPositionCost(lotId, tankB), 1000);
    assert.equal(getLiquidPositionCost(lotId, tankC), 1500);
    assert.equal(getLiquidLotEconomicCost(lotId), 5000);
  });

  it('4. source position cost decreases correctly', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(12000, 1000);
    const before = getLiquidPositionCost(lotId, tankA);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 250, sourceLotId: lotId });
    assert.equal(before - getLiquidPositionCost(lotId, tankA), 3000);
  });

  it('5. destination position cost increases correctly', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(12000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 250, sourceLotId: lotId });
    assert.equal(getLiquidPositionCost(lotId, tankB), 3000);
  });

  it('6. company total unchanged', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, tankC, lotId } = setupTwoTankLot(5000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankC, volumeLitres: 300, sourceLotId: lotId });
    const positionTotal = getLiquidLotPositionCostTotal(lotId);
    assert.equal(positionTotal, 5000);
    assert.equal(getLiquidLotEconomicCost(lotId), 5000);
  });

  it('7. cost/L preserved on homogeneous transfer', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(5000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    assert.equal(getLiquidPositionCost(lotId, tankB) / 200, 5);
    assert.equal(getLiquidPositionCost(lotId, tankA) / 800, 5);
  });

  it('8. cost/LPA preserved appropriately', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(9600, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 500, sourceLotId: lotId });
    const destLpa = 500 * 0.96;
    assert.ok(Math.abs(getLiquidPositionCost(lotId, tankB) / destLpa - 9600 / 960) < 0.01);
  });

  it('9. reversal restores source', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId, costKyd } = setupTwoTankLot();
    const txId = transferLiquid({
      sourceTankId: tankA,
      destinationTankId: tankB,
      volumeLitres: 200,
      sourceLotId: lotId,
    });
    const outTx = queryOne<{ id: number }>(
      `SELECT id FROM liq_transactions WHERE transaction_type = 'Tank Transfer Out'
       AND transaction_group_id = (SELECT transaction_group_id FROM liq_transactions WHERE id = ?)`,
      [txId],
    )!;
    reverseTransaction(outTx.id);
    assert.equal(getLiquidPositionCost(lotId, tankA), costKyd);
  });

  it('10. reversal clears destination position', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    const txId = transferLiquid({
      sourceTankId: tankA,
      destinationTankId: tankB,
      volumeLitres: 200,
      sourceLotId: lotId,
    });
    const outTx = queryOne<{ id: number }>(
      `SELECT id FROM liq_transactions WHERE transaction_type = 'Tank Transfer Out'
       AND transaction_group_id = (SELECT transaction_group_id FROM liq_transactions WHERE id = ?)`,
      [txId],
    )!;
    reverseTransaction(outTx.id);
    assert.equal(getLiquidPositionCost(lotId, tankB), 0);
  });

  it('11. duplicate reversal blocked', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    const txId = transferLiquid({
      sourceTankId: tankA,
      destinationTankId: tankB,
      volumeLitres: 200,
      sourceLotId: lotId,
    });
    const outTx = queryOne<{ id: number }>(
      `SELECT id FROM liq_transactions WHERE transaction_type = 'Tank Transfer Out'
       AND transaction_group_id = (SELECT transaction_group_id FROM liq_transactions WHERE id = ?)`,
      [txId],
    )!;
    reverseTransaction(outTx.id);
    assert.throws(() => reverseTransaction(outTx.id), /already been reversed|already been reversed/i);
    assert.equal(getLiquidLotEconomicCost(lotId), 5000);
  });

  it('12. paired Phase 1D rows not double-counted', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    const movements = listLiquidCostMovements(lotId).filter((m) => m.movement_type === 'Transfer');
    assert.equal(movements.length, 1);
    assert.equal(movements[0]?.transferred_cost_kyd, 1000);
  });

  it('13. transaction group processed once', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    const groupId = queryOne<{ transaction_group_id: string }>(
      `SELECT transaction_group_id FROM liq_transactions WHERE transaction_type = 'Tank Transfer Out' LIMIT 1`,
    )!.transaction_group_id;
    const count = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM cost_liquid_movements WHERE transaction_group_id = ? AND movement_type = 'Transfer'`,
      [groupId],
    )!.count;
    assert.equal(count, 1);
  });

  it('14. lot-specific cost basis', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB } = setupTwoTankLot(5000, 1000);
    const lotB = createLot({
      lot_type: 'Hearts',
      product_id: null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: 'Lot B',
      initial_volume_litres: 500,
      initial_abv: 60,
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
      destination_tank_id: tankA,
      source_lot_id: null,
      destination_lot_id: lotB,
      volume_litres: 500,
      abv: 60,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: '',
      created_by: null,
    });
    createLiquidCostLayer({
      liquidLotId: lotB,
      sourceType: 'Opening Cost',
      effectiveDate: '2026-01-01',
      volumeLitres: 500,
      lpa: 300,
      inputCostKyd: 4000,
    });
    const lotA = queryOne<{ id: number }>(
      `SELECT l.id FROM liq_lots l JOIN liq_transactions t ON t.destination_lot_id = l.id
       WHERE t.destination_tank_id = ? AND l.id != ? LIMIT 1`,
      [tankA, lotB],
    )!.id;
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotA });
    assert.equal(getLiquidPositionCost(lotA, tankB), 1000);
    assert.equal(getLiquidPositionCost(lotB, tankA), 4000);
  });

  it('15. multiple lots not averaged incorrectly', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId: lotA } = setupTwoTankLot(5000, 1000);
    const lotB = createLot({
      lot_type: 'Hearts',
      product_id: null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: 'Lot B high cost',
      initial_volume_litres: 500,
      initial_abv: 60,
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
      destination_tank_id: tankA,
      source_lot_id: null,
      destination_lot_id: lotB,
      volume_litres: 500,
      abv: 60,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: '',
      created_by: null,
    });
    createLiquidCostLayer({
      liquidLotId: lotB,
      sourceType: 'Opening Cost',
      effectiveDate: '2026-01-01',
      volumeLitres: 500,
      lpa: 300,
      inputCostKyd: 4000,
    });
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotA });
    assert.notEqual(getLiquidPositionCost(lotA, tankB), getLiquidPositionCost(lotB, tankA) / 2.5);
    assert.equal(getLiquidPositionCost(lotA, tankB), 1000);
  });

  it('16. transfer followed by proof-down', async () => {
    db = await createCostingTestDb(true);
    const scenario = seedProofDownScenario(db);
    transferLiquid({
      sourceTankId: scenario.sourceTankId,
      destinationTankId: scenario.destTankId,
      volumeLitres: 500,
      sourceLotId: scenario.lotId,
    });
    assert.equal(getLiquidPositionCost(scenario.lotId, scenario.destTankId), 6000);

    const orderId = createOrder({
      productId: scenario.productId,
      recipeId: scenario.recipeId,
      recipeVersionId: scenario.versionId,
      plannedBatchSize: 2400,
      productionType: 'Proof Down',
    });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({
      batchId,
      inputType: 'Liquid Lot',
      liquidLotId: scenario.lotId,
      sourceTankId: scenario.destTankId,
      actualQuantity: 400,
      unit: 'L',
      actualVolumeLitres: 400,
      actualAbv: 96,
    });
    recordInput({
      batchId,
      inputType: 'Water',
      actualQuantity: 600,
      unit: 'L',
      actualVolumeLitres: 600,
    });
    completeBatch({
      batchId,
      destinationTankId: scenario.destTankId,
      actualOutputLitres: 990,
      actualOutputAbv: 40,
      notes: 'Post-transfer proof down',
    });
    const outputLotId = queryOne<{ output_lot_id: number }>('SELECT output_lot_id FROM prod_batches WHERE id = ?', [batchId])!.output_lot_id;
    const outputCost = getLiquidLotTotalCost(outputLotId);
    assert.ok(outputCost >= 4800);
    assert.equal(getLiquidPositionCost(scenario.lotId, scenario.destTankId), 1200);
  });

  it('17. transfer followed by blend', async () => {
    db = await createCostingTestDb(true);
    const scenario = seedBlendScenario(db);
    transferLiquid({
      sourceTankId: scenario.sourceTankId,
      destinationTankId: scenario.destTankId,
      volumeLitres: 200,
      sourceLotId: scenario.lotA,
    });
    transferLiquid({
      sourceTankId: scenario.sourceTankId,
      destinationTankId: scenario.destTankId,
      volumeLitres: 600,
      sourceLotId: scenario.lotB,
    });
    assert.equal(getLiquidPositionCost(scenario.lotA, scenario.destTankId), 2400);

    db.run(`UPDATE rc_recipes SET recipe_type = 'Blending' WHERE id = ?`, [scenario.recipeId]);
    const orderId = createOrder({
      productId: scenario.productId,
      recipeId: scenario.recipeId,
      recipeVersionId: scenario.versionId,
      plannedBatchSize: 1100,
      productionType: 'Blending',
    });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({
      batchId,
      inputType: 'Liquid Lot',
      liquidLotId: scenario.lotA,
      sourceTankId: scenario.destTankId,
      actualQuantity: 200,
      unit: 'L',
      actualVolumeLitres: 200,
      actualAbv: 40,
    });
    recordInput({
      batchId,
      inputType: 'Liquid Lot',
      liquidLotId: scenario.lotB,
      sourceTankId: scenario.destTankId,
      actualQuantity: 600,
      unit: 'L',
      actualVolumeLitres: 600,
      actualAbv: 60,
    });
    completeBatch({
      batchId,
      destinationTankId: scenario.destTankId,
      actualOutputLitres: 790,
      actualOutputAbv: 50,
      notes: 'Blend after transfer',
    });
    const outputLotId = queryOne<{ output_lot_id: number }>('SELECT output_lot_id FROM prod_batches WHERE id = ?', [batchId])!.output_lot_id;
    const blendCost = getLiquidLotTotalCost(outputLotId);
    assert.ok(blendCost >= 6400);
  });

  it('18. transfer followed by loss', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(5000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    const costBeforeLoss = getLiquidPositionCost(lotId, tankB);
    postProcessLoss({
      tankId: tankB,
      lotId,
      volumeLitres: 10,
      abv: 96,
      lossType: 'Sampling',
      reason: 'Measurement Correction',
    });
    assert.equal(getLiquidPositionCost(lotId, tankB), costBeforeLoss);
    assert.equal(getLiquidLotEconomicCost(lotId), 5000);
  });

  it('19. traceability includes transfer', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    const trace = getLiquidCostTraceability(lotId);
    assert.ok(trace.some((t) => t.movementType === 'Transfer'));
    assert.ok(trace.some((t) => t.movementType === 'Initial Position'));
  });

  it('20. valuation UI query shows split positions', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, tankC, lotId } = setupTwoTankLot(5000, 1000);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankC, volumeLitres: 300, sourceLotId: lotId });
    const positions = listLiquidValuationPositions().filter((p) => p.liquid_lot_id === lotId);
    assert.equal(positions.length, 3);
    const lotVals = listLiquidValuations().filter((v) => v.liquid_lot_id === lotId);
    assert.equal(lotVals[0]?.accumulated_cost_kyd, 5000);
  });

  it('21. economic lot total does not increase from transfer', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot(5000, 1000);
    const before = getLiquidLotEconomicCost(lotId);
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 500, sourceLotId: lotId });
    transferLiquid({ sourceTankId: tankB, destinationTankId: tankA, volumeLitres: 100, sourceLotId: lotId });
    assert.equal(getLiquidLotEconomicCost(lotId), before);
  });

  it('22. original cost layer remains immutable', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    const layerBefore = queryOne<{ total_cost_kyd: number }>(
      'SELECT total_cost_kyd FROM cost_liquid_lot_layers WHERE liquid_lot_id = ?',
      [lotId],
    )!.total_cost_kyd;
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    const layerAfter = queryOne<{ total_cost_kyd: number }>(
      'SELECT total_cost_kyd FROM cost_liquid_lot_layers WHERE liquid_lot_id = ?',
      [lotId],
    )!.total_cost_kyd;
    assert.equal(layerBefore, layerAfter);
  });

  it('23. rebuild does not duplicate cost', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId });
    const before = getLiquidPositionCost(lotId, tankB);
    const result = rebuildLiquidTransferCostMovements();
    assert.equal(result.created, 0);
    assert.ok(result.skipped >= 1);
    assert.equal(getLiquidPositionCost(lotId, tankB), before);
  });

  it('24. costing failure does not corrupt Phase 1D quantity ledger', async () => {
    db = await createCostingTestDb(true);
    const { tankA, tankB, lotId } = setupTwoTankLot();
    db.run('DROP TABLE cost_liquid_movements');
    assert.throws(
      () => transferLiquid({ sourceTankId: tankA, destinationTankId: tankB, volumeLitres: 200, sourceLotId: lotId }),
      /no such table|cost_liquid_movements/i,
    );
    const volA = queryOne<{ vol: number }>(
      `SELECT COALESCE(SUM(CASE WHEN destination_tank_id = ? THEN volume_litres ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN source_tank_id = ? THEN volume_litres ELSE 0 END), 0) AS vol
       FROM liq_transactions WHERE source_lot_id = ? OR destination_lot_id = ?`,
      [tankA, tankA, lotId, lotId],
    )!.vol;
    assert.equal(volA, 1000);
  });

  it('25. legacy tanks remain excluded', async () => {
    db = await createCostingTestDb(true);
    const legacyTank = saveTank({
      name: 'Legacy Tank',
      tank_type: 'Spirit Holding',
      capacity_litres: 5000,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEGACY',
      status: 'Active',
      notes: '',
    });
    const lotId = createLot({
      lot_type: 'Purchased Bulk Spirit',
      product_id: null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: 'Legacy lot',
      initial_volume_litres: 500,
      initial_abv: 40,
      status: 'Active',
      source_type: 'Manual',
      source_reference_id: null,
      parent_lot_id: null,
      notes: '',
    });
    db.run(
      `INSERT INTO liq_transactions (
        transaction_code, transaction_type, transaction_timestamp,
        destination_tank_id, destination_lot_id, volume_litres, abv, lpa, notes, created_at
      ) VALUES ('LTX-LEG', 'Bulk Spirit Receipt', datetime('now'), ?, ?, 500, 40, 200, '', datetime('now'))`,
      [legacyTank, lotId],
    );
    createLiquidCostLayer({
      liquidLotId: lotId,
      sourceType: 'Opening Cost',
      effectiveDate: '2026-01-01',
      volumeLitres: 500,
      lpa: 200,
      inputCostKyd: 2500,
    });
    const positions = listLiquidValuationPositions().filter((p) => p.liquid_lot_id === lotId);
    assert.equal(positions.length, 0);
  });
});
