import { getEquipmentMaintenanceReportLog } from '../../db/queries';
import { formatAssigneeLabel } from '../../lib/assignee';
import { formatRecordedAt } from '../../lib/date-input';
import { describeEquipmentMaintenanceLogEntry } from '../../lib/equipment-maintenance-log';
import { eventInReportRange } from '../../lib/reporting/period';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function MaintenanceReport() {
  const { range } = useReportContext();
  const rows = getEquipmentMaintenanceReportLog().filter((entry) =>
    eventInReportRange(entry.created_at, range),
  );

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
      description="Every cleaning and maintenance event in this period. The Equipment Maintenance page keeps the latest 10."
      periodLabel={range.label}
      csvFilename={`maintenance-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No maintenance or cleaning events in this period."
    >
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
    </ReportTableShell>
  );
}
