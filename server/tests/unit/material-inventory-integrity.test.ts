/**
 * Phase 1F material inventory integrity review — focused coverage for LEGACY/LEDGER
 * authority, receipt safety, opening balances, production cross-ledger atomicity.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  activateMaterialLedgerTracking,
  createMaterialLot,
  createMaterialReconciliation,
  getMaterialBalance,
  getMaterialLotBalance,
  getMaterialLotBalanceByLocation,
  getMaterialTrackingMode,
  getBatchMaterialTransactions,
  getMaterialTransactions,
  normalizeMaterialQuantity,
  postMaterialOpeningBalance,
  postMaterialReconciliation,
  postMaterialTransaction,
  postProductionIssue,
  postProductionReturn,
  previewMaterialReconciliation,
  reverseMaterialTransaction,
  saveMaterialUomConversion,
  setMaterialTrackingMode,
  transferMaterial,
} from '../../../src/db/material-inventory-queries';
import { convertQuantity } from '../../../shared/material-inventory/uom-conversion';
import {
  addPurchaseOrderLine,
  addReceiptLine,
  closePurchaseOrder,
  createPurchaseOrder,
  createReceipt,
  getPurchaseOrder,
  getReceipt,
  getReceiptLines,
  getReceivedQuantity,
  getRemainingQuantity,
  postDirectReceipt,
  postReceipt,
  postSupplierReturn,
  reverseReceipt,
  submitPurchaseOrder,
} from '../../../src/db/purchasing-queries';
import {
  cancelBatch,
  completeBatch,
  createOrder,
  getBatch,
  planOrder,
  recordInput,
  releaseOrder,
  startBatch,
} from '../../../src/db/production-orders-queries';
import { postOpeningBalance, saveTank } from '../../../src/db/liquid-ledger-queries';
import {
  activateRecipeVersion,
  getRecipeVersion,
  saveRecipe,
  saveRecipeIngredient,
  saveRecipeVersion,
} from '../../../src/db/recipes-queries';
import {
  createMaterialTestDb,
  seedPackagingMaterial,
  seedRawMaterial,
  seedSupplierAndLocation,
} from '../helpers/material-test-db';

let db: Database;

const FLOOR_STUB = `
CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, floor_plan_id INTEGER DEFAULT 1, name TEXT NOT NULL,
  equipment_type TEXT DEFAULT 'holding_tank', tracking_mode TEXT DEFAULT 'LEGACY', created_at TEXT DEFAULT (datetime('now'))
);
`;

function legacyInventoryQty(name: string): number {
  return queryOne<{ quantity: number }>('SELECT quantity FROM inventory_items WHERE name = ?', [name])?.quantity ?? 0;
}

function seedProofDownWithRawMaterial() {
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-INT', 'Test Spirit', 'Vodka', 'Active')`);
  const productId = queryOne<{ id: number }>('SELECT id FROM md_products WHERE product_code = ?', ['PROD-INT'])!.id;
  db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-INT', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
  const bulkSpiritId = queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits WHERE spirit_code = ?', ['BS-INT'])!.id;
  const rawId = seedRawMaterial(db);
  activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'TEST-SEED');
  const recipeId = saveRecipe({ product_id: productId, name: 'Test', description: '', recipe_type: 'Proof Down', status: 'Development' });
  const versionId = queryOne<{ id: number }>('SELECT id FROM rc_recipe_versions WHERE recipe_id = ?', [recipeId])!.id;
  const version = getRecipeVersion(versionId)!;
  saveRecipeVersion(versionId, {
    version_label: version.version_label, status: 'Draft', effective_date: null,
    target_batch_size: 1000, batch_size_unit: 'L', target_abv: 40,
    expected_yield_percent: null, expected_final_volume_litres: null,
    target_brix: null, target_ph: null, target_carbonation_volumes: null,
    instructions: '', notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Bulk Spirit', raw_material_id: null, bulk_spirit_id: bulkSpiritId,
    source_lot_id: null, description: 'NGS', quantity: 400, unit: 'L', quantity_basis: 'Per Batch', sequence: 1, optional: 0, notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Raw Material', raw_material_id: rawId, bulk_spirit_id: null,
    source_lot_id: null, description: 'Sugar', quantity: 50, unit: 'kg', quantity_basis: 'Per Batch', sequence: 2, optional: 0, notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Water', raw_material_id: null, bulk_spirit_id: null,
    source_lot_id: null, description: 'Water', quantity: 600, unit: 'L', quantity_basis: 'Per Batch', sequence: 3, optional: 0, notes: '',
  });
  activateRecipeVersion(recipeId, versionId);
  return { productId, recipeId, versionId, rawId };
}

function seedMaterialLot(rawId: number, locA: number, qty: number) {
  db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-INT', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
  const lotId = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', ['MLT-INT'])!.id;
  postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: qty, unit: 'kg' });
  return lotId;
}

function seedLiquidTanks() {
  const sourceTankId = saveTank({ name: 'NGS', tank_type: 'Spirit Holding', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  const destTankId = saveTank({ name: 'Finished', tank_type: 'Finished Spirit', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  postOpeningBalance({ tankId: sourceTankId, lotType: 'Purchased Bulk Spirit', description: 'NGS', volumeLitres: 5000, abv: 96, effectiveDate: '2026-01-01' });
  const lotId = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  return { sourceTankId, destTankId, lotId };
}

describe('Phase 1F material inventory integrity', () => {
  beforeEach(async () => {
    db = await createMaterialTestDb(true);
    db.run(FLOOR_STUB);
  });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('1. LEGACY material receipt posting blocked', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    db.run(`UPDATE inventory_items SET quantity = 5000 WHERE name = 'Legacy Sugar'`);
    assert.equal(getMaterialTrackingMode('PACKAGING_MATERIAL', pkgId), 'LEGACY');
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(poId);
    const receiptId = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 1000, acceptedQuantity: 1000, unit: 'each' });
    assert.throws(() => postReceipt(receiptId), /LEGACY-tracked/);
    assert.equal(getMaterialTransactions({ packagingMaterialId: pkgId }).length, 0);
    assert.equal(getMaterialLotBalanceByLocation(getReceiptLines(receiptId)[0]!.material_lot_id!, locA), 0);
    assert.equal(getReceivedQuantity(lineId), 0);
    assert.equal(getMaterialTrackingMode('PACKAGING_MATERIAL', pkgId), 'LEGACY');
    assert.equal(legacyInventoryQty('Legacy Sugar'), 5000);
  });

  it('2-4. explicit LEDGER activation, zero inventory until opening/receipt, downgrade blocked', () => {
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'MIG-2026-001');
    assert.equal(getMaterialTrackingMode('RAW_MATERIAL', rawId), 'LEDGER');
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 0);
    const activated = queryOne<{ ledger_activation_reference: string }>(
      'SELECT ledger_activation_reference FROM md_raw_materials WHERE id = ?',
      [rawId],
    );
    assert.equal(activated?.ledger_activation_reference, 'MIG-2026-001');
    const { locA } = seedSupplierAndLocation(db);
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    assert.throws(
      () => setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEGACY'),
      /Cannot downgrade to LEGACY/,
    );
  });

  it('5. no LEGACY + LEDGER double count in UI paths', () => {
    const pkgId = seedPackagingMaterial(db);
    assert.equal(getMaterialTrackingMode('PACKAGING_MATERIAL', pkgId), 'LEGACY');
    assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 0);
    db.run(`INSERT INTO inventory_items (name, quantity, unit) VALUES ('750mL Bottle Legacy', 5000, 'each')`);
    assert.equal(legacyInventoryQty('750mL Bottle Legacy'), 5000);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'MIG-PKG');
    const { locA } = seedSupplierAndLocation(db);
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    postMaterialOpeningBalance({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'each' });
    assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 1000);
    assert.equal(legacyInventoryQty('750mL Bottle Legacy'), 5000);
  });

  it('6-7. opening same lot multi-location; duplicate lot+location blocked', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'OB-TEST');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 600, unit: 'kg' });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locB, quantity: 400, unit: 'kg' });
    assert.equal(getMaterialLotBalance(lotId), 1000);
    assert.throws(
      () => postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 600, unit: 'kg' }),
      /already exists for this material lot at this location/,
    );
  });

  it('8-9. lot multi-location aggregation; ambiguous UOM conversion rejected', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'XFER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'kg' });
    transferMaterial({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA, destinationLocationId: locB, quantity: 300, unit: 'kg' });
    assert.equal(getMaterialLotBalance(lotId), 1000);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locA), 700);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locB), 300);

    const pkgId = seedPackagingMaterial(db);
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'pallet', to_unit: 'case', conversion_factor: 80, description: '', active: 1 });
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'pallet', to_unit: 'each', conversion_factor: 1000, description: 'conflict', active: 1 });
    const conversions = [{ from_unit: 'case', to_unit: 'each', conversion_factor: 12 }, { from_unit: 'pallet', to_unit: 'case', conversion_factor: 80 }, { from_unit: 'pallet', to_unit: 'each', conversion_factor: 1000 }];
    assert.throws(() => convertQuantity(1, 'pallet', 'each', conversions), /Ambiguous conversion/);
  });

  it('10. UOM direction: 10 CASE @ 12 EACH/CASE = 120 EACH', () => {
    const pkgId = seedPackagingMaterial(db);
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    const { baseQuantity } = normalizeMaterialQuantity('PACKAGING_MATERIAL', null, pkgId, 10, 'case');
    assert.equal(baseQuantity, 120);
  });

  it('11. historical UOM snapshot unchanged after conversion change', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'UOM-HIST');
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 10, acceptedQuantity: 10, unit: 'case' });
    postReceipt(receiptId);
    const tx = queryOne<{ base_quantity: number }>('SELECT base_quantity FROM mat_transactions WHERE receipt_id = ?', [receiptId]);
    assert.equal(tx?.base_quantity, 120);
    db.run(`UPDATE mat_item_uom_conversions SET conversion_factor = 24 WHERE packaging_material_id = ? AND from_unit = 'case'`, [pkgId]);
    const txAfter = queryOne<{ base_quantity: number }>('SELECT base_quantity FROM mat_transactions WHERE receipt_id = ?', [receiptId]);
    assert.equal(txAfter?.base_quantity, 120);
  });

  it('12. receipt duplicate posting blocked', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'RCV-DUP');
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 50, acceptedQuantity: 50, unit: 'kg' });
    postReceipt(receiptId);
    assert.throws(() => postReceipt(receiptId), /Receipt already posted/);
    assert.equal(getMaterialTransactions({ rawMaterialId: rawId }).filter((t) => t.transaction_type === 'Purchase Receipt').length, 1);
  });

  it('13. multi-line receipt atomic rollback on LEGACY line', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    const pkgId = seedPackagingMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'ATOMIC');
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 50, acceptedQuantity: 50, unit: 'kg' });
    addReceiptLine({ receiptId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 100, acceptedQuantity: 100, unit: 'each' });
    assert.throws(() => postReceipt(receiptId), /LEGACY-tracked/);
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 0);
    assert.equal(getReceipt(receiptId)?.status, 'Draft');
  });

  it('14-16. receipt reversal updates PO status; rejected leaves PO remainder', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'PO-REV');
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(poId);
    const r1 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId: r1, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 600, acceptedQuantity: 600, unit: 'each' });
    postReceipt(r1);
    const r2 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-10', receivingLocationId: locA });
    addReceiptLine({ receiptId: r2, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 400, acceptedQuantity: 400, unit: 'each' });
    postReceipt(r2);
    assert.equal(getPurchaseOrder(poId)?.status, 'Received');
    reverseReceipt(r2);
    assert.equal(getPurchaseOrder(poId)?.status, 'Partially Received');
    assert.equal(getReceivedQuantity(lineId), 600);
    assert.equal(getRemainingQuantity(lineId), 400);

    const rejectPo = createPurchaseOrder({ supplierId, orderDate: '2026-02-01' });
    const rejectLine = addPurchaseOrderLine({ purchaseOrderId: rejectPo, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(rejectPo);
    const rejectRcv = createReceipt({ purchaseOrderId: rejectPo, supplierId, receivedDate: '2026-02-05', receivingLocationId: locA });
    addReceiptLine({ receiptId: rejectRcv, purchaseOrderLineId: rejectLine, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 1000, acceptedQuantity: 980, rejectedQuantity: 20, unit: 'each' });
    postReceipt(rejectRcv);
    assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 600 + 980);
    assert.equal(getReceivedQuantity(rejectLine), 980);
    assert.equal(getRemainingQuantity(rejectLine), 20);
    assert.equal(getPurchaseOrder(rejectPo)?.status, 'Partially Received');
  });

  it('17. expired-by-date lot cannot issue even if status Released', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'EXP');
    db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status, expiration_date) VALUES ('MLT-EXP', 'RAW_MATERIAL', ?, 'Released', '2020-01-01')`, [rawId]);
    const lotId = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', ['MLT-EXP'])!.id;
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    assert.throws(
      () => postProductionIssue({
        materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA,
        quantity: 10, unit: 'kg', baseQuantity: 10, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-EXP',
      }),
      /past expiration/,
    );
  });

  it('18. lot status issue restrictions', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'STATUS');
    for (const [code, status] of [['MLT-Q', 'Quarantine'], ['MLT-R', 'Rejected'], ['MLT-X', 'Expired']] as const) {
      db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES (?, 'RAW_MATERIAL', ?, ?)`, [code, rawId, status]);
      const lotId = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', [code])!.id;
      postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 50, unit: 'kg' });
      assert.throws(
        () => postProductionIssue({
          materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA,
          quantity: 5, unit: 'kg', baseQuantity: 5, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: `MGO-${code}`,
        }),
        /not eligible for production issue/,
      );
    }
  });

  it('19-20. transfer no double-count; reversal restores locations', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'XFER-REV');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    const txId = postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'kg' });
    const groupId = transferMaterial({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA, destinationLocationId: locB, quantity: 300, unit: 'kg' });
    assert.equal(getMaterialLotBalanceByLocation(lotId, locA), 700);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locB), 300);
    assert.equal(getMaterialLotBalance(lotId), 1000);
    const xferTxs = getMaterialTransactions({ lotId }).filter((t) => t.transaction_group_id === groupId);
    reverseMaterialTransaction(xferTxs[0]!.id);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locA), 1000);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locB), 0);
    assert.equal(getMaterialLotBalance(lotId), 1000);
    void txId;
  });

  it('21. production material revalidation at completion blocks insufficient stock', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial();
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const { sourceTankId, destTankId, lotId } = seedLiquidTanks();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    db.run(`INSERT INTO mat_transactions (transaction_code, transaction_type, transaction_timestamp, material_type, raw_material_id, material_lot_id, source_location_id, quantity, unit, base_quantity, base_unit, notes, created_at)
      VALUES ('MTX-CONSUME', 'Production Issue', datetime('now'), 'RAW_MATERIAL', ?, ?, ?, 460, 'kg', 460, 'kg', 'Other batch', datetime('now'))`, [rawId, matLotId, locA]);
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Variance' }),
      /Insufficient/,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');
    assert.equal(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM mat_transactions WHERE production_batch_id = ?', [batchId])?.count, 0);
  });

  it('22. material+liquid cross-ledger atomic rollback on completion failure', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial();
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const { sourceTankId, lotId } = seedLiquidTanks();
    const tinyDest = saveTank({ name: 'Tiny', tank_type: 'Finished Spirit', capacity_litres: 10, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    const matBefore = getMaterialLotBalance(matLotId);
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: tinyDest, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Capacity fail' }),
      /capacity/i,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');
    assert.equal(getMaterialLotBalance(matLotId), matBefore);
    assert.equal(getBatchMaterialTransactions(batchId).length, 0);
  });

  it('23-24. production return bounded by net issued', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'RET');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 200, unit: 'kg' });
    postProductionIssue({
      materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA,
      quantity: 100, unit: 'kg', baseQuantity: 100, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-I1',
    });
    postProductionReturn({
      materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, destinationLocationId: locA,
      quantity: 60, unit: 'kg', baseQuantity: 60, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-R1',
    });
    postProductionReturn({
      materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, destinationLocationId: locA,
      quantity: 40, unit: 'kg', baseQuantity: 40, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-R2',
    });
    assert.throws(
      () => postProductionReturn({
        materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, destinationLocationId: locA,
        quantity: 1, unit: 'kg', baseQuantity: 1, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-R3',
      }),
      /exceeds net issued/,
    );
  });

  it('25. supplier return blocked when insufficient lot balance', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'SUP-RET');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 50, unit: 'kg' });
    assert.throws(
      () => postSupplierReturn({
        materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA,
        quantity: 100, unit: 'kg', reason: 'Defective',
      }),
      /Insufficient/,
    );
  });

  it('26-27. reconciliation negative and positive variance', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    activateMaterialLedgerTracking('RAW_MATERIAL', rawId, 'RECON');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'kg' });
    const preview = previewMaterialReconciliation({
      material_type: 'RAW_MATERIAL', raw_material_id: rawId, packaging_material_id: null,
      material_lot_id: lotId, location_id: locA, system_quantity: 0, physical_quantity: 992,
      variance_quantity: 0, unit: 'kg', base_unit: 'kg', reason: 'Count', counted_by: 'test', counted_at: null, notes: '',
    });
    assert.equal(preview.variance_quantity, -8);
    assert.equal(getMaterialLotBalance(lotId), 1000);
    const reconId = createMaterialReconciliation({
      material_type: 'RAW_MATERIAL', raw_material_id: rawId, packaging_material_id: null,
      material_lot_id: lotId, location_id: locA, physical_quantity: 992, unit: 'kg', base_unit: 'kg',
      reason: 'Count', counted_by: 'test', counted_at: new Date().toISOString(), notes: '',
    });
    postMaterialReconciliation(reconId);
    assert.equal(getMaterialLotBalance(lotId), 992);
    const reconUpId = createMaterialReconciliation({
      material_type: 'RAW_MATERIAL', raw_material_id: rawId, packaging_material_id: null,
      material_lot_id: lotId, location_id: locA, physical_quantity: 995, unit: 'kg', base_unit: 'kg',
      reason: 'Recount', counted_by: 'test', counted_at: new Date().toISOString(), notes: '',
    });
    postMaterialReconciliation(reconUpId);
    assert.equal(getMaterialLotBalance(lotId), 995);
  });

  it('28. PO close-short preserves discrepancy', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'CLOSE');
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(poId);
    const r1 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId: r1, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 980, acceptedQuantity: 980, unit: 'each' });
    postReceipt(r1);
    closePurchaseOrder(poId);
    assert.equal(getPurchaseOrder(poId)?.status, 'Closed');
    assert.equal(getReceivedQuantity(lineId), 980);
    assert.equal(getRemainingQuantity(lineId), 20);
  });

  it('29. historical cost and cost_unit snapshot on receipt', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'COST');
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 10, acceptedQuantity: 10, unit: 'case', unitCost: 120, currency: 'USD' });
    postReceipt(receiptId);
    const tx = queryOne<{ unit_cost: number; cost_unit: string; base_quantity: number }>(
      'SELECT unit_cost, cost_unit, base_quantity FROM mat_transactions WHERE receipt_id = ?',
      [receiptId],
    );
    assert.equal(tx?.unit_cost, 120);
    assert.equal(tx?.cost_unit, 'case');
    assert.equal(tx?.base_quantity, 120);
  });

  it('30. end-to-end traceability Supplier → PUR → RCV → MLT → MTX → Batch', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial();
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, orderedQuantity: 100, unit: 'kg', unitPrice: 2 });
    submitPurchaseOrder(poId);
    const receiptId = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId, purchaseOrderLineId: lineId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 100, acceptedQuantity: 100, unit: 'kg', supplierLotNumber: 'SUP-LOT-1' });
    postReceipt(receiptId);
    const lotId = getReceiptLines(receiptId)[0]!.material_lot_id!;
    const { sourceTankId, destTankId, lotId: liqLotId } = seedLiquidTanks();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: liqLotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Trace test' });
    const lotRow = queryOne<{ supplier_lot_number: string }>(
      'SELECT supplier_lot_number FROM mat_lots WHERE id = ?',
      [lotId],
    );
    assert.equal(lotRow?.supplier_lot_number, 'SUP-LOT-1');
    const chain = queryOne<{ supplier_name: string; po_code: string; receipt_code: string; lot_code: string }>(
      `SELECT s.company_name AS supplier_name, po.po_code, r.receipt_code, l.lot_code
       FROM mat_lots l
       JOIN pur_receipt_lines rl ON rl.material_lot_id = l.id
       JOIN pur_receipts r ON r.id = rl.receipt_id
       JOIN pur_purchase_orders po ON po.id = r.purchase_order_id
       JOIN md_suppliers s ON s.id = po.supplier_id
       WHERE l.id = ?`,
      [lotId],
    );
    assert.ok(chain?.supplier_name);
    assert.match(chain?.po_code ?? '', /^PUR-/);
    assert.match(chain?.receipt_code ?? '', /^RCV-/);
    assert.match(chain?.lot_code ?? '', /^MLT-/);
    const batchIssue = getMaterialTransactions({ productionBatchId: batchId }).find((t) => t.transaction_type === 'Production Issue');
    assert.equal(batchIssue?.material_lot_id, lotId);
  });

  it('31. discrete EACH rejects fractional base quantity', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'DISCRETE');
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    assert.throws(
      () => postMaterialTransaction({
        transactionType: 'Opening Balance',
        materialType: 'PACKAGING_MATERIAL',
        packagingMaterialId: pkgId,
        materialLotId: lotId,
        destinationLocationId: locA,
        quantity: 1.5,
        unit: 'each',
        baseQuantity: 1.5,
        baseUnit: 'each',
      }),
      /whole-number quantities/,
    );
  });

  it('32. LEGACY receipt then activate then post succeeds', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(poId);
    const receiptId = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 1000, acceptedQuantity: 1000, unit: 'each' });
    assert.throws(() => postReceipt(receiptId), /LEGACY-tracked/);
    activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'MIG-ACTIVATE');
    postMaterialOpeningBalance({
      materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId,
      materialLotId: createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId }),
      locationId: locA, quantity: 5000, unit: 'each', notes: 'Legacy migration opening balance',
    });
    postReceipt(receiptId);
    assert.equal(getReceivedQuantity(lineId), 1000);
    assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 6000);
  });
});
