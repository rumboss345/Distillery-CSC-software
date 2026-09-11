import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  getMaterialBalance,
  getMaterialLotBalance,
  getMaterialTransactions,
  saveMaterialUomConversion,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import {
  addPurchaseOrderLine,
  addReceiptLine,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createReceipt,
  getPurchaseOrder,
  getPurchaseOrderLines,
  getPurchaseOrderSubtotal,
  getReceipt,
  getReceiptLines,
  getReceivedQuantity,
  getRemainingQuantity,
  postDirectReceipt,
  postReceipt,
  reverseReceipt,
  submitPurchaseOrder,
  updateDraftPurchaseOrder,
} from '../../../src/db/purchasing-queries';
import {
  createMaterialTestDb,
  seedPackagingMaterial,
  seedRawMaterial,
  seedSupplierAndLocation,
} from '../helpers/material-test-db';

let db: Database;

describe('Phase 1F purchasing', () => {
  beforeEach(async () => { db = await createMaterialTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('28. creates Draft PO', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    assert.equal(getPurchaseOrder(poId)?.status, 'Draft');
    assert.match(getPurchaseOrder(poId)?.po_code ?? '', /^PUR-/);
  });

  it('29. unique PUR code', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const a = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const b = createPurchaseOrder({ supplierId, orderDate: '2026-01-02' });
    assert.notEqual(getPurchaseOrder(a)?.po_code, getPurchaseOrder(b)?.po_code);
  });

  it('30. supplier required', () => {
    assert.throws(() => createPurchaseOrder({ supplierId: 0, orderDate: '2026-01-01' }), /Supplier/);
  });

  it('31. multiple PO lines', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 10, unit: 'pallet', unitPrice: 500 });
    addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 20, unit: 'case', unitPrice: 75 });
    assert.equal(getPurchaseOrderLines(poId).length, 2);
  });

  it('32. PO subtotal', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 10, unit: 'pallet', unitPrice: 500 });
    assert.equal(getPurchaseOrderSubtotal(poId), 5000);
  });

  it('33. submit PO', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 10, unit: 'case', unitPrice: 50 });
    submitPurchaseOrder(poId);
    assert.equal(getPurchaseOrder(poId)?.status, 'Submitted');
  });

  it('34. Draft editable', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01', notes: 'A' });
    updateDraftPurchaseOrder(poId, { notes: 'B' });
    assert.equal(getPurchaseOrder(poId)?.notes, 'B');
  });

  it('35. Submitted line protection', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 10, unit: 'case', unitPrice: 50 });
    submitPurchaseOrder(poId);
    assert.throws(
      () => addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1, unit: 'case', unitPrice: 1 }),
      /Draft/,
    );
  });

  it('36-39. partial receipt and completion flow', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(poId);

    const r1 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId: r1, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 600, acceptedQuantity: 600, unit: 'each', unitCost: 1, currency: 'USD' });
    postReceipt(r1);
    assert.equal(getPurchaseOrder(poId)?.status, 'Partially Received');
    assert.equal(getReceivedQuantity(lineId), 600);

    const r2 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-10', receivingLocationId: locA });
    addReceiptLine({ receiptId: r2, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 400, acceptedQuantity: 400, unit: 'each' });
    postReceipt(r2);
    assert.equal(getPurchaseOrder(poId)?.status, 'Received');
    assert.equal(getRemainingQuantity(lineId), 0);
  });

  it('40. over-receipt blocked', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 1000, unit: 'each', unitPrice: 1 });
    submitPurchaseOrder(poId);
    const r1 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId: r1, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 800, acceptedQuantity: 800, unit: 'each' });
    postReceipt(r1);
    const r2 = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-10', receivingLocationId: locA });
    assert.throws(
      () => addReceiptLine({ receiptId: r2, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 250, acceptedQuantity: 250, unit: 'each' }),
      /Over-receipt/,
    );
  });

  it('41. direct receipt without PO', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const receiptId = postDirectReceipt({
      supplierId, receivedDate: '2026-01-01', receivingLocationId: locA,
      materialType: 'RAW_MATERIAL', rawMaterialId: rawId, acceptedQuantity: 100, unit: 'kg',
    });
    assert.equal(getReceipt(receiptId)?.purchase_order_id, null);
    assert.equal(getReceipt(receiptId)?.status, 'Posted');
  });

  it('42-43. supplier lot and CSC lot preserved', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({
      receiptId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId,
      receivedQuantity: 100, acceptedQuantity: 100, unit: 'kg', supplierLotNumber: 'ABC-77889',
    });
    const line = getReceiptLines(receiptId)[0];
    assert.equal(line?.supplier_lot_number, 'ABC-77889');
    assert.match(line?.lot_code ?? '', /^MLT-/);
  });

  it('44-45. accepted vs rejected quantities', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({
      receiptId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId,
      receivedQuantity: 1000, acceptedQuantity: 980, rejectedQuantity: 20, unit: 'each',
    });
    postReceipt(receiptId);
    assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 980);
  });

  it('46-47. posted receipt creates ledger; draft does not', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const draftId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId: draftId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 50, acceptedQuantity: 50, unit: 'kg' });
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 0);
    postReceipt(draftId);
    assert.ok(getMaterialTransactions({ rawMaterialId: rawId }).length >= 1);
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 50);
  });

  it('48. failed receipt rolls back', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 50, acceptedQuantity: 50, unit: 'kg' });
    db.run(`DELETE FROM pur_receipt_lines WHERE receipt_id = ?`, [receiptId]);
    assert.throws(() => postReceipt(receiptId), /at least one line/);
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 0);
  });

  it('49. receipt group linkage', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 50, acceptedQuantity: 50, unit: 'kg' });
    const groupId = postReceipt(receiptId);
    assert.ok(getReceipt(receiptId)?.transaction_group_id);
    assert.ok(getMaterialTransactions({ rawMaterialId: rawId }).every((t) => t.transaction_group_id === groupId));
  });

  it('50. receipt reversal safety', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
    addReceiptLine({ receiptId, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, receivedQuantity: 100, acceptedQuantity: 100, unit: 'kg' });
    postReceipt(receiptId);
    reverseReceipt(receiptId);
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 0);
    assert.equal(getReceipt(receiptId)?.status, 'Reversed');
  });

  it('historical cost: receipt unit_cost unchanged when PO price changes', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    saveMaterialUomConversion({ material_type: 'PACKAGING_MATERIAL', raw_material_id: null, packaging_material_id: pkgId, from_unit: 'case', to_unit: 'each', conversion_factor: 12, description: '', active: 1 });
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    const lineId = addPurchaseOrderLine({ purchaseOrderId: poId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, orderedQuantity: 10, unit: 'case', unitPrice: 10 });
    submitPurchaseOrder(poId);
    const receiptId = createReceipt({ purchaseOrderId: poId, supplierId, receivedDate: '2026-01-05', receivingLocationId: locA });
    addReceiptLine({ receiptId, purchaseOrderLineId: lineId, materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, receivedQuantity: 10, acceptedQuantity: 10, unit: 'case', unitCost: 10, currency: 'USD' });
    postReceipt(receiptId);
    db.run(`UPDATE pur_purchase_order_lines SET unit_price = 12 WHERE id = ?`, [lineId]);
    const tx = queryOne<{ unit_cost: number }>('SELECT unit_cost FROM mat_transactions WHERE receipt_id = ?', [receiptId]);
    assert.equal(tx?.unit_cost, 10);
  });

  it('cancelled PO', () => {
    const { supplierId } = seedSupplierAndLocation(db);
    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-01-01' });
    cancelPurchaseOrder(poId);
    assert.equal(getPurchaseOrder(poId)?.status, 'Cancelled');
  });
});
