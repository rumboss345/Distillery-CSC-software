/**
 * Phase 1G liquid cost location movements — tied to Phase 1D liquid transactions.
 * Economic cost lives in cost_liquid_lot_layers; movements relocate value without creating it.
 */
import { proportionalTransferCost } from '../../shared/costing/liquid-cost';
import type { CostStatus } from '../../shared/costing/constants';
import type { CostLiquidMovement, LiquidPositionValuationRow } from '../types/costing';
import { insertRow, queryAll, queryOne, runQuery } from './database';

const now = () => new Date().toISOString();

const TX_ACTIVE = `
  t.reversal_of_transaction_id IS NULL
  AND t.id NOT IN (
    SELECT reversal_of_transaction_id FROM liq_transactions WHERE reversal_of_transaction_id IS NOT NULL
  )
`;

type TankVolumeRow = { tank_id: number; volume_litres: number; lpa: number; tracking_mode: string };

function queryLotTankVolumes(liquidLotId: number): TankVolumeRow[] {
  const tankIds = queryAll<{ tank_id: number; tracking_mode: string }>(
    `SELECT DISTINCT tk.id AS tank_id, tk.tracking_mode
     FROM liq_tanks tk
     JOIN liq_transactions t ON (t.source_tank_id = tk.id OR t.destination_tank_id = tk.id)
     WHERE (t.source_lot_id = ? OR t.destination_lot_id = ?)
       AND tk.tracking_mode = 'LEDGER'
       AND ${TX_ACTIVE}`,
    [liquidLotId, liquidLotId],
  );

  return tankIds
    .map((row) => {
      const vol = queryLotVolumeInTank(liquidLotId, row.tank_id);
      return {
        tank_id: row.tank_id,
        tracking_mode: row.tracking_mode,
        volume_litres: vol.volumeLitres,
        lpa: vol.lpa,
      };
    })
    .filter((row) => row.volume_litres > 0.000001);
}

export function queryLotVolumeInTank(liquidLotId: number, tankId: number): { volumeLitres: number; lpa: number } {
  const row = queryOne<{ vol: number; lpa: number }>(
    `SELECT
      COALESCE(SUM(CASE WHEN destination_tank_id = ? AND destination_lot_id = ? THEN volume_litres ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN source_tank_id = ? AND source_lot_id = ? THEN volume_litres ELSE 0 END), 0) AS vol,
      COALESCE(SUM(CASE WHEN destination_tank_id = ? AND destination_lot_id = ? THEN lpa ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN source_tank_id = ? AND source_lot_id = ? THEN lpa ELSE 0 END), 0) AS lpa
     FROM liq_transactions
     WHERE (source_lot_id = ? OR destination_lot_id = ?)
       AND (source_tank_id = ? OR destination_tank_id = ?)
       AND reversal_of_transaction_id IS NULL
       AND id NOT IN (SELECT reversal_of_transaction_id FROM liq_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
    [tankId, liquidLotId, tankId, liquidLotId, tankId, liquidLotId, tankId, liquidLotId, liquidLotId, liquidLotId, tankId, tankId],
  );
  return { volumeLitres: Math.max(0, row?.vol ?? 0), lpa: Math.max(0, row?.lpa ?? 0) };
}

function sumActiveMovements(
  liquidLotId: number,
  tankId: number,
  direction: 'in' | 'out',
): number {
  const col = direction === 'in' ? 'destination_tank_id' : 'source_tank_id';
  const rows = queryAll<{ transferred_cost_kyd: number }>(
    `SELECT transferred_cost_kyd FROM cost_liquid_movements
     WHERE liquid_lot_id = ? AND ${col} = ? AND status = 'Active' AND costing_status = 'Recorded'`,
    [liquidLotId, tankId],
  );
  return rows.reduce((s, r) => s + r.transferred_cost_kyd, 0);
}

/** Cost attributed to a lot at a specific tank/location (location cost, not new economic cost). */
export function getLiquidPositionCost(liquidLotId: number, tankId: number): number {
  const inCost = sumActiveMovements(liquidLotId, tankId, 'in');
  const outCost = sumActiveMovements(liquidLotId, tankId, 'out');
  return Math.max(0, inCost - outCost);
}

/** Proportional cost for a volume drawn from a tank position. */
export function getLiquidPositionCostForVolume(
  liquidLotId: number,
  tankId: number,
  volumeLitres: number,
): number {
  const posCost = getLiquidPositionCost(liquidLotId, tankId);
  const posVol = queryLotVolumeInTank(liquidLotId, tankId).volumeLitres;
  if (posVol <= 0 || volumeLitres <= 0) return 0;
  if (volumeLitres >= posVol - 0.000001) return posCost;
  const ratio = volumeLitres / posVol;
  return posCost * ratio;
}

export function getLiquidLotEconomicCost(liquidLotId: number): number {
  const row = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(total_cost_kyd), 0) AS total FROM cost_liquid_lot_layers
     WHERE liquid_lot_id = ? AND status = 'Active'`,
    [liquidLotId],
  );
  return row?.total ?? 0;
}

