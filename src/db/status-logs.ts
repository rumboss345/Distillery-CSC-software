import { insertRow, queryAll, runQuery } from './database';
import { statusChangeToLog, type StatusDateLogKind } from '../lib/status-date-log';

export interface StatusDateLogEntry {
  id: number;
  record_kind: StatusDateLogKind;
  record_id: number;
  floor_equipment_id: number | null;
  previous_status: string;
  status: string;
  changed_at: string;
  changed_by: string;
}

export function recordStatusDateLog(entry: {
  recordKind: StatusDateLogKind;
  recordId: number;
  floorEquipmentId?: number | null;
  previousStatus: string | null | undefined;
  status: string;
  changedBy?: string | null;
  changedAt?: string;
}): void {
  const change = statusChangeToLog(entry.previousStatus, entry.status);
  if (!change || !(entry.recordId > 0)) return;
  insertRow(
    `INSERT INTO production_status_logs
      (record_kind, record_id, floor_equipment_id, previous_status, status, changed_at, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.recordKind,
      entry.recordId,
      entry.floorEquipmentId ?? null,
      change.previous,
      change.next,
      entry.changedAt ?? new Date().toISOString(),
      (entry.changedBy ?? '').trim(),
    ],
  );
}

export function getStatusDateLog(
  recordKind: StatusDateLogKind,
  recordId: number,
  floorEquipmentId?: number | null,
): StatusDateLogEntry[] {
  if (floorEquipmentId) {
    return queryAll<StatusDateLogEntry>(
      `SELECT * FROM production_status_logs
       WHERE record_kind = ? AND record_id = ? AND floor_equipment_id = ?
       ORDER BY changed_at DESC, id DESC`,
      [recordKind, recordId, floorEquipmentId],
    );
  }
  return queryAll<StatusDateLogEntry>(
    `SELECT * FROM production_status_logs
     WHERE record_kind = ? AND record_id = ?
     ORDER BY changed_at DESC, id DESC`,
    [recordKind, recordId],
  );
}

export function deleteStatusDateLog(recordKind: StatusDateLogKind, recordId: number): void {
  runQuery(
    'DELETE FROM production_status_logs WHERE record_kind = ? AND record_id = ?',
    [recordKind, recordId],
  );
}
