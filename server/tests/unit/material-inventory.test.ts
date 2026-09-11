import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { validateMaterialIdentity } from '../../../shared/material-inventory/validation';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  createMaterialLot,
  createMaterialReconciliation,
  getAvailableMaterialLots,
  getMaterialBalance,
  getMaterialBalanceByLocation,
  getMaterialLot,
  getMaterialLotBalance,
  getMaterialLotBalanceByLocation,
  getMaterialTransactions,
  listMaterialLots,
  normalizeMaterialQuantity,
  postMaterialDamage,
  postMaterialOpeningBalance,
  postMaterialReconciliation,
  postMaterialTransaction,
  previewMaterialReconciliation,
  reverseMaterialTransaction,
  saveMaterialUomConversion,
  setMaterialTrackingMode,
  transferMaterial,
} from '../../../src/db/material-inventory-queries';
import {
  createMaterialTestDb,
  seedPackagingMaterial,
  seedRawMaterial,
  seedSupplierAndLocation,
} from '../helpers/material-test-db';

let db: Database;

describe('Phase 1F material ledger', () => {
  beforeEach(async () => { db = await createMaterialTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('1. creates material lot with readable code', () => {
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, supplierLotNumber: 'SUG-2026' });
    assert.match(getMaterialLot(lotId)?.lot_code ?? '', /^MLT-/);
  });

  it('2. enforces unique lot code', () => {
    const rawId = seedRawMaterial(db);
    db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-DUP', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
    assert.throws(() => {
      db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-DUP', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
    });
  });

  it('3. raw material identity', () => {
    const rawId = seedRawMaterial(db);
    const lot = getMaterialLot(createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId }));
    assert.equal(lot?.raw_material_id, rawId);
  });

  it('4. packaging identity', () => {
    const pkgId = seedPackagingMaterial(db);
    const lot = getMaterialLot(createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId }));
    assert.equal(lot?.packaging_material_id, pkgId);
  });

  it('5. mutual exclusivity validation', () => {
    assert.throws(() => validateMaterialIdentity({ materialType: 'RAW_MATERIAL', rawMaterialId: 1, packagingMaterialId: 2 }));
    assert.throws(() => validateMaterialIdentity({ materialType: 'RAW_MATERIAL' }));
  });

  it('6. receipt increases inventory', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    postMaterialTransaction({
      transactionType: 'Purchase Receipt',
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      destinationLocationId: locA,
      quantity: 120,
      unit: 'each',
      baseQuantity: 120,
      baseUnit: 'each',
    });
    assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 120);
  });

  it('7. base UOM conversion on normalize', () => {
    const pkgId = seedPackagingMaterial(db);
    saveMaterialUomConversion({
      material_type: 'PACKAGING_MATERIAL',
      raw_material_id: null,
      packaging_material_id: pkgId,
      from_unit: 'case',
      to_unit: 'each',
      conversion_factor: 12,
      description: '1 case = 12 each',
      active: 1,
    });
    const n = normalizeMaterialQuantity('PACKAGING_MATERIAL', null, pkgId, 10, 'case');
    assert.equal(n.baseQuantity, 120);
    assert.equal(n.baseUnit, 'each');
  });

  it('8. material-specific conversion chain', () => {
    const pkgId = seedPackagingMaterial(db);
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'pallet', to_unit: 'case', conversion_factor: 80, description: '', active: 1 });
    const n = normalizeMaterialQuantity('PACKAGING_MATERIAL', null, pkgId, 1, 'pallet');
    assert.equal(n.baseQuantity, 960);
  });

  it('9. material balance', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 500, unit: 'kg' });
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 500);
  });

  it('10. balance by location', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 300, unit: 'kg' });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId }), locationId: locB, quantity: 200, unit: 'kg' });
    assert.equal(getMaterialBalanceByLocation('RAW_MATERIAL', rawId, null, locA), 300);
  });

  it('11. balance by lot', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 500, unit: 'kg' });
    assert.equal(getMaterialLotBalance(lotId), 500);
  });

  it('12. transfer between locations', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'kg' });
    transferMaterial({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA, destinationLocationId: locB, quantity: 300, unit: 'kg' });
    assert.equal(getMaterialLotBalanceByLocation(lotId, locA), 700);
    assert.equal(getMaterialLotBalanceByLocation(lotId, locB), 300);
  });

  it('13. transfer preserves lot identity', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    transferMaterial({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA, destinationLocationId: locB, quantity: 30, unit: 'kg' });
    const txs = getMaterialTransactions({ lotId });
    assert.ok(txs.every((t) => t.material_lot_id === lotId));
  });

  it('14. transfer does not change company total', () => {
    const { locA, locB } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'kg' });
    const before = getMaterialBalance('RAW_MATERIAL', rawId, null).onHand;
    transferMaterial({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA, destinationLocationId: locB, quantity: 300, unit: 'kg' });
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, before);
  });

  it('15. insufficient location quantity rejected', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 300, unit: 'kg' });
    assert.throws(
      () => postMaterialTransaction({
        transactionType: 'Production Issue',
        materialType: 'RAW_MATERIAL',
        rawMaterialId: rawId,
        materialLotId: lotId,
        sourceLocationId: locA,
        quantity: 350,
        unit: 'kg',
        baseQuantity: 350,
        baseUnit: 'kg',
      }),
      /Insufficient/,
    );
  });

  it('16. negative inventory rejected', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    assert.throws(
      () => postMaterialDamage({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 150, unit: 'kg', lossType: 'Damage', reason: 'Test' }),
      /Insufficient/,
    );
  });

  it('17. damage decreases balance', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    postMaterialDamage({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 10, unit: 'kg', lossType: 'Damage', reason: 'Breakage' });
    assert.equal(getMaterialLotBalance(lotId), 90);
  });

  it('18. reason required for damage', () => {
    assert.throws(() => postMaterialDamage({ materialType: 'RAW_MATERIAL', rawMaterialId: 1, materialLotId: 1, locationId: 1, quantity: 1, unit: 'kg', lossType: 'Damage', reason: '' }), /reason/i);
  });

  it('19. reconciliation preview does not change inventory', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    previewMaterialReconciliation({
      material_type: 'RAW_MATERIAL', raw_material_id: rawId, packaging_material_id: null,
      material_lot_id: lotId, location_id: locA, system_quantity: 0, physical_quantity: 95,
      variance_quantity: 0, unit: 'kg', base_unit: 'kg', reason: 'Count', counted_by: null, counted_at: null, notes: '',
    });
    assert.equal(getMaterialLotBalance(lotId), 100);
  });

  it('20. reconciliation posting adjusts inventory', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    const recId = createMaterialReconciliation({
      material_type: 'RAW_MATERIAL', raw_material_id: rawId, packaging_material_id: null,
      material_lot_id: lotId, location_id: locA, physical_quantity: 95, unit: 'kg', base_unit: 'kg',
      reason: 'Cycle count', counted_by: 'test', counted_at: new Date().toISOString(), notes: '',
    });
    postMaterialReconciliation(recId);
    assert.equal(getMaterialLotBalance(lotId), 95);
  });

  it('21. opening balance posts inventory', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 250, unit: 'kg' });
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 250);
  });

  it('22. duplicate opening balance blocked', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    assert.throws(
      () => postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 50, unit: 'kg' }),
      /Opening Balance already exists/,
    );
  });

  it('23. reversal exact offset', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    const txId = postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    reverseMaterialTransaction(txId);
    assert.equal(getMaterialLotBalance(lotId), 0);
  });

  it('24. duplicate reversal blocked', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    const txId = postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    reverseMaterialTransaction(txId);
    assert.throws(() => reverseMaterialTransaction(txId), /already been reversed/);
  });

  it('25. reversal causing negative inventory blocked', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId });
    const receiptTx = postMaterialTransaction({
      transactionType: 'Purchase Receipt', materialType: 'RAW_MATERIAL', rawMaterialId: rawId,
      materialLotId: lotId, destinationLocationId: locA, quantity: 1000, unit: 'each', baseQuantity: 1000, baseUnit: 'each',
    });
    postMaterialTransaction({
      transactionType: 'Production Issue', materialType: 'RAW_MATERIAL', rawMaterialId: rawId,
      materialLotId: lotId, sourceLocationId: locA, quantity: 800, unit: 'each', baseQuantity: 800, baseUnit: 'each',
    });
    assert.throws(() => reverseMaterialTransaction(receiptTx), /Insufficient/);
  });

  it('26. quarantine lot prevents issue', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, status: 'Quarantine' });
    db.run(`UPDATE mat_lots SET status = 'Quarantine' WHERE id = ?`, [lotId]);
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    assert.throws(
      () => postMaterialTransaction({
        transactionType: 'Production Issue', materialType: 'RAW_MATERIAL', rawMaterialId: rawId,
        materialLotId: lotId, sourceLocationId: locA, quantity: 10, unit: 'kg', baseQuantity: 10, baseUnit: 'kg',
      }),
      /not eligible/i,
    );
  });

  it('27. FEFO ordering for available lots', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const lot1 = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, expirationDate: '2026-12-01' });
    const lot2 = createMaterialLot({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, expirationDate: '2026-06-01' });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lot1, locationId: locA, quantity: 50, unit: 'kg' });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lot2, locationId: locA, quantity: 50, unit: 'kg' });
    const available = getAvailableMaterialLots('RAW_MATERIAL', rawId, null, locA);
    assert.equal(available[0]?.id, lot2);
  });

  it('historical UOM: stored base_quantity unchanged after conversion table edit', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    const n = normalizeMaterialQuantity('PACKAGING_MATERIAL', null, pkgId, 10, 'case');
    postMaterialTransaction({
      transactionType: 'Purchase Receipt', materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId,
      materialLotId: lotId, destinationLocationId: locA, quantity: 10, unit: 'case', baseQuantity: n.baseQuantity, baseUnit: n.baseUnit,
    });
    db.run(`UPDATE mat_item_uom_conversions SET conversion_factor = 24 WHERE packaging_material_id = ?`, [pkgId]);
    const tx = queryOne<{ base_quantity: number }>('SELECT base_quantity FROM mat_transactions WHERE material_lot_id = ?', [lotId]);
    assert.equal(tx?.base_quantity, 120);
  });
});