export function getLiquidLotPositionCostTotal(liquidLotId: number): number {
  const tanks = queryLotTankVolumes(liquidLotId).filter((t) => t.tracking_mode === 'LEDGER');
  return tanks.reduce((s, t) => s + getLiquidPositionCost(liquidLotId, t.tank_id), 0);
}

function insertMovement(input: {
  liquidTransactionId?: number | null;
  transactionGroupId?: string | null;
  liquidLotId: number;
  sourceTankId?: number | null;
  destinationTankId?: number | null;
  volumeLitres: number;
  lpa?: number | null;
  transferredCostKyd: number;
  movementType: string;
  reversalOfId?: number | null;
  sourceCostLayerId?: number | null;
  costingStatus?: string;
  notes?: string;
}): number {
  const costPerL = input.volumeLitres > 0 ? input.transferredCostKyd / input.volumeLitres : null;
  const costPerLpa = input.lpa != null && input.lpa > 0 ? input.transferredCostKyd / input.lpa : null;
  return insertRow(
    `INSERT INTO cost_liquid_movements (
      liquid_transaction_id, transaction_group_id, liquid_lot_id,
      source_tank_id, destination_tank_id, volume_litres, lpa,
      transferred_cost_kyd, cost_per_litre_snapshot, cost_per_lpa_snapshot,
      movement_type, status, reversal_of_id, costing_status, source_cost_layer_id, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?)`,
    [
      input.liquidTransactionId ?? null,
      input.transactionGroupId ?? null,
      input.liquidLotId,
      input.sourceTankId ?? null,
      input.destinationTankId ?? null,
      input.volumeLitres,
      input.lpa ?? null,
      input.transferredCostKyd,
      costPerL,
      costPerLpa,
      input.movementType,
      input.reversalOfId ?? null,
      input.costingStatus ?? 'Recorded',
      input.sourceCostLayerId ?? null,
      input.notes ?? '',
      now(),
    ],
  );
}

/** Assign economic lot cost to tank positions when a cost layer is created. */
export function assignInitialLiquidPositionFromLayer(
  liquidLotId: number,
  layerId: number,
  totalCostKyd: number,
  _volumeLitres: number,
  lpa: number,
): void {
  if (totalCostKyd <= 0) return;

  const existing = queryOne<{ id: number }>(
    `SELECT id FROM cost_liquid_movements
     WHERE source_cost_layer_id = ? AND movement_type = 'Initial Position' AND status = 'Active'`,
    [layerId],
  );
  if (existing) return;

  const tanks = queryLotTankVolumes(liquidLotId).filter((t) => t.tracking_mode === 'LEDGER');
  if (tanks.length === 0) return;

  const totalVol = tanks.reduce((s, t) => s + t.volume_litres, 0);
  let allocated = 0;
  for (let i = 0; i < tanks.length; i++) {
    const tank = tanks[i]!;
    const isLast = i === tanks.length - 1;
    const share = isLast
      ? totalCostKyd - allocated
      : totalCostKyd * (tank.volume_litres / totalVol);
    allocated += share;
    const tankLpa = totalVol > 0 ? lpa * (tank.volume_litres / totalVol) : 0;
    insertMovement({
      liquidLotId,
      destinationTankId: tank.tank_id,
      volumeLitres: tank.volume_litres,
      lpa: tankLpa,
      transferredCostKyd: share,
      movementType: 'Initial Position',
      sourceCostLayerId: layerId,
      notes: `Initial position from cost layer #${layerId}`,
    });
  }
}

