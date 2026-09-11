import { nextBusinessCode, queryAll, queryOne, runQuery, withPgTransaction, insertRow } from '../pg-helpers.js';

const now = () => new Date().toISOString();

export async function listAccountingEvents(filters?: {
  status?: string;
  eventType?: string;
  exportBatchId?: number;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.status) {
    clauses.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.eventType) {
    clauses.push(`event_type = $${idx++}`);
    params.push(filters.eventType);
  }
  if (filters?.exportBatchId != null) {
    clauses.push(`export_batch_id = $${idx++}`);
    params.push(filters.exportBatchId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll(
    `SELECT * FROM acct_events ${where} ORDER BY event_date DESC, id DESC`,
    params,
  );
}

export async function listExportBatches() {
  return queryAll('SELECT * FROM acct_export_batches ORDER BY created_at DESC');
}

export async function createExportBatch(input: {
  eventIds: number[];
  exportFormat: string;
  adapterType?: string;
  idempotencyKey?: string;
  notes?: string;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    if (input.idempotencyKey) {
      const existing = await queryOne<{ id: number }>(
        'SELECT id FROM acct_export_batches WHERE idempotency_key = $1',
        [input.idempotencyKey],
        client,
      );
      if (existing) throw new Error('Export batch with this idempotency key already exists.');
    }

    const events = [];
    for (const eventId of input.eventIds) {
      const event = await queryOne<{
        id: number;
        event_code: string;
        status: string;
        amount_kyd: number;
      }>('SELECT id, event_code, status, amount_kyd FROM acct_events WHERE id = $1', [eventId], client);
      if (!event) throw new Error(`Accounting event ${eventId} not found.`);
      if (event.status !== 'Pending') {
        throw new Error(`Event ${event.event_code} is not pending export (status: ${event.status}).`);
      }
      const alreadyExported = await queryOne<{ id: number }>(
        'SELECT id FROM acct_export_batch_lines WHERE accounting_event_id = $1',
        [eventId],
        client,
      );
      if (alreadyExported) {
        throw new Error(`Event ${event.event_code} has already been exported.`);
      }
      events.push(event);
    }

    if (events.length === 0) throw new Error('Export batch requires at least one pending event.');

    const totalDebit = events.reduce((sum, e) => sum + e.amount_kyd, 0);
    const batchCode = await nextBusinessCode('exportBatch', 'acct_export_batches', 'batch_code', 6, client);
    const exportedAt = now();

    const batchId = await insertRow(
      `INSERT INTO acct_export_batches (
        batch_code, export_format, adapter_type, status, reconciliation_status,
        event_count, total_debit_kyd, total_credit_kyd, exported_at, idempotency_key, notes, created_at
      ) VALUES ($1, $2, $3, 'Completed', 'Pending', $4, $5, $5, $6, $7, $8, $6)`,
      [
        batchCode,
        input.exportFormat,
        input.adapterType ?? 'Manual',
        events.length,
        totalDebit,
        exportedAt,
        input.idempotencyKey ?? null,
        input.notes ?? '',
      ],
      client,
    );

    for (const event of events) {
      await insertRow(
        'INSERT INTO acct_export_batch_lines (export_batch_id, accounting_event_id, exported_at) VALUES ($1, $2, $3)',
        [batchId, event.id, exportedAt],
        client,
      );
      await runQuery(
        `UPDATE acct_events SET status = 'Exported', export_batch_id = $1 WHERE id = $2`,
        [batchId, event.id],
        client,
      );
    }

    return batchId;
  });
}
