/**
 * Phase 1Q QuickBooks / Accounting Integration Foundation.
 * Browser-local staging & export handoff — no external API calls, no inventory mutation on export.
 */
import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import {
  DEFAULT_ACCOUNT_MAPPINGS,
  type AccountingEventType,
  type OperationalAccountCategory,
  type ReconciliationStatus,
} from '../../shared/accounting/constants';
import {
  getQuickBooksAdapter,
  type AccountingExportLine,
  type QuickBooksExportPayload,
} from '../../shared/accounting/quickbooks-adapter';
import { rowsToCsv } from '../lib/csv-export';
import type {
  AcctAccountMapping,
  AcctEvent,
  AcctExportBatch,
  AccountingDashboardSummary,
  CreateAccountMappingInput,
  CreateExportBatchInput,
  StageOperationalEventsResult,
  UpdateAccountMappingInput,
} from '../types/accounting';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { nextBusinessCode } from './master-data-queries';

const now = () => new Date().toISOString();

type AccountPair = {
  debit: { number: string; name: string; category: OperationalAccountCategory };
  credit: { number: string; name: string; category: OperationalAccountCategory };
};

type StageEventInput = {
  eventType: AccountingEventType;
  operationalCategory?: OperationalAccountCategory | null;
  sourceEntityType: string;
  sourceEntityId: number;
  idempotencyKey: string;
  eventDate: string;
  amountKyd: number;
  debitCategory: OperationalAccountCategory;
  creditCategory: OperationalAccountCategory;
  description: string;
  metadata?: Record<string, unknown>;
};

// ─── Account mappings ────────────────────────────────────────────────────────

