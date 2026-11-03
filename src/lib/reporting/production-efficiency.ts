import { formatDistillationAlcoholResult } from '../distillation-loss';
import { getDistillationRuns, getMashBatches, getYieldReports } from '../../db/queries';
import { safePercent } from './alcohol-units';
import { buildDistillationReportRows } from './distillation-rows';
import { buildFermentationPerformance } from './fermentation-performance';
import { eventInReportRange, type ReportDateRange } from './period';
import { filterRowsByPerson, reportPersonMatches, type ReportEmployee } from './person';
import { buildStillEfficiencyFromRows, type StillEfficiencyRow } from './still-efficiency';

export interface ProductionEfficiencySnapshot {
  still_by_run_type: StillEfficiencyRow[];
  completed_still_runs: number;
  /** Hearts LAA ÷ alcohol charged across completed runs with known charge. */
  hearts_recovery_pct: number | null;
  net_alcohol_balance_gal: number | null;
  net_alcohol_balance_label: string;
  avg_ferment_days: number | null;
  avg_wash_yield_pct: number | null;
  wash_batches_with_yield: number;
}

export function rollupStillEfficiency(byType: StillEfficiencyRow[]): Pick<
  ProductionEfficiencySnapshot,
  'completed_still_runs' | 'hearts_recovery_pct' | 'net_alcohol_balance_gal' | 'net_alcohol_balance_label'
> {
  const completed_still_runs = byType.reduce((sum, row) => sum + row.completed_runs, 0);
  const totalCharged = byType.reduce((sum, row) => sum + row.total_alcohol_charged_gal, 0);
  const totalHeartsLaa = byType.reduce((sum, row) => sum + row.total_hearts_laa_gal, 0);
  const hearts_recovery_pct = totalCharged > 0
    ? safePercent(totalHeartsLaa, totalCharged)
    : null;

  let net_alcohol_balance_gal: number | null = null;
  for (const row of byType) {
    if (row.total_alcohol_loss_gal != null) {
      net_alcohol_balance_gal = (net_alcohol_balance_gal ?? 0) + row.total_alcohol_loss_gal;
    }
  }
  const net_alcohol_balance_label = net_alcohol_balance_gal != null
    ? formatDistillationAlcoholResult(net_alcohol_balance_gal)
    : '—';

  return {
    completed_still_runs,
    hearts_recovery_pct,
    net_alcohol_balance_gal,
    net_alcohol_balance_label,
  };
}

function avgFermentDaysFromRows(
  rows: { duration_days: number | null; status: string }[],
): number | null {
  const finished = rows.filter((row) => row.duration_days != null && row.status !== 'fermenting');
  if (finished.length === 0) return null;
  const avg = finished.reduce((sum, row) => sum + (row.duration_days ?? 0), 0) / finished.length;
  return Math.round(avg * 10) / 10;
}

function washYieldsInRange(range: ReportDateRange, employee: ReportEmployee | null) {
  const monthParam =
    range.from?.slice(0, 7) === range.to?.slice(0, 7) && range.from
      ? range.from.slice(0, 7)
      : undefined;
  const yieldsAll = getYieldReports(monthParam);
  const runs = getDistillationRuns();
  const mashes = getMashBatches();
  const mashIdsInRange = new Set(
    runs
      .filter((r) => (
        eventInReportRange(r.run_date, range)
        && r.source_mash_batch_id
        && reportPersonMatches(r.assigned_user_name, employee, r.assigned_user_id)
      ))
      .map((r) => r.source_mash_batch_id as number),
  );
  const mashBatchNumbersInRange = new Set(
    mashes.filter((m) => mashIdsInRange.has(m.id)).map((m) => m.batch_number),
  );
  return (monthParam ? yieldsAll : yieldsAll.filter((y) => mashBatchNumbersInRange.has(y.mashBatchNumber)))
    .filter((y) => !employee || mashBatchNumbersInRange.has(y.mashBatchNumber));
}

export function buildProductionEfficiency(
  range: ReportDateRange,
  employee: ReportEmployee | null = null,
): ProductionEfficiencySnapshot {
  const distRows = filterRowsByPerson(
    buildDistillationReportRows(range),
    (row) => row.operator,
    employee,
  );
  const still_by_run_type = buildStillEfficiencyFromRows(distRows);
  const rollup = rollupStillEfficiency(still_by_run_type);

  const fermentRows = filterRowsByPerson(
    buildFermentationPerformance(range).rows,
    (row) => row.operator,
    employee,
  );
  const yields = washYieldsInRange(range, employee);
  const avg_wash_yield_pct = yields.length > 0
    ? Math.round((yields.reduce((sum, y) => sum + y.yieldPercent, 0) / yields.length) * 10) / 10
    : null;

  return {
    still_by_run_type,
    ...rollup,
    avg_ferment_days: avgFermentDaysFromRows(fermentRows),
    avg_wash_yield_pct,
    wash_batches_with_yield: yields.length,
  };
}
