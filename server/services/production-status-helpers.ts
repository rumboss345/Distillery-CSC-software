import { queryOne } from '../db/pool.js';

export async function serverHasProductionData(): Promise<boolean> {
  const row = await queryOne<{ total: string }>(`
    SELECT (
      (SELECT COUNT(*) FROM mash_batches) +
      (SELECT COUNT(*) FROM distillation_runs) +
      (SELECT COUNT(*) FROM floor_equipment) +
      (SELECT COUNT(*) FROM inventory_items)
    )::text AS total
  `);
  return Number(row?.total ?? 0) > 0;
}
