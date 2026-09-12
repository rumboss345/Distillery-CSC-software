import { computeMaterialLotValuation } from '../../../../shared/costing/material-cost.js';
import { computeLiquidLotValuation } from '../../../../shared/costing/liquid-cost.js';
import { computeMaterialLotBalance } from '../balance-engine.js';
import { queryAll, queryOne } from '../pg-helpers.js';

const MAT_ACTIVE_FILTER = `
  reversal_of_transaction_id IS NULL
  AND id NOT IN (
    SELECT reversal_of_transaction_id FROM mat_transactions
    WHERE reversal_of_transaction_id IS NOT NULL
  )`;

async function getMaterialOriginalReceivedQty(lotId: number): Promise<number> {
  const row = await queryOne<{ qty: string }>(
    `SELECT COALESCE(SUM(base_quantity), 0)::text AS qty FROM mat_transactions
     WHERE material_lot_id = $1 AND transaction_type IN ('Purchase Receipt', 'Opening Balance')
       AND ${MAT_ACTIVE_FILTER}`,
    [lotId],
  );
  return Number(row?.qty ?? 0);
}

export async function listMaterialValuations(filters?: {
  materialType?: string;
  costStatus?: string;
}) {
  let sql = `
    SELECT l.id AS material_lot_id, l.lot_code, l.material_type,
           COALESCE(rm.name, pm.name) AS material_name,
           s.company_name AS supplier_name,
           r.receipt_code
    FROM mat_lots l
    LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id
    LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id
    LEFT JOIN md_suppliers s ON s.id = l.supplier_id
    LEFT JOIN pur_receipt_lines rl ON rl.material_lot_id = l.id
    LEFT JOIN pur_receipts r ON r.id = rl.receipt_id
    WHERE (rm.inventory_tracking_mode = 'LEDGER' OR pm.inventory_tracking_mode = 'LEDGER')`;
  const params: unknown[] = [];
  if (filters?.materialType) {
    sql += ' AND l.material_type = $1';
    params.push(filters.materialType);
  }
  sql += ' GROUP BY l.id, l.lot_code, l.material_type, rm.name, pm.name, s.company_name, r.receipt_code ORDER BY l.lot_code';

  const rows = await queryAll<{
    material_lot_id: number;
    lot_code: string;
    material_type: string;
    material_name: string;
    supplier_name: string | null;
    receipt_code: string | null;
  }>(sql, params);

  const results = [];
  for (const row of rows) {
    const layerRows = await queryAll<{
      purchase_cost_kyd: number;
      landed_cost_kyd: number;
      total_cost_kyd: number;
      quantity_basis: number;
      cost_status: string;
    }>(
      `SELECT purchase_cost_kyd, landed_cost_kyd, total_cost_kyd, quantity_basis, cost_status
       FROM cost_material_lot_layers WHERE material_lot_id = $1 AND status = 'Active'`,
      [row.material_lot_id],
    );
    const layers = layerRows.map((l) => ({
      purchaseCostKyd: l.purchase_cost_kyd,
      landedCostKyd: l.landed_cost_kyd,
      totalCostKyd: l.total_cost_kyd,
      unitCostKyd: l.quantity_basis > 0 ? l.total_cost_kyd / l.quantity_basis : 0,
      quantityBasis: l.quantity_basis,
      costStatus: l.cost_status as 'VALUED' | 'UNVALUED' | 'PARTIALLY_VALUED',
    }));
    const originalQty = await getMaterialOriginalReceivedQty(row.material_lot_id);
    const currentQty = await computeMaterialLotBalance(row.material_lot_id);
    const val = computeMaterialLotValuation(layers, originalQty, currentQty);
    const entry = {
      material_lot_id: row.material_lot_id,
      lot_code: row.lot_code,
      material_name: row.material_name,
      material_type: row.material_type,
      supplier_name: row.supplier_name,
      receipt_code: row.receipt_code,
      received_qty: originalQty,
      remaining_qty: currentQty,
      purchase_cost_kyd: val.originalPurchaseCostKyd,
      landed_cost_kyd: val.allocatedLandedCostKyd,
      total_cost_kyd: val.totalHistoricalLotCostKyd,
      unit_cost_kyd: val.historicalUnitLandedCostKyd,
      remaining_value_kyd: val.remainingInventoryValueKyd,
      cost_status: val.costStatus,
    };
    if (!filters?.costStatus || entry.cost_status === filters.costStatus) {
      results.push(entry);
    }
  }
  return results;
}

