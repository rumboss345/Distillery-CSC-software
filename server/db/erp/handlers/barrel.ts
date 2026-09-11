import type pg from 'pg';
import { BARREL_DOCUMENT_TYPES } from '../../../../shared/barrel-aging/constants.js';
import { computeLpa } from '../../../../shared/liquid-ledger/balance.js';
import {
  validateAbv,
  validateCapacity,
  validatePositiveVolume,
  validateSufficientBalance,
} from '../../../../shared/liquid-ledger/validation.js';
import { computeLiquidLotVolume } from '../balance-engine.js';
import {
  insertRow,
  nextBusinessCode,
  queryAll,
  queryOne,
  runQuery,
  withPgTransaction,
} from '../pg-helpers.js';
import { createLiquidLot } from './liquid-operations.js';
import { postLiquidTransaction } from './liquid.js';

const now = () => new Date().toISOString();

async function assertLedgerTank(client: pg.PoolClient, tankId: number) {
  const tank = await queryOne<{ tracking_mode: string; status: string; capacity_litres: number }>(
    'SELECT tracking_mode, status, capacity_litres FROM liq_tanks WHERE id = $1',
    [tankId],
    client,
  );
  if (!tank) throw new Error('Tank not found.');
  if (tank.tracking_mode !== 'LEDGER') throw new Error('This operation requires a LEDGER-managed tank.');
  if (tank.status !== 'Active') throw new Error('Tank is not active.');
  return tank;
}

async function getLatestObservation(client: pg.PoolClient, fillId: number) {
  return queryOne<{ id: number; volume_litres: number; abv: number; lpa: number; sequence_number: number }>(
    `SELECT id, volume_litres, abv, lpa, sequence_number FROM brl_observations
     WHERE fill_id = $1 ORDER BY sequence_number DESC, id DESC LIMIT 1`,
    [fillId],
    client,
  );
}

async function computeFillPosition(client: pg.PoolClient, fillId: number) {
  const fill = await queryOne<{ liquid_cost_kyd: number }>(
    'SELECT liquid_cost_kyd FROM brl_fills WHERE id = $1',
    [fillId],
    client,
  );
  if (!fill) throw new Error('Barrel fill not found.');
  const latest = await getLatestObservation(client, fillId);
  if (!latest) {
    return { volumeLitres: 0, abv: 0, lpa: 0, liquidCostKyd: fill.liquid_cost_kyd };
  }
  const angel = await queryOne<{ liquid_cost_after_kyd: number }>(
    'SELECT liquid_cost_after_kyd FROM brl_angel_share_events WHERE fill_id = $1 ORDER BY id DESC LIMIT 1',
    [fillId],
    client,
  );
  const liquidCostKyd = angel?.liquid_cost_after_kyd ?? fill.liquid_cost_kyd;
  return {
    volumeLitres: latest.volume_litres,
    abv: latest.abv,
    lpa: latest.lpa,
    liquidCostKyd,
  };
}

export async function listBarrels(filters?: { status?: string }) {
  let sql = `SELECT b.*, loc.name AS location_name
    FROM brl_barrels b
    LEFT JOIN md_storage_locations loc ON loc.id = b.location_id WHERE 1=1`;
  const params: unknown[] = [];
  if (filters?.status) {
    sql += ' AND b.status = $1';
    params.push(filters.status);
  }
  sql += ' ORDER BY b.barrel_code';
  return queryAll(sql, params);
}

export async function listFills(filters?: { barrelId?: number; status?: string }) {
  let sql = 'SELECT * FROM brl_fills WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.barrelId != null) {
    sql += ` AND barrel_id = $${idx++}`;
    params.push(filters.barrelId);
  }
  if (filters?.status) {
    sql += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  sql += ' ORDER BY fill_date DESC';
  return queryAll(sql, params);
}

