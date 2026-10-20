import { formatDateDisplay } from '../../lib/date-input';
import { formatDistillationAlcoholResult } from '../../lib/distillation-loss';
import {
  buildDistillationReportRows,
  groupDistillationReportRows,
  type DistillationReportRow,
} from '../../lib/reporting/distillation-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function DistillationReport() {
  const { range } = useReportContext();
  const rows = buildDistillationReportRows(range);
  const groups = groupDistillationReportRows(rows);

  const csvHeaders = [
    'Run ID', 'Batch', 'Date', 'Still', 'Type', 'Status', 'Source', 'Charge gal', 'Charge ABV',
    'Heads gal', 'Hearts gal', 'Tails gal', 'Other gal', 'Total cuts gal', 'Hearts LAA gal',
    'Alcohol charged gal', 'Alcohol collected gal', 'Alcohol loss gal', 'Operator', 'Notes',
  ];
  const csvRows = rows.map((r) => [
    r.run_id, r.batch_number, r.run_date, r.still_name, r.run_type, r.status, r.source_label,
    r.charge_volume_gal, r.charge_abv ?? '', r.heads_gal, r.hearts_gal, r.tails_gal, r.other_gal,
    r.total_cut_gal, r.hearts_laa_gal,
    r.alcohol_charged_gal ?? '', r.alcohol_collected_gal ?? '', r.alcohol_loss_gal ?? '',
    r.operator, r.notes,
  ]);

  return (
    <ReportTableShell
      title="Distillation runs"
      description="Runs are grouped by type: Low Wine Run, Rum Run, Vodka Run, Heavy Rum, and Gin Run. Each row includes cut totals, hearts LAA, and alcohol loss or gain. The difference is the alcohol charged minus the alcohol collected. When more alcohol is collected than was charged, the result is recorded as a gain. The Distillation page keeps the latest 10 completed runs."
      periodLabel={range.label}
      csvFilename={`distillation-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No distillation runs in this period."
      tableWrap={false}
    >
      <div className="wash-status-groups">
        {groups.map((group) => (
          <section key={group.key} className="card wash-status-group" data-testid={`distillation-group-${group.key}`}>
            <header className="wash-status-group-header">
              <h3 className="wash-status-group-title">{group.label}</h3>
              <span className="text-muted wash-status-group-count">
                {group.rows.length} {group.rows.length === 1 ? 'run' : 'runs'}
              </span>
            </header>
            {group.rows.length === 0 ? (
              <p className="text-muted">No runs in this period.</p>
            ) : (
              <DistillationRunTable rows={group.rows} />
            )}
          </section>
        ))}
      </div>
    </ReportTableShell>
  );
}

function DistillationRunTable({ rows }: { rows: DistillationReportRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Date</th>
            <th>Still</th>
            <th>Status</th>
            <th>Source</th>
            <th className="num">Charge</th>
            <th className="num">Heads</th>
            <th className="num">Hearts</th>
            <th className="num">Tails</th>
            <th className="num">Hearts LAA</th>
            <th className="num">Alcohol in</th>
            <th className="num">Collected</th>
            <th className="num">Loss or gain</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.run_id}>
              <td><strong>{r.batch_number}</strong></td>
              <td>{formatDateDisplay(r.run_date)}</td>
              <td>{r.still_name}</td>
              <td>{r.status}</td>
              <td>{r.source_label}</td>
              <td className="num">
                {r.charge_volume_gal.toFixed(1)} gal
                {r.charge_abv != null ? ` @ ${r.charge_abv.toFixed(1)}%` : ''}
              </td>
              <td className="num">{r.heads_gal.toFixed(1)}</td>
              <td className="num">{r.hearts_gal.toFixed(1)}</td>
              <td className="num">{r.tails_gal.toFixed(1)}</td>
              <td className="num">{r.hearts_laa_gal.toFixed(2)}</td>
              <td className="num">{r.alcohol_charged_gal != null ? `${r.alcohol_charged_gal.toFixed(2)} gal` : '—'}</td>
              <td className="num">{r.alcohol_collected_gal != null ? `${r.alcohol_collected_gal.toFixed(2)} gal` : '—'}</td>
              <td className="num">{r.alcohol_loss_gal != null ? formatDistillationAlcoholResult(r.alcohol_loss_gal) : '—'}</td>
              <td>{r.operator}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