export async function listLiquidValuations() {
  const positions = await queryAll<{
    liquid_lot_id: number;
    lot_code: string;
    lot_type: string;
    current_volume_litres: number;
    current_lpa: number;
    current_abv: number;
    lot_economic_cost_kyd: number;
    cost_status: string;
    source_batch_code: string | null;
  }>(`
    SELECT cl.liquid_lot_id, ll.lot_code, ll.lot_type,
           cl.remaining_volume_litres AS current_volume_litres,
           cl.remaining_lpa AS current_lpa,
           CASE WHEN cl.remaining_volume_litres > 0
             THEN (cl.remaining_lpa / cl.remaining_volume_litres) * 100 ELSE 0 END AS current_abv,
           cl.total_cost_kyd AS lot_economic_cost_kyd,
           cl.cost_status,
           pb.batch_code AS source_batch_code
    FROM cost_liquid_layers cl
    JOIN liq_lots ll ON ll.id = cl.liquid_lot_id
    LEFT JOIN prod_batches pb ON pb.id = cl.source_batch_id
    WHERE cl.status = 'Active' AND cl.remaining_volume_litres > 0.0001
    ORDER BY ll.lot_code`);

  const lotMap = new Map<number, {
    liquid_lot_id: number;
    lot_code: string;
    lot_type: string;
    current_volume_litres: number;
    current_lpa: number;
    current_abv: number;
    accumulated_cost_kyd: number;
    cost_per_litre_kyd: number | null;
    cost_per_lpa_kyd: number | null;
    cost_status: string;
    source_batch_code: string | null;
  }>();

  for (const pos of positions) {
    const existing = lotMap.get(pos.liquid_lot_id);
    if (existing) {
      existing.current_volume_litres += pos.current_volume_litres;
      existing.current_lpa += pos.current_lpa;
      existing.accumulated_cost_kyd = pos.lot_economic_cost_kyd;
    } else {
      lotMap.set(pos.liquid_lot_id, {
        liquid_lot_id: pos.liquid_lot_id,
        lot_code: pos.lot_code,
        lot_type: pos.lot_type,
        current_volume_litres: pos.current_volume_litres,
        current_abv: pos.current_abv,
        current_lpa: pos.current_lpa,
        accumulated_cost_kyd: pos.lot_economic_cost_kyd,
        cost_per_litre_kyd: null,
        cost_per_lpa_kyd: null,
        cost_status: pos.cost_status,
        source_batch_code: pos.source_batch_code,
      });
    }
  }

  const results = [];
  for (const row of lotMap.values()) {
    row.current_abv =
      row.current_volume_litres > 0 ? (row.current_lpa / row.current_volume_litres) * 100 : 0;
    const layerRows = await queryAll<{
      remaining_volume_litres: number;
      remaining_lpa: number;
      input_cost_kyd: number;
      conversion_cost_kyd: number;
      total_cost_kyd: number;
      cost_status: string;
    }>(
      `SELECT remaining_volume_litres, remaining_lpa, input_cost_kyd, conversion_cost_kyd,
              total_cost_kyd, cost_status
       FROM cost_liquid_layers WHERE liquid_lot_id = $1 AND status = 'Active'`,
      [row.liquid_lot_id],
    );
    const layers = layerRows.map((l) => ({
      volumeLitres: l.remaining_volume_litres,
      lpa: l.remaining_lpa,
      inputCostKyd: l.input_cost_kyd,
      conversionCostKyd: l.conversion_cost_kyd,
      totalCostKyd: l.total_cost_kyd,
      costStatus: l.cost_status as 'VALUED' | 'UNVALUED' | 'PARTIALLY_VALUED',
    }));
    const val = computeLiquidLotValuation(layers, row.current_volume_litres, row.current_lpa);
    row.cost_per_litre_kyd = val.costPerLitreKyd;
    row.cost_per_lpa_kyd = val.costPerLpaKyd;
    row.cost_status = val.costStatus;
    row.accumulated_cost_kyd = val.accumulatedCostKyd;
    results.push(row);
  }
  return results;
}

export async function getBatchCostBreakdown(batchId: number) {
  const batch = await queryOne<{ batch_code: string }>(
    'SELECT batch_code FROM prod_batches WHERE id = $1',
    [batchId],
  );
  if (!batch) throw new Error('Batch not found.');

  const materialCosts = await queryAll(
    `SELECT COALESCE(rm.name, pm.name) AS material_name, ml.lot_code,
            c.base_quantity_consumed, c.unit_cost_kyd_snapshot, c.extended_cost_kyd, c.cost_status,
            t.base_unit, s.company_name AS supplier_name, r.receipt_code
     FROM cost_material_consumptions c
     JOIN mat_transactions t ON t.id = c.material_transaction_id
     JOIN mat_lots ml ON ml.id = c.material_lot_id
     LEFT JOIN md_raw_materials rm ON rm.id = t.raw_material_id
     LEFT JOIN md_packaging_materials pm ON pm.id = t.packaging_material_id
     LEFT JOIN md_suppliers s ON s.id = ml.supplier_id
     LEFT JOIN pur_receipt_lines rl ON rl.material_lot_id = ml.id
     LEFT JOIN pur_receipts r ON r.id = rl.receipt_id
     WHERE c.production_batch_id = $1`,
    [batchId],
  );

  const snapshot = await queryOne(
    `SELECT * FROM cost_batch_snapshots WHERE production_batch_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [batchId],
  );

  const conversionCosts = await queryAll(
    'SELECT * FROM cost_batch_conversion_costs WHERE production_batch_id = $1',
    [batchId],
  );

  return {
    batchId,
    batchCode: batch.batch_code,
    materialCosts,
    snapshot,
    conversionCosts,
  };
}