export function seedAccountingMappingsIfEmpty(): void {
  const count = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM acct_account_mappings')?.count ?? 0;
  if (count > 0) return;
  const ts = now();
  for (const mapping of DEFAULT_ACCOUNT_MAPPINGS) {
    insertRow(
      `INSERT INTO acct_account_mappings (
        operational_category, gl_account_number, gl_account_name, description, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [mapping.operationalCategory, mapping.glAccountNumber, mapping.glAccountName, mapping.description, ts, ts],
    );
  }
}

export function listAccountMappings(activeOnly = false): AcctAccountMapping[] {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return queryAll<AcctAccountMapping>(
    `SELECT * FROM acct_account_mappings ${where} ORDER BY operational_category COLLATE NOCASE`,
  );
}

export function getAccountMapping(id: number): AcctAccountMapping | null {
  return queryOne<AcctAccountMapping>('SELECT * FROM acct_account_mappings WHERE id = ?', [id]);
}

export function getAccountMappingByCategory(category: OperationalAccountCategory): AcctAccountMapping | null {
  return queryOne<AcctAccountMapping>(
    'SELECT * FROM acct_account_mappings WHERE operational_category = ? COLLATE NOCASE AND active = 1',
    [category],
  );
}

export function createAccountMapping(input: CreateAccountMappingInput): number {
  const ts = now();
  return insertRow(
    `INSERT INTO acct_account_mappings (
      operational_category, gl_account_number, gl_account_name, description, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [
      input.operationalCategory,
      input.glAccountNumber.trim(),
      input.glAccountName.trim(),
      input.description ?? '',
      ts,
      ts,
    ],
  );
}

export function updateAccountMapping(id: number, input: UpdateAccountMappingInput): void {
  const existing = getAccountMapping(id);
  if (!existing) throw new Error('Account mapping not found.');
  runQuery(
    `UPDATE acct_account_mappings SET
      gl_account_number = ?,
      gl_account_name = ?,
      description = ?,
      active = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      input.glAccountNumber ?? existing.gl_account_number,
      input.glAccountName ?? existing.gl_account_name,
      input.description ?? existing.description,
      input.active === false ? 0 : input.active === true ? 1 : existing.active,
      now(),
      id,
    ],
  );
}

function resolveAccountPair(
  debitCategory: OperationalAccountCategory,
  creditCategory: OperationalAccountCategory,
): AccountPair {
  const debitMapping = getAccountMappingByCategory(debitCategory);
  const creditMapping = getAccountMappingByCategory(creditCategory);
  if (!debitMapping) {
    throw new Error(`No active account mapping for debit category ${debitCategory}.`);
  }
  if (!creditMapping) {
    throw new Error(`No active account mapping for credit category ${creditCategory}.`);
  }
  return {
    debit: {
      number: debitMapping.gl_account_number,
      name: debitMapping.gl_account_name,
      category: debitCategory,
    },
    credit: {
      number: creditMapping.gl_account_number,
      name: creditMapping.gl_account_name,
      category: creditCategory,
    },
  };
}

// ─── Immutable staging events ────────────────────────────────────────────────

function eventExistsByIdempotencyKey(key: string): boolean {
  return queryOne<{ id: number }>('SELECT id FROM acct_events WHERE idempotency_key = ?', [key]) != null;
}

export function createAccountingEvent(input: StageEventInput): number | null {
  if (!(input.amountKyd > 0)) return null;
  if (eventExistsByIdempotencyKey(input.idempotencyKey)) return null;

  const accounts = resolveAccountPair(input.debitCategory, input.creditCategory);
  const eventCode = nextBusinessCode('accountingEvent', 'acct_events', 'event_code', 6);

  return insertRow(
    `INSERT INTO acct_events (
      event_code, event_type, operational_category, source_entity_type, source_entity_id,
      idempotency_key, event_date, amount_kyd,
      debit_account_number, debit_account_name, credit_account_number, credit_account_name,
      description, status, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
    [
      eventCode,
      input.eventType,
      input.operationalCategory ?? input.debitCategory,
      input.sourceEntityType,
      input.sourceEntityId,
      input.idempotencyKey,
      input.eventDate,
      input.amountKyd,
      accounts.debit.number,
      accounts.debit.name,
      accounts.credit.number,
      accounts.credit.name,
      input.description,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now(),
    ],
  );
}

export function listAccountingEvents(filters?: {
  status?: string;
  eventType?: string;
  exportBatchId?: number;
}): AcctEvent[] {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.eventType) {
    clauses.push('event_type = ?');
    params.push(filters.eventType);
  }
  if (filters?.exportBatchId != null) {
    clauses.push('export_batch_id = ?');
    params.push(filters.exportBatchId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<AcctEvent>(`SELECT * FROM acct_events ${where} ORDER BY event_date DESC, id DESC`, params);
}

export function getAccountingEvent(id: number): AcctEvent | null {
  return queryOne<AcctEvent>('SELECT * FROM acct_events WHERE id = ?', [id]);
}

export function createReversalEvent(originalEventId: number, reason?: string): number {
  return withDatabaseTransaction(() => {
    const original = getAccountingEvent(originalEventId);
    if (!original) throw new Error('Accounting event not found.');
    if (original.status === 'Reversed') throw new Error('Event has already been reversed.');
    if (original.reversal_of_event_id != null) throw new Error('Cannot reverse a reversal event.');

    const reversalKey = `Reversal:acct_event:${originalEventId}`;
    if (eventExistsByIdempotencyKey(reversalKey)) {
      throw new Error('Reversal event already exists for this accounting event.');
    }

    const eventCode = nextBusinessCode('accountingEvent', 'acct_events', 'event_code', 6);
    const reversalId = insertRow(
      `INSERT INTO acct_events (
        event_code, event_type, operational_category, source_entity_type, source_entity_id,
        idempotency_key, event_date, amount_kyd,
        debit_account_number, debit_account_name, credit_account_number, credit_account_name,
        description, status, reversal_of_event_id, metadata_json, created_at
      ) VALUES (?, 'Reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [
        eventCode,
        original.operational_category,
        original.source_entity_type,
        original.source_entity_id,
        reversalKey,
        now().slice(0, 10),
        original.amount_kyd,
        original.credit_account_number,
        original.credit_account_name,
        original.debit_account_number,
        original.debit_account_name,
        `Reversal of ${original.event_code}${reason ? `: ${reason}` : ''}`,
        originalEventId,
        JSON.stringify({ reversalOf: original.event_code, reason: reason ?? null }),
        now(),
      ],
    );

    runQuery(`UPDATE acct_events SET status = 'Reversed' WHERE id = ?`, [originalEventId]);
    return reversalId;
  });
}

// ─── Operational event staging ───────────────────────────────────────────────

function inventoryCategoryForMaterialType(materialType: string): OperationalAccountCategory {
  return materialType === 'PACKAGING_MATERIAL' ? 'PACKAGING_INVENTORY' : 'RAW_MATERIAL_INVENTORY';
}

function stageReceiptEvents(result: StageOperationalEventsResult): void {
  const receipts = queryAll<{
    id: number;
    receipt_code: string;
    received_date: string;
    line_id: number;
    material_type: string;
    base_quantity: number;
    unit_cost: number | null;
  }>(
    `SELECT r.id, r.receipt_code, r.received_date, rl.id AS line_id, rl.material_type,
            rl.base_quantity, rl.unit_cost
     FROM pur_receipts r
     JOIN pur_receipt_lines rl ON rl.receipt_id = r.id
     WHERE r.status = 'Posted' AND rl.accepted_quantity > 0`,
  );

  for (const row of receipts) {
    const amount = (row.unit_cost ?? 0) * row.base_quantity;
    const inventoryCategory = inventoryCategoryForMaterialType(row.material_type);
    const id = createAccountingEvent({
      eventType: 'Receipt',
      operationalCategory: inventoryCategory,
      sourceEntityType: 'pur_receipt_line',
      sourceEntityId: row.line_id,
      idempotencyKey: `Receipt:pur_receipt_line:${row.line_id}`,
      eventDate: row.received_date.slice(0, 10),
      amountKyd: amount,
      debitCategory: inventoryCategory,
      creditCategory: 'ACCOUNTS_PAYABLE',
      description: `Receipt ${row.receipt_code} line ${row.line_id}`,
      metadata: { receiptId: row.id, materialType: row.material_type },
    });
    if (id != null) result.byType.Receipt = (result.byType.Receipt ?? 0) + 1;
  }
}

function stageLandedCostEvents(result: StageOperationalEventsResult): void {
  const docs = queryAll<{
    id: number;
    landed_cost_code: string;
    effective_date: string;
    total_kyd: number;
  }>(
    `SELECT d.id, d.landed_cost_code, d.effective_date,
            COALESCE(SUM(c.kyd_amount), 0) AS total_kyd
     FROM cost_landed_cost_documents d
     JOIN cost_landed_cost_components c ON c.landed_cost_document_id = d.id
     WHERE d.status = 'Finalized'
     GROUP BY d.id, d.landed_cost_code, d.effective_date`,
  );

  for (const doc of docs) {
    const id = createAccountingEvent({
      eventType: 'Landed Cost',
      operationalCategory: 'RAW_MATERIAL_INVENTORY',
      sourceEntityType: 'cost_landed_cost_document',
      sourceEntityId: doc.id,
      idempotencyKey: `LandedCost:cost_landed_cost_document:${doc.id}`,
      eventDate: doc.effective_date.slice(0, 10),
      amountKyd: doc.total_kyd,
      debitCategory: 'RAW_MATERIAL_INVENTORY',
      creditCategory: 'FREIGHT_CLEARING',
      description: `Landed cost ${doc.landed_cost_code}`,
      metadata: { landedCostDocumentId: doc.id },
    });
    if (id != null) result.byType['Landed Cost'] = (result.byType['Landed Cost'] ?? 0) + 1;
  }
}

function stageProductionConsumptionEvents(result: StageOperationalEventsResult): void {
  const rows = queryAll<{
    id: number;
    production_batch_id: number;
    material_lot_id: number;
    extended_cost_kyd: number | null;
    material_type: string;
    created_at: string;
  }>(
    `SELECT mc.id, mc.production_batch_id, mc.material_lot_id, mc.extended_cost_kyd,
            ml.material_type, mc.created_at
     FROM cost_material_consumptions mc
     JOIN mat_lots ml ON ml.id = mc.material_lot_id
     WHERE mc.extended_cost_kyd IS NOT NULL AND mc.extended_cost_kyd > 0`,
  );

  for (const row of rows) {
    const inventoryCategory = inventoryCategoryForMaterialType(row.material_type);
    const id = createAccountingEvent({
      eventType: 'Production Consumption',
      operationalCategory: 'WIP',
      sourceEntityType: 'cost_material_consumption',
      sourceEntityId: row.id,
      idempotencyKey: `ProductionConsumption:cost_material_consumption:${row.id}`,
      eventDate: row.created_at.slice(0, 10),
      amountKyd: row.extended_cost_kyd!,
      debitCategory: 'WIP',
      creditCategory: inventoryCategory,
      description: `Production consumption batch ${row.production_batch_id}`,
      metadata: { batchId: row.production_batch_id, materialLotId: row.material_lot_id },
    });
    if (id != null) result.byType['Production Consumption'] = (result.byType['Production Consumption'] ?? 0) + 1;
  }
}

function stageProductionOutputEvents(result: StageOperationalEventsResult): void {
  const rows = queryAll<{
    id: number;
    production_batch_id: number;
    output_type: string;
    allocated_batch_cost_kyd: number | null;
    created_at: string;
  }>(
    `SELECT id, production_batch_id, output_type, allocated_batch_cost_kyd, created_at
     FROM cost_production_outputs
     WHERE allocated_batch_cost_kyd IS NOT NULL AND allocated_batch_cost_kyd > 0`,
  );

  for (const row of rows) {
    const debitCategory: OperationalAccountCategory =
      row.output_type === 'Finished Goods Lot' ? 'FG_INVENTORY' : 'LIQUID_INVENTORY';
    const id = createAccountingEvent({
      eventType: 'Production Output',
      operationalCategory: debitCategory,
      sourceEntityType: 'cost_production_output',
      sourceEntityId: row.id,
      idempotencyKey: `ProductionOutput:cost_production_output:${row.id}`,
      eventDate: row.created_at.slice(0, 10),
      amountKyd: row.allocated_batch_cost_kyd!,
      debitCategory,
      creditCategory: 'WIP',
      description: `Production output batch ${row.production_batch_id}`,
      metadata: { batchId: row.production_batch_id, outputType: row.output_type },
    });
    if (id != null) result.byType['Production Output'] = (result.byType['Production Output'] ?? 0) + 1;
  }
}

function stageFgShipmentCogsEvents(result: StageOperationalEventsResult): void {
  const rows = queryAll<{
    id: number;
    shipment_id: number;
    recognition_date: string;
    extended_cost_kyd: number;
    shipment_code: string;
  }>(
    `SELECT c.id, c.shipment_id, c.recognition_date, c.extended_cost_kyd, s.shipment_code
     FROM sal_cogs_records c
     JOIN sal_shipments s ON s.id = c.shipment_id
     WHERE s.status = 'Posted' AND c.extended_cost_kyd > 0`,
  );

  for (const row of rows) {
    const id = createAccountingEvent({
      eventType: 'FG Shipment',
      operationalCategory: 'COGS',
      sourceEntityType: 'sal_cogs_record',
      sourceEntityId: row.id,
      idempotencyKey: `FgShipment:sal_cogs_record:${row.id}`,
      eventDate: row.recognition_date.slice(0, 10),
      amountKyd: row.extended_cost_kyd,
      debitCategory: 'COGS',
      creditCategory: 'FG_INVENTORY',
      description: `COGS shipment ${row.shipment_code}`,
      metadata: { shipmentId: row.shipment_id, cogsRecordId: row.id },
    });
    if (id != null) result.byType['FG Shipment'] = (result.byType['FG Shipment'] ?? 0) + 1;
  }
}

function stageInventoryAdjustmentEvents(result: StageOperationalEventsResult): void {
  const matAdjustments = queryAll<{
    id: number;
    transaction_type: string;
    transaction_timestamp: string;
    unit_cost: number | null;
    base_quantity: number;
  }>(
    `SELECT id, transaction_type, transaction_timestamp, unit_cost, base_quantity
     FROM mat_transactions
     WHERE transaction_type LIKE '%Adjustment%'`,
  );

  for (const row of matAdjustments) {
    const isIncrease = row.transaction_type.includes('Increase');
    const amount = Math.abs((row.unit_cost ?? 0) * row.base_quantity);
    if (!(amount > 0)) continue;
    const id = createAccountingEvent({
      eventType: 'Inventory Adjustment',
      operationalCategory: 'INVENTORY_ADJUSTMENT',
      sourceEntityType: 'mat_transaction',
      sourceEntityId: row.id,
      idempotencyKey: `InventoryAdjustment:mat_transaction:${row.id}`,
      eventDate: row.transaction_timestamp.slice(0, 10),
      amountKyd: amount,
      debitCategory: isIncrease ? 'RAW_MATERIAL_INVENTORY' : 'INVENTORY_ADJUSTMENT',
      creditCategory: isIncrease ? 'INVENTORY_ADJUSTMENT' : 'RAW_MATERIAL_INVENTORY',
      description: `Material ${row.transaction_type}`,
      metadata: { transactionType: row.transaction_type },
    });
    if (id != null) result.byType['Inventory Adjustment'] = (result.byType['Inventory Adjustment'] ?? 0) + 1;
  }

  const fgAdjustments = queryAll<{
    id: number;
    transaction_type: string;
    transaction_timestamp: string;
    quantity: number;
    extended_cost_kyd: number | null;
    unit_cost_kyd_snapshot: number | null;
  }>(
    `SELECT id, transaction_type, transaction_timestamp, quantity, extended_cost_kyd, unit_cost_kyd_snapshot
     FROM fg_transactions
     WHERE transaction_type LIKE '%Adjustment%'`,
  );

  for (const row of fgAdjustments) {
    const amount =
      row.extended_cost_kyd != null
        ? Math.abs(row.extended_cost_kyd)
        : Math.abs((row.unit_cost_kyd_snapshot ?? 0) * row.quantity);
    if (!(amount > 0)) continue;
    const isIncrease = row.transaction_type.includes('Increase') || row.quantity > 0;
    const id = createAccountingEvent({
      eventType: 'Inventory Adjustment',
      operationalCategory: 'INVENTORY_ADJUSTMENT',
      sourceEntityType: 'fg_transaction',
      sourceEntityId: row.id,
      idempotencyKey: `InventoryAdjustment:fg_transaction:${row.id}`,
      eventDate: row.transaction_timestamp.slice(0, 10),
      amountKyd: amount,
      debitCategory: isIncrease ? 'FG_INVENTORY' : 'INVENTORY_ADJUSTMENT',
      creditCategory: isIncrease ? 'INVENTORY_ADJUSTMENT' : 'FG_INVENTORY',
      description: `FG ${row.transaction_type}`,
      metadata: { transactionType: row.transaction_type },
    });
    if (id != null) result.byType['Inventory Adjustment'] = (result.byType['Inventory Adjustment'] ?? 0) + 1;
  }
}

function stageCostAdjustmentEvents(result: StageOperationalEventsResult): void {
  const rows = queryAll<{
    id: number;
    adjustment_code: string;
    effective_date: string;
    amount_kyd: number;
    target_type: string;
  }>(
    `SELECT id, adjustment_code, effective_date, amount_kyd, target_type
     FROM cost_adjustments
     WHERE amount_kyd != 0`,
  );

  for (const row of rows) {
    const amount = Math.abs(row.amount_kyd);
    const isPositive = row.amount_kyd > 0;
    const id = createAccountingEvent({
      eventType: 'Cost Adjustment',
      operationalCategory: 'COST_VARIANCE',
      sourceEntityType: 'cost_adjustment',
      sourceEntityId: row.id,
      idempotencyKey: `CostAdjustment:cost_adjustment:${row.id}`,
      eventDate: row.effective_date.slice(0, 10),
      amountKyd: amount,
      debitCategory: isPositive ? 'WIP' : 'COST_VARIANCE',
      creditCategory: isPositive ? 'COST_VARIANCE' : 'WIP',
      description: `Cost adjustment ${row.adjustment_code}`,
      metadata: { targetType: row.target_type },
    });
    if (id != null) result.byType['Cost Adjustment'] = (result.byType['Cost Adjustment'] ?? 0) + 1;
  }
}

export function stagePendingOperationalEvents(): StageOperationalEventsResult {
  seedAccountingMappingsIfEmpty();
  const result: StageOperationalEventsResult = { staged: 0, skipped: 0, byType: {} };
  const before = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM acct_events')?.count ?? 0;

  stageReceiptEvents(result);
  stageLandedCostEvents(result);
  stageProductionConsumptionEvents(result);
  stageProductionOutputEvents(result);
  stageFgShipmentCogsEvents(result);
  stageInventoryAdjustmentEvents(result);
  stageCostAdjustmentEvents(result);

  const after = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM acct_events')?.count ?? 0;
  result.staged = after - before;
  result.skipped = result.staged === 0 ? 0 : 0;
  return result;
}

// ─── Export batches ──────────────────────────────────────────────────────────

export function listExportBatches(): AcctExportBatch[] {
  return queryAll<AcctExportBatch>('SELECT * FROM acct_export_batches ORDER BY created_at DESC');
}

export function getExportBatch(id: number): AcctExportBatch | null {
  return queryOne<AcctExportBatch>('SELECT * FROM acct_export_batches WHERE id = ?', [id]);
}

function snapshotInventoryCounts(): Record<string, number> {
  return {
    mat_transactions: queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM mat_transactions')?.count ?? 0,
    fg_transactions: queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM fg_transactions')?.count ?? 0,
    liq_transactions: queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM liq_transactions')?.count ?? 0,
    mat_lots: queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM mat_lots')?.count ?? 0,
    fg_lots: queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM fg_lots')?.count ?? 0,
  };
}

export function createExportBatch(input: CreateExportBatchInput): number {
  return withDatabaseTransaction(() => {
    if (input.idempotencyKey) {
      const existing = queryOne<{ id: number }>(
        'SELECT id FROM acct_export_batches WHERE idempotency_key = ?',
        [input.idempotencyKey],
      );
      if (existing) throw new Error('Export batch with this idempotency key already exists.');
    }

    const inventoryBefore = snapshotInventoryCounts();
    const events: AcctEvent[] = [];
    for (const eventId of input.eventIds) {
      const event = getAccountingEvent(eventId);
      if (!event) throw new Error(`Accounting event ${eventId} not found.`);
      if (event.status !== 'Pending') {
        throw new Error(`Event ${event.event_code} is not pending export (status: ${event.status}).`);
      }
      const alreadyExported = queryOne<{ id: number }>(
        'SELECT id FROM acct_export_batch_lines WHERE accounting_event_id = ?',
        [eventId],
      );
      if (alreadyExported) {
        throw new Error(`Event ${event.event_code} has already been exported.`);
      }
      events.push(event);
    }

    if (events.length === 0) throw new Error('Export batch requires at least one pending event.');

    const totalDebit = events.reduce((sum, e) => sum + e.amount_kyd, 0);
    const totalCredit = totalDebit;
    const batchCode = nextBusinessCode('exportBatch', 'acct_export_batches', 'batch_code', 6);
    const exportedAt = now();

    const batchId = insertRow(
      `INSERT INTO acct_export_batches (
        batch_code, export_format, adapter_type, status, reconciliation_status,
        event_count, total_debit_kyd, total_credit_kyd, exported_at, idempotency_key, notes, created_at
      ) VALUES (?, ?, ?, 'Completed', 'Pending', ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchCode,
        input.exportFormat,
        input.adapterType ?? 'Manual',
        events.length,
        totalDebit,
        totalCredit,
        exportedAt,
        input.idempotencyKey ?? null,
        input.notes ?? '',
        exportedAt,
      ],
    );

    for (const event of events) {
      insertRow(
        `INSERT INTO acct_export_batch_lines (export_batch_id, accounting_event_id, exported_at)
         VALUES (?, ?, ?)`,
        [batchId, event.id, exportedAt],
      );
      runQuery(
        `UPDATE acct_events SET status = 'Exported', export_batch_id = ? WHERE id = ?`,
        [batchId, event.id],
      );
    }

    const inventoryAfter = snapshotInventoryCounts();
    for (const key of Object.keys(inventoryBefore)) {
      if (inventoryBefore[key] !== inventoryAfter[key]) {
        throw new Error('Accounting export must not mutate inventory tables.');
      }
    }

    return batchId;
  });
}

export function updateExportBatchReconciliation(
  batchId: number,
  reconciliationStatus: ReconciliationStatus,
  notes?: string,
): void {
  const batch = getExportBatch(batchId);
  if (!batch) throw new Error('Export batch not found.');
  runQuery(
    `UPDATE acct_export_batches SET reconciliation_status = ?, notes = COALESCE(?, notes) WHERE id = ?`,
    [reconciliationStatus, notes ?? null, batchId],
  );
}

function eventsToExportLines(events: AcctEvent[]): AccountingExportLine[] {
  return events.map((event) => ({
    eventCode: event.event_code,
    eventType: event.event_type,
    eventDate: event.event_date,
    description: event.description,
    debitAccountNumber: event.debit_account_number,
    debitAccountName: event.debit_account_name,
    creditAccountNumber: event.credit_account_number,
    creditAccountName: event.credit_account_name,
    amountKyd: event.amount_kyd,
    sourceEntityType: event.source_entity_type,
    sourceEntityId: event.source_entity_id,
    idempotencyKey: event.idempotency_key,
  }));
}

export function exportBatchToJson(batchId: number): string {
  const batch = getExportBatch(batchId);
  if (!batch) throw new Error('Export batch not found.');
  const events = queryAll<AcctEvent>(
    'SELECT * FROM acct_events WHERE export_batch_id = ? ORDER BY event_date, id',
    [batchId],
  );
  const lines = eventsToExportLines(events);
  const adapter = getQuickBooksAdapter(batch.adapter_type);
  let payload: QuickBooksExportPayload | Record<string, unknown> = {
    batchCode: batch.batch_code,
    exportFormat: batch.export_format,
    adapterType: batch.adapter_type,
    exportedAt: batch.exported_at,
    reconciliationStatus: batch.reconciliation_status,
    lines,
  };
  if (adapter) {
    const formatted = adapter.formatJournalEntries(lines);
    formatted.batchCode = batch.batch_code;
    formatted.exportedAt = batch.exported_at ?? now();
    payload = formatted;
  }
  return JSON.stringify(payload, null, 2);
}

export function exportBatchToCsv(batchId: number): string {
  const batch = getExportBatch(batchId);
  if (!batch) throw new Error('Export batch not found.');
  const events = queryAll<AcctEvent>(
    'SELECT * FROM acct_events WHERE export_batch_id = ? ORDER BY event_date, id',
    [batchId],
  );
  const headers = [
    'eventCode',
    'eventType',
    'eventDate',
    'description',
    'debitAccountNumber',
    'debitAccountName',
    'creditAccountNumber',
    'creditAccountName',
    'amountKyd',
    'idempotencyKey',
  ];
  const rows = eventsToExportLines(events).map((line) => ({ ...line }));
  return rowsToCsv(headers, rows);
}

export function getAccountingDashboardSummary(): AccountingDashboardSummary {
  const pending = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM acct_events WHERE status = 'Pending'",
  )?.count ?? 0;
  const exported = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM acct_events WHERE status = 'Exported'",
  )?.count ?? 0;
  const reversed = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM acct_events WHERE status = 'Reversed'",
  )?.count ?? 0;
  const pendingCogs = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_kyd), 0) AS total FROM acct_events
     WHERE status = 'Pending' AND event_type = 'FG Shipment'`,
  )?.total ?? 0;
  const batches = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM acct_export_batches')?.count ?? 0;
  const unreconciled = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM acct_export_batches WHERE reconciliation_status != 'Reconciled'",
  )?.count ?? 0;
  const mappingCount = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM acct_account_mappings')?.count ?? 0;

  return {
    pendingEvents: pending,
    exportedEvents: exported,
    reversedEvents: reversed,
    pendingCogsKyd: pendingCogs,
    exportBatches: batches,
    unreconciledBatches: unreconciled,
    mappingCount,
  };
}
