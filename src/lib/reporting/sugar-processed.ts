import { queryAll } from '../../db/database';
import { eventInReportRange, type ReportDateRange } from './period';

export interface SugarUse {
  occurredAt: string;
  sugarLbs: number;
  operator?: string | null;
  operatorId?: number | null;
}

/** Pounds of sugar used to make washes during the report period. */
export function totalSugarProcessedLbs(uses: readonly SugarUse[], range: ReportDateRange): number {
  return uses.reduce((sum, use) => {
    if (!(use.sugarLbs > 0)) return sum;
    if (!eventInReportRange(use.occurredAt, range)) return sum;
    return sum + use.sugarLbs;
  }, 0);
}

/** Sugar put into each wash, dated by the wash start date. */
export function sugarUses(): SugarUse[] {
  const washes = queryAll<{
    start_date: string;
    grain_lbs: number;
    assigned_user_name: string | null;
    assigned_user_id: number | null;
  }>(
    'SELECT start_date, grain_lbs, assigned_user_name, assigned_user_id FROM mash_batches',
  );
  return washes.map((wash) => ({
    occurredAt: wash.start_date,
    sugarLbs: wash.grain_lbs,
    operator: wash.assigned_user_name,
    operatorId: wash.assigned_user_id,
  }));
}
