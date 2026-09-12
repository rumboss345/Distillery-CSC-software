/**
 * Phase 1K QA/QC — specifications, samples, holds, COA & recall traceability.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import { postFgShipment } from '../../../src/db/finished-goods-queries';
import { createBlend, saveTank } from '../../../src/db/liquid-ledger-queries';
import { postProductionIssue } from '../../../src/db/material-inventory-queries';
import {
  addSpecParameter,
  createSample,
  createSpecification,
  generateInternalCoa,
  listHolds,
  placeHold,
  recordTestResult,
  releaseHold,
  traceRecallBackward,
  traceRecallForward,
} from '../../../src/db/quality-queries';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import {
  createCostingTestDb,
  seedTraceableProductionChain,
} from '../helpers/quality-test-helpers';

describe('Phase 1K QA/QC', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('creates specification with parameters', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const specId = createSpecification({ name: 'Vodka 750mL QC', specType: 'SKU', skuId: chain.skuId });
    addSpecParameter({
      specificationId: specId,
      parameterCode: 'ABV',
      parameterName: 'ABV %',
      parameterType: 'numeric',
      minValue: 39.5,
      maxValue: 40.5,
      unit: '%',
    });
    const params = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM qc_spec_parameters WHERE specification_id = ?',
      [specId],
    );
    assert.equal(params?.count, 1);
  });

  it('records test results and evaluates pass/fail', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const specId = createSpecification({ name: 'Packaging QC', specType: 'SKU', skuId: chain.skuId });
    const paramId = addSpecParameter({
      specificationId: specId,
      parameterCode: 'FILL',
      parameterName: 'Fill Level',
      parameterType: 'numeric',
      minValue: 740,
      maxValue: 760,
    });
    const sampleId = createSample({
      sampleType: 'Finished',
      sourceEntityType: 'fg_lot',
      sourceEntityId: chain.fgLotId,
      specificationId: specId,
    });
    recordTestResult({
      sampleId,
      parameterId: paramId,
      parameterName: 'Fill Level',
      resultType: 'numeric',
      resultNumeric: 750,
    });
    const sample = queryOne<{ status: string; overall_pass_fail: string }>(
      'SELECT status, overall_pass_fail FROM qc_samples WHERE id = ?',
      [sampleId],
    );
    assert.equal(sample?.status, 'Complete');
    assert.equal(sample?.overall_pass_fail, 'Pass');
  });

  it('generates internal COA for complete sample', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const specId = createSpecification({ name: 'FG COA Spec', specType: 'FinishedGoods', skuId: chain.skuId });
    addSpecParameter({
      specificationId: specId,
      parameterCode: 'APPEARANCE',
      parameterName: 'Appearance',
      parameterType: 'pass_fail',
    });
    const sampleId = createSample({
      sampleType: 'Finished',
      sourceEntityType: 'fg_lot',
      sourceEntityId: chain.fgLotId,
      specificationId: specId,
    });
    recordTestResult({
      sampleId,
      parameterName: 'Appearance',
      resultType: 'pass_fail',
      resultValue: 'Pass',
      passFail: 'Pass',
    });
    const coaId = generateInternalCoa(sampleId, 'qc-lab');
    const coa = queryOne<{ status: string; document_snapshot: string }>(
      'SELECT status, document_snapshot FROM qc_coa_documents WHERE id = ?',
      [coaId],
    );
    assert.equal(coa?.status, 'Issued');
    assert.ok(coa?.document_snapshot.includes('"coaType": "Internal"'));
  });

  it('hold blocks production issue', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    placeHold({ entityType: 'mat_lot', entityId: chain.pkgLotId, reason: 'Failed incoming inspection' });
    assert.throws(
      () =>
        postProductionIssue({
          materialType: 'PACKAGING_MATERIAL',
          packagingMaterialId: queryOne<{ id: number }>('SELECT id FROM md_packaging_materials LIMIT 1')!.id,
          materialLotId: chain.pkgLotId,
          sourceLocationId: queryOne<{ id: number }>('SELECT id FROM md_storage_locations LIMIT 1')!.id,
          quantity: 10,
          unit: 'each',
          baseQuantity: 10,
          baseUnit: 'each',
          productionOrderId: 1,
          productionBatchId: chain.batchId,
          transactionGroupId: 'MGO-HOLD-TEST',
        }),
      /Quality hold blocks production issue/i,
    );
  });

  it('hold blocks blend', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const destTankId = saveTank({
      name: 'Blend Dest',
      tank_type: 'Blending Tank',
      capacity_litres: 5000,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEDGER',
      status: 'Active',
      notes: '',
    });
    placeHold({ entityType: 'liq_lot', entityId: chain.outputLotId, reason: 'Pending QC release' });
    assert.throws(
      () =>
        createBlend({
          sourceTankId: chain.scenario.destTankId,
          destinationTankId: destTankId,
          consumptions: [
            { lotId: chain.outputLotId, volumeLitres: 100 },
            { lotId: chain.scenario.lotId, volumeLitres: 50 },
          ],
          outputDescription: 'Blend test',
        }),
      /Quality hold blocks blend/i,
    );
  });

  it('hold blocks FG shipment', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    placeHold({ entityType: 'fg_lot', entityId: chain.fgLotId, reason: 'Awaiting COA' });
    assert.throws(
      () =>
        postFgShipment({
          fgLotId: chain.fgLotId,
          sourceLocationId: chain.fgLocId,
          quantity: 10,
        }),
      /Quality hold blocks shipment/i,
    );
  });

  it('release hold allows shipment again', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const holdId = placeHold({ entityType: 'fg_lot', entityId: chain.fgLotId, reason: 'Temporary hold' });
    releaseHold({ holdId, releaseNotes: 'COA approved' });
    assert.equal(listHolds({ status: 'Active' }).length, 0);
    const txId = postFgShipment({
      fgLotId: chain.fgLotId,
      sourceLocationId: chain.fgLocId,
      quantity: 5,
    });
    assert.ok(txId > 0);
  });

  it('forward recall trace links supplier lot to FG lots', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const trace = traceRecallForward(chain.supplierLotNumber);
    assert.equal(trace.direction, 'forward');
    assert.ok(trace.nodes.some((n) => n.level === 'material_lot'));
    assert.ok(trace.nodes.some((n) => n.level === 'production_batch'));
    assert.ok(trace.nodes.some((n) => n.level === 'liquid_lot'));
    assert.ok(trace.nodes.some((n) => n.level === 'fg_lot' && n.id === chain.fgLotId));
  });

  it('backward recall trace links FG lot to supplier lot', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const trace = traceRecallBackward(chain.fgLotId);
    assert.equal(trace.direction, 'backward');
    assert.ok(trace.nodes.some((n) => n.level === 'fg_lot' && n.id === chain.fgLotId));
    assert.ok(trace.nodes.some((n) => n.level === 'material_lot' && n.id === chain.pkgLotId));
    assert.ok(trace.nodes.some((n) => n.level === 'supplier_lot' && n.code === chain.supplierLotNumber));
  });
});
