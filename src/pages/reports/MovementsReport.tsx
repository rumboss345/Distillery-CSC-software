import { formatCalendarDay } from '../../lib/date-input';
import { buildLiquidMovements } from '../../lib/reporting/movements';
import { emptyForEmployee, filterRowsByPerson, reportPeriodLabel } from '../../lib/reporting/person';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function MovementsReport() {
  const { range, employee } = useReportContext();
  const periodLabel = reportPeriodLabel(range.label, employee);
  const rows = filterRowsByPerson(buildLiquidMovements(range), (row) => row.user_label, employee);

  const csvHeaders = [
    'Date', 'Type', 'Source', 'Destination', 'Product', 'Batch', 'Volume gal', 'ABV', 'LAA gal', 'User', 'Reference', 'Notes',
  ];
  const csvRows = rows.map((r) => [
    r.occurred_at, r.movement_type, r.source_label, r.dest_label, r.product_liquid, r.batch_ref,
    r.volume_gal, r.abv, r.laa_gal, r.user_label, r.reference, r.notes,
  ]);

  return (
    <ReportTableShell
      title="Liquid movements"
      description={`Union of cuts, still charges, transfers, water added in a tank, blend draws/outputs, bottling tank draws, and barrel fills. The Tank Transfer page keeps the latest 10 transfers.${employee ? ' Tank transfers and barrel fills are listed under All employees.' : ''}`}
      periodLabel={periodLabel}
      csvFilename={`movements-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage={emptyForEmployee('No liquid movements in this period.', employee)}
    >
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>From</th>
            <th>To</th>
            <th>Product</th>
            <th className="num">Volume</th>
            <th className="num">LAA</th>
            <th>Batch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row_key}>
              <td>{formatCalendarDay(r.occurred_at)}</td>
              <td>{r.movement_type.replace(/_/g, ' ')}</td>
              <td>{r.source_label}</td>
              <td>{r.dest_label}</td>
              <td>{r.product_liquid}</td>
              <td className="num">{r.volume_gal.toFixed(2)} gal @ {r.abv.toFixed(1)}%</td>
              <td className="num">{r.laa_gal.toFixed(2)}</td>
              <td>{r.batch_ref || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