export function findTransferMovementByGroup(transactionGroupId: string): CostLiquidMovement | null {
  return queryOne<CostLiquidMovement>(
    `SELECT * FROM cost_liquid_movements
     WHERE transaction_group_id = ? AND movement_type = 'Transfer' AND status = 'Active'
     ORDER BY id LIMIT 1`,
    [transactionGroupId],
  );
}

export function hasTransferMovementReversal(movementId: number): boolean {
  return queryOne<{ id: number }>(
    `SELECT id FROM cost_liquid_movements
     WHERE reversal_of_id = ? AND movement_type = 'Transfer Reversal' AND status = 'Active'`,
    [movementId],
  ) != null;
}

/** Record one cost movement for a tank transfer (paired Out/In rows share one group). */
export function recordLiquidTransferCostMovement(input: {
  outTransactionId: number;
  transactionGroupId: string;
  liquidLotId: number;
  sourceTankId: number;
  destinationTankId: number;
  volumeLitres: number;
  lpa: number;
  /** Pre-transfer lot volume in source tank — required when called after ledger Out row. */
  sourceVolumeAtTransfer?: number;
}): number {
  const dup = findTransferMovementByGroup(input.transactionGroupId);
  if (dup) return dup.id;

  const sourceVol = input.sourceVolumeAtTransfer ?? queryLotVolumeInTank(input.liquidLotId, input.sourceTankId).volumeLitres;
  const sourceCost = getLiquidPositionCost(input.liquidLotId, input.sourceTankId);

  if (sourceVol <= 0) {
    throw new Error(`No cost position volume for lot ${input.liquidLotId} in tank ${input.sourceTankId}.`);
  }

  const { transferredCostKyd } = proportionalTransferCost(sourceCost, sourceVol, input.volumeLitres);

  return insertMovement({
    liquidTransactionId: input.outTransactionId,
    transactionGroupId: input.transactionGroupId,
    liquidLotId: input.liquidLotId,
    sourceTankId: input.sourceTankId,
    destinationTankId: input.destinationTankId,
    volumeLitres: input.volumeLitres,
    lpa: input.lpa,
    transferredCostKyd,
    movementType: 'Transfer',
    notes: 'Tank transfer cost relocation',
  });
}

/** Reverse cost movement when Phase 1D transfer group is reversed. */
export function reverseLiquidTransferCostMovement(transactionGroupId: string): number | null {
  const original = findTransferMovementByGroup(transactionGroupId);
  if (!original) return null;
  if (hasTransferMovementReversal(original.id)) {
    throw new Error('Transfer cost movement has already been reversed.');
  }

  return insertMovement({
    transactionGroupId,
    liquidLotId: original.liquid_lot_id,
    sourceTankId: original.destination_tank_id,
    destinationTankId: original.source_tank_id,
    volumeLitres: original.volume_litres,
    lpa: original.lpa,
    transferredCostKyd: original.transferred_cost_kyd,
    movementType: 'Transfer Reversal',
    reversalOfId: original.id,
    notes: `Reversal of cost movement #${original.id}`,
  });
}

/** Remove cost from source tank when liquid is filled into a barrel (Phase 1J). */
export function recordBarrelFillCostMovement(input: {
  liquidLotId: number;
  sourceTankId: number;
  volumeLitres: number;
  lpa: number;
  fillId: number;
  liquidTransactionId: number;
  transactionGroupId: string;
  costKyd?: number;
}): number {
  const costKyd = input.costKyd ?? getLiquidPositionCostForVolume(input.liquidLotId, input.sourceTankId, input.volumeLitres);
  return insertMovement({
    liquidTransactionId: input.liquidTransactionId,
    transactionGroupId: input.transactionGroupId,
    liquidLotId: input.liquidLotId,
    sourceTankId: input.sourceTankId,
    volumeLitres: input.volumeLitres,
    lpa: input.lpa,
    transferredCostKyd: costKyd,
    movementType: 'Barrel Fill Consumption',
    notes: `Barrel fill #${input.fillId}`,
  });
}

