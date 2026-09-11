import { computeFgLotBalance } from '../balance-engine.js';
import { queryOne, withPgTransaction } from '../pg-helpers.js';
import { insertFgTransactionRow } from './finished-goods.js';

export async function postFgCycleCountAdjustment(input: {
  fgLotId: number;
  locationId: number;
  varianceQuantity: number;
  notes?: string;
  createdBy?: string | null;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    const lot = await queryOne<{ sku_id: number; unit_cost_kyd: number | null }>(
      'SELECT sku_id, unit_cost_kyd FROM fg_lots WHERE id = $1',
      [input.fgLotId],
      client,
    );
    if (!lot) throw new Error('Finished goods lot not found.');
    if (Math.abs(input.varianceQuantity) < 1e-9) {
      throw new Error('No variance to post.');
    }
    const isIncrease = input.varianceQuantity > 0;
    const absQty = Math.abs(input.varianceQuantity);
    if (!isIncrease) {
      const balance = await computeFgLotBalance(input.fgLotId, input.locationId);
      if (balance < absQty) throw new Error('Insufficient quantity for cycle count decrease.');
    }

    return insertFgTransactionRow({
      transactionType: 'Reconciliation',
      fgLotId: input.fgLotId,
      skuId: lot.sku_id,
      sourceLocationId: isIncrease ? null : input.locationId,
      destinationLocationId: isIncrease ? input.locationId : null,
      quantity: absQty,
      unitCostKyd: lot.unit_cost_kyd,
      reasonCode: 'Cycle Count',
      notes: input.notes ?? 'Cycle count reconciliation',
      createdBy: input.createdBy,
    });
  });
}
