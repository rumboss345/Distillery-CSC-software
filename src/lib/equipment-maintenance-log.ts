import { equipmentCleaningStatusLabel } from './equipment-cleaning';
import { maintenanceStatusLabel } from './equipment-maintenance';
import type { EquipmentMaintenanceLogEventType, EquipmentMaintenanceStatus } from '../types';

export const EQUIPMENT_MAINTENANCE_LOG_EVENT_LABELS: Record<EquipmentMaintenanceLogEventType, string> = {
  needs_cleaning: 'Needs cleaning (after use)',
  marked_cleaned: 'Marked cleaned',
  maintenance_set: 'Maintenance / issue recorded',
  returned_to_service: 'Returned to service',
};

/** Report groups, in the order operators scan a maintenance log. */
export const MAINTENANCE_REPORT_STATUS_GROUPS: { key: string; label: string }[] = [
  { key: 'needs_cleaning', label: 'Needs cleaning' },
  { key: 'marked_cleaned', label: 'Marked cleaned' },
  { key: 'broken', label: 'Broken' },
  { key: 'maintenance', label: 'Under maintenance' },
  { key: 'repair_note', label: 'Repair note' },
  { key: 'returned_to_service', label: 'Returned to service' },
];

export function maintenanceReportStatusKey(entry: {
  event_type: EquipmentMaintenanceLogEventType;
  maintenance_status: EquipmentMaintenanceStatus | null;
}): string {
  if (entry.event_type === 'maintenance_set') {
    return entry.maintenance_status ?? 'maintenance_set';
  }
  return entry.event_type;
}

export interface MaintenanceReportStatusGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

/** One section per status. Unknown statuses follow as Other. */
export function groupMaintenanceReportRows<T extends {
  event_type: EquipmentMaintenanceLogEventType;
  maintenance_status: EquipmentMaintenanceStatus | null;
}>(rows: readonly T[]): MaintenanceReportStatusGroup<T>[] {
  const buckets = new Map<string, T[]>(
    MAINTENANCE_REPORT_STATUS_GROUPS.map((group) => [group.key, []]),
  );
  const other: T[] = [];
  for (const row of rows) {
    const key = maintenanceReportStatusKey(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else other.push(row);
  }
  const groups = MAINTENANCE_REPORT_STATUS_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    rows: buckets.get(group.key) ?? [],
  }));
  if (other.length > 0) {
    groups.push({ key: 'other', label: 'Other', rows: other });
  }
  return groups;
}

export function describeEquipmentMaintenanceLogEntry(entry: {
  event_type: EquipmentMaintenanceLogEventType;
  maintenance_status: EquipmentMaintenanceStatus | null;
  notes: string;
}): string {
  const base = EQUIPMENT_MAINTENANCE_LOG_EVENT_LABELS[entry.event_type];
  if (entry.event_type === 'maintenance_set' && entry.maintenance_status) {
    return `${base}: ${maintenanceStatusLabel(entry.maintenance_status)}`;
  }
  if (entry.event_type === 'needs_cleaning') {
    return equipmentCleaningStatusLabel();
  }
  if (entry.notes.trim()) {
    return `${base} — ${entry.notes.trim()}`;
  }
  return base;
}