/** Assign barrel-aged liquid cost to destination tank on dump. */
export function recordBarrelDumpCostMovement(input: {
  liquidLotId: number;
  destinationTankId: number;
  volumeLitres: number;
  lpa: number;
  dumpId: number;
  liquidTransactionId: number;
  transactionGroupId: string;
  costKyd: number;
}): number {
  return insertMovement({
    liquidTransactionId: input.liquidTransactionId,
    transactionGroupId: input.transactionGroupId,
    liquidLotId: input.liquidLotId,
    destinationTankId: input.destinationTankId,
    volumeLitres: input.volumeLitres,
    lpa: input.lpa,
    transferredCostKyd: input.costKyd,
    movementType: 'Barrel Dump Receipt',
    notes: `Barrel dump #${input.dumpId}`,
  });
}

/** Remove cost from source tank when liquid is consumed in production. */
export function recordLiquidProductionConsumption(input: {
  liquidLotId: number;
  sourceTankId: number;
  volumeLitres: number;
  lpa: number;
  productionBatchId: number;
  transactionGroupId?: string | null;
  costKyd?: number;
}): number {
  const costKyd = input.costKyd ?? getLiquidPositionCostForVolume(input.liquidLotId, input.sourceTankId, input.volumeLitres);
  return insertMovement({
    transactionGroupId: input.transactionGroupId ?? null,
    liquidLotId: input.liquidLotId,
    sourceTankId: input.sourceTankId,
    volumeLitres: input.volumeLitres,
    lpa: input.lpa,
    transferredCostKyd: costKyd,
    movementType: 'Production Consumption',
    notes: `Production batch #${input.productionBatchId}`,
  });
}

export function markTransferCostReconciliationRequired(
  transactionGroupId: string,
  errorMessage: string,
): void {
  runQuery(
    `UPDATE cost_liquid_movements SET costing_status = 'RECONCILIATION REQUIRED', notes = ?
     WHERE transaction_group_id = ? AND movement_type = 'Transfer'`,
    [errorMessage, transactionGroupId],
  );
}

export function listLiquidCostMovements(liquidLotId?: number): CostLiquidMovement[] {
  if (liquidLotId != null) {
    return queryAll<CostLiquidMovement>(
      'SELECT * FROM cost_liquid_movements WHERE liquid_lot_id = ? ORDER BY created_at, id',
      [liquidLotId],
    );
  }
  return queryAll<CostLiquidMovement>('SELECT * FROM cost_liquid_movements ORDER BY created_at, id');
}

export function listLiquidValuationPositions(): LiquidPositionValuationRow[] {
  const positions = queryAll<{
    liquid_lot_id: number;
    lot_code: string;
    lot_type: string;
    tank_id: number;
    tank_name: string;
    volume_litres: number;
    lpa: number;
  }>(
    `SELECT l.id AS liquid_lot_id, l.lot_code, l.lot_type, tk.id AS tank_id, tk.name AS tank_name,
      COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.volume_litres ELSE 0 END), 0) AS volume_litres,
      COALESCE(SUM(CASE WHEN t.destination_tank_id = tk.id AND t.destination_lot_id = l.id THEN t.lpa ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN t.source_tank_id = tk.id AND t.source_lot_id = l.id THEN t.lpa ELSE 0 END), 0) AS lpa
     FROM liq_lots l
     JOIN liq_transactions t ON t.source_lot_id = l.id OR t.destination_lot_id = l.id
     JOIN liq_tanks tk ON tk.id = t.source_tank_id OR tk.id = t.destination_tank_id
     WHERE tk.tracking_mode = 'LEDGER'
       AND ${TX_ACTIVE}
     GROUP BY l.id, tk.id
     HAVING volume_litres > 0.000001`,
  );

  return positions.map((p) => {
    const abv = p.volume_litres > 0 ? (p.lpa / p.volume_litres) * 100 : 0;
    const positionCost = getLiquidPositionCost(p.liquid_lot_id, p.tank_id);
    const lotEconomic = getLiquidLotEconomicCost(p.liquid_lot_id);
    const costPerL = p.volume_litres > 0 ? positionCost / p.volume_litres : null;
    const costPerLpa = p.lpa > 0 ? positionCost / p.lpa : null;
    const costStatus: CostStatus =
      lotEconomic > 0 && positionCost > 0 ? 'VALUED' : lotEconomic > 0 ? 'PARTIALLY_VALUED' : 'UNVALUED';
    const batchCode = queryOne<{ batch_code: string }>(
      `SELECT b.batch_code FROM prod_batches b
       JOIN cost_liquid_lot_layers cl ON cl.production_batch_id = b.id
       WHERE cl.liquid_lot_id = ? LIMIT 1`,
      [p.liquid_lot_id],
    )?.batch_code ?? null;

    return {
      liquid_lot_id: p.liquid_lot_id,
      lot_code: p.lot_code,
      lot_type: p.lot_type,
      tank_id: p.tank_id,
      tank_name: p.tank_name,
      current_volume_litres: p.volume_litres,
      current_abv: abv,
      current_lpa: p.lpa,
      position_cost_kyd: positionCost,
      cost_per_litre_kyd: costPerL,
      cost_per_lpa_kyd: costPerLpa,
      cost_status: costStatus,
      lot_economic_cost_kyd: lotEconomic,
      source_batch_code: batchCode,
    };
  });
}

