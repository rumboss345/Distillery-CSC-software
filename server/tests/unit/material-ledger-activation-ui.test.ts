/**
 * Material ledger activation UI helpers + activation workflow (query layer).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVATE_LEDGER_CONFIRM_TEXT,
  buildMaterialLedgerDisplay,
  showActivateLedgerAction,
  showDowngradeToLegacyAction,
  validateActivationForm,
} from '../../../shared/material-inventory/ledger-activation-ui';
import {
  formatLegacyReceiptBlockMessage,
  isLegacyReceiptBlockError,
} from '../../../shared/material-inventory/receipt-post-errors';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  activateMaterialLedgerTracking,
  getMaterialBalance,
  getMaterialLedgerInfo,
  getMaterialTrackingMode,
  postMaterialOpeningBalance,
  createMaterialLot,
} from '../../../src/db/material-inventory-queries';
import {
  addReceiptLine,
  createReceipt,
  getLegacyMaterialsOnReceipt,
  postReceipt,
} from '../../../src/db/purchasing-queries';
import {
  createMaterialTestDb,
  seedPackagingMaterial,
  seedSupplierAndLocation,
} from '../helpers/material-test-db';

describe('material ledger activation UI helpers', () => {
  it('1. LEGACY material shows activation action', () => {
    const display = buildMaterialLedgerDisplay({
      trackingMode: 'LEGACY',
      onHand: 0,
      hasLedgerTransactions: false,
    });
    assert.equal(display.showActivateAction, true);
    assert.equal(display.ledgerBalanceLabel, 'Not Activated');
  });

  it('2. validateActivationForm requires reference and typed confirm', () => {
    assert.match(validateActivationForm({ reference: '', confirmText: '' }) ?? '', /reference/i);
    assert.match(
      validateActivationForm({ reference: 'Migration', confirmText: 'wrong', requireTypedConfirm: true }) ?? '',
      /ACTIVATE LEDGER/,
    );
    assert.equal(
      validateActivationForm({ reference: 'Physical count', confirmText: ACTIVATE_LEDGER_CONFIRM_TEXT, requireTypedConfirm: true }),
      null,
    );
  });

  it('9. LEGACY UI shows Not Activated; 10. LEDGER UI shows on hand', () => {
    const legacy = buildMaterialLedgerDisplay({ trackingMode: 'LEGACY', onHand: 0, hasLedgerTransactions: false });
    assert.equal(legacy.ledgerBalanceLabel, 'Not Activated');
    const ledger = buildMaterialLedgerDisplay({
      trackingMode: 'LEDGER',
      onHand: 1250,
      ledgerActivatedAt: '2026-09-11T12:00:00.000Z',
      ledgerActivationReference: 'Physical count',
      hasLedgerTransactions: true,
    });
    assert.equal(ledger.ledgerBalanceLabel, '1250.000');
    assert.equal(ledger.showActivateAction, false);
    assert.ok(ledger.activatedAtLabel);
    assert.equal(ledger.activationReference, 'Physical count');
  });

  it('8. LEDGER material does not show downgrade when transactions exist', () => {
    assert.equal(showDowngradeToLegacyAction('LEDGER', true), false);
    assert.equal(showActivateLedgerAction('LEDGER'), false);
    assert.equal(showDowngradeToLegacyAction('LEDGER', false), true);
  });

  it('legacy receipt error formatting identifies material names', () => {
    const single = formatLegacyReceiptBlockMessage([{ materialName: '750 mL Bottle', materialType: 'PACKAGING_MATERIAL' }]);
    assert.match(single, /750 mL Bottle/);
    assert.match(single, /LEGACY-tracked/);
    const multi = formatLegacyReceiptBlockMessage([
      { materialName: 'Sugar', materialType: 'RAW_MATERIAL' },
      { materialName: '750 mL Bottle', materialType: 'PACKAGING_MATERIAL' },
    ]);
    assert.match(multi, /Sugar/);
    assert.match(multi, /750 mL Bottle/);
    assert.ok(isLegacyReceiptBlockError(single));
  });
});

describe('material ledger activation workflow', () => {
  it('3-7. activation path stores metadata, creates no inventory, receipt blocked then allowed', async () => {
    const db = await createMaterialTestDb();
    try {
      const { supplierId, locA } = seedSupplierAndLocation(db);
      const pkgId = seedPackagingMaterial(db);
      assert.equal(getMaterialTrackingMode('PACKAGING_MATERIAL', pkgId), 'LEGACY');
      assert.equal(showActivateLedgerAction(getMaterialTrackingMode('PACKAGING_MATERIAL', pkgId)), true);

      const receiptId = createReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA });
      addReceiptLine({
        receiptId,
        materialType: 'PACKAGING_MATERIAL',
        packagingMaterialId: pkgId,
        receivedQuantity: 100,
        acceptedQuantity: 100,
        unit: 'each',
      });
      assert.equal(getLegacyMaterialsOnReceipt(receiptId).length, 1);
      assert.throws(() => postReceipt(receiptId), /750mL Bottle|LEGACY-tracked/i);

      activateMaterialLedgerTracking('PACKAGING_MATERIAL', pkgId, 'Physical count 2026-09-11');
      assert.equal(getMaterialTrackingMode('PACKAGING_MATERIAL', pkgId), 'LEDGER');
      assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 0);

      const info = getMaterialLedgerInfo('PACKAGING_MATERIAL', pkgId);
      assert.equal(info.trackingMode, 'LEDGER');
      assert.ok(info.ledgerActivatedAt);
      assert.equal(info.ledgerActivationReference, 'Physical count 2026-09-11');
      assert.equal(info.hasLedgerTransactions, false);
      assert.equal(getLegacyMaterialsOnReceipt(receiptId).length, 0);

      postReceipt(receiptId);
      assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 100);

      const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
      postMaterialOpeningBalance({
        materialType: 'PACKAGING_MATERIAL',
        packagingMaterialId: pkgId,
        materialLotId: lotId,
        locationId: locA,
        quantity: 500,
        unit: 'each',
        notes: 'Migration opening balance',
      });
      assert.equal(getMaterialBalance('PACKAGING_MATERIAL', null, pkgId).onHand, 600);
      const obCount = queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM mat_transactions WHERE packaging_material_id = ? AND transaction_type = 'Opening Balance'`,
        [pkgId],
      )?.count;
      assert.equal(obCount, 1);
    } finally {
      __injectDatabaseForTests(null);
    }
  });
});
