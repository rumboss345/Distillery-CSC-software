import { formatDateDisplay } from '../../lib/date-input';
import {
  buildFermentationHistoryRows,
  buildFermentationLeftoverRows,
} from '../../lib/reporting/fermentation-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function FermentationReport() {
  const { range } = useReportContext();
  const rows = buildFermentationHistoryRows(range);
  const leftovers = buildFermentationLeftoverRows(range);

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

  const leftoverHeaders = ['Date', 'Wash batch', 'Recipe', 'Fermenter', 'Gallons', 'Why', 'Who'];
  const leftoverCsv = leftovers.map((row) => [
    row.discarded_date,
    row.batch_number,
    row.recipe_name,
    row.fermenter_name,
    row.volume_gal,
    row.notes,
    row.who,
  ]);

  return (
    <>
    <ReportTableShell
      title="Fermentation history"
      description="Completed and discarded fermentations. The Fermentation page keeps the latest 10 of each. Use the period above to look up older ones."
      periodLabel={range.label}
      csvFilename={`fermentation-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No completed or discarded fermentations in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Wash batch</th>
            <th>Recipe</th>
            <th>Fermenter</th>
            <th className="num">Volume</th>
            <th>Started</th>
            <th className="num">Start Brix</th>
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
              <td className="num">{row.volume_gal != null ? `${row.volume_gal.toFixed(1)} gal` : '—'}</td>
              <td>{formatDateDisplay(row.start_date)}</td>
              <td className="num">{row.start_brix ?? '—'}</td>
              <td>{row.status}</td>
              <td>{row.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
    <ReportTableShell
      title="Fermentation leftovers"
      description="Gallons that could not be used. The Fermentation page keeps the latest 10 leftover records."
      periodLabel={range.label}
      csvFilename={`fermentation-leftovers-${range.from ?? 'all'}`}
      csvHeaders={leftoverHeaders}
      csvRows={leftoverCsv}
      isEmpty={leftovers.length === 0}
      emptyMessage="No leftovers in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Wash batch</th>
            <th>Recipe</th>
            <th>Fermenter</th>
            <th className="num">Gallons</th>
            <th>Why</th>
            <th>Who</th>
          </tr>
        </thead>
        <tbody>
          {leftovers.map((row) => (
            <tr key={row.key}>
              <td>{formatDateDisplay(row.discarded_date)}</td>
              <td><strong>{row.batch_number}</strong></td>
              <td>{row.recipe_name}</td>
              <td>{row.fermenter_name}</td>
              <td className="num">{row.volume_gal.toFixed(1)} gal</td>
              <td>{row.notes}</td>
              <td>{row.who}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
    </>
  );
}
