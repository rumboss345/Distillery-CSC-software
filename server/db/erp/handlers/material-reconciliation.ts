import type pg from 'pg';
import { computeMaterialLotBalance } from '../balance-engine.js';
import { insertRow, queryOne, runQuery, withPgTransaction } from '../pg-helpers.js';
import { postMaterialTransaction } from './material.js';

const now = () => new Date().toISOString();

export async function createMaterialReconciliation(input: {
  material_type: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
  raw_material_id: number | null;
  packaging_material_id: number | null;
  material_lot_id: number;
  location_id: number;
  physical_quantity: number;
  unit: string;
  base_unit: string;
  reason: string;
  counted_by: string | null;
  counted_at: string;
  notes?: string;
}): Promise<number> {
  const systemQty = await computeMaterialLotBalance(input.material_lot_id, input.location_id);
  const variance = input.physical_quantity - systemQty;

  return withPgTransaction(async (client) =>
    insertRow(
      `INSERT INTO mat_reconciliations (
        material_type, raw_material_id, packaging_material_id, material_lot_id, location_id,
        system_quantity, physical_quantity, variance_quantity, unit, base_unit, status, reason,
        counted_by, counted_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Draft', $11, $12, $13, $14)`,
      [
        input.material_type,
        input.raw_material_id,
        input.packaging_material_id,
        input.material_lot_id,
        input.location_id,
        systemQty,
        input.physical_quantity,
        variance,
        input.unit,
        input.base_unit,
        input.reason,
        input.counted_by,
        input.counted_at,
        input.notes ?? '',
      ],
      client,
    ),
  );
}

export async function postMaterialReconciliation(
  reconciliationId: number,
  countedBy?: string | null,
): Promise<number> {
  return withPgTransaction(async (client) => {
    const rec = await queryOne<{
      id: number;
      status: string;
      material_type: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
      raw_material_id: number | null;
      packaging_material_id: number | null;
      material_lot_id: number | null;
      location_id: number;
      variance_quantity: number;
      base_unit: string;
      reason: string;
      notes: string;
    }>('SELECT * FROM mat_reconciliations WHERE id = $1', [reconciliationId], client);

    if (!rec) throw new Error('Reconciliation not found.');
    if (rec.status === 'Posted') throw new Error('Reconciliation already posted.');
    if (Math.abs(rec.variance_quantity) < 1e-9) throw new Error('No variance to post.');

    const isIncrease = rec.variance_quantity > 0;
    const absBase = Math.abs(rec.variance_quantity);

    const txId = await postMaterialTransaction({
      transactionType: 'Cycle Count Adjustment',
      materialType: rec.material_type,
      rawMaterialId: rec.raw_material_id,
      packagingMaterialId: rec.packaging_material_id,
      materialLotId: rec.material_lot_id ?? undefined,
      sourceLocationId: isIncrease ? undefined : rec.location_id,
      destinationLocationId: isIncrease ? rec.location_id : undefined,
      quantity: absBase,
      unit: rec.base_unit,
      baseQuantity: absBase,
      baseUnit: rec.base_unit,
      reasonCode: rec.reason,
      notes: rec.notes,
      createdBy: countedBy,
    });

    await runQuery(
      `UPDATE mat_reconciliations SET status = 'Posted', transaction_id = $1, posted_at = $2,
       counted_by = COALESCE($3, counted_by) WHERE id = $4`,
      [txId, now(), countedBy ?? null, reconciliationId],
      client,
    );
    return txId;
  });
}
