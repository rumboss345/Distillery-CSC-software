import { useMemo, useState } from 'react';
import { downloadCsv } from '../../lib/csv-export';
import { reportingRepository } from '../../db/repositories/reporting-repository';

export function PurchasingReportsPage() {
  const [openOnly, setOpenOnly] = useState(true);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const rows = useMemo(() => {
    const filter = {
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
    };
    return openOnly
      ? reportingRepository.getOpenPurchasingReport()
      : reportingRepository.getPurchasingReport(filter);
  }, [openOnly, periodStart, periodEnd]);

  function exportCsv(): void {
    downloadCsv(
      'purchasing-report.csv',
      ['poCode', 'supplierName', 'orderDate', 'status', 'materialName', 'orderedQty', 'receivedQty', 'remainingQty', 'currency'],
      rows.map((row) => ({ ...row })),
    );
  }

  return (
    <section className="card">
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <label>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          {' '}Open PO lines only
        </label>
        {!openOnly && (
          <>
            <label>
              From
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <h2>Purchasing Reports</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Order Date</th>
              <th>Status</th>
              <th>Material</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Remaining</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.poCode}-${row.materialName}-${row.orderedQty}`}>
                <td>{row.poCode}</td>
                <td>{row.supplierName}</td>
                <td>{row.orderDate}</td>
                <td>{row.status}</td>
                <td>{row.materialName}</td>
                <td>{row.orderedQty.toFixed(2)}</td>
                <td>{row.receivedQty.toFixed(2)}</td>
                <td>{row.remainingQty.toFixed(2)}</td>
                <td>{row.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
