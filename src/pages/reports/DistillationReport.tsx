import { format, parseISO } from 'date-fns';
import { buildDistillationReportRows } from '../../lib/reporting/distillation-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function DistillationReport() {
  const { range } = useReportContext();
  const rows = buildDistillationReportRows(range);

  const csvHeaders = [
    'Run ID', 'Batch', 'Date', 'Still', 'Type', 'Status', 'Source', 'Charge gal', 'Charge ABV',
    'Heads gal', 'Hearts gal', 'Tails gal', 'Other gal', 'Total cuts gal', 'Hearts LAA gal', 'Operator', 'Notes',
  ];
  const csvRows = rows.map((r) => [
    r.run_id, r.batch_number, r.run_date, r.still_name, r.run_type, r.status, r.source_label,
    r.charge_volume_gal, r.charge_abv ?? '', r.heads_gal, r.hearts_gal, r.tails_gal, r.other_gal,
    r.total_cut_gal, r.hearts_laa_gal, r.operator, r.notes,
  ]);

  return (
    <ReportTableShell
      title="Distillation runs"
      description="One row per distillation run with cut totals and hearts LAA."
      periodLabel={range.label}
      csvFilename={`distillation-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No distillation runs in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Date</th>
            <th>Still</th>
            <th>Type</th>
            <th>Status</th>
            <th>Source</th>
            <th>Charge</th>
            <th>Heads</th>
            <th>Hearts</th>
            <th>Tails</th>
            <th>Hearts LAA</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.run_id}>
              <td><strong>{r.batch_number}</strong></td>
              <td>{format(parseISO(r.run_date), 'MMM d, yyyy')}</td>
              <td>{r.still_name}</td>
              <td>{r.run_type}</td>
              <td>{r.status}</td>
              <td>{r.source_label}</td>
              <td>
                {r.charge_volume_gal.toFixed(1)} gal
                {r.charge_abv != null ? ` @ ${r.charge_abv.toFixed(1)}%` : ''}
              </td>
              <td>{r.heads_gal.toFixed(1)}</td>
              <td>{r.hearts_gal.toFixed(1)}</td>
              <td>{r.tails_gal.toFixed(1)}</td>
              <td>{r.hearts_laa_gal.toFixed(2)}</td>
              <td>{r.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
