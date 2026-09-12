/**
 * Phase 1O Management Dashboard, Reports & KPI Analytics.
 * All inventory balances use authoritative ledger sources only — never legacy + ledger mixed.
 */
import { OPEN_PO_STATUSES } from '../../shared/planning/constants';
import type {
  BarrelReportRow,
  CostingReportRow,
  ExecutiveDashboardSummary,
  FgInventoryReportRow,
  LiquidInventoryReportRow,
  MaterialInventoryReportRow,
  ProductionKpiRow,
  PurchasingReportRow,
  ReportPeriodFilter,
  UnvaluedInventoryWarning,
} from '../types/reporting';
import { listMaterialValuations, listLiquidValuations } from './costing-queries';
import { queryAll, queryOne } from './database';
import { listFgInventory } from './finished-goods-queries';
import { getPlanningDashboardSummary } from './planning-queries';
import { getPurchaseOrderLines, listPurchaseOrders } from './purchasing-queries';
import { getQualityDashboardSummary } from './quality-queries';

function periodClause(
  column: string,
  filter?: ReportPeriodFilter,
): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter?.periodStart) {
    clauses.push(`${column} >= ?`);
    params.push(filter.periodStart);
  }
  if (filter?.periodEnd) {
    clauses.push(`${column} <= ?`);
    params.push(filter.periodEnd);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  };
}

function countMaintenanceDueItems(): number {
  const pmDue =
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM maint_pm_schedules
       WHERE active = 1 AND next_due_date IS NOT NULL AND next_due_date <= date('now')`,
    )?.count ?? 0;
  const hasCalibrationColumn = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('floor_equipment') WHERE name = 'next_calibration_due'",
  );
  const calibrationDue = hasCalibrationColumn
    ? queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM floor_equipment
       WHERE next_calibration_due IS NOT NULL AND next_calibration_due <= date('now')`,
    )?.count ?? 0
    : 0;
  return pmDue + calibrationDue;
}

function sumValuedExtended(rows: Array<{ extended_cost_kyd?: number | null; cost_status: string }>): number | null {
  const valued = rows.filter((r) => r.cost_status === 'VALUED' && r.extended_cost_kyd != null);
  if (valued.length === 0) return null;
  return valued.reduce((sum, row) => sum + (row.extended_cost_kyd ?? 0), 0);
}

export function getExecutiveDashboardSummary(): ExecutiveDashboardSummary {
  const fgInventory = listFgInventory();
  const materialRows = listMaterialValuations();
  const liquidRows = listLiquidValuations();

  const fgValueKyd = sumValuedExtended(
    fgInventory.map((row) => ({ extended_cost_kyd: row.extended_cost_kyd, cost_status: row.cost_status })),
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
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM prod_orders WHERE status = 'In Progress'`,
    )?.count ?? 0;

  const poPlaceholders = OPEN_PO_STATUSES.map(() => '?').join(', ');
  const poOutstanding =
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM pur_purchase_orders WHERE status IN (${poPlaceholders})`,
      [...OPEN_PO_STATUSES],
    )?.count ?? 0;

  const shortages = getPlanningDashboardSummary().totalShortages;
  const qaHolds = getQualityDashboardSummary().activeHolds;
  const maintenanceDue = countMaintenanceDueItems();

  const depletion = queryOne<{ qty: number; cost: number }>(
    `SELECT COALESCE(SUM(quantity), 0) AS qty, COALESCE(SUM(extended_cost_kyd), 0) AS cost
     FROM sal_cogs_records`,
  );

  const unvaluedMaterial = materialRows.filter((r) => r.cost_status === 'UNVALUED').length;
  const unvaluedLiquid = liquidRows.filter((r) => r.cost_status === 'UNVALUED').length;
  const unvaluedFg = fgInventory.filter((r) => r.cost_status === 'UNVALUED' && r.quantity > 0).length;
  const unvaluedInventoryWarnings = unvaluedMaterial + unvaluedLiquid + unvaluedFg;

  const hasInventory = fgInventory.length > 0 || materialRows.length > 0 || liquidRows.length > 0;
  let valuationStatus: ExecutiveDashboardSummary['valuationStatus'] = 'NO_INVENTORY';
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
    shortages,
    qaHolds,
    maintenanceDue,
    fgDepletionUnits: depletion?.qty ?? 0,
    operationalCogsKyd: depletion?.cost ?? 0,
    unvaluedInventoryWarnings,
    valuationStatus,
  };
}

