import { equipmentCleaningStatusLabel } from './equipment-cleaning';
import { maintenanceStatusLabel } from './equipment-maintenance';
import type { EquipmentMaintenanceLogEventType, EquipmentMaintenanceStatus } from '../types';

export const EQUIPMENT_MAINTENANCE_LOG_EVENT_LABELS: Record<EquipmentMaintenanceLogEventType, string> = {
  needs_cleaning: 'Needs cleaning (after use)',
  marked_cleaned: 'Marked cleaned',
  maintenance_set: 'Maintenance / issue recorded',
  returned_to_service: 'Returned to service',
};

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
