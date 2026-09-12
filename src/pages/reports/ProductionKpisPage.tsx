import { useMemo, useState } from 'react';
import { downloadCsv } from '../../lib/csv-export';
import { reportingRepository } from '../../db/repositories/reporting-repository';

export function ProductionKpisPage() {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const rows = useMemo(
    () => reportingRepository.getProductionKpiReport({
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
    }),
    [periodStart, periodEnd],
  );

  function exportCsv(): void {
    downloadCsv(
      'production-kpis.csv',
      ['period', 'ordersReleased', 'ordersCompleted', 'batchesStarted', 'batchesCompleted', 'avgBatchCostKyd', 'totalOutputLitres'],
      rows.map((row) => ({ ...row })),
    );
  }

  return (
    <section className="card">
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <label>
          From
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <h2>Production KPIs</h2>
      {rows.length === 0 ? (
        <p className="muted">No production batch activity for the selected period.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Orders Released</th>
                <th>Orders Completed</th>
                <th>Batches Started</th>
                <th>Batches Completed</th>
                <th>Avg Batch Cost (KYD)</th>
                <th>Output (L)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.period}>
                  <td>{row.period}</td>
                  <td>{row.ordersReleased}</td>
                  <td>{row.ordersCompleted}</td>
                  <td>{row.batchesStarted}</td>
                  <td>{row.batchesCompleted}</td>
                  <td>{row.avgBatchCostKyd != null ? row.avgBatchCostKyd.toFixed(2) : '—'}</td>
                  <td>{row.totalOutputLitres.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
