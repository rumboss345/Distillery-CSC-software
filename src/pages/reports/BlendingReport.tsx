import { format, parseISO } from 'date-fns';
import { buildBlendReportRows } from '../../lib/reporting/blend-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function BlendingReport() {
  const { range } = useReportContext();
  const rows = buildBlendReportRows(range);

  const csvHeaders = [
    'Batch', 'Product', 'Blend date', 'Executed', 'Status', 'Sources', 'Spirit draw gal', 'Spirit LAA gal',
    'Final vol gal', 'Final ABV', 'Final LAA gal', 'Theo vol gal', 'Vol variance %', 'Output tank', 'Operator',
  ];
  const csvRows = rows.map((r) => [
    r.batch_number, r.product_name, r.blend_date, r.executed_at ?? '', r.status, r.source_count,
    r.spirit_draw_gal, r.spirit_laa_gal, r.final_volume_gal, r.final_abv, r.final_laa_gal,
    r.theoretical_volume_gal ?? '', r.volume_variance_pct ?? '', r.output_tank, r.operator,
  ]);

  return (
    <ReportTableShell
      title="Blending"
      description="Executed blends with spirit draws and final volume vs theoretical where recorded."
      periodLabel={range.label}
      csvFilename={`blending-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No executed blends in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Product</th>
            <th>Date</th>
            <th>Status</th>
            <th>Spirit draw</th>
            <th>Final</th>
            <th>Theo Δ vol</th>
            <th>Output tank</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.blend_id}>
              <td><strong>{r.batch_number}</strong></td>
              <td>{r.product_name}</td>
              <td>{format(parseISO((r.executed_at ?? r.blend_date).slice(0, 10)), 'MMM d, yyyy')}</td>
              <td>{r.status}</td>
              <td>{r.spirit_draw_gal.toFixed(1)} gal · {r.spirit_laa_gal.toFixed(2)} LAA</td>
              <td>{r.final_volume_gal.toFixed(1)} gal @ {r.final_abv.toFixed(1)}%</td>
              <td>
                {r.volume_variance_pct != null
                  ? `${r.volume_variance_pct > 0 ? '+' : ''}${r.volume_variance_pct}%`
                  : '—'}
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
