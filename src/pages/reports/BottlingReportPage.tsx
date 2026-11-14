import { formatDateDisplay } from '../../lib/date-input';
import { bottleSizeCounts, formatBottlingAlcoholVariance } from '../../lib/bottling-lines';
import { buildBottlingReportRows } from '../../lib/reporting/bottling-rows';
import { buildPackagingConsumption } from '../../lib/reporting/packaging-consumption';
import { emptyForEmployee, filterRowsByPerson, reportPeriodLabel } from '../../lib/reporting/person';
import { ReportRecordLink } from '../../components/ReportRecordLink';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function BottlingReportPage() {
  const { range, employee } = useReportContext();
  const periodLabel = reportPeriodLabel(range.label, employee);
  const rows = filterRowsByPerson(
    buildBottlingReportRows(range),
    (row) => row.variance_changed_by,
    employee,
  );
  const sizeTotals = bottleSizeCounts(rows.flatMap((row) => (
    row.bottle_sizes.map((size) => ({ bottle_count: size.count, bottle_size_ml: size.sizeMl }))
  )));
  const packagingConsumption = buildPackagingConsumption(range, employee);

  const csvHeaders = [
    'Batch', 'Product', 'Date', 'Lot', 'Source type', 'Tank draw gal', 'Expected gal', 'Bottled gal', 'Variance %',
    'Planned ABV', 'Measured ABV (60F)', 'ABV variance pts', 'Bottled LAA gal', 'Bottles', 'Bottle sizes',
    'Variance gal', 'Alcohol variance gal', 'Why', 'Who', 'Operator',
  ];
  const csvRows = rows.map((r) => [
    r.batch_number, r.product_name, r.bottling_date, r.lot_number, r.source_type,
    r.tank_draw_gal ?? '', r.expected_gal ?? '', r.bottled_gal, r.volume_variance_pct ?? '',
    r.final_abv, r.measured_abv ?? '', r.abv_variance_points ?? '', r.bottled_laa_gal, r.bottle_count,
    r.packaging_summary, r.volume_variance_gal ?? '', r.alcohol_variance_gal ?? '', r.variance_reason ?? '', r.variance_changed_by ?? '',
    r.operator,
  ]);

  return (
    <ReportTableShell
      title="Packaging & bottling"
      description={`Bottling runs with tank draw, bottled volume, LAA, gallon variance, alcohol gained or lost, and each bottle size. Gallons sent to a tank are not a loss. The Bottling page keeps the latest 10 runs.${employee ? ` This list keeps runs whose variance was recorded by ${employee.label}.` : ''}`}
      periodLabel={periodLabel}
      csvFilename={`bottling-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage={emptyForEmployee('No bottling runs in this period.', employee)}
      tableWrap={false}
    >
      {packagingConsumption.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '1rem' }} data-testid="bottling-packaging-consumption">
          <table>
            <thead>
              <tr>
                <th colSpan={3}>Packaging consumption (inventory SKUs)</th>
              </tr>
              <tr>
                <th>Type</th>
                <th>SKU</th>
                <th className="num">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {packagingConsumption.map((row) => (
                <tr key={row.key}>
                  <td>{row.kind === 'bottle' ? 'Bottle' : 'Label'}</td>
                  <td>{row.sku}</td>
                  <td className="num">{row.quantity.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
            <th className="num">ABV planned / measured</th>
            <th className="num">LAA</th>
            <th className="num">Bottles</th>
            <th>Bottle sizes</th>
            <th className="num">Tank draw / expected</th>
            <th className="num">Variance</th>
            <th>Why</th>
            <th>Who</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bottling_id}>
              <td>
                <ReportRecordLink target={{ kind: 'bottling', id: r.bottling_id }}>
                  <strong>{r.batch_number}</strong>
                </ReportRecordLink>
              </td>
              <td>{r.product_name}</td>
              <td>{formatDateDisplay(r.bottling_date)}</td>
              <td className="num">{r.bottled_gal.toFixed(2)} gal</td>
              <td className="num">
                <div>{r.final_abv.toFixed(2)}%</div>
                <div className="text-muted">
                  {r.measured_abv != null
                    ? `${r.measured_abv.toFixed(2)}% (${(r.abv_variance_points ?? 0) > 0 ? '+' : ''}${(r.abv_variance_points ?? 0).toFixed(2)})`
                    : 'Not checked'}
                </div>
              </td>
              <td className="num">{r.bottled_laa_gal.toFixed(2)}</td>
              <td className="num">{r.bottle_count.toLocaleString()}</td>
              <td>
                {r.bottle_sizes.length === 0 ? '—' : r.bottle_sizes.map((size) => (
                  <div key={size.sizeMl}>{size.count.toLocaleString()} × {size.sizeMl} ml</div>
                ))}
              </td>
              <td className="num">
                <div>{r.tank_draw_gal != null ? r.tank_draw_gal.toFixed(2) : '—'}</div>
                {r.expected_gal != null && (
                  <div className="text-muted">
                    {r.expected_gal.toFixed(2)} expected
                    {r.volume_variance_pct != null ? ` (${r.volume_variance_pct > 0 ? '+' : ''}${r.volume_variance_pct}%)` : ''}
                  </div>
                )}
              </td>
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
