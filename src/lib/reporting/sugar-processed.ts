import { queryAll } from '../../db/database';
import { ingredientWeightLbs } from '../blending';
import { eventInReportRange, type ReportDateRange } from './period';

export interface SugarUse {
  occurredAt: string;
  sugarLbs: number;
}

/** Pounds of sugar used on washes and in finished blends during the report period. */
export function totalSugarProcessedLbs(uses: readonly SugarUse[], range: ReportDateRange): number {
  return uses.reduce((sum, use) => {
    if (!(use.sugarLbs > 0)) return sum;
    if (!eventInReportRange(use.occurredAt, range)) return sum;
    return sum + use.sugarLbs;
  }, 0);
}

/** Sugar put into a wash, plus sugar in a blend that was produced. */
export function sugarUses(): SugarUse[] {
  const washes = queryAll<{ start_date: string; grain_lbs: number }>(
    'SELECT start_date, grain_lbs FROM mash_batches',
  );
  const blends = queryAll<{
    occurred_at: string;
    amount: number;
    unit: string;
  }>(`
    SELECT COALESCE(NULLIF(TRIM(p.executed_at), ''), p.blend_date) as occurred_at,
           i.amount, i.unit
    FROM blend_ingredients i
    JOIN blend_products p ON p.id = i.blend_product_id
    WHERE i.ingredient_type = 'sugar'
      AND p.status IN ('executed', 'bottled', 'blended')
  `);

  return [
    ...washes.map((wash) => ({
      occurredAt: wash.start_date,
      sugarLbs: wash.grain_lbs,
    })),
    ...blends.map((blend) => ({
      occurredAt: blend.occurred_at,
      sugarLbs: ingredientWeightLbs({
        ingredient_type: 'sugar',
        amount: blend.amount,
        unit: blend.unit,
      }),
    })),
  ];
}