export function getProductionKpiReport(filter?: ReportPeriodFilter): ProductionKpiRow[] {
  const { sql, params } = periodClause('b.completed_at', filter);
  const batchRows = queryAll<{
    period: string;
    batches_started: number;
    batches_completed: number;
    avg_cost: number | null;
    total_output: number;
  }>(
    `SELECT
      substr(COALESCE(b.completed_at, b.started_at, b.created_at), 1, 7) AS period,
      COUNT(*) AS batches_started,
      SUM(CASE WHEN b.status = 'Completed' THEN 1 ELSE 0 END) AS batches_completed,
      AVG(CASE WHEN bs.total_cost_kyd IS NOT NULL THEN bs.total_cost_kyd END) AS avg_cost,
      COALESCE(SUM(bs.output_volume_litres), 0) AS total_output
     FROM prod_batches b
     LEFT JOIN cost_batch_snapshots bs ON bs.production_batch_id = b.id AND bs.status = 'Final'
     WHERE 1=1${sql}
     GROUP BY period
     ORDER BY period DESC`,
    params,
  );

  const orderPeriod = periodClause('COALESCE(o.released_at, o.completed_at, o.created_at)', filter);
  const orderRows = queryAll<{ period: string; released: number; completed: number }>(
    `SELECT
      substr(COALESCE(o.released_at, o.completed_at, o.created_at), 1, 7) AS period,
      SUM(CASE WHEN o.released_at IS NOT NULL THEN 1 ELSE 0 END) AS released,
      SUM(CASE WHEN o.status = 'Completed' THEN 1 ELSE 0 END) AS completed
     FROM prod_orders o
     WHERE 1=1${orderPeriod.sql}`,
    orderPeriod.params,
  );
  const orderMap = new Map(orderRows.map((row) => [row.period, row]));

  return batchRows.map((row) => {
    const orders = orderMap.get(row.period);
    return {
      period: row.period,
      ordersReleased: orders?.released ?? 0,
      ordersCompleted: orders?.completed ?? 0,
      batchesStarted: row.batches_started,
      batchesCompleted: row.batches_completed,
      avgBatchCostKyd: row.avg_cost,
      totalOutputLitres: row.total_output,
    };
  });
}

