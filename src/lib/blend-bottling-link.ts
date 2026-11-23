import type { BlendProduct, BottlingRunView } from '../types';
import { bottlingCountsTowardProduction } from './bottling-lines';

export type BlendBottlingLookup = Pick<
  BlendProduct,
  'id' | 'batch_number' | 'product_name' | 'output_holding_tank_equipment_id' | 'executed_at' | 'blend_date' | 'status'
>;

function blendStartDay(blend: BlendBottlingLookup): string {
  return (blend.executed_at ?? blend.blend_date ?? '').slice(0, 10);
}

/** Bottling runs that drew this blend's output tank on or after it was produced. */
export function matchingBottlingRunsForBlend(
  blend: BlendBottlingLookup,
  runs: BottlingRunView[],
): BottlingRunView[] {
  const outputTankId = blend.output_holding_tank_equipment_id;
  if (!outputTankId) return [];

  const blendDay = blendStartDay(blend);
  if (!blendDay) return [];

  const lot = blend.batch_number.trim();
  const product = blend.product_name.trim().toLowerCase();

  const matches = runs.filter((run) => {
    if (run.source_holding_tank_equipment_id !== outputTankId) return false;
    if (!bottlingCountsTowardProduction(run.status)) return false;
    if (run.bottling_date.slice(0, 10) < blendDay) return false;

    const runLot = run.lot_number?.trim() ?? '';
    if (lot && runLot && runLot === lot) return true;

    const runProduct = run.product_name?.trim().toLowerCase() ?? '';
    if (product && runProduct && runProduct === product) return true;

    return false;
  });

  return matches.sort((a, b) => {
    const lotBoost = (run: BottlingRunView) => (
      lot && run.lot_number?.trim() === lot ? 1 : 0
    );
    const diff = lotBoost(b) - lotBoost(a);
    if (diff !== 0) return diff;
    const byDate = b.bottling_date.localeCompare(a.bottling_date);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });
}

export function primaryBottlingRunIdForBlend(
  blend: BlendBottlingLookup,
  runs: BottlingRunView[],
): number | null {
  const finished = blend.status === 'executed' || blend.status === 'bottled' || blend.status === 'blended';
  if (!finished) return null;
  const matches = matchingBottlingRunsForBlend(blend, runs);
  return matches[0]?.id ?? null;
}