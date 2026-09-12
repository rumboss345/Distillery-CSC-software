/**
 * Phase 1I multi-location inventory — transfers, cycle counts & barcodes.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { queryOne } from '../../../src/db/database';
import { computeFgLotBalance } from '../../../src/db/finished-goods-queries';
import {
  addCycleCountLine,
  cancelTransferDocument,
  createCycleCount,
  createTransferDocument,
  generateBarcodeForEntity,
  getOrCreateInTransitLocation,
  getTransferLines,
  lookupBarcode,
  postCycleCountReconciliation,
  receiveTransferDocument,
  recordCycleCount,
  registerBarcode,
  releaseTransferDocument,
} from '../../../src/db/multi-location-queries';
import {
  createMaterialLot,
  getMaterialLotBalanceByLocation,
  postMaterialOpeningBalance,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import { createCostingTestDb, seedTraceableProductionChain } from '../helpers/quality-test-helpers';
import { seedRawMaterial, seedSupplierAndLocation } from '../helpers/material-test-db';

describe('Phase 1I multi-location inventory', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('creates in-transit system location', async () => {
    db = await createCostingTestDb(true);
    const id = getOrCreateInTransitLocation();
    assert.ok(id > 0);
    const dup = getOrCreateInTransitLocation();
    assert.equal(id, dup);
  });

  it('transfers material cross-location via in-transit', async () => {
    db = await createCostingTestDb(true);
    const { locA } = seedSupplierAndLocation(db);
    db.run(`INSERT INTO md_storage_locations (location_code, name, location_type, active) VALUES ('LOC-C', 'Airport', 'Airport', 1)`);
    const locC = queryOne<{ id: number }>('SELECT id FROM md_storage_locations WHERE location_code = ?', ['LOC-C'])!.id;

    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({
      materialType: 'RAW_MATERIAL',
      rawMaterialId: rawId,
      materialLotId: lotId,
      locationId: locA,
      quantity: 100,
      unit: 'kg',
    });

    const docId = createTransferDocument({
      originLocationId: locA,
      destinationLocationId: locC,
      lines: [{
        inventoryType: 'MATERIAL',
        materialLotId: lotId,
        rawMaterialId: rawId,
        quantity: 40,
        unit: 'kg',
      }],
    });

    releaseTransferDocument(docId);
    const inTransitId = getOrCreateInTransitLocation();
    assert.equal(getMaterialLotBalanceByLocation(lotId, locA), 60);
    assert.equal(getMaterialLotBalanceByLocation(lotId, inTransitId), 40);

    const lines = getTransferLines(docId);
    receiveTransferDocument(docId, [{ lineId: lines[0].id, quantity: 40 }]);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locC), 40);
    assert.equal(getMaterialLotBalanceByLocation(lotId, inTransitId), 0);
  });

  it('supports partial transfer receipt', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    db.run(`INSERT INTO md_storage_locations (location_code, name, location_type, active) VALUES ('LOC-D', 'Tasting Room', 'Retail', 1)`);
    const locD = queryOne<{ id: number }>('SELECT id FROM md_storage_locations WHERE location_code = ?', ['LOC-D'])!.id;

    const balance = computeFgLotBalance(chain.fgLotId, chain.fgLocId);
    const docId = createTransferDocument({
      originLocationId: chain.fgLocId,
      destinationLocationId: locD,
      lines: [{ inventoryType: 'FINISHED_GOODS', fgLotId: chain.fgLotId, skuId: chain.skuId, quantity: balance, unit: 'each' }],
    });
    releaseTransferDocument(docId);
    const lines = getTransferLines(docId);
    receiveTransferDocument(docId, [{ lineId: lines[0].id, quantity: Math.floor(balance / 2) }]);
    const doc = queryOne<{ status: string }>('SELECT status FROM inv_transfer_documents WHERE id = ?', [docId]);
    assert.equal(doc?.status, 'In Transit');
  });

  it('registers and looks up unique barcodes', async () => {
    db = await createCostingTestDb(true);
    registerBarcode({ barcode: 'CSC-FGL-000001', entityType: 'fg_lot', entityId: 1 });
    const found = lookupBarcode('CSC-FGL-000001');
    assert.ok(found);
    assert.throws(() => registerBarcode({ barcode: 'CSC-FGL-000001', entityType: 'sku', entityId: 2 }));
  });

  it('generates entity barcodes', async () => {
    db = await createCostingTestDb(true);
    const code = generateBarcodeForEntity({ entityType: 'material_lot', entityId: 5 });
    assert.match(code, /^MAT-/);
    assert.ok(lookupBarcode(code));
  });

  it('cancels draft transfer without inventory movement', async () => {
    db = await createCostingTestDb(true);
    const { locA, locB } = seedSupplierAndLocation(db);
    const docId = createTransferDocument({
      originLocationId: locA,
      destinationLocationId: locB,
      lines: [{ inventoryType: 'MATERIAL', materialLotId: 1, rawMaterialId: 1, quantity: 1, unit: 'kg' }],
    });
    cancelTransferDocument(docId);
    const doc = queryOne<{ status: string }>('SELECT status FROM inv_transfer_documents WHERE id = ?', [docId]);
    assert.equal(doc?.status, 'Cancelled');
  });

  it('posts cycle count reconciliation for FG variance', async () => {
    db = await createCostingTestDb(true);
    const chain = await seedTraceableProductionChain(db);
    const systemQty = computeFgLotBalance(chain.fgLotId, chain.fgLocId);
    const countId = createCycleCount(chain.fgLocId);
    const lineId = addCycleCountLine({
      cycleCountId: countId,
      inventoryType: 'FINISHED_GOODS',
      fgLotId: chain.fgLotId,
      skuId: chain.skuId,
      systemQuantity: systemQty,
      unit: 'each',
    });
    recordCycleCount({ lineId, countedQuantity: systemQty - 2 });
    postCycleCountReconciliation(countId);
    assert.equal(computeFgLotBalance(chain.fgLotId, chain.fgLocId), systemQty - 2);
  });

  it('prevents duplicate barcode on same entity', async () => {
    db = await createCostingTestDb(true);
    registerBarcode({ barcode: 'UNIQ-001', entityType: 'sku', entityId: 10 });
    assert.throws(() => registerBarcode({ barcode: 'UNIQ-002', entityType: 'sku', entityId: 10 }));
  });
});
