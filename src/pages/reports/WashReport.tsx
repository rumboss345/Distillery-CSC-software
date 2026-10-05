import { formatDateDisplay } from '../../lib/date-input';
import { buildWashHistoryRows } from '../../lib/reporting/wash-rows';
import { washStatusLabel } from '../../lib/wash-stage';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function WashReport() {
  const { range } = useReportContext();
  const rows = buildWashHistoryRows(range);

  const csvHeaders = [
    'Wash batch', 'Recipe', 'Sugar lbs', 'Batch size gal', 'Started', 'Status', 'Operator',
  ];
  const csvRows = rows.map((row) => [
    row.batch_number,
    row.recipe_name,
    row.sugar_lbs,
    row.volume_gal,
    row.start_date,
    washStatusLabel(row.status),
    row.operator,
  ]);

  return (
    <ReportTableShell
      title="Wash history"
      description="Every wash cook, including batches that moved on to fermentation. The Wash page keeps active washes and the latest 10 completed or discarded batches. Use the period above to look up older ones."
      periodLabel={range.label}
      csvFilename={`wash-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No wash batches in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Wash batch</th>
            <th>Recipe</th>
            <th>Sugar</th>
            <th>Batch size</th>
            <th>Started</th>
            <th>Status</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td><strong>{row.batch_number}</strong></td>
              <td>{row.recipe_name}</td>
              <td>{row.sugar_lbs} lbs</td>
              <td>{row.volume_gal} gal</td>
              <td>{formatDateDisplay(row.start_date)}</td>
              <td>{washStatusLabel(row.status)}</td>
              <td>{row.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
