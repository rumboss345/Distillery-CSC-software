/**
 * Phase 1J barrel aging & maturation ledger.
 * Liquid tracked via immutable observations; fill/dump integrated with Phase 1D liquid ledger.
 */
import { processLossCostConservation } from '../../shared/costing/liquid-cost';
import { BARREL_DOCUMENT_TYPES } from '../../shared/barrel-aging/constants';
import { computeLpa } from '../../shared/liquid-ledger/balance';
import { wouldCreateCircularGenealogy } from '../../shared/liquid-ledger/genealogy';
import {
  validateAbv,
  validateCapacity,
  validatePositiveVolume,
  validateSufficientBalance,
} from '../../shared/liquid-ledger/validation';
import { codePrefixForEntity, formatBusinessCode } from '../../shared/master-data/codes';
import type { CodeEntityType } from '../../shared/master-data/codes';
import type {
  BarrelFillPosition,
  BrlAngelShareEvent,
  BrlBarrel,
  BrlBarrelSaveInput,
  BrlDump,
  BrlFill,
  BrlObservation,
  CreateBarrelFillInput,
  DumpBarrelInput,
  RecordBarrelObservationInput,
} from '../types/barrel-aging';
import {
  getLiquidPositionCostForVolume,
  recordBarrelDumpCostMovement,
  recordBarrelFillCostMovement,
} from './liquid-cost-movement-queries';
import {
  createLot,
  getLot,
  getLotParents,
  getLotVolumeInTank,
  getTank,
  postTransaction,
  reverseTransaction,
} from './liquid-ledger-queries';
import type { PermissionContext } from '../types/administration';
import { guardSensitiveAction } from './administration-queries';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';

const now = () => new Date().toISOString();
const CODE_PAD = 6;

function nextBarrelBusinessCode(entityType: CodeEntityType, table: string, codeColumn: string): string {
  const prefix = codePrefixForEntity(entityType);
  const row = queryOne<{ last_number: number }>(
    'SELECT last_number FROM md_code_sequences WHERE entity_type = ?',
    [entityType],
  );
  let next = (row?.last_number ?? 0) + 1;
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = formatBusinessCode(prefix, next, CODE_PAD);
    const clash = queryOne<{ id: number }>(`SELECT id FROM ${table} WHERE ${codeColumn} = ?`, [code]);
    if (!clash) {
      if (row) {
        runQuery('UPDATE md_code_sequences SET last_number = ? WHERE entity_type = ?', [next, entityType]);
      } else {
        insertRow('INSERT INTO md_code_sequences (entity_type, last_number) VALUES (?, ?)', [entityType, next]);
      }
      return code;
    }
    next += 1;
  }
  throw new Error('Could not generate a unique business code.');
}

function nextOperationGroupId(): string {
  return nextBarrelBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id');
}

function assertLedgerTank(tankId: number): { id: number; capacity_litres: number; tracking_mode: string; status: string } {
  const tank = getTank(tankId);
  if (!tank) throw new Error('Tank not found.');
  if (tank.tracking_mode !== 'LEDGER') throw new Error('This operation requires a LEDGER-managed tank.');
  if (tank.status !== 'Active') throw new Error('Tank is not active.');
  return tank;
}

function getBarrelOrThrow(barrelId: number): BrlBarrel {
  const barrel = getBarrel(barrelId);
  if (!barrel) throw new Error('Barrel not found.');
  return barrel;
}

function getFillOrThrow(fillId: number): BrlFill {
  const fill = getFill(fillId);
  if (!fill) throw new Error('Barrel fill not found.');
  return fill;
}

function getLatestObservation(fillId: number): BrlObservation | null {
  return queryOne<BrlObservation>(
    `SELECT * FROM brl_observations WHERE fill_id = ? ORDER BY sequence_number DESC, id DESC LIMIT 1`,
    [fillId],
  );
}

function linkLotParent(childLotId: number, parentLotId: number, contributedVolume: number, contributedLpa: number, transactionId?: number | null): void {
  const ancestors: number[] = [];
  const queue = [parentLotId];
  while (queue.length) {
    const current = queue.shift()!;
    if (ancestors.includes(current)) continue;
    ancestors.push(current);
    for (const p of getLotParents(current)) {
      queue.push(p.parent_lot_id);
    }
  }
  if (wouldCreateCircularGenealogy(childLotId, parentLotId, ancestors.map((id) => ({ parent_lot_id: id })))) {
    throw new Error('Circular lot genealogy is not allowed.');
  }
  insertRow(
    `INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa, transaction_id)
     VALUES (?, ?, ?, ?, ?)`,
    [childLotId, parentLotId, contributedVolume, contributedLpa, transactionId ?? null],
  );
}

