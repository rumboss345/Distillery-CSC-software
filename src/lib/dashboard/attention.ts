import { parseStoredDate } from '../date-input';
import type { OverdueFermentation } from '../fermentation';
import { formatDaysOverdue } from '../fermentation';
import type { PermissionKey } from '../permissions';
import type { BlendReportRow } from '../reporting/blend-rows';
import type { BottlingReportRow } from '../reporting/bottling-rows';
import type { DashboardThresholds } from './thresholds';

export type AttentionSeverity = 'critical' | 'warning' | 'info';

export type AttentionCategory =
  | 'inventory'
  | 'fermentation'
  | 'records'
  | 'variance'
  | 'equipment';

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  category: AttentionCategory;
  title: string;
  detail: string;
  /** Page that holds the record this alert is about. */
  href: string;
  /** Page permission needed to open the record. */
  permission: PermissionKey;
  occurredAt?: string;
}

export const ATTENTION_CATEGORY_LABELS: Record<AttentionCategory, string> = {
  inventory: 'Low inventory',
  fermentation: 'Fermentation checks',
  records: 'Incomplete records',
  variance: 'Variance',
  equipment: 'Equipment',
};

export interface AttentionInventoryItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  reorder_level: number;
}

export interface AttentionFermentingVessel {
  batchId: number;
  batchNumber: string;
  equipmentId: number;
  equipmentName: string;
  /** Fermentation start (date or timestamp). */
  startedAt: string | null;
  /** Latest fermentation log for this vessel or batch. Null when none was logged. */
  lastLogAt: string | null;
}

export interface AttentionRun {
  id: number;
  batch_number: string;
  status: string;
  run_date: string;
  charge_volume_gal: number;
  hearts_gal: number;
}

export interface AttentionWash {
  id: number;
  batch_number: string;
  status: string;
  completedOn: string;
  actual_final_brix: number | null;
}

export interface AttentionTank {
  id: number;
  name: string;
  capacity_gal: number;
  volume_gal: number;
}

export interface AttentionEquipment {
  id: number;
  name: string;
  /** Days since it was flagged as needing cleaning, or null when it is clean. */
  daysDirty: number | null;
  maintenance_status: string | null;
}

export interface AttentionInput {
  now: Date;
  thresholds: DashboardThresholds;
  inventory: AttentionInventoryItem[];
  fermenting: AttentionFermentingVessel[];
  overdueFermentations: OverdueFermentation[];
  runs: AttentionRun[];
  washes: AttentionWash[];
  /** Executed blends in the review window. */
  blends: BlendReportRow[];
  /** Started or finished bottling runs in the review window. */
  bottlings: BottlingReportRow[];
  tanks: AttentionTank[];
  equipment: AttentionEquipment[];
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Above this fill a tank is overfilled on the books. Matches the exceptions report. */
export const OVERFILL_PCT = 100.5;

function hoursSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const parsed = parseStoredDate(value);
  if (!parsed) return null;
  return (now.getTime() - parsed.getTime()) / 3_600_000;
}