export function getMaterialInventoryReport(): MaterialInventoryReportRow[] {
  return listMaterialValuations()
    .filter((row) => row.remaining_qty > 0.000001)
    .map((row) => ({
      materialType: row.material_type,
      materialCode: row.lot_code,
      materialName: row.material_name,
      lotCode: row.lot_code,
      remainingQty: row.remaining_qty,
      unitCostKyd: row.unit_cost_kyd,
      extendedValueKyd: row.remaining_value_kyd,
      costStatus: row.cost_status,
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName) || a.lotCode.localeCompare(b.lotCode));
}

export function getLiquidInventoryReport(): LiquidInventoryReportRow[] {
  return queryAll<LiquidInventoryReportRow>(
    `SELECT
      l.lot_code AS lotCode,
      l.lot_type AS lotType,
      tk.name AS tankName,
      COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0) AS volumeLitres,
      CASE
        WHEN (
          COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0)
        ) > 0
        THEN (
          COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.lpa ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.lpa ELSE 0 END), 0)
        ) * 100.0 / (
          COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0)
        )
        ELSE 0
      END AS abv,
      COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.lpa ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.lpa ELSE 0 END), 0) AS lpa,
      0 AS positionCostKyd,
      'UNVALUED' AS costStatus
     FROM liq_lots l
     JOIN liq_transactions t ON t.source_lot_id = l.id OR t.destination_lot_id = l.id
     JOIN liq_tanks tk ON tk.id = t.source_tank_id OR tk.id = t.destination_tank_id
     WHERE tk.tracking_mode = 'LEDGER'
       AND t.reversal_of_transaction_id IS NULL
       AND t.id NOT IN (SELECT reversal_of_transaction_id FROM liq_transactions WHERE reversal_of_transaction_id IS NOT NULL)
     GROUP BY l.id, tk.id
     HAVING volumeLitres > 0.000001
     ORDER BY tk.name, l.lot_code`,
  ).map((row) => {
    const valuation = listLiquidValuations().find((v) => v.lot_code === row.lotCode);
    return {
      ...row,
      positionCostKyd: valuation?.accumulated_cost_kyd ?? 0,
      costStatus: valuation?.cost_status ?? 'UNVALUED',
    };
  });
}

export function getFgInventoryReport(): FgInventoryReportRow[] {
  return listFgInventory()
    .filter((row) => row.quantity > 0.000001)
    .map((row) => ({
      skuCode: row.sku_code,
      skuName: row.sku_name,
      fgLotCode: row.fg_lot_code,
      locationName: row.location_name,
      quantity: row.quantity,
      unitCostKyd: row.unit_cost_kyd,
      extendedValueKyd: row.extended_cost_kyd,
      costStatus: row.cost_status,
    }))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode) || a.fgLotCode.localeCompare(b.fgLotCode));
}

export function getPurchasingReport(filter?: ReportPeriodFilter): PurchasingReportRow[] {
  const orders = listPurchaseOrders().filter((po) => {
    if (filter?.periodStart && po.order_date < filter.periodStart) return false;
    if (filter?.periodEnd && po.order_date > filter.periodEnd) return false;
    return true;
  });

  const rows: PurchasingReportRow[] = [];
  for (const po of orders) {
    for (const line of getPurchaseOrderLines(po.id)) {
      rows.push({
        poCode: po.po_code,
        supplierName: po.supplier_name ?? '',
        orderDate: po.order_date,
        status: po.status,
        materialName: line.material_name ?? '',
        orderedQty: line.ordered_quantity,
        receivedQty: line.received_quantity ?? 0,
        remainingQty: line.remaining_quantity ?? 0,
        currency: po.currency,
      });
    }
  }
  return rows.sort((a, b) => b.orderDate.localeCompare(a.orderDate) || a.poCode.localeCompare(b.poCode));
}

export function getOpenPurchasingReport(): PurchasingReportRow[] {
  const openStatuses = [...OPEN_PO_STATUSES, 'Draft'];
  return getPurchasingReport().filter(
    (row) => openStatuses.includes(row.status) && row.remainingQty > 0.000001,
  );
}

export function getBarrelReport(): BarrelReportRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return queryAll<{
    barrel_code: string;
    status: string;
    location_name: string | null;
    fill_date: string | null;
    volume_litres: number;
    liquid_cost_kyd: number;
    asset_cost_kyd: number;
  }>(
    `SELECT
      b.barrel_code,
      b.status,
      loc.name AS location_name,
      f.fill_date,
      COALESCE(f.initial_volume_litres, 0) AS volume_litres,
      COALESCE(f.liquid_cost_kyd, 0) AS liquid_cost_kyd,
      COALESCE(b.purchase_cost_kyd, 0) AS asset_cost_kyd
     FROM brl_barrels b
     LEFT JOIN md_storage_locations loc ON loc.id = b.location_id
     LEFT JOIN brl_fills f ON f.barrel_id = b.id AND f.status = 'Active'
     ORDER BY b.barrel_code`,
  ).map((row) => ({
    barrelCode: row.barrel_code,
    status: row.status,
    locationName: row.location_name,
    fillDate: row.fill_date,
    volumeLitres: row.volume_litres,
    liquidCostKyd: row.liquid_cost_kyd,
    assetCostKyd: row.asset_cost_kyd,
    ageDays: row.fill_date
      ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(row.fill_date.slice(0, 10))) / 86_400_000))
      : null,
  }));
}

