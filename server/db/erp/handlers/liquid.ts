import type pg from 'pg';
import { computeAbvFromLpa, computeLpa } from '../../../../shared/liquid-ledger/balance.js';
import {
  validateAbv,
  validateCapacity,
  validatePositiveVolume,
  validateSufficientBalance,
} from '../../../../shared/liquid-ledger/validation.js';
import { computeLiquidLotVolume } from '../balance-engine.js';
import { insertRow, nextBusinessCode, queryAll, queryOne, withPgTransaction } from '../pg-helpers.js';

const now = () => new Date().toISOString();

export interface LiqTransactionPostInput {
  transaction_type: string;
  transaction_timestamp?: string;
  source_tank_id?: number | null;
  destination_tank_id?: number | null;
  source_lot_id?: number | null;
  destination_lot_id?: number | null;
  volume_litres: number;
  abv: number;
  reason_code?: string | null;
  source_document_type?: string | null;
  source_document_id?: number | null;
  notes?: string;
  created_by?: string | null;
  transaction_group_id?: string | null;
}

export interface TransferLiquidInput {
  sourceTankId: number;
  destinationTankId: number;
  sourceLotId?: number | null;
  volumeLitres: number;
  notes?: string;
  createdBy?: string | null;
}

async function nextOperationGroupId(client: pg.PoolClient): Promise<string> {
  return nextBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id', 4, client);
}

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

async function computeTankBalanceFromLedger(tankId: number) {
  const rows = await queryAll<{
    source_tank_id: number | null;
    destination_tank_id: number | null;
    volume_litres: number;
    lpa: number;
  }>(
    `SELECT source_tank_id, destination_tank_id, volume_litres, lpa
     FROM liq_transactions
     WHERE source_tank_id = $1 OR destination_tank_id = $1`,
    [tankId],
  );
  let volume = 0;
  let lpa = 0;
  for (const tx of rows) {
    if (tx.destination_tank_id === tankId) {
      volume += tx.volume_litres;
      lpa += tx.lpa;
    }
    if (tx.source_tank_id === tankId) {
      volume -= tx.volume_litres;
      lpa -= tx.lpa;
    }
  }
  return { volumeLitres: Math.max(0, volume), lpa: volume > 0 ? Math.max(0, lpa) : 0 };
}

async function getTankLotComponents(tankId: number) {
  const lots = await queryAll<{ id: number; lot_code: string }>(
    'SELECT DISTINCT l.id, l.lot_code FROM liq_lots l',
  );
  const components: Array<{ lotId: number; lotCode: string; volumeLitres: number; lpa: number }> = [];
  for (const lot of lots) {
    const inTank = await computeLiquidLotVolume(lot.id, tankId);
    if (inTank.volumeLitres > 1e-9) {
      components.push({
        lotId: lot.id,
        lotCode: lot.lot_code,
        volumeLitres: inTank.volumeLitres,
        lpa: inTank.lpa,
      });
    }
  }
  return components.sort((a, b) => b.volumeLitres - a.volumeLitres);
}

async function insertTransaction(client: pg.PoolClient, input: LiqTransactionPostInput): Promise<number> {
  validatePositiveVolume(input.volume_litres, 'Transaction volume');
  validateAbv(input.abv);
  const lpa = computeLpa(input.volume_litres, input.abv);
  const code = await nextBusinessCode('liquidTransaction', 'liq_transactions', 'transaction_code', 4, client);
  return insertRow(
    `INSERT INTO liq_transactions (
      transaction_code, transaction_type, transaction_timestamp,
      source_tank_id, destination_tank_id, source_lot_id, destination_lot_id,
      volume_litres, abv, lpa, reason_code, source_document_type, source_document_id,
      notes, created_by, created_at, transaction_group_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      code,
      input.transaction_type,
      input.transaction_timestamp ?? now(),
      input.source_tank_id ?? null,
      input.destination_tank_id ?? null,
      input.source_lot_id ?? null,
      input.destination_lot_id ?? null,
      input.volume_litres,
      input.abv,
      lpa,
      input.reason_code ?? null,
      input.source_document_type ?? null,
      input.source_document_id ?? null,
      input.notes ?? '',
      input.created_by ?? null,
      now(),
      input.transaction_group_id ?? null,
    ],
    client,
  );
}

export async function postLiquidTransaction(input: LiqTransactionPostInput): Promise<number> {
  return withPgTransaction((client) => insertTransaction(client, input));
}

export async function transferLiquid(input: TransferLiquidInput): Promise<number> {
  return withPgTransaction(async (client) => {
    if (input.sourceTankId === input.destinationTankId) {
      throw new Error('Source and destination tanks must differ.');
    }

    const source = await assertLedgerTank(client, input.sourceTankId);
    const dest = await assertLedgerTank(client, input.destinationTankId);
    validatePositiveVolume(input.volumeLitres, 'Transfer volume');

    const sourceBalance = await computeTankBalanceFromLedger(source.id);
    validateSufficientBalance(sourceBalance.volumeLitres, input.volumeLitres, 'Source tank');

    const destBalance = await computeTankBalanceFromLedger(dest.id);
    validateCapacity(destBalance.volumeLitres + input.volumeLitres, dest.capacity_litres);

    let lotId = input.sourceLotId ?? null;
    if (lotId == null) {
      const components = await getTankLotComponents(source.id);
      if (components.length === 1) lotId = components[0].lotId;
      else if (components.length === 0) throw new Error('Source tank has no lot to transfer.');
      else throw new Error('Specify a source lot when the tank contains multiple lots.');
    }

    const lotInTank = await computeLiquidLotVolume(lotId, source.id);
    validateSufficientBalance(lotInTank.volumeLitres, input.volumeLitres, 'Source lot');
    const lotAbv = computeAbvFromLpa(lotInTank.volumeLitres, lotInTank.lpa);
    const transferLpa =
      lotInTank.volumeLitres > 0 ? lotInTank.lpa * (input.volumeLitres / lotInTank.volumeLitres) : 0;
    validateSufficientBalance(lotInTank.lpa, transferLpa, 'Source lot LPA');

    const ts = now();
    const groupId = await nextOperationGroupId(client);

    await insertTransaction(client, {
      transaction_type: 'Tank Transfer Out',
      transaction_timestamp: ts,
      source_tank_id: source.id,
      source_lot_id: lotId,
      volume_litres: input.volumeLitres,
      abv: lotAbv,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    return insertTransaction(client, {
      transaction_type: 'Tank Transfer In',
      transaction_timestamp: ts,
      destination_tank_id: dest.id,
      destination_lot_id: lotId,
      volume_litres: input.volumeLitres,
      abv: lotAbv,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });
  });
}
