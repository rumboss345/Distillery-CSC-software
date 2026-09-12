import { useMemo } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { downloadCsv } from '../../lib/csv-export';
import { reportingRepository } from '../../db/repositories/reporting-repository';

export function BarrelReportsPage() {
  const rows = useMemo(() => reportingRepository.getBarrelReport(), []);

  function exportCsv(): void {
    downloadCsv(
      'barrel-report.csv',
      ['barrelCode', 'status', 'locationName', 'fillDate', 'volumeLitres', 'liquidCostKyd', 'assetCostKyd', 'ageDays'],
      rows.map((row) => ({ ...row })),
    );
  }

  return (
    <section className="card">
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <h2>Barrel Aging Report</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Barrel</th>
              <th>Status</th>
              <th>Location</th>
              <th>Fill Date</th>
              <th>Age (days)</th>
              <th>Volume (L)</th>
              <th>Liquid Cost</th>
              <th>Asset Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.barrelCode}>
                <td>{row.barrelCode}</td>
                <td>{row.status}</td>
                <td>{row.locationName ?? '—'}</td>
                <td>{row.fillDate ?? '—'}</td>
                <td>{row.ageDays ?? '—'}</td>
                <td>{row.volumeLitres.toFixed(1)}</td>
                <td>{formatCostDisplay(row.liquidCostKyd, 'VALUED')}</td>
                <td>{formatCostDisplay(row.assetCostKyd, 'VALUED')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
