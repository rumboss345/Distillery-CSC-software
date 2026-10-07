import { formatCalendarDay } from '../../lib/date-input';
import { buildVolumeChangeRows } from '../../lib/reporting/volume-changes';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function VolumeChangesReport() {
  const { range } = useReportContext();
  const rows = buildVolumeChangeRows(range);

  const csvHeaders = ['Date', 'Kind', 'Place', 'Change', 'Why', 'Who'];
  const csvRows = rows.map((row) => [
    row.occurred_at, row.kind, row.place, row.change, row.why, row.who,
  ]);

  return (
    <ReportTableShell
      title="Volume changes"
      description="Fermenter leftovers, set tank volumes and ABV, bottling variances, blend differences, and distillation alcohol loss. A distillation loss is the alcohol charged minus the alcohol collected. Other corrections record why they were made and who made them."
      periodLabel={range.label}
      csvFilename={`volume-changes-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No volume or ABV changes in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Kind</th>
            <th>Place</th>
            <th>Change</th>
            <th>Why</th>
            <th>Who</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{formatCalendarDay(row.occurred_at)}</td>
              <td>{row.kind}</td>
              <td><strong>{row.place}</strong></td>
              <td>{row.change}</td>
              <td>{row.why}</td>
              <td>{row.who}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