export async function fillBarrel(input: {
  barrelId: number;
  sourceTankId: number;
  liquidLotId: number;
  volumeLitres: number;
  abv: number;
  fillDate?: string;
  notes?: string;
  createdBy?: string | null;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    const barrel = await queryOne<{ id: number; status: string; capacity_litres: number; fill_count: number }>(
      'SELECT id, status, capacity_litres, fill_count FROM brl_barrels WHERE id = $1',
      [input.barrelId],
      client,
    );
    if (!barrel) throw new Error('Barrel not found.');
    if (barrel.status !== 'Empty') throw new Error('Barrel must be empty before filling.');
    if (input.volumeLitres > barrel.capacity_litres + 0.0001) {
      throw new Error('Fill volume exceeds barrel capacity.');
    }

    const tank = await assertLedgerTank(client, input.sourceTankId);
    validateAbv(input.abv);
    validatePositiveVolume(input.volumeLitres, 'Fill volume');

    const lotInTank = await computeLiquidLotVolume(input.liquidLotId, tank.id);
    validateSufficientBalance(lotInTank.volumeLitres, input.volumeLitres, 'Source lot in tank');

    const lpa = computeLpa(input.volumeLitres, input.abv);
    const fillNumber = barrel.fill_count + 1;
    const fillCode = await nextBusinessCode('barrelFill', 'brl_fills', 'fill_code', 6, client);
    const groupId = await nextBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id', 4, client);
    const ts = now();

    const txId = await postLiquidTransaction({
      transaction_type: 'Barrel Fill Withdrawal',
      transaction_timestamp: input.fillDate || ts,
      source_tank_id: tank.id,
      source_lot_id: input.liquidLotId,
      volume_litres: input.volumeLitres,
      abv: input.abv,
      source_document_type: BARREL_DOCUMENT_TYPES.FILL,
      notes: input.notes ?? `Barrel fill ${fillCode}`,
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    const fillId = await insertRow(
      `INSERT INTO brl_fills (
        fill_code, barrel_id, liquid_lot_id, source_tank_id, fill_date, fill_number,
        initial_volume_litres, initial_abv, initial_lpa, liquid_cost_kyd, status,
        transaction_group_id, liquid_transaction_id, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'Active', $10, $11, $12, $13, $13)`,
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
      ],
      client,
    );

    await runQuery('UPDATE liq_transactions SET source_document_id = $1 WHERE id = $2', [fillId, txId], client);

    const obsCode = await nextBusinessCode('barrelObservation', 'brl_observations', 'observation_code', 6, client);
    await insertRow(
      `INSERT INTO brl_observations (
        observation_code, barrel_id, fill_id, observation_date, sequence_number,
        volume_litres, abv, lpa, is_fill_event, is_dump_event, notes, created_by, created_at
      ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, TRUE, FALSE, $8, $9, $10)`,
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
      client,
    );

    await runQuery(
      `UPDATE brl_barrels SET status = 'Aging', fill_count = $1, active_fill_id = $2, updated_at = $3 WHERE id = $4`,
      [fillNumber, fillId, ts, barrel.id],
      client,
    );

    return fillId;
  });
}

