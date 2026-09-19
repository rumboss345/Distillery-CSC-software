import { format, parseISO } from 'date-fns';
import { buildLiquidMovements } from '../../lib/reporting/movements';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function MovementsReport() {
  const { range } = useReportContext();
  const rows = buildLiquidMovements(range);

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
      description="Union of cuts, still charges, transfers, blend draws/outputs, bottling tank draws, and barrel fills."
      periodLabel={range.label}
      csvFilename={`movements-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No liquid movements in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>From</th>
            <th>To</th>
            <th>Product</th>
            <th>Volume</th>
            <th>LAA</th>
            <th>Batch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row_key}>
              <td>{format(parseISO(r.occurred_at.slice(0, 10)), 'MMM d, yyyy')}</td>
              <td>{r.movement_type.replace(/_/g, ' ')}</td>
              <td>{r.source_label}</td>
              <td>{r.dest_label}</td>
              <td>{r.product_liquid}</td>
              <td>{r.volume_gal.toFixed(2)} gal @ {r.abv.toFixed(1)}%</td>
              <td>{r.laa_gal.toFixed(2)}</td>
              <td>{r.batch_ref || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
