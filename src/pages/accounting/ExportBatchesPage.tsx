import { useEffect, useState } from 'react';
import { accountingRepository } from '../../db/repositories/accounting-repository';
import type { AcctExportBatch } from '../../types/accounting';

export function ExportBatchesPage() {
  const [batches, setBatches] = useState<AcctExportBatch[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => setBatches(accountingRepository.listExportBatches());

  useEffect(() => {
    refresh();
  }, []);

  const handleCreateExport = () => {
    const pending = accountingRepository.listAccountingEvents({ status: 'Pending' });
    if (pending.length === 0) {
      setMessage('No pending events to export.');
      return;
    }
    const batchId = accountingRepository.createExportBatch({
      eventIds: pending.map((e) => e.id),
      exportFormat: 'CSV',
      adapterType: 'QuickBooksOnline',
      notes: 'Manual export from UI',
    });
    setMessage(`Created export batch ${batchId}.`);
    refresh();
  };

  const handleDownloadCsv = (batchId: number) => {
    const batch = accountingRepository.getExportBatch(batchId);
    if (!batch) return;
    const csv = accountingRepository.exportBatchToCsv(batchId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${batch.batch_code}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = (batchId: number) => {
    const batch = accountingRepository.getExportBatch(batchId);
    if (!batch) return;
    const json = accountingRepository.exportBatchToJson(batchId);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${batch.batch_code}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleReconcile = (batchId: number) => {
    accountingRepository.updateExportBatchReconciliation(batchId, 'Reconciled');
    refresh();
  };

  return (
    <section className="card">
      <h2>Export Batches</h2>
      <p className="text-muted">
        CSV/JSON handoff files with batch tracking and reconciliation status. Export does not mutate inventory.
      </p>
      <button type="button" className="btn btn-primary" onClick={handleCreateExport}>
        Export All Pending Events
      </button>
      {message && <p className="muted">{message}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Batch</th>
            <th>Format</th>
            <th>Adapter</th>
            <th>Events</th>
            <th>Total (KYD)</th>
            <th>Reconciliation</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td>{b.batch_code}</td>
              <td>{b.export_format}</td>
              <td>{b.adapter_type}</td>
              <td>{b.event_count}</td>
              <td>{b.total_debit_kyd.toFixed(2)}</td>
              <td>{b.reconciliation_status}</td>
              <td>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleDownloadCsv(b.id)}>
                  CSV
                </button>{' '}
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleDownloadJson(b.id)}>
                  JSON
                </button>{' '}
                {b.reconciliation_status !== 'Reconciled' && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleReconcile(b.id)}>
                    Mark Reconciled
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