export async function dumpBarrel(input: {
  fillId: number;
  destinationTankId: number;
  volumeLitres?: number;
  abv?: number;
  dumpDate?: string;
  createAgedLot?: boolean;
  agedLotDescription?: string;
  notes?: string;
  createdBy?: string | null;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    const fill = await queryOne<{
      id: number;
      status: string;
      barrel_id: number;
      liquid_lot_id: number;
    }>('SELECT id, status, barrel_id, liquid_lot_id FROM brl_fills WHERE id = $1', [input.fillId], client);
    if (!fill) throw new Error('Barrel fill not found.');
    if (fill.status !== 'Active') throw new Error('Only active fills can be dumped.');

    const barrel = await queryOne<{ id: number; barrel_code: string }>(
      'SELECT id, barrel_code FROM brl_barrels WHERE id = $1',
      [fill.barrel_id],
      client,
    );
    if (!barrel) throw new Error('Barrel not found.');

    const position = await computeFillPosition(client, fill.id);
    if (position.volumeLitres <= 0) throw new Error('Barrel has no remaining liquid to dump.');

    const volumeLitres = input.volumeLitres ?? position.volumeLitres;
    const abv = input.abv ?? position.abv;
    validatePositiveVolume(volumeLitres, 'Dump volume');
    validateAbv(abv);
    if (volumeLitres > position.volumeLitres + 0.0001) {
      throw new Error('Dump volume exceeds current barrel volume.');
    }

    const destTank = await assertLedgerTank(client, input.destinationTankId);
    const destBal = await queryOne<{ vol: string }>(
      `SELECT
        COALESCE(SUM(CASE WHEN destination_tank_id = $1 THEN volume_litres ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_tank_id = $1 THEN volume_litres ELSE 0 END), 0) AS vol
       FROM liq_transactions`,
      [destTank.id],
      client,
    );
    validateCapacity(Number(destBal?.vol ?? 0) + volumeLitres, destTank.capacity_litres);

    const lpa = computeLpa(volumeLitres, abv);
    const ratio = position.volumeLitres > 0 ? volumeLitres / position.volumeLitres : 1;
    const dumpCost = position.liquidCostKyd * ratio;
    const sourceLot = await queryOne<{
      product_id: number | null;
      bulk_spirit_id: number | null;
      recipe_version_id: number | null;
    }>('SELECT product_id, bulk_spirit_id, recipe_version_id FROM liq_lots WHERE id = $1', [fill.liquid_lot_id], client);
    if (!sourceLot) throw new Error('Source liquid lot not found.');

    const ts = now();
    const groupId = await nextBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id', 4, client);
    const dumpCode = await nextBusinessCode('barrelDump', 'brl_dumps', 'dump_code', 6, client);

    let destinationLotId = fill.liquid_lot_id;
    if (input.createAgedLot !== false) {
      destinationLotId = await createLiquidLot(client, {
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
        notes: input.notes ?? '',
      });
      await insertRow(
        `INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa)
         VALUES ($1, $2, $3, $4)`,
        [destinationLotId, fill.liquid_lot_id, volumeLitres, lpa],
        client,
      );
    }

    const txId = await postLiquidTransaction({
      transaction_type: 'Barrel Dump Receipt',
      transaction_timestamp: input.dumpDate || ts,
      destination_tank_id: destTank.id,
      destination_lot_id: destinationLotId,
      volume_litres: volumeLitres,
      abv,
      source_document_type: BARREL_DOCUMENT_TYPES.DUMP,
      notes: input.notes ?? `Barrel dump ${dumpCode}`,
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    const dumpId = await insertRow(
      `INSERT INTO brl_dumps (
        dump_code, fill_id, barrel_id, destination_tank_id, destination_lot_id, dump_date,
        volume_litres, abv, lpa, liquid_cost_kyd, transaction_group_id, liquid_transaction_id,
        notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
      client,
    );

    await runQuery('UPDATE liq_transactions SET source_document_id = $1 WHERE id = $2', [dumpId, txId], client);

    const obsCode = await nextBusinessCode('barrelObservation', 'brl_observations', 'observation_code', 6, client);
    const previous = await getLatestObservation(client, fill.id);
    await insertRow(
      `INSERT INTO brl_observations (
        observation_code, barrel_id, fill_id, observation_date, sequence_number,
        volume_litres, abv, lpa, is_fill_event, is_dump_event, notes, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, 0, FALSE, TRUE, $7, $8, $9)`,
      [
        obsCode,
        barrel.id,
        fill.id,
        input.dumpDate || ts.slice(0, 10),
        (previous?.sequence_number ?? 0) + 1,
        abv,
        input.notes ?? 'Barrel dump',
        input.createdBy ?? null,
        ts,
      ],
      client,
    );

    const isFullDump = volumeLitres >= position.volumeLitres - 0.0001;
    if (isFullDump) {
      await runQuery(
        `UPDATE brl_fills SET status = 'Dumped', updated_at = $1 WHERE id = $2`,
        [ts, fill.id],
        client,
      );
      await runQuery(
        `UPDATE brl_barrels SET status = 'Empty', active_fill_id = NULL, updated_at = $1 WHERE id = $2`,
        [ts, barrel.id],
        client,
      );
    }

    return dumpId;
  });
}
