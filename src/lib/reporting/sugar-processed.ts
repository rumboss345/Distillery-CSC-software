import { queryAll } from '../../db/database';
import { eventInReportRange, type ReportDateRange } from './period';

export interface SugarUse {
  occurredAt: string;
  sugarLbs: number;
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
  const washes = queryAll<{ start_date: string; grain_lbs: number }>(
    'SELECT start_date, grain_lbs FROM mash_batches',
  );
  return washes.map((wash) => ({ occurredAt: wash.start_date, sugarLbs: wash.grain_lbs }));
}
