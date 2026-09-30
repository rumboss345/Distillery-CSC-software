import { formatDateDisplay } from '../../lib/date-input';
import { buildFermentationHistoryRows } from '../../lib/reporting/fermentation-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function FermentationReport() {
  const { range } = useReportContext();
  const rows = buildFermentationHistoryRows(range);

  const csvHeaders = [
    'Wash batch', 'Recipe', 'Fermenter', 'Volume gal', 'Started', 'Start Brix', 'Status', 'Operator',
  ];
  const csvRows = rows.map((row) => [
    row.batch_number,
    row.recipe_name,
    row.fermenter_name,
    row.volume_gal ?? '',
    row.start_date,
    row.start_brix ?? '',
    row.status,
    row.operator,
  ]);

  return (
    <ReportTableShell
      title="Fermentation history"
      description="Completed fermentations. The Fermentation page keeps the latest 10. Use the period above to look up older ones."
      periodLabel={range.label}
      csvFilename={`fermentation-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No completed fermentations in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Wash batch</th>
            <th>Recipe</th>
            <th>Fermenter</th>
            <th>Volume</th>
            <th>Started</th>
            <th>Start Brix</th>
            <th>Status</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td><strong>{row.batch_number}</strong></td>
              <td>{row.recipe_name}</td>
              <td>{row.fermenter_name}</td>
              <td>{row.volume_gal != null ? `${row.volume_gal.toFixed(1)} gal` : '—'}</td>
              <td>{formatDateDisplay(row.start_date)}</td>
              <td>{row.start_brix ?? '—'}</td>
              <td>{row.status}</td>
              <td>{row.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