export function getBarrelDashboardSummary(): {
  totalBarrels: number;
  agingBarrels: number;
  emptyBarrels: number;
  totalAgingVolumeLitres: number;
  totalBarrelAssetCostKyd: number;
  totalLiquidCostKyd: number;
} {
  const totalBarrels = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM brl_barrels')?.count ?? 0;
  const agingBarrels = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM brl_barrels WHERE status = 'Aging'",
  )?.count ?? 0;
  const emptyBarrels = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM brl_barrels WHERE status = 'Empty'",
  )?.count ?? 0;
  const assetCost = queryOne<{ total: number }>(
    'SELECT COALESCE(SUM(purchase_cost_kyd), 0) AS total FROM brl_barrels',
  )?.total ?? 0;

  const activeFills = queryAll<{ id: number }>("SELECT id FROM brl_fills WHERE status = 'Active'");
  let totalVolume = 0;
  let totalLiquidCost = 0;
  for (const fill of activeFills) {
    const pos = computeFillPosition(fill.id);
    totalVolume += pos.volumeLitres;
    totalLiquidCost += pos.liquidCostKyd;
  }

  return {
    totalBarrels,
    agingBarrels,
    emptyBarrels,
    totalAgingVolumeLitres: totalVolume,
    totalBarrelAssetCostKyd: assetCost,
    totalLiquidCostKyd: totalLiquidCost,
  };
}

export function listBarrels(filters?: { status?: string }): BrlBarrel[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.status) {
    clauses.push('b.status = ?');
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<BrlBarrel>(
    `SELECT b.*, loc.name AS location_name
     FROM brl_barrels b
     LEFT JOIN md_storage_locations loc ON loc.id = b.location_id
     ${where}
     ORDER BY b.barrel_code`,
    params as (string | number)[],
  );
}

export function getBarrel(id: number): BrlBarrel | null {
  return queryOne<BrlBarrel>(
    `SELECT b.*, loc.name AS location_name
     FROM brl_barrels b
     LEFT JOIN md_storage_locations loc ON loc.id = b.location_id
     WHERE b.id = ?`,
    [id],
  );
}

export function createBarrel(input: BrlBarrelSaveInput): number {
  validatePositiveVolume(input.capacity_litres, 'Barrel capacity');
  const code = nextBarrelBusinessCode('barrel', 'brl_barrels', 'barrel_code');
  const ts = now();
  return insertRow(
    `INSERT INTO brl_barrels (
      barrel_code, cooperage, wood_type, capacity_litres, fill_count, location_id,
      purchase_cost_kyd, barcode, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'Empty', ?, ?, ?)`,
    [
      code,
      input.cooperage.trim(),
      input.wood_type.trim(),
      input.capacity_litres,
      input.location_id ?? null,
      input.purchase_cost_kyd ?? 0,
      input.barcode?.trim() ?? '',
      input.notes?.trim() ?? '',
      ts,
      ts,
    ],
  );
}

export function updateBarrel(id: number, input: BrlBarrelSaveInput): void {
  const barrel = getBarrelOrThrow(id);
  if (barrel.status === 'Aging') {
    throw new Error('Cannot edit barrel master while a fill is active.');
  }
  validatePositiveVolume(input.capacity_litres, 'Barrel capacity');
  runQuery(
    `UPDATE brl_barrels SET cooperage=?, wood_type=?, capacity_litres=?, location_id=?,
      purchase_cost_kyd=?, barcode=?, notes=?, updated_at=? WHERE id=?`,
    [
      input.cooperage.trim(),
      input.wood_type.trim(),
      input.capacity_litres,
      input.location_id ?? null,
      input.purchase_cost_kyd ?? 0,
      input.barcode?.trim() ?? '',
      input.notes?.trim() ?? '',
      now(),
      id,
    ],
  );
}

