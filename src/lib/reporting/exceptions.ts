import { queryAll } from '../../db/database';
import { getBottlingRuns, getEquipmentVolumeReport, getHoldingTankVolumeVariances } from '../../db/queries';
import { formatTankVolumeVariance } from '../tank-volume-variance';
import { reportedBottlingVarianceGal, totalVolumeGal } from '../bottling-lines';
import { buildBlendReportRows } from './blend-rows';
import { compareStoredDatesDesc } from '../date-input';
import { localIsoDate } from '../planned-event-date';
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
    const variance = reportedBottlingVarianceGal(run);
    if (variance != null && Math.abs(variance) >= VARIANCE_GAL_THRESHOLD) {
      const why = run.variance_reason?.trim();
      const who = run.variance_changed_by?.trim();
      rows.push({
        row_key: `bottling_var:${run.id}`,
        severity: 'warning',
        category: 'Bottling variance',
        occurred_at: run.bottling_date,
        reference: run.batch_number,
        message: `Bottling variance is ${variance > 0 ? '+' : ''}${variance.toFixed(2)} gal after gallons sent to a tank (${run.product_name})${why ? `. ${why}` : ''}${who ? ` Changed by ${who}.` : '.'}`,
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

  for (const variance of getHoldingTankVolumeVariances()) {
    if (!eventInReportRange(variance.recorded_at, range)) continue;
    const abvChanged = Math.abs(variance.set_abv - variance.book_abv) >= 0.05;
    if (Math.abs(variance.variance_gal) < VARIANCE_GAL_THRESHOLD && !abvChanged) continue;
    const note = variance.notes.trim();
    const who = variance.changed_by?.trim();
    const abvNote = abvChanged
      ? `, ABV ${variance.book_abv.toFixed(1)}% to ${variance.set_abv.toFixed(1)}%`
      : '';
    rows.push({
      row_key: `tank_var:${variance.id}`,
      severity: 'warning',
      category: 'Tank volume',
      occurred_at: variance.recorded_at,
      reference: variance.tank_name,
      message: `Set from ${variance.book_volume_gal.toFixed(2)} gal to ${variance.set_volume_gal.toFixed(2)} gal (${formatTankVolumeVariance(variance.variance_gal)})${abvNote}${note ? `. ${note}` : ''}${who ? ` Changed by ${who}.` : '.'}`,
    });
  }

  const leftovers = queryAll<{
    id: number;
    batch_number: string;
    fermenter_name: string;
    volume_gal: number;
    discarded_date: string;
    notes: string;
    changed_by: string | null;
  }>(`
    SELECT id, batch_number, fermenter_name, volume_gal, discarded_date, notes, changed_by
    FROM discarded_fermentations
  `);
  for (const leftover of leftovers) {
    if (!eventInReportRange(leftover.discarded_date, range)) continue;
    const who = leftover.changed_by?.trim();
    rows.push({
      row_key: `leftover:${leftover.id}`,
      severity: 'info',
      category: 'Fermenter leftovers',
      occurred_at: leftover.discarded_date,
      reference: leftover.fermenter_name || leftover.batch_number,
      message: `${leftover.volume_gal.toFixed(1)} gal could not be used${leftover.notes.trim() ? `. ${leftover.notes.trim()}` : ''}${who ? ` Changed by ${who}.` : '.'}`,
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
        occurred_at: localIsoDate(),
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

  rows.sort((a, b) => compareStoredDatesDesc(a.occurred_at, b.occurred_at));
  return rows;
}