function signed(value: number, decimals: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

/** Items at or below their reorder level. Zero or negative stock is critical. */
export function inventoryAttention(items: AttentionInventoryItem[]): AttentionItem[] {
  return items
    .filter((item) => item.reorder_level > 0 && item.quantity <= item.reorder_level)
    .map((item) => ({
      key: `inventory:${item.id}`,
      severity: item.quantity <= 0 ? 'critical' : 'warning',
      category: 'inventory',
      title: item.quantity <= 0 ? `${item.name} is out of stock` : `${item.name} is low`,
      detail: `${item.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.unit} on hand · reorder at ${item.reorder_level.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.unit}`,
      href: `/inventory?item=${item.id}`,
      permission: 'inventory',
    }));
}

/**
 * Fermenting vessels with no log within the check window.
 * Twice the window, or no log at all after the window, is critical.
 */
export function fermenterCheckAttention(
  vessels: AttentionFermentingVessel[],
  now: Date,
  checkHours: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const vessel of vessels) {
    const sinceLog = hoursSince(vessel.lastLogAt, now);
    const sinceStart = hoursSince(vessel.startedAt, now);
    const href = `/fermentation?wash=${vessel.batchId}&logsEquipment=${vessel.equipmentId}`;
    if (sinceLog == null) {
      if (sinceStart == null || sinceStart < checkHours) continue;
      items.push({
        key: `fermenter-check:${vessel.batchId}:${vessel.equipmentId}`,
        severity: 'critical',
        category: 'fermentation',
        title: `${vessel.equipmentName}: no fermentation log`,
        detail: `Wash ${vessel.batchNumber} has no Brix or temperature log since it started.`,
        href,
        permission: 'wash',
        occurredAt: vessel.startedAt ?? undefined,
      });
      continue;
    }
    if (sinceLog < checkHours) continue;
    const hours = Math.floor(sinceLog);
    items.push({
      key: `fermenter-check:${vessel.batchId}:${vessel.equipmentId}`,
      severity: sinceLog >= checkHours * 2 ? 'critical' : 'warning',
      category: 'fermentation',
      title: `${vessel.equipmentName}: check missed`,
      detail: `Wash ${vessel.batchNumber} last logged ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`} ago (check every ${checkHours} h).`,
      href,
      permission: 'wash',
      occurredAt: vessel.lastLogAt ?? undefined,
    });
  }
  return items;
}

export function overdueFermentationAttention(rows: OverdueFermentation[]): AttentionItem[] {
  return rows.map((row) => ({
    key: `ferment-overdue:${row.batchId}:${row.equipmentId}`,
    severity: row.daysOverdue >= 3 ? 'critical' : 'warning',
    category: 'fermentation',
    title: `${row.equipmentName}: fermentation overdue`,
    detail: `Wash ${row.batchNumber} · ${formatDaysOverdue(row.daysOverdue)}`,
    href: `/fermentation?wash=${row.batchId}&logsEquipment=${row.equipmentId}`,
    permission: 'wash',
    occurredAt: row.expectedCompletionDate,
  }));
}

/** Records that were closed or left running without the figures the reports need. */
export function incompleteRecordAttention(
  input: Pick<AttentionInput, 'runs' | 'washes' | 'blends' | 'bottlings' | 'now' | 'thresholds'>,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const run of input.runs) {
    if (run.status === 'complete' && run.hearts_gal <= 0.001) {
      items.push({
        key: `run-no-hearts:${run.id}`,
        severity: 'warning',
        category: 'records',
        title: `Run ${run.batch_number} finished with no hearts`,
        detail: 'Enter the hearts cut or confirm none was collected.',
        href: `/distillation?record=${run.id}`,
        permission: 'distillation',
        occurredAt: run.run_date,
      });
    }
    if ((run.status === 'running' || run.status === 'complete') && !(run.charge_volume_gal > 0)) {
      items.push({
        key: `run-no-charge:${run.id}`,
        severity: 'warning',
        category: 'records',
        title: `Run ${run.batch_number} has no charge volume`,
        detail: 'The still charge is blank, so the alcohol balance cannot be worked out.',
        href: `/distillation?record=${run.id}`,
        permission: 'distillation',
        occurredAt: run.run_date,
      });
    }
    const runningHours = run.status === 'running' ? hoursSince(run.run_date, input.now) : null;
    if (runningHours != null && runningHours >= input.thresholds.longRunningRunDays * 24) {
      const days = Math.floor(runningHours / 24);
      items.push({
        key: `run-long:${run.id}`,
        severity: 'warning',
        category: 'records',
        title: `Run ${run.batch_number} still running`,
        detail: `Started ${days} day${days === 1 ? '' : 's'} ago. Finish the run or update its cuts.`,
        href: `/distillation?record=${run.id}`,
        permission: 'distillation',
        occurredAt: run.run_date,
      });
    }
  }
  for (const wash of input.washes) {
    if (wash.status !== 'complete' || wash.actual_final_brix != null) continue;
    items.push({
      key: `wash-no-final-brix:${wash.id}`,
      severity: 'info',
      category: 'records',
      title: `Wash ${wash.batch_number} has no final Brix`,
      detail: 'Fermentation was finished without a final Brix reading.',
      href: `/wash?record=${wash.id}`,
      permission: 'wash',
      occurredAt: wash.completedOn,
    });
  }
  for (const blend of input.blends) {
    if (blend.measured_abv != null && blend.actual_volume_gal > 0) continue;
    items.push({
      key: `blend-incomplete:${blend.blend_id}`,
      severity: 'warning',
      category: 'records',
      title: `Blend ${blend.batch_number} is missing its final figures`,
      detail: blend.actual_volume_gal > 0 ? 'No finished ABV was recorded.' : 'No finished volume was recorded.',
      href: `/blending?record=${blend.blend_id}`,
      permission: 'blending',
      occurredAt: blend.executed_at ?? blend.blend_date,
    });
  }
  for (const bottling of input.bottlings) {
    if (bottling.bottle_count > 0 || bottling.bottled_gal > 0) continue;
    items.push({
      key: `bottling-empty:${bottling.bottling_id}`,
      severity: 'warning',
      category: 'records',
      title: `Bottling ${bottling.batch_number} has no bottles`,
      detail: 'The run is started or finished but no bottle lines were entered.',
      href: `/bottling?record=${bottling.bottling_id}`,
      permission: 'bottling',
      occurredAt: bottling.bottling_date,
    });
  }
  return items;
}

/** Blend and bottling results outside the administrator's limits. */
export function varianceAttention(
  blends: BlendReportRow[],
  bottlings: BottlingReportRow[],
  thresholds: DashboardThresholds,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const blend of blends) {
    const pct = blend.volume_variance_pct;
    if (pct != null && Math.abs(pct) >= thresholds.blendVolumeVariancePct) {
      items.push({
        key: `blend-volume:${blend.blend_id}`,
        severity: Math.abs(pct) >= thresholds.blendVolumeVariancePct * 2 ? 'critical' : 'warning',
        category: 'variance',
        title: `Blend ${blend.batch_number}: volume ${signed(pct, 1)}%`,
        detail: `Expected ${blend.theoretical_volume_gal?.toFixed(1) ?? '—'} gal, finished ${blend.actual_volume_gal.toFixed(1)} gal.`,
        href: `/blending?record=${blend.blend_id}`,
        permission: 'blending',
        occurredAt: blend.executed_at ?? blend.blend_date,
      });
    }
    const pts = blend.abv_variance_points;
    if (pts != null && Math.abs(pts) >= thresholds.abvVariancePoints) {
      items.push({
        key: `blend-abv:${blend.blend_id}`,
        severity: 'warning',
        category: 'variance',
        title: `Blend ${blend.batch_number}: ABV ${signed(pts, 2)} points`,
        detail: `Planned ${blend.planned_abv?.toFixed(2)}%, measured ${blend.measured_abv?.toFixed(2)}%.`,
        href: `/blending?record=${blend.blend_id}`,
        permission: 'blending',
        occurredAt: blend.executed_at ?? blend.blend_date,
      });
    }
  }
  for (const bottling of bottlings) {
    const vol = bottling.volume_variance_gal;
    const alcohol = bottling.alcohol_variance_gal;
    const volOut = vol != null && Math.abs(vol) >= thresholds.bottlingVarianceGal;
    const alcoholOut = alcohol != null && Math.abs(alcohol) >= thresholds.bottlingVarianceGal / 2;
    if (volOut || alcoholOut) {
      const parts: string[] = [];
      if (vol != null) parts.push(`${signed(vol, 2)} gal volume`);
      if (alcohol != null) parts.push(`${signed(alcohol, 2)} gal pure alcohol`);
      const big = (vol != null && Math.abs(vol) >= thresholds.bottlingVarianceGal * 4)
        || (alcohol != null && Math.abs(alcohol) >= thresholds.bottlingVarianceGal * 2);
      items.push({
        key: `bottling-variance:${bottling.bottling_id}`,
        severity: big ? 'critical' : 'warning',
        category: 'variance',
        title: `Bottling ${bottling.batch_number}: variance`,
        detail: `${parts.join(' · ')}${bottling.variance_reason ? ` — ${bottling.variance_reason}` : ''}`,
        href: `/bottling?record=${bottling.bottling_id}`,
        permission: 'bottling',
        occurredAt: bottling.bottling_date,
      });
    }
    const pts = bottling.abv_variance_points;
    if (pts != null && Math.abs(pts) >= thresholds.abvVariancePoints) {
      items.push({
        key: `bottling-abv:${bottling.bottling_id}`,
        severity: 'warning',
        category: 'variance',
        title: `Bottling ${bottling.batch_number}: ABV ${signed(pts, 2)} points`,
        detail: `Planned ${bottling.final_abv.toFixed(2)}%, measured ${bottling.measured_abv?.toFixed(2)}% (60 °F).`,
        href: `/bottling?record=${bottling.bottling_id}`,
        permission: 'bottling',
        occurredAt: bottling.bottling_date,
      });
    }
  }
  return items;
}

export function equipmentAttention(tanks: AttentionTank[], equipment: AttentionEquipment[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const tank of tanks) {
    if (!(tank.capacity_gal > 0)) continue;
    const pct = (tank.volume_gal / tank.capacity_gal) * 100;
    if (pct <= OVERFILL_PCT) continue;
    items.push({
      key: `tank-overfill:${tank.id}`,
      severity: 'critical',
      category: 'equipment',
      title: `${tank.name} is over capacity on the books`,
      detail: `${tank.volume_gal.toFixed(1)} gal recorded in a ${tank.capacity_gal.toFixed(0)} gal tank (${pct.toFixed(0)}%). Check the last transfer or set the tank volume.`,
      href: `/floor-plan?equipment=${tank.id}`,
      permission: 'equipment',
    });
  }
  for (const item of equipment) {
    if (item.maintenance_status === 'broken' || item.maintenance_status === 'maintenance') {
      items.push({
        key: `equipment-down:${item.id}`,
        severity: 'warning',
        category: 'equipment',
        title: `${item.name} is ${item.maintenance_status === 'broken' ? 'broken' : 'in maintenance'}`,
        detail: 'It cannot be used for production until it is fixed.',
        href: `/equipment-maintenance?equipment=${item.id}`,
        permission: 'equipment',
      });
    }
    if (item.daysDirty != null && item.daysDirty >= 2) {
      items.push({
        key: `equipment-dirty:${item.id}`,
        severity: 'info',
        category: 'equipment',
        title: `${item.name} needs cleaning`,
        detail: `Waiting ${item.daysDirty} days to be cleaned.`,
        href: `/equipment-maintenance?equipment=${item.id}`,
        permission: 'equipment',
      });
    }
  }
  return items;
}

export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (b.occurredAt ?? '').localeCompare(a.occurredAt ?? '') || a.title.localeCompare(b.title);
  });
}

export function buildNeedsAttention(input: AttentionInput): AttentionItem[] {
  return sortAttention([
    ...inventoryAttention(input.inventory),
    ...fermenterCheckAttention(input.fermenting, input.now, input.thresholds.fermenterCheckHours),
    ...overdueFermentationAttention(input.overdueFermentations),
    ...incompleteRecordAttention(input),
    ...varianceAttention(input.blends, input.bottlings, input.thresholds),
    ...equipmentAttention(input.tanks, input.equipment),
  ]);
}

/** Keep only alerts whose record the person can open. */
export function attentionForUser(
  items: AttentionItem[],
  hasPermission: (key: PermissionKey) => boolean,
): AttentionItem[] {
  return items.filter((item) => hasPermission(item.permission));
}

export function countBySeverity(items: AttentionItem[]): Record<AttentionSeverity, number> {
  const counts: Record<AttentionSeverity, number> = { critical: 0, warning: 0, info: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}