/** Rebuild transfer cost movements from immutable Phase 1D history (idempotent). */
export function rebuildLiquidTransferCostMovements(): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;

  const transfers = queryAll<{
    id: number;
    transaction_group_id: string;
    source_lot_id: number;
    source_tank_id: number;
    destination_tank_id: number;
    volume_litres: number;
    lpa: number;
  }>(
    `SELECT t_out.id, t_out.transaction_group_id, t_out.source_lot_id, t_out.source_tank_id,
            t_in.destination_tank_id, t_out.volume_litres, t_out.lpa
     FROM liq_transactions t_out
     JOIN liq_transactions t_in ON t_in.transaction_group_id = t_out.transaction_group_id
       AND t_in.transaction_type = 'Tank Transfer In'
     WHERE t_out.transaction_type = 'Tank Transfer Out'
       AND t_out.transaction_group_id IS NOT NULL
       AND t_out.reversal_of_transaction_id IS NULL
       AND t_out.id NOT IN (SELECT reversal_of_transaction_id FROM liq_transactions WHERE reversal_of_transaction_id IS NOT NULL)
     GROUP BY t_out.transaction_group_id`,
  );

  for (const tx of transfers) {
    if (!tx.transaction_group_id || tx.source_lot_id == null || tx.source_tank_id == null || tx.destination_tank_id == null) {
      skipped++;
      continue;
    }
    if (findTransferMovementByGroup(tx.transaction_group_id)) {
      skipped++;
      continue;
    }
    recordLiquidTransferCostMovement({
      outTransactionId: tx.id,
      transactionGroupId: tx.transaction_group_id,
      liquidLotId: tx.source_lot_id,
      sourceTankId: tx.source_tank_id,
      destinationTankId: tx.destination_tank_id,
      volumeLitres: tx.volume_litres,
      lpa: tx.lpa,
    });
    created++;
  }

  return { created, skipped };
}

export function getLiquidCostTraceability(liquidLotId: number): Array<{
  movementType: string;
  tankName: string | null;
  destinationTankName: string | null;
  volumeLitres: number;
  costKyd: number;
  transactionGroupId: string | null;
  createdAt: string;
}> {
  const rows = queryAll<{
    movement_type: string;
    source_tank_name: string | null;
    dest_tank_name: string | null;
    volume_litres: number;
    transferred_cost_kyd: number;
    transaction_group_id: string | null;
    created_at: string;
  }>(
    `SELECT m.movement_type, st.name AS source_tank_name, dt.name AS dest_tank_name,
            m.volume_litres, m.transferred_cost_kyd, m.transaction_group_id, m.created_at
     FROM cost_liquid_movements m
     LEFT JOIN liq_tanks st ON st.id = m.source_tank_id
     LEFT JOIN liq_tanks dt ON dt.id = m.destination_tank_id
     WHERE m.liquid_lot_id = ? AND m.status = 'Active'
     ORDER BY m.created_at, m.id`,
    [liquidLotId],
  );

  return rows.map((r) => ({
    movementType: r.movement_type,
    tankName: r.source_tank_name,
    destinationTankName: r.dest_tank_name,
    volumeLitres: r.volume_litres,
    costKyd: r.transferred_cost_kyd,
    transactionGroupId: r.transaction_group_id,
    createdAt: r.created_at,
  }));
}