export function getCostingReport(): CostingReportRow[] {
  const rows: CostingReportRow[] = [];

  for (const row of getMaterialInventoryReport()) {
    rows.push({
      category: 'Material',
      entityCode: row.lotCode,
      description: row.materialName,
      quantity: row.remainingQty,
      unit: 'base',
      totalCostKyd: row.extendedValueKyd,
      costStatus: row.costStatus,
    });
  }

  for (const row of getLiquidInventoryReport()) {
    rows.push({
      category: 'Liquid',
      entityCode: row.lotCode,
      description: `${row.lotType} @ ${row.tankName}`,
      quantity: row.volumeLitres,
      unit: 'L',
      totalCostKyd: row.positionCostKyd,
      costStatus: row.costStatus,
    });
  }

  for (const row of getFgInventoryReport()) {
    rows.push({
      category: 'Finished Goods',
      entityCode: row.fgLotCode,
      description: `${row.skuName}${row.locationName ? ` @ ${row.locationName}` : ''}`,
      quantity: row.quantity,
      unit: 'each',
      totalCostKyd: row.extendedValueKyd,
      costStatus: row.costStatus,
    });
  }

  const batchCosts = queryAll<{
    batch_code: string;
    total_cost_kyd: number | null;
    output_volume_litres: number | null;
    status: string;
  }>(
    `SELECT b.batch_code, bs.total_cost_kyd, bs.output_volume_litres, bs.status
     FROM prod_batches b
     JOIN cost_batch_snapshots bs ON bs.production_batch_id = b.id
     WHERE b.status = 'Completed'
     ORDER BY b.completed_at DESC
     LIMIT 100`,
  );
  for (const batch of batchCosts) {
    rows.push({
      category: 'Production Batch',
      entityCode: batch.batch_code,
      description: 'Finalized batch cost snapshot',
      quantity: batch.output_volume_litres ?? 0,
      unit: 'L',
      totalCostKyd: batch.total_cost_kyd,
      costStatus: batch.status === 'Final' ? 'VALUED' : 'UNVALUED',
    });
  }

  return rows;
}

export function listUnvaluedInventoryWarnings(): UnvaluedInventoryWarning[] {
  const warnings: UnvaluedInventoryWarning[] = [];

  for (const row of listMaterialValuations().filter((r) => r.cost_status === 'UNVALUED' && r.remaining_qty > 0)) {
    warnings.push({
      inventoryType: 'Material',
      entityCode: row.lot_code,
      description: row.material_name,
      quantity: row.remaining_qty,
      unit: 'base',
    });
  }

  for (const row of listLiquidValuations().filter((r) => r.cost_status === 'UNVALUED' && r.current_volume_litres > 0)) {
    warnings.push({
      inventoryType: 'Liquid',
      entityCode: row.lot_code,
      description: row.lot_type,
      quantity: row.current_volume_litres,
      unit: 'L',
    });
  }

  for (const row of listFgInventory().filter((r) => r.cost_status === 'UNVALUED' && r.quantity > 0)) {
    warnings.push({
      inventoryType: 'Finished Goods',
      entityCode: row.fg_lot_code,
      description: row.sku_name,
      quantity: row.quantity,
      unit: 'each',
    });
  }

  return warnings;
}

/** Ensures reporting views exist and are ledger-scoped. */
export function assertLedgerOnlyReportingViews(): boolean {
  const matView = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='view' AND name='rpt_v_mat_ledger_tx'",
  );
  const liqView = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='view' AND name='rpt_v_liq_ledger_tx'",
  );
  const fgView = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='view' AND name='rpt_v_fg_ledger_tx'",
  );
  return matView != null && liqView != null && fgView != null;
}
