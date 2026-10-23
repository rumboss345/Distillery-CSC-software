import { getEquipmentMaintenanceReportLog } from '../../db/queries';
import { formatAssigneeLabel } from '../../lib/assignee';
import { formatRecordedAt } from '../../lib/date-input';
import {
  describeEquipmentMaintenanceLogEntry,
  groupMaintenanceReportRows,
} from '../../lib/equipment-maintenance-log';
import { eventInReportRange } from '../../lib/reporting/period';
import type { EquipmentMaintenanceLogView } from '../../types';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function MaintenanceReport() {
  const { range } = useReportContext();
  const rows = getEquipmentMaintenanceReportLog().filter((entry) =>
    eventInReportRange(entry.created_at, range),
  );
  const groups = groupMaintenanceReportRows(rows);

  const csvHeaders = ['When', 'Equipment', 'Event', 'Recorded by', 'Notes'];
  const csvRows = rows.map((entry) => [
    formatRecordedAt(entry.created_at),
    entry.equipment_name,
    describeEquipmentMaintenanceLogEntry(entry),
    entry.recorded_by_user_name
      ? formatAssigneeLabel(entry.recorded_by_user_name)
      : '— (system)',
    entry.notes,
  ]);

  return (
    <ReportTableShell
      title="Maintenance & cleaning"
      description="Events are grouped by status: Needs cleaning, Marked cleaned, Broken, Under maintenance, Repair note, and Returned to service. The Equipment Maintenance page keeps the latest 10."
      periodLabel={range.label}
      csvFilename={`maintenance-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No maintenance or cleaning events in this period."
      tableWrap={false}
    >
      <div className="wash-status-groups">
        {groups.map((group) => (
          <section key={group.key} className="card wash-status-group" data-testid={`maintenance-group-${group.key}`}>
            <header className="wash-status-group-header">
              <h3 className="wash-status-group-title">{group.label}</h3>
              <span className="text-muted wash-status-group-count">
                {group.rows.length} {group.rows.length === 1 ? 'event' : 'events'}
              </span>
            </header>
            {group.rows.length === 0 ? (
              <p className="text-muted">No events in this period.</p>
            ) : (
              <MaintenanceEventTable rows={group.rows} />
            )}
          </section>
        ))}
      </div>
    </ReportTableShell>
  );
}

function MaintenanceEventTable({ rows }: { rows: EquipmentMaintenanceLogView[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Equipment</th>
            <th>Event</th>
            <th>Recorded by</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td>{formatRecordedAt(entry.created_at)}</td>
              <td>{entry.equipment_name}</td>
              <td>{describeEquipmentMaintenanceLogEntry(entry)}</td>
              <td>
                {entry.recorded_by_user_name
                  ? formatAssigneeLabel(entry.recorded_by_user_name)
                  : '— (system)'}
              </td>
              <td>{entry.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
