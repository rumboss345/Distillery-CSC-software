import { formatCalendarDay } from '../../lib/date-input';
import { buildBlendReportRows } from '../../lib/reporting/blend-rows';
import { emptyForEmployee, filterRowsByPerson, reportPeriodLabel } from '../../lib/reporting/person';
import { ReportRecordLink } from '../../components/ReportRecordLink';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function BlendingReport() {
  const { range, employee } = useReportContext();
  const periodLabel = reportPeriodLabel(range.label, employee);
  const rows = filterRowsByPerson(buildBlendReportRows(range), (row) => row.operator, employee);

  const csvHeaders = [
    'Batch', 'Product', 'Blend date', 'Executed', 'Status', 'Sources', 'Spirit draw gal', 'Spirit LAA gal',
    'Final vol gal', 'Final ABV', 'Final LAA gal', 'Theo vol gal', 'Actual vol gal', 'Vol variance gal', 'Vol variance %',
    'Planned ABV', 'Measured ABV', 'ABV variance pts', 'Output tank', 'Operator',
  ];
  const csvRows = rows.map((r) => [
    r.batch_number, r.product_name, r.blend_date, r.executed_at ?? '', r.status, r.source_count,
    r.spirit_draw_gal, r.spirit_laa_gal, r.final_volume_gal, r.final_abv, r.final_laa_gal,
    r.theoretical_volume_gal ?? '', r.actual_volume_gal, r.volume_variance_gal ?? '', r.volume_variance_pct ?? '',
    r.planned_abv ?? '', r.measured_abv ?? '', r.abv_variance_points ?? '', r.output_tank, r.operator,
  ]);

  return (
    <ReportTableShell
      title="Blending"
      description="Executed blends with spirit draws, planned vs actual volume, and planned vs measured ABV where recorded. The Blending page keeps the latest 10 completed batches."
      periodLabel={periodLabel}
      csvFilename={`blending-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage={emptyForEmployee('No executed blends in this period.', employee)}
    >
      <table>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Product</th>
            <th>Date</th>
            <th>Status</th>
            <th className="num">Spirit draw</th>
            <th className="num">Expected → actual</th>
            <th className="num">Δ vol</th>
            <th className="num">ABV planned / measured</th>
            <th>Output tank</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.blend_id}>
              <td>
                <ReportRecordLink target={{ kind: 'blend', id: r.blend_id }}>
                  <strong>{r.batch_number}</strong>
                </ReportRecordLink>
              </td>
              <td>{r.product_name}</td>
              <td>{formatCalendarDay(r.executed_at ?? r.blend_date)}</td>
              <td>{r.status}</td>
              <td className="num">{r.spirit_draw_gal.toFixed(1)} gal · {r.spirit_laa_gal.toFixed(2)} LAA</td>
              <td className="num">
                {r.theoretical_volume_gal != null ? `${r.theoretical_volume_gal.toFixed(1)} → ` : ''}
                {r.actual_volume_gal.toFixed(1)} gal
              </td>
              <td className="num">
                {r.volume_variance_gal != null && r.volume_variance_pct != null
                  ? `${r.volume_variance_gal > 0 ? '+' : ''}${r.volume_variance_gal.toFixed(2)} gal (${r.volume_variance_pct > 0 ? '+' : ''}${r.volume_variance_pct}%)`
                  : '—'}
              </td>
              <td className="num">
                {r.planned_abv != null ? `${r.planned_abv.toFixed(2)}%` : '—'}
                {' / '}
                {r.measured_abv != null ? `${r.measured_abv.toFixed(2)}%` : '—'}
              </td>
              <td>{r.output_tank}</td>
              <td>{r.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
