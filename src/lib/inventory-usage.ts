import { formatCalendarDay } from './date-input';
import { formatInventoryOnHand } from './inventory-units';

export type InventoryUsageKind =
  | 'manual'
  | 'bottling'
  | 'blend'
  | 'barrel'
  | 'wash'
  | 'distillation'
  | 'count_edit'
  | 'system';

export interface InventoryAdjustSource {
  kind: InventoryUsageKind;
  reference?: string;
  summary?: string;
  changedBy?: string;
}

export interface InventoryUsageLogRow {
  id: number;
  inventory_item_id: number;
  delta: number;
  balance_after: number | null;
  source_kind: string;
  source_ref: string;
  summary: string;
  changed_by: string;
  created_at: string;
}

const KIND_LABELS: Record<string, string> = {
  manual: 'Manual adjustment',
  bottling: 'Bottling',
  blend: 'Blending',
  barrel: 'Barrel',
  wash: 'Wash / fermentation',
  distillation: 'Distillation',
  count_edit: 'Count edited',
  system: 'Production',
};

export function inventoryUsageKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? 'Stock change';
}

export function formatInventoryUsageDelta(delta: number, unit: string): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatInventoryOnHand(delta)} ${unit}`;
}

export function formatInventoryUsageWhen(createdAt: string): string {
  const trimmed = createdAt.trim();
  if (!trimmed) return '—';
  if (trimmed.includes('T') || trimmed.endsWith('Z')) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }
  return formatCalendarDay(trimmed);
}

export function inventoryUsageDescription(row: InventoryUsageLogRow): string {
  const parts: string[] = [];
  const kind = inventoryUsageKindLabel(row.source_kind);
  if (row.summary.trim()) {
    parts.push(row.summary.trim());
  } else {
    parts.push(kind);
  }
  if (row.source_ref.trim()) {
    parts.push(row.source_ref.trim());
  }
  return parts.join(' · ');
}
