/**
 * Phase 1Q QuickBooks / Accounting Integration Foundation.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import {
  QuickBooksDesktopAdapter,
  QuickBooksOnlineAdapter,
} from '../../../shared/accounting/quickbooks-adapter';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  createAccountMapping,
  createExportBatch,
  createReversalEvent,
  exportBatchToCsv,
  exportBatchToJson,
  getAccountingDashboardSummary,
  listAccountMappings,
  listAccountingEvents,
  seedAccountingMappingsIfEmpty,
  stagePendingOperationalEvents,
  updateAccountMapping,
  updateExportBatchReconciliation,
} from '../../../src/db/accounting-queries';
import {
  addLandedCostComponent,
  createLandedCostDocument,
  finalizeLandedCost,
} from '../../../src/db/landed-cost-queries';
import { createCostAdjustment } from '../../../src/db/costing-queries';
import { countTable, seedReceiptWithCost, teardownTestDb } from '../helpers/costing-test-helpers';
import {
  createAccountingIntegrationTestDb,
  seedAccountingShipmentScenario,
} from '../helpers/accounting-integration-test-helpers';

describe('Phase 1Q Accounting Integration Foundation', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('seeds configurable default account mappings', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    const mappings = listAccountMappings();
    assert.ok(mappings.length >= 10);
    assert.ok(mappings.some((m) => m.operational_category === 'COGS'));
    assert.ok(mappings.every((m) => m.gl_account_number.length > 0));
  });

  it('allows updating account mapping numbers without hard-coded logic', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    const cogs = listAccountMappings().find((m) => m.operational_category === 'COGS')!;
    updateAccountMapping(cogs.id, { glAccountNumber: '5199', glAccountName: 'Custom COGS' });
    const updated = listAccountMappings().find((m) => m.id === cogs.id)!;
    assert.equal(updated.gl_account_number, '5199');
    assert.equal(updated.gl_account_name, 'Custom COGS');
  });

  it('stages receipt accounting events with idempotency', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    seedReceiptWithCost(db, { quantity: 500, unitCost: 2 });
    const first = stagePendingOperationalEvents();
    assert.ok(first.staged >= 1);
    assert.ok(first.byType.Receipt >= 1);

    const second = stagePendingOperationalEvents();
    assert.equal(second.staged, 0);

    const events = listAccountingEvents({ eventType: 'Receipt' });
    assert.ok(events.every((e) => e.status === 'Pending'));
    const keys = events.map((e) => e.idempotency_key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it('stages landed cost, production and cost adjustment events', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    const { receiptId } = seedReceiptWithCost(db);
    const docId = createLandedCostDocument({
      receiptId,
      effectiveDate: '2026-01-20',
      notes: 'Freight',
    });
    addLandedCostComponent({
      landedCostDocumentId: docId,
      componentType: 'Freight',
      description: 'Ocean freight',
      originalAmount: 500,
      currency: 'KYD',
    });
    finalizeLandedCost(docId);

    createCostAdjustment({
      targetType: 'Production Batch',
      targetId: 1,
      reason: 'Variance true-up',
      amountKyd: 75,
      effectiveDate: '2026-01-25',
    });

    const result = stagePendingOperationalEvents();
    assert.ok(result.byType['Landed Cost'] >= 1);
    assert.ok(result.byType['Cost Adjustment'] >= 1);
  });

  it('stages FG shipment COGS from operational sal_cogs_records', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    await seedAccountingShipmentScenario(db);

    const result = stagePendingOperationalEvents();
    assert.ok(result.byType['FG Shipment'] >= 1);

    const cogsEvents = listAccountingEvents({ eventType: 'FG Shipment' });
    assert.ok(cogsEvents.length >= 1);
    assert.ok(cogsEvents[0].amount_kyd > 0);
    assert.equal(cogsEvents[0].debit_account_number, '5100');
    assert.equal(cogsEvents[0].credit_account_number, '1500');
  });

  it('creates reversal events with swapped debit/credit', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    seedReceiptWithCost(db);
    stagePendingOperationalEvents();
    const event = listAccountingEvents({ status: 'Pending' })[0]!;

    const reversalId = createReversalEvent(event.id, 'Posted in error');
    const reversal = queryOne<{ event_type: string; debit_account_number: string; credit_account_number: string }>(
      'SELECT event_type, debit_account_number, credit_account_number FROM acct_events WHERE id = ?',
      [reversalId],
    );
    assert.equal(reversal?.event_type, 'Reversal');
    assert.equal(reversal?.debit_account_number, event.credit_account_number);
    assert.equal(reversal?.credit_account_number, event.debit_account_number);

    const original = queryOne<{ status: string }>('SELECT status FROM acct_events WHERE id = ?', [event.id]);
    assert.equal(original?.status, 'Reversed');
  });

  it('prevents duplicate export of the same accounting event', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    await seedAccountingShipmentScenario(db);
    stagePendingOperationalEvents();
    const pending = listAccountingEvents({ status: 'Pending' });
    const eventId = pending[0]!.id;

    const batch1 = createExportBatch({
      eventIds: [eventId],
      exportFormat: 'CSV',
      adapterType: 'Manual',
    });
    assert.ok(batch1 > 0);

    assert.throws(
      () =>
        createExportBatch({
          eventIds: [eventId],
          exportFormat: 'JSON',
        }),
      /already been exported|not pending export/i,
    );
  });

  it('export batch does not mutate inventory tables', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    await seedAccountingShipmentScenario(db);
    stagePendingOperationalEvents();

    const matBefore = countTable('mat_transactions');
    const fgBefore = countTable('fg_transactions');
    const liqBefore = countTable('liq_transactions');

    const pending = listAccountingEvents({ status: 'Pending' });
    createExportBatch({
      eventIds: pending.map((e) => e.id),
      exportFormat: 'JSON',
      adapterType: 'QuickBooksOnline',
      idempotencyKey: 'export-test-1',
    });

    assert.equal(countTable('mat_transactions'), matBefore);
    assert.equal(countTable('fg_transactions'), fgBefore);
    assert.equal(countTable('liq_transactions'), liqBefore);
  });

  it('exports CSV and JSON handoff with reconciliation tracking', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    await seedAccountingShipmentScenario(db);
    stagePendingOperationalEvents();
    const pending = listAccountingEvents({ status: 'Pending' });
    const batchId = createExportBatch({
      eventIds: pending.map((e) => e.id),
      exportFormat: 'CSV',
      adapterType: 'QuickBooksDesktop',
    });

    const csv = exportBatchToCsv(batchId);
    assert.match(csv, /eventCode,eventType,eventDate/);
    assert.match(csv, /ACE-/);

    const json = exportBatchToJson(batchId);
    const parsed = JSON.parse(json) as { lines: unknown[]; adapterType?: string };
    assert.ok(Array.isArray(parsed.lines));
    assert.ok(parsed.lines.length >= 1);

    updateExportBatchReconciliation(batchId, 'Reconciled', 'Matched to GL');
    const batch = queryOne<{ reconciliation_status: string }>(
      'SELECT reconciliation_status FROM acct_export_batches WHERE id = ?',
      [batchId],
    );
    assert.equal(batch?.reconciliation_status, 'Reconciled');
  });

  it('QuickBooks adapter interface validates and formats journal entries', () => {
    const qbo = new QuickBooksOnlineAdapter();
    const qbd = new QuickBooksDesktopAdapter();
    const line = {
      eventCode: 'ACE-000001',
      eventType: 'FG Shipment',
      eventDate: '2026-02-10',
      description: 'Test',
      debitAccountNumber: '5100',
      debitAccountName: 'COGS',
      creditAccountNumber: '1500',
      creditAccountName: 'FG Inventory',
      amountKyd: 100,
      sourceEntityType: 'sal_cogs_record',
      sourceEntityId: 1,
      idempotencyKey: 'FgShipment:sal_cogs_record:1',
    };
    assert.equal(qbo.validateExportLine(line), null);
    const payload = qbo.formatJournalEntries([line]);
    assert.equal(payload.adapterType, 'QuickBooksOnline');
    assert.equal(payload.metadata.importTarget, 'QuickBooks Online (manual import)');

    const desktopPayload = qbd.formatJournalEntries([line]);
    assert.equal(desktopPayload.adapterType, 'QuickBooksDesktop');
    assert.equal(desktopPayload.format, 'CSV');
  });

  it('dashboard summary reflects pending and exported counts', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    await seedAccountingShipmentScenario(db);
    stagePendingOperationalEvents();
    let summary = getAccountingDashboardSummary();
    assert.ok(summary.pendingEvents >= 1);

    createExportBatch({
      eventIds: listAccountingEvents({ status: 'Pending' }).map((e) => e.id),
      exportFormat: 'CSV',
    });
    summary = getAccountingDashboardSummary();
    assert.ok(summary.exportedEvents >= 1);
    assert.ok(summary.exportBatches >= 1);
  });

  it('rejects duplicate account mapping category on create', async () => {
    db = await createAccountingIntegrationTestDb();
    seedAccountingMappingsIfEmpty();
    assert.throws(
      () =>
        createAccountMapping({
          operationalCategory: 'COGS',
          glAccountNumber: '9999',
          glAccountName: 'Duplicate',
        }),
      /UNIQUE/i,
    );
  });
});
