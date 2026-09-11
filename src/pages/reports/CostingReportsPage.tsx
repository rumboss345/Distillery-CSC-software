import { useMemo } from 'react';
import type { CostStatus } from '../../../shared/costing/constants';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { downloadCsv } from '../../lib/csv-export';
import { reportingRepository } from '../../db/repositories/reporting-repository';

export function CostingReportsPage() {
  const rows = useMemo(() => reportingRepository.getCostingReport(), []);

  function exportCsv(): void {
    downloadCsv(
      'costing-report.csv',
      ['category', 'entityCode', 'description', 'quantity', 'unit', 'totalCostKyd', 'costStatus'],
      rows.map((row) => ({ ...row })),
    );
  }

  return (
    <section className="card">
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <h2>Costing &amp; Valuation Report</h2>
      <p className="page-subtitle">Combined ledger inventory valuation plus recent batch cost snapshots.</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Code</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Total Cost (KYD)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.category}-${row.entityCode}-${row.description}`}>
                <td>{row.category}</td>
                <td>{row.entityCode}</td>
                <td>{row.description}</td>
                <td>{row.quantity.toFixed(2)}</td>
                <td>{row.unit}</td>
                <td>{formatCostDisplay(row.totalCostKyd, row.costStatus as CostStatus)}</td>
                <td>{row.costStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
