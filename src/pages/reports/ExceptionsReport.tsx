import { formatCalendarDay } from '../../lib/date-input';
import { buildProductionExceptions } from '../../lib/reporting/exceptions';
import { emptyForEmployee, filterRowsByPerson, reportPeriodLabel } from '../../lib/reporting/person';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function ExceptionsReport() {
  const { range, employee } = useReportContext();
  const periodLabel = reportPeriodLabel(range.label, employee);
  const rows = filterRowsByPerson(buildProductionExceptions(range), (row) => row.who, employee);

  const csvHeaders = ['Severity', 'Category', 'Date', 'Reference', 'Message'];
  const csvRows = rows.map((r) => [
    r.severity, r.category, r.occurred_at, r.reference, r.message,
  ]);

  return (
    <ReportTableShell
      title="Exceptions"
      description="Operational flags: bottling variance, blend volume drift, tank volume and ABV corrections, fermenter leftovers, missing hearts, and tank overfill. Volume changes also lists every correction with why and who."
      periodLabel={periodLabel}
      csvFilename={`exceptions-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage={emptyForEmployee('No exceptions detected for this period.', employee)}
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
              <td>{formatCalendarDay(r.occurred_at)}</td>
              <td><strong>{r.reference}</strong></td>
              <td>{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
