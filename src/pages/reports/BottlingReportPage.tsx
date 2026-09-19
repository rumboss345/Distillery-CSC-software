import { format, parseISO } from 'date-fns';
import { buildBottlingReportRows } from '../../lib/reporting/bottling-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function BottlingReportPage() {
  const { range } = useReportContext();
  const rows = buildBottlingReportRows(range);

  const csvHeaders = [
    'Batch', 'Product', 'Date', 'Lot', 'Source type', 'Tank draw gal', 'Bottled gal', 'ABV',
    'Bottled LAA gal', 'Bottles', 'Packaging', 'Variance gal',
  ];
  const csvRows = rows.map((r) => [
    r.batch_number, r.product_name, r.bottling_date, r.lot_number, r.source_type,
    r.tank_draw_gal ?? '', r.bottled_gal, r.final_abv, r.bottled_laa_gal, r.bottle_count,
    r.packaging_summary, r.volume_variance_gal ?? '',
  ]);

  return (
    <ReportTableShell
      title="Packaging & bottling"
      description="Bottling runs with tank draw, bottled volume, LAA, and variance."
      periodLabel={range.label}
      csvFilename={`bottling-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No bottling runs in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Product</th>
            <th>Date</th>
            <th>Bottled</th>
            <th>ABV</th>
            <th>LAA</th>
            <th>Bottles</th>
            <th>Tank draw</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bottling_id}>
              <td><strong>{r.batch_number}</strong></td>
              <td>{r.product_name}</td>
              <td>{format(parseISO(r.bottling_date), 'MMM d, yyyy')}</td>
              <td>{r.bottled_gal.toFixed(2)} gal</td>
              <td>{r.final_abv.toFixed(1)}%</td>
              <td>{r.bottled_laa_gal.toFixed(2)}</td>
              <td>{r.bottle_count}</td>
              <td>{r.tank_draw_gal != null ? r.tank_draw_gal.toFixed(2) : '—'}</td>
              <td>
                {r.volume_variance_gal != null && Math.abs(r.volume_variance_gal) >= 0.01
                  ? `${r.volume_variance_gal > 0 ? '+' : ''}${r.volume_variance_gal.toFixed(2)}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
