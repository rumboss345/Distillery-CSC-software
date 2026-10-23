import { formatDateDisplay } from '../../lib/date-input';
import { bottleSizeCounts, formatBottlingAlcoholVariance } from '../../lib/bottling-lines';
import { buildBottlingReportRows } from '../../lib/reporting/bottling-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function BottlingReportPage() {
  const { range } = useReportContext();
  const rows = buildBottlingReportRows(range);
  const sizeTotals = bottleSizeCounts(rows.flatMap((row) => (
    row.bottle_sizes.map((size) => ({ bottle_count: size.count, bottle_size_ml: size.sizeMl }))
  )));

  const csvHeaders = [
    'Batch', 'Product', 'Date', 'Lot', 'Source type', 'Tank draw gal', 'Bottled gal', 'ABV',
    'Bottled LAA gal', 'Bottles', 'Bottle sizes', 'Variance gal', 'Alcohol variance gal', 'Why', 'Who',
  ];
  const csvRows = rows.map((r) => [
    r.batch_number, r.product_name, r.bottling_date, r.lot_number, r.source_type,
    r.tank_draw_gal ?? '', r.bottled_gal, r.final_abv, r.bottled_laa_gal, r.bottle_count,
    r.packaging_summary, r.volume_variance_gal ?? '', r.alcohol_variance_gal ?? '', r.variance_reason ?? '', r.variance_changed_by ?? '',
  ]);

  return (
    <ReportTableShell
      title="Packaging & bottling"
      description="Bottling runs with tank draw, bottled volume, LAA, gallon variance, alcohol gained or lost, and each bottle size. Gallons sent to a tank are not a loss. The Bottling page keeps the latest 10 runs."
      periodLabel={range.label}
      csvFilename={`bottling-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No bottling runs in this period."
      tableWrap={false}
    >
      {sizeTotals.length > 0 && (
        <div className="card-grid bottling-size-grid" data-testid="bottling-size-totals">
          {sizeTotals.map((size) => (
            <div key={size.sizeMl} className="stat-card" data-testid={`bottle-size-${size.sizeMl}`}>
              <div className="label">{size.sizeMl} ml</div>
              <div className="value">{size.count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Product</th>
            <th>Date</th>
            <th className="num">Bottled</th>
            <th className="num">ABV</th>
            <th className="num">LAA</th>
            <th className="num">Bottles</th>
            <th>Bottle sizes</th>
            <th className="num">Tank draw</th>
            <th className="num">Variance</th>
            <th>Why</th>
            <th>Who</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bottling_id}>
              <td><strong>{r.batch_number}</strong></td>
              <td>{r.product_name}</td>
              <td>{formatDateDisplay(r.bottling_date)}</td>
              <td className="num">{r.bottled_gal.toFixed(2)} gal</td>
              <td className="num">{r.final_abv.toFixed(1)}%</td>
              <td className="num">{r.bottled_laa_gal.toFixed(2)}</td>
              <td className="num">{r.bottle_count.toLocaleString()}</td>
              <td>
                {r.bottle_sizes.length === 0 ? '—' : r.bottle_sizes.map((size) => (
                  <div key={size.sizeMl}>{size.count.toLocaleString()} × {size.sizeMl} ml</div>
                ))}
              </td>
              <td className="num">{r.tank_draw_gal != null ? r.tank_draw_gal.toFixed(2) : '—'}</td>
              <td className="num">
                <div>
                  {r.volume_variance_gal != null && Math.abs(r.volume_variance_gal) >= 0.01
                    ? `${r.volume_variance_gal > 0 ? '+' : ''}${r.volume_variance_gal.toFixed(2)}`
                    : '—'}
                </div>
                {r.alcohol_variance_gal != null && Math.abs(r.alcohol_variance_gal) >= 0.01 && (
                  <div data-testid="bottling-report-alcohol">{formatBottlingAlcoholVariance(r.alcohol_variance_gal)}</div>
                )}
              </td>
              <td>{r.variance_reason || '—'}</td>
              <td>{r.variance_changed_by || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </ReportTableShell>
  );
}