export function listFills(filters?: { barrelId?: number; status?: string }): BrlFill[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.barrelId != null) {
    clauses.push('f.barrel_id = ?');
    params.push(filters.barrelId);
  }
  if (filters?.status) {
    clauses.push('f.status = ?');
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<BrlFill>(
    `SELECT f.*, b.barrel_code, l.lot_code, t.name AS source_tank_name
     FROM brl_fills f
     JOIN brl_barrels b ON b.id = f.barrel_id
     JOIN liq_lots l ON l.id = f.liquid_lot_id
     JOIN liq_tanks t ON t.id = f.source_tank_id
     ${where}
     ORDER BY f.fill_date DESC, f.id DESC`,
    params as (string | number)[],
  );
}

export function getFill(id: number): BrlFill | null {
  return queryOne<BrlFill>(
    `SELECT f.*, b.barrel_code, l.lot_code, t.name AS source_tank_name
     FROM brl_fills f
     JOIN brl_barrels b ON b.id = f.barrel_id
     JOIN liq_lots l ON l.id = f.liquid_lot_id
     JOIN liq_tanks t ON t.id = f.source_tank_id
     WHERE f.id = ?`,
    [id],
  );
}

export function listObservations(fillId: number): BrlObservation[] {
  return queryAll<BrlObservation>(
    'SELECT * FROM brl_observations WHERE fill_id = ? ORDER BY sequence_number ASC, id ASC',
    [fillId],
  );
}

export function listAngelShareEvents(fillId: number): BrlAngelShareEvent[] {
  return queryAll<BrlAngelShareEvent>(
    'SELECT * FROM brl_angel_share_events WHERE fill_id = ? ORDER BY id ASC',
    [fillId],
  );
}

