import { getStatusDateLog } from '../db/status-logs';
import { formatRecordedAt } from '../lib/date-input';
import { statusDateLogText, type StatusDateLogKind } from '../lib/status-date-log';

export function StatusDateLog({
  kind,
  recordId,
  equipmentId,
}: {
  kind: StatusDateLogKind;
  recordId: number | null | undefined;
  equipmentId?: number | null;
}) {
  if (!recordId) return null;
  const rows = getStatusDateLog(kind, recordId, equipmentId);

  return (
    <div className="form-group full-width">
      <label>Status log</label>
      {rows.length === 0 ? (
        <p className="field-hint" style={{ margin: 0 }}>
          No status changes recorded yet. The date is saved the next time status changes.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Change</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatRecordedAt(row.changed_at)}</td>
                  <td>{statusDateLogText(row.previous_status, row.status)}</td>
                  <td>{row.changed_by.trim() || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
