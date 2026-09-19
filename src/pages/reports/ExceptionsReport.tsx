import { format, parseISO } from 'date-fns';
import { buildProductionExceptions } from '../../lib/reporting/exceptions';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function ExceptionsReport() {
  const { range } = useReportContext();
  const rows = buildProductionExceptions(range);

  const csvHeaders = ['Severity', 'Category', 'Date', 'Reference', 'Message'];
  const csvRows = rows.map((r) => [
    r.severity, r.category, r.occurred_at, r.reference, r.message,
  ]);

  return (
    <ReportTableShell
      title="Exceptions"
      description="Operational flags: bottling variance, blend volume drift, missing hearts, and tank overfill."
      periodLabel={range.label}
      csvFilename={`exceptions-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No exceptions detected for this period."
    >
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Category</th>
            <th>Date</th>
            <th>Reference</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row_key}>
              <td><span className={`exception-badge exception-${r.severity}`}>{r.severity}</span></td>
              <td>{r.category}</td>
              <td>{format(parseISO(r.occurred_at.slice(0, 10)), 'MMM d, yyyy')}</td>
              <td><strong>{r.reference}</strong></td>
              <td>{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
