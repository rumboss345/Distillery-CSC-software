import { format } from 'date-fns';
import { describeEquipmentMaintenanceLogEntry } from '../../lib/equipment-maintenance-log';
import { formatAssigneeLabel } from '../../lib/assignee';
import type { EquipmentMaintenanceLogView } from '../../types';

interface EquipmentMaintenanceLogTableProps {
  entries: EquipmentMaintenanceLogView[];
  showEquipment?: boolean;
  emptyMessage?: string;
}

export function EquipmentMaintenanceLogTable({
  entries,
  showEquipment = false,
  emptyMessage = 'No maintenance or cleaning events recorded yet.',
}: EquipmentMaintenanceLogTableProps) {
  if (entries.length === 0) {
    return <p className="field-hint">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            {showEquipment && <th>Equipment</th>}
            <th>Event</th>
            <th>Recorded by</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}</td>
              {showEquipment && <td>{entry.equipment_name}</td>}
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
