import { OPEN_PO_STATUSES } from '../../../../shared/planning/constants.js';
import { queryAll, queryOne } from '../pg-helpers.js';
import { listMaterialValuations, listLiquidValuations } from './costing.js';

function sumValuedExtended(
  rows: Array<{ extended_cost_kyd?: number | null; cost_status: string }>,
): number | null {
  const valued = rows.filter((r) => r.cost_status === 'VALUED' && r.extended_cost_kyd != null);
  if (valued.length === 0) return null;
  return valued.reduce((sum, row) => sum + (row.extended_cost_kyd ?? 0), 0);
}

export async function getExecutiveDashboardSummary() {
  const fgInventory = await queryAll<{
    extended_cost_kyd: number | null;
    cost_status: string;
    quantity: number;
  }>(`
    SELECT fl.unit_cost_kyd * COALESCE(bal.qty, 0) AS extended_cost_kyd,
           fl.cost_status, COALESCE(bal.qty, 0) AS quantity
    FROM fg_lots fl
    LEFT JOIN (
      SELECT fg_lot_id,
        COALESCE(SUM(CASE WHEN destination_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) AS qty
      FROM fg_transactions
      WHERE reversal_of_transaction_id IS NULL
      GROUP BY fg_lot_id
    ) bal ON bal.fg_lot_id = fl.id`);

  const materialRows = await listMaterialValuations();
  const liquidRows = await listLiquidValuations();

  const fgValueKyd = sumValuedExtended(
    fgInventory.map((row) => ({
      extended_cost_kyd: row.extended_cost_kyd,
      cost_status: row.cost_status,
    })),
  );

  const valuedMaterial = materialRows.filter((r) => r.cost_status === 'VALUED');
  const materialValueKyd =
    valuedMaterial.length > 0
      ? valuedMaterial.reduce((sum, row) => sum + (row.remaining_value_kyd ?? 0), 0)
      : null;

  const valuedLiquid = liquidRows.filter((r) => r.cost_status === 'VALUED');
  const liquidValueKyd =
    valuedLiquid.length > 0
      ? valuedLiquid.reduce((sum, row) => sum + row.accumulated_cost_kyd, 0)
      : null;

  const productionInProgress =
    Number(
      (
        await queryOne<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM prod_orders WHERE status = 'In Progress'`,
        )
      )?.count ?? 0,
    );

  const poOutstanding = Number(
    (
      await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM pur_purchase_orders WHERE status = ANY($1)`,
        [OPEN_PO_STATUSES],
      )
    )?.count ?? 0,
  );

  const qaHolds = Number(
    (await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM qc_holds WHERE status = 'Active'`))
      ?.count ?? 0,
  );

  const depletion = await queryOne<{ qty: string; cost: string }>(
    `SELECT COALESCE(SUM(quantity), 0)::text AS qty, COALESCE(SUM(extended_cost_kyd), 0)::text AS cost
     FROM sal_cogs_records`,
  );

  const unvaluedMaterial = materialRows.filter((r) => r.cost_status === 'UNVALUED').length;
  const unvaluedLiquid = liquidRows.filter((r) => r.cost_status === 'UNVALUED').length;
  const unvaluedFg = fgInventory.filter((r) => r.cost_status === 'UNVALUED' && r.quantity > 0).length;
  const unvaluedInventoryWarnings = unvaluedMaterial + unvaluedLiquid + unvaluedFg;

  const hasInventory = fgInventory.length > 0 || materialRows.length > 0 || liquidRows.length > 0;
  let valuationStatus: 'NO_INVENTORY' | 'FULLY_VALUED' | 'PARTIALLY_VALUED' | 'UNVALUED' = 'NO_INVENTORY';
  if (hasInventory) {
    if (unvaluedInventoryWarnings === 0) valuationStatus = 'FULLY_VALUED';
    else if (unvaluedInventoryWarnings >= materialRows.length + liquidRows.length + fgInventory.length) {
      valuationStatus = 'UNVALUED';
    } else {
      valuationStatus = 'PARTIALLY_VALUED';
    }
  }

  return {
    fgValueKyd,
    materialValueKyd,
    liquidValueKyd,
    productionInProgress,
    poOutstanding,
    shortages: 0,
    qaHolds,
    maintenanceDue: 0,
    fgDepletionUnits: Number(depletion?.qty ?? 0),
    operationalCogsKyd: Number(depletion?.cost ?? 0),
    unvaluedInventoryWarnings,
    valuationStatus,
  };
}
