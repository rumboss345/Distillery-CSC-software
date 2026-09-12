import type pg from 'pg';
import { computeAbvFromLpa, computeLpa } from '../../../../shared/liquid-ledger/balance.js';
import { dilutionCalculation } from '../../../../shared/master-data/conversions.js';
import {
  validateAbv,
  validateCapacity,
  validatePositiveVolume,
  validateSufficientBalance,
} from '../../../../shared/liquid-ledger/validation.js';
import { computeLiquidLotVolume } from '../balance-engine.js';
import { assertEntityNotOnHold } from '../quality-hold-guard.js';
import { insertRow, nextBusinessCode, queryAll, queryOne } from '../pg-helpers.js';

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

async function computeTankBalanceFromLedger(client: pg.PoolClient, tankId: number) {
  const rows = await queryAll<{
    source_tank_id: number | null;
    destination_tank_id: number | null;
    volume_litres: number;
    lpa: number;
  }>(
    `SELECT source_tank_id, destination_tank_id, volume_litres, lpa
     FROM liq_transactions WHERE source_tank_id = $1 OR destination_tank_id = $1`,
    [tankId],
    client,
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

async function insertLiquidTx(
  client: pg.PoolClient,
  input: {
    transaction_type: string;
    transaction_timestamp?: string;
    source_tank_id?: number | null;
    destination_tank_id?: number | null;
    source_lot_id?: number | null;
    destination_lot_id?: number | null;
    volume_litres: number;
    abv: number;
    source_document_type?: string | null;
    source_document_id?: number | null;
    notes?: string;
    created_by?: string | null;
    transaction_group_id?: string | null;
  },
): Promise<number> {
  validatePositiveVolume(input.volume_litres, 'Transaction volume');
  validateAbv(input.abv);
  const lpa = computeLpa(input.volume_litres, input.abv);
  const code = await nextBusinessCode('liquidTransaction', 'liq_transactions', 'transaction_code', 4, client);
  return insertRow(
    `INSERT INTO liq_transactions (
      transaction_code, transaction_type, transaction_timestamp,
      source_tank_id, destination_tank_id, source_lot_id, destination_lot_id,
      volume_litres, abv, lpa, source_document_type, source_document_id,
      notes, created_by, created_at, transaction_group_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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

export async function createLiquidLot(
  client: pg.PoolClient,
  input: {
    lot_type: string;
    product_id?: number | null;
    bulk_spirit_id?: number | null;
    recipe_version_id?: number | null;
    description: string;
    initial_volume_litres: number;
    initial_abv: number;
    status: string;
    source_type: string;
    source_reference_id?: number | null;
    parent_lot_id?: number | null;
    notes?: string;
  },
): Promise<number> {
  validateAbv(input.initial_abv);
  validatePositiveVolume(input.initial_volume_litres, 'Initial volume');
  const lpa = computeLpa(input.initial_volume_litres, input.initial_abv);
  const code = await nextBusinessCode('lot', 'liq_lots', 'lot_code', 4, client);
  const ts = now();
  return insertRow(
    `INSERT INTO liq_lots (
      lot_code, lot_type, product_id, bulk_spirit_id, recipe_version_id, description,
      initial_volume_litres, initial_abv, initial_lpa, status, source_type, source_reference_id,
      parent_lot_id, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
    [
      code,
      input.lot_type,
      input.product_id ?? null,
      input.bulk_spirit_id ?? null,
      input.recipe_version_id ?? null,
      input.description,
      input.initial_volume_litres,
      input.initial_abv,
      lpa,
      input.status,
      input.source_type,
      input.source_reference_id ?? null,
      input.parent_lot_id ?? null,
      input.notes ?? '',
      ts,
    ],
    client,
  );
}

async function insertLotParent(
  client: pg.PoolClient,
  childLotId: number,
  parentLotId: number,
  contributedVolume: number,
  contributedLpa: number,
): Promise<void> {
  await insertRow(
    `INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa)
     VALUES ($1, $2, $3, $4)`,
    [childLotId, parentLotId, contributedVolume, contributedLpa],
    client,
  );
}

export async function createBlend(
  client: pg.PoolClient,
  input: {
    sourceTankId: number;
    destinationTankId: number;
    consumptions: Array<{ lotId: number; volumeLitres: number }>;
    outputLotType: string;
    outputDescription: string;
    productId?: number | null;
    recipeVersionId?: number | null;
    sourceDocumentType?: string | null;
    sourceDocumentId?: number | null;
    transactionGroupId?: string | null;
    notes?: string;
    createdBy?: string | null;
  },
): Promise<{ lotId: number; transactionIds: number[] }> {
  const sourceTank = await assertLedgerTank(client, input.sourceTankId);
  const destTank = await assertLedgerTank(client, input.destinationTankId);
  if (input.consumptions.length < 2) throw new Error('A blend requires at least two source lots.');

  for (const c of input.consumptions) {
    await assertEntityNotOnHold('liq_lot', c.lotId, `blend consumption for liquid lot ${c.lotId}`);
  }

  let totalVolume = 0;
  let totalLpa = 0;
  const txIds: number[] = [];
  const ts = now();
  const groupId =
    input.transactionGroupId ??
    (await nextBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id', 4, client));

  for (const c of input.consumptions) {
    validatePositiveVolume(c.volumeLitres, 'Blend consumption volume');
    const inTank = await computeLiquidLotVolume(c.lotId, sourceTank.id);
    validateSufficientBalance(inTank.volumeLitres, c.volumeLitres, `Lot ${c.lotId}`);
    const abv = computeAbvFromLpa(inTank.volumeLitres, inTank.lpa);
    const lpa = inTank.volumeLitres > 0 ? inTank.lpa * (c.volumeLitres / inTank.volumeLitres) : 0;
    totalVolume += c.volumeLitres;
    totalLpa += lpa;
    txIds.push(
      await insertLiquidTx(client, {
        transaction_type: 'Blend Consumption',
        transaction_timestamp: ts,
        source_tank_id: sourceTank.id,
        source_lot_id: c.lotId,
        volume_litres: c.volumeLitres,
        abv,
        source_document_type: input.sourceDocumentType,
        source_document_id: input.sourceDocumentId,
        notes: input.notes ?? '',
        created_by: input.createdBy ?? null,
        transaction_group_id: groupId,
      }),
    );
  }

  const destBalance = await computeTankBalanceFromLedger(client, destTank.id);
  validateCapacity(destBalance.volumeLitres + totalVolume, destTank.capacity_litres);

  const outputAbv = computeAbvFromLpa(totalVolume, totalLpa);
  const lotId = await createLiquidLot(client, {
    lot_type: input.outputLotType,
    product_id: input.productId,
    recipe_version_id: input.recipeVersionId,
    description: input.outputDescription,
    initial_volume_litres: totalVolume,
    initial_abv: outputAbv,
    status: 'Active',
    source_type: 'Blend',
    notes: input.notes ?? '',
  });

  for (const c of input.consumptions) {
    const inTank = await computeLiquidLotVolume(c.lotId, sourceTank.id);
    const abv = computeAbvFromLpa(inTank.volumeLitres, inTank.lpa);
    await insertLotParent(client, lotId, c.lotId, c.volumeLitres, computeLpa(c.volumeLitres, abv));
  }

  txIds.push(
    await insertLiquidTx(client, {
      transaction_type: 'Blend Production',
      transaction_timestamp: ts,
      destination_tank_id: destTank.id,
      destination_lot_id: lotId,
      volume_litres: totalVolume,
      abv: outputAbv,
      source_document_type: input.sourceDocumentType,
      source_document_id: input.sourceDocumentId,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }),
  );

  return { lotId, transactionIds: txIds };
}

export async function proofDown(
  client: pg.PoolClient,
  input: {
    sourceTankId: number;
    sourceLotId: number;
    sourceVolumeLitres: number;
    sourceAbv: number;
    waterVolumeLitres: number;
    targetAbv: number;
    actualOutputVolumeLitres?: number;
    actualOutputAbv?: number;
    destinationTankId: number;
    productId?: number | null;
    recipeVersionId?: number | null;
    sourceDocumentType?: string | null;
    sourceDocumentId?: number | null;
    transactionGroupId?: string | null;
    notes?: string;
    createdBy?: string | null;
  },
): Promise<{ lotId: number; transactionIds: number[] }> {
  const sourceTank = await assertLedgerTank(client, input.sourceTankId);
  const destTank = await assertLedgerTank(client, input.destinationTankId);
  validateAbv(input.sourceAbv);
  validateAbv(input.targetAbv);
  validatePositiveVolume(input.sourceVolumeLitres, 'Source volume');
  validatePositiveVolume(input.waterVolumeLitres, 'Water volume');

  const theoretical = dilutionCalculation(input.sourceVolumeLitres, input.sourceAbv, input.targetAbv);
  const outputVolume = input.actualOutputVolumeLitres ?? theoretical.finalVolumeLitres;
  validatePositiveVolume(outputVolume, 'Output volume');
  const outputAbv = input.actualOutputAbv ?? input.targetAbv;
  validateAbv(outputAbv);

  const sourceLpa = computeLpa(input.sourceVolumeLitres, input.sourceAbv);
  const outputLpa = computeLpa(outputVolume, outputAbv);
  if (Math.abs(outputLpa - sourceLpa) > 0.5 && !(input.notes ?? '').trim()) {
    throw new Error('Actual output LPA differs from source LPA. Provide a note explaining the variance.');
  }

  const lotInTank = await computeLiquidLotVolume(input.sourceLotId, sourceTank.id);
  validateSufficientBalance(lotInTank.volumeLitres, input.sourceVolumeLitres, 'Source lot');

  const destBalance = await computeTankBalanceFromLedger(client, destTank.id);
  validateCapacity(destBalance.volumeLitres + outputVolume, destTank.capacity_litres);

  const ts = now();
  const groupId =
    input.transactionGroupId ??
    (await nextBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id', 4, client));
  const txIds: number[] = [];

  txIds.push(
    await insertLiquidTx(client, {
      transaction_type: 'Proof Down Consumption',
      transaction_timestamp: ts,
      source_tank_id: sourceTank.id,
      source_lot_id: input.sourceLotId,
      volume_litres: input.sourceVolumeLitres,
      abv: input.sourceAbv,
      source_document_type: input.sourceDocumentType,
      source_document_id: input.sourceDocumentId,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }),
  );

  const lotId = await createLiquidLot(client, {
    lot_type: 'Proofed Spirit',
    product_id: input.productId,
    recipe_version_id: input.recipeVersionId,
    description: 'Proof-down output',
    initial_volume_litres: outputVolume,
    initial_abv: outputAbv,
    status: 'Active',
    source_type: 'Proof Down',
    source_reference_id: input.sourceDocumentId ?? null,
    parent_lot_id: input.sourceLotId,
    notes: input.notes ?? '',
  });

  await insertLotParent(client, lotId, input.sourceLotId, input.sourceVolumeLitres, sourceLpa);

  txIds.push(
    await insertLiquidTx(client, {
      transaction_type: 'Proof Down Production',
      transaction_timestamp: ts,
      destination_tank_id: destTank.id,
      destination_lot_id: lotId,
      volume_litres: outputVolume,
      abv: outputAbv,
      source_document_type: input.sourceDocumentType,
      source_document_id: input.sourceDocumentId,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }),
  );

  return { lotId, transactionIds: txIds };
}

export async function postProcessLoss(
  client: pg.PoolClient,
  input: {
    tankId: number;
    lotId?: number | null;
    volumeLitres: number;
    abv: number;
    lossType: string;
    reason: string;
    sourceDocumentType?: string | null;
    sourceDocumentId?: number | null;
    transactionGroupId?: string | null;
    createdBy?: string | null;
  },
): Promise<number> {
  await assertLedgerTank(client, input.tankId);
  validatePositiveVolume(input.volumeLitres, 'Loss volume');
  validateAbv(input.abv);

  if (input.lotId != null) {
    const inTank = await computeLiquidLotVolume(input.lotId, input.tankId);
    validateSufficientBalance(inTank.volumeLitres, input.volumeLitres, 'Lot volume');
  }

  return insertLiquidTx(client, {
    transaction_type: 'Process Loss',
    source_tank_id: input.tankId,
    source_lot_id: input.lotId ?? null,
    volume_litres: input.volumeLitres,
    abv: input.abv,
    source_document_type: input.sourceDocumentType,
    source_document_id: input.sourceDocumentId,
    notes: `${input.lossType}: ${input.reason}`,
    created_by: input.createdBy ?? null,
    transaction_group_id: input.transactionGroupId ?? null,
  });
}
