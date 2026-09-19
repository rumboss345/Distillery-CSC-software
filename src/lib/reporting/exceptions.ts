import { queryAll } from '../../db/database';
import { getBottlingRuns, getEquipmentVolumeReport } from '../../db/queries';
import { totalVolumeGal } from '../bottling-lines';
import { buildBlendReportRows } from './blend-rows';
import { eventInReportRange, type ReportDateRange } from './period';

export type ExceptionSeverity = 'warning' | 'info';

export interface ProductionExceptionRow {
  row_key: string;
  severity: ExceptionSeverity;
  category: string;
  occurred_at: string;
  reference: string;
  message: string;
}

const VARIANCE_GAL_THRESHOLD = 0.25;
const BLEND_VOLUME_VARIANCE_PCT = 5;
const OVERFILL_PCT = 100.5;

export function buildProductionExceptions(range: ReportDateRange): ProductionExceptionRow[] {
  const rows: ProductionExceptionRow[] = [];

  for (const run of getBottlingRuns()) {
    if (!eventInReportRange(run.bottling_date, range)) continue;
    const variance = run.volume_variance_gal;
    if (variance != null && Math.abs(variance) >= VARIANCE_GAL_THRESHOLD) {
      rows.push({
        row_key: `bottling_var:${run.id}`,
        severity: 'warning',
        category: 'Bottling variance',
        occurred_at: run.bottling_date,
        reference: run.batch_number,
        message: `Tank draw vs bottled differs by ${variance > 0 ? '+' : ''}${variance.toFixed(2)} gal (${run.product_name}).`,
      });
    }
  }

  for (const blend of buildBlendReportRows(range)) {
    if (
      blend.volume_variance_pct != null
      && Math.abs(blend.volume_variance_pct) >= BLEND_VOLUME_VARIANCE_PCT
    ) {
      rows.push({
        row_key: `blend_var:${blend.blend_id}`,
        severity: 'warning',
        category: 'Blend volume',
        occurred_at: blend.executed_at ?? blend.blend_date,
        reference: blend.batch_number,
        message: `Final volume ${blend.volume_variance_pct > 0 ? '+' : ''}${blend.volume_variance_pct}% vs theoretical (${blend.product_name}).`,
      });
    }
  }

  const completeNoHearts = queryAll<{
    id: number;
    batch_number: string;
    run_date: string;
    still_name: string;
  }>(`
    SELECT r.id, r.batch_number, r.run_date, r.still_name
    FROM distillation_runs r
    WHERE r.status = 'complete'
      AND NOT EXISTS (
        SELECT 1 FROM distillation_cuts c
        WHERE c.distillation_run_id = r.id AND c.cut_type = 'hearts' AND c.volume_gal > 0
      )
  `);
  for (const r of completeNoHearts) {
    if (!eventInReportRange(r.run_date, range)) continue;
    rows.push({
      row_key: `no_hearts:${r.id}`,
      severity: 'warning',
      category: 'Distillation',
      occurred_at: r.run_date,
      reference: r.batch_number,
      message: `Completed run on ${r.still_name} has no hearts volume recorded.`,
    });
  }

  for (const eq of getEquipmentVolumeReport()) {
    if (eq.capacity_gal <= 0 || eq.volume_gal <= 0) continue;
    const pct = (eq.volume_gal / eq.capacity_gal) * 100;
    if (pct > OVERFILL_PCT) {
      rows.push({
        row_key: `overfill:${eq.id}`,
        severity: 'info',
        category: 'Tank level',
        occurred_at: new Date().toISOString().slice(0, 10),
        reference: eq.name,
        message: `Current volume ${eq.volume_gal.toFixed(1)} gal exceeds nominal capacity (${pct.toFixed(0)}% of ${eq.capacity_gal} gal).`,
      });
    }
  }

  const runsMissingCharge = queryAll<{
    id: number;
    batch_number: string;
    run_date: string;
  }>(`
    SELECT id, batch_number, run_date FROM distillation_runs
    WHERE status IN ('running', 'complete') AND charge_volume_gal <= 0
  `);
  for (const r of runsMissingCharge) {
    if (!eventInReportRange(r.run_date, range)) continue;
    rows.push({
      row_key: `no_charge:${r.id}`,
      severity: 'info',
      category: 'Distillation',
      occurred_at: r.run_date,
      reference: r.batch_number,
      message: 'Run is active or complete but charge volume is zero.',
    });
  }

  for (const run of getBottlingRuns()) {
    if (!eventInReportRange(run.bottling_date, range)) continue;
    const bottled = run.bottled_volume_gal ?? totalVolumeGal(run.lines);
    if (bottled <= 0 && (run.bottle_count > 0 || run.lines.length > 0)) {
      rows.push({
        row_key: `bottle_vol:${run.id}`,
        severity: 'info',
        category: 'Bottling',
        occurred_at: run.bottling_date,
        reference: run.batch_number,
        message: 'Bottle counts recorded but bottled volume is zero.',
      });
    }
  }

  rows.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  return rows;
}