export function listDumps(filters?: { barrelId?: number }): BrlDump[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.barrelId != null) {
    clauses.push('d.barrel_id = ?');
    params.push(filters.barrelId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<BrlDump>(
    `SELECT d.*, b.barrel_code, t.name AS destination_tank_name, l.lot_code AS destination_lot_code
     FROM brl_dumps d
     JOIN brl_barrels b ON b.id = d.barrel_id
     JOIN liq_tanks t ON t.id = d.destination_tank_id
     JOIN liq_lots l ON l.id = d.destination_lot_id
     ${where}
     ORDER BY d.dump_date DESC, d.id DESC`,
    params as (string | number)[],
  );
}

export function computeFillPosition(fillId: number): BarrelFillPosition {
  const fill = getFillOrThrow(fillId);
  const latest = getLatestObservation(fillId);
  if (!latest) {
    return {
      fillId,
      volumeLitres: 0,
      abv: 0,
      lpa: 0,
      liquidCostKyd: fill.liquid_cost_kyd,
      costPerLitreKyd: null,
    };
  }

  const angelRows = queryAll<{ liquid_cost_after_kyd: number }>(
    'SELECT liquid_cost_after_kyd FROM brl_angel_share_events WHERE fill_id = ? ORDER BY id DESC LIMIT 1',
    [fillId],
  );
  const liquidCostKyd = angelRows[0]?.liquid_cost_after_kyd ?? fill.liquid_cost_kyd;

  return {
    fillId,
    volumeLitres: latest.volume_litres,
    abv: latest.abv,
    lpa: latest.lpa,
    liquidCostKyd,
    costPerLitreKyd: latest.volume_litres > 0 ? liquidCostKyd / latest.volume_litres : null,
  };
}

export function fillBarrel(input: CreateBarrelFillInput): number {
  return withDatabaseTransaction(() => {
    const barrel = getBarrelOrThrow(input.barrelId);
    if (barrel.status !== 'Empty') {
      throw new Error('Barrel must be empty before filling.');
    }
    if (input.volumeLitres > barrel.capacity_litres + 0.0001) {
      throw new Error('Fill volume exceeds barrel capacity.');
    }

    const tank = assertLedgerTank(input.sourceTankId);
    validateAbv(input.abv);
    validatePositiveVolume(input.volumeLitres, 'Fill volume');

    const lotInTank = getLotVolumeInTank(input.liquidLotId, tank.id);
    validateSufficientBalance(lotInTank.volumeLitres, input.volumeLitres, 'Source lot in tank');

    const lot = getLot(input.liquidLotId);
    if (!lot) throw new Error('Liquid lot not found.');

    const lpa = computeLpa(input.volumeLitres, input.abv);
    const fillNumber = barrel.fill_count + 1;
    const fillCode = nextBarrelBusinessCode('barrelFill', 'brl_fills', 'fill_code');
    const groupId = nextOperationGroupId();
    const ts = now();
    const liquidCost = getLiquidPositionCostForVolume(
      input.liquidLotId,
      tank.id,
      input.volumeLitres,
    );

    const txId = postTransaction({
      transaction_type: 'Barrel Fill Withdrawal',
      transaction_timestamp: input.fillDate || ts,
      source_tank_id: tank.id,
      destination_tank_id: null,
      source_lot_id: input.liquidLotId,
      destination_lot_id: null,
      volume_litres: input.volumeLitres,
      abv: input.abv,
      reason_code: null,
      source_document_type: BARREL_DOCUMENT_TYPES.FILL,
      source_document_id: null,
      notes: input.notes ?? `Barrel fill ${fillCode}`,
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    const fillId = insertRow(
      `INSERT INTO brl_fills (
        fill_code, barrel_id, liquid_lot_id, source_tank_id, fill_date, fill_number,
        initial_volume_litres, initial_abv, initial_lpa, liquid_cost_kyd, status,
        transaction_group_id, liquid_transaction_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Active', ?, ?, ?, ?, ?)`,
      [
        fillCode,
        barrel.id,
        input.liquidLotId,
        tank.id,
        input.fillDate || ts.slice(0, 10),
        fillNumber,
        input.volumeLitres,
        input.abv,
        lpa,
        groupId,
        txId,
        input.notes ?? '',
        ts,
        ts,
      ],
    );

    runQuery(
      'UPDATE liq_transactions SET source_document_id = ? WHERE id = ?',
      [fillId, txId],
    );

    recordBarrelFillCostMovement({
      liquidLotId: input.liquidLotId,
      sourceTankId: tank.id,
      volumeLitres: input.volumeLitres,
      lpa,
      fillId,
      liquidTransactionId: txId,
      transactionGroupId: groupId,
      costKyd: liquidCost,
    });

    runQuery('UPDATE brl_fills SET liquid_cost_kyd = ? WHERE id = ?', [liquidCost, fillId]);

    const obsCode = nextBarrelBusinessCode('barrelObservation', 'brl_observations', 'observation_code');
    insertRow(
      `INSERT INTO brl_observations (
        observation_code, barrel_id, fill_id, observation_date, sequence_number,
        volume_litres, abv, lpa, is_fill_event, is_dump_event, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 1, 0, ?, ?, ?)`,
      [
        obsCode,
        barrel.id,
        fillId,
        input.fillDate || ts.slice(0, 10),
        input.volumeLitres,
        input.abv,
        lpa,
        input.notes ?? 'Initial fill observation',
        input.createdBy ?? null,
        ts,
      ],
    );

    runQuery(
      `UPDATE brl_barrels SET status='Aging', fill_count=?, active_fill_id=?, updated_at=? WHERE id=?`,
      [fillNumber, fillId, ts, barrel.id],
    );

    return fillId;
  });
}

export function recordObservation(input: RecordBarrelObservationInput): number {
  return withDatabaseTransaction(() => {
    const fill = getFillOrThrow(input.fillId);
    if (fill.status !== 'Active') {
      throw new Error('Observations can only be recorded on active fills.');
    }

    validateAbv(input.abv);
    validatePositiveVolume(input.volumeLitres, 'Observation volume');

    const previous = getLatestObservation(fill.id);
    if (previous && input.volumeLitres > previous.volume_litres + 0.0001) {
      throw new Error('Observation volume cannot exceed the previous reading.');
    }

    const lpa = computeLpa(input.volumeLitres, input.abv);
    const seq = (previous?.sequence_number ?? 0) + 1;
    const ts = now();
    const obsCode = nextBarrelBusinessCode('barrelObservation', 'brl_observations', 'observation_code');

    const obsId = insertRow(
      `INSERT INTO brl_observations (
        observation_code, barrel_id, fill_id, observation_date, sequence_number,
        volume_litres, abv, lpa, is_fill_event, is_dump_event, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        obsCode,
        fill.barrel_id,
        fill.id,
        input.observationDate || ts.slice(0, 10),
        seq,
        input.volumeLitres,
        input.abv,
        lpa,
        input.notes ?? '',
        input.createdBy ?? null,
        ts,
      ],
    );

    if (previous && input.volumeLitres < previous.volume_litres - 0.0001) {
      const volumeLost = previous.volume_litres - input.volumeLitres;
      const lpaLost = previous.lpa - lpa;
      const priorCost = queryOne<{ liquid_cost_after_kyd: number }>(
        'SELECT liquid_cost_after_kyd FROM brl_angel_share_events WHERE fill_id = ? ORDER BY id DESC LIMIT 1',
        [fill.id],
      )?.liquid_cost_after_kyd ?? fill.liquid_cost_kyd;
      const conserved = processLossCostConservation(priorCost, previous.volume_litres, input.volumeLitres);

      insertRow(
        `INSERT INTO brl_angel_share_events (
          fill_id, from_observation_id, to_observation_id, volume_lost_litres, lpa_lost,
          liquid_cost_before_kyd, liquid_cost_after_kyd, cost_per_litre_after, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fill.id,
          previous.id,
          obsId,
          volumeLost,
          lpaLost,
          priorCost,
          conserved.outputTotalCostKyd,
          conserved.costPerLitreKyd,
          `Angel's share: ${volumeLost.toFixed(3)} L lost`,
          ts,
        ],
      );
    }

    return obsId;
  });
}

export function dumpBarrel(input: DumpBarrelInput): number {
  return withDatabaseTransaction(() => {
    const fill = getFillOrThrow(input.fillId);
    if (fill.status !== 'Active') {
      throw new Error('Only active fills can be dumped.');
    }

    const barrel = getBarrelOrThrow(fill.barrel_id);
    const position = computeFillPosition(fill.id);
    if (position.volumeLitres <= 0) {
      throw new Error('Barrel has no remaining liquid to dump.');
    }

    const volumeLitres = input.volumeLitres ?? position.volumeLitres;
    const abv = input.abv ?? position.abv;
    validatePositiveVolume(volumeLitres, 'Dump volume');
    validateAbv(abv);
    if (volumeLitres > position.volumeLitres + 0.0001) {
      throw new Error('Dump volume exceeds current barrel volume.');
    }

    const destTank = assertLedgerTank(input.destinationTankId);
    const destBalance = queryOne<{ vol: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN destination_tank_id = ? THEN volume_litres ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_tank_id = ? THEN volume_litres ELSE 0 END), 0) AS vol
       FROM liq_transactions
       WHERE reversal_of_transaction_id IS NULL
         AND id NOT IN (SELECT reversal_of_transaction_id FROM liq_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
      [destTank.id, destTank.id],
    )?.vol ?? 0;
    validateCapacity(destBalance + volumeLitres, destTank.capacity_litres);

    const lpa = computeLpa(volumeLitres, abv);
    const ratio = position.volumeLitres > 0 ? volumeLitres / position.volumeLitres : 1;
    const dumpCost = position.liquidCostKyd * ratio;
    const sourceLot = getLot(fill.liquid_lot_id)!;
    const ts = now();
    const groupId = nextOperationGroupId();
    const dumpCode = nextBarrelBusinessCode('barrelDump', 'brl_dumps', 'dump_code');

    let destinationLotId = fill.liquid_lot_id;
    if (input.createAgedLot !== false) {
      destinationLotId = createLot({
        lot_type: 'Finished Spirit',
        product_id: sourceLot.product_id,
        bulk_spirit_id: sourceLot.bulk_spirit_id,
        recipe_version_id: sourceLot.recipe_version_id,
        description: input.agedLotDescription ?? `Barrel-aged from ${barrel.barrel_code}`,
        initial_volume_litres: volumeLitres,
        initial_abv: abv,
        status: 'Active',
        source_type: 'Barrel Dump',
        source_reference_id: fill.id,
        parent_lot_id: null,
        notes: input.notes ?? '',
      });
      linkLotParent(destinationLotId, fill.liquid_lot_id, volumeLitres, lpa);
    }

    const txId = postTransaction({
      transaction_type: 'Barrel Dump Receipt',
      transaction_timestamp: input.dumpDate || ts,
      source_tank_id: null,
      destination_tank_id: destTank.id,
      source_lot_id: null,
      destination_lot_id: destinationLotId,
      volume_litres: volumeLitres,
      abv,
      reason_code: null,
      source_document_type: BARREL_DOCUMENT_TYPES.DUMP,
      source_document_id: null,
      notes: input.notes ?? `Barrel dump ${dumpCode}`,
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    const dumpId = insertRow(
      `INSERT INTO brl_dumps (
        dump_code, fill_id, barrel_id, destination_tank_id, destination_lot_id, dump_date,
        volume_litres, abv, lpa, liquid_cost_kyd, transaction_group_id, liquid_transaction_id,
        observation_id, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        dumpCode,
        fill.id,
        barrel.id,
        destTank.id,
        destinationLotId,
        input.dumpDate || ts.slice(0, 10),
        volumeLitres,
        abv,
        lpa,
        dumpCost,
        groupId,
        txId,
        input.notes ?? '',
        ts,
      ],
    );

    runQuery('UPDATE liq_transactions SET source_document_id = ? WHERE id = ?', [dumpId, txId]);

    recordBarrelDumpCostMovement({
      liquidLotId: destinationLotId,
      destinationTankId: destTank.id,
      volumeLitres,
      lpa,
      dumpId,
      liquidTransactionId: txId,
      transactionGroupId: groupId,
      costKyd: dumpCost,
    });

    const obsCode = nextBarrelBusinessCode('barrelObservation', 'brl_observations', 'observation_code');
    const previous = getLatestObservation(fill.id);
    const obsId = insertRow(
      `INSERT INTO brl_observations (
        observation_code, barrel_id, fill_id, observation_date, sequence_number,
        volume_litres, abv, lpa, is_fill_event, is_dump_event, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, 1, ?, ?, ?)`,
      [
        obsCode,
        barrel.id,
        fill.id,
        input.dumpDate || ts.slice(0, 10),
        (previous?.sequence_number ?? 0) + 1,
        abv,
        input.notes ?? 'Barrel dump — empty',
        input.createdBy ?? null,
        ts,
      ],
    );

    runQuery('UPDATE brl_dumps SET observation_id = ? WHERE id = ?', [obsId, dumpId]);
    runQuery(
      `UPDATE brl_fills SET status='Dumped', updated_at=? WHERE id=?`,
      [ts, fill.id],
    );
    runQuery(
      `UPDATE brl_barrels SET status='Empty', active_fill_id=NULL, updated_at=? WHERE id=?`,
      [ts, barrel.id],
    );

    return dumpId;
  });
}

export function reverseBarrelFill(
  fillId: number,
  createdBy?: string | null,
  permissionCtx?: PermissionContext,
): void {
  withDatabaseTransaction(() => {
    const fill = getFillOrThrow(fillId);
    if (fill.status !== 'Active') {
      throw new Error('Only active fills can be reversed.');
    }

    guardSensitiveAction({
      action: 'REVERSE_BARREL_FILL',
      permissionCtx,
      entityType: 'brl_fill',
      entityId: fillId,
      beforeState: { status: fill.status, fill_code: fill.fill_code },
      afterState: { status: 'Reversed' },
    });

    const obsCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM brl_observations WHERE fill_id = ?',
      [fillId],
    )?.count ?? 0;
    if (obsCount > 1) {
      throw new Error('Cannot reverse fill after additional observations have been recorded.');
    }

    const angelCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM brl_angel_share_events WHERE fill_id = ?',
      [fillId],
    )?.count ?? 0;
    if (angelCount > 0) {
      throw new Error('Cannot reverse fill after angel\'s share events.');
    }

    if (fill.liquid_transaction_id) {
      reverseTransaction(fill.liquid_transaction_id, createdBy);
    }

    runQuery(
      `UPDATE brl_fills SET status='Reversed', updated_at=? WHERE id=?`,
      [now(), fillId],
    );
    runQuery(
      `UPDATE brl_barrels SET status='Empty', active_fill_id=NULL, fill_count=fill_count-1, updated_at=? WHERE id=?`,
      [now(), fill.barrel_id],
    );
  });
}

export function getBarrelGenealogy(fillId: number): Array<{ childLotCode: string; parentLotCode: string; contributedVolumeLitres: number }> {
  getFillOrThrow(fillId);
  const dump = queryOne<{ destination_lot_id: number }>(
    'SELECT destination_lot_id FROM brl_dumps WHERE fill_id = ? ORDER BY id DESC LIMIT 1',
    [fillId],
  );
  if (!dump) return [];

  const parents = getLotParents(dump.destination_lot_id);
  return parents.map((p) => ({
    childLotCode: getLot(dump.destination_lot_id)?.lot_code ?? String(dump.destination_lot_id),
    parentLotCode: getLot(p.parent_lot_id)?.lot_code ?? String(p.parent_lot_id),
    contributedVolumeLitres: p.contributed_volume_litres,
  }));
}
