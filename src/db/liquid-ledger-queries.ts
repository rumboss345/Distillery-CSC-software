import {
  aggregateLotBalance,
  aggregateLotInTank,
  aggregateTankBalance,
} from '../../shared/liquid-ledger/balance-engine';
import {
  balanceFromVolumeLpa,
  capacityUtilizationPercent,
  computeAbvFromLpa,
  computeLpa,
  type BalanceSnapshot,
} from '../../shared/liquid-ledger/balance';
import { formatBusinessCode, codePrefixForEntity } from '../../shared/master-data/codes';
import { wouldCreateCircularGenealogy } from '../../shared/liquid-ledger/genealogy';
import {
  DEFAULT_LOT_TYPES,
  DEFAULT_TANK_TYPES,
  LIQ_LOOKUP_TYPES,
} from '../../shared/liquid-ledger/constants';
import {
  validateAbv,
  validateCapacity,
  validateLotType,
  validateNonNegativeVolume,
  validatePositiveVolume,
  validateReasonCode,
  validateSufficientBalance,
  validateTankName,
  validateTrackingMode,
} from '../../shared/liquid-ledger/validation';
import { dilutionCalculation } from '../../shared/master-data/conversions';
import type {
  BlendInput,
  BulkSpiritReceiptInput,
  LiqLot,
  LiqLotParent,
  LiqLotSaveInput,
  LiqReconciliation,
  LiqTank,
  LiqTankSaveInput,
  LiqTransaction,
  LiqTransactionPostInput,
  LotBalance,
  OpeningBalanceInput,
  ProofDownInput,
  ReconcileTankInput,
  TankBalance,
  TankLotComponent,
  TransferLiquidInput,
} from '../types/liquid-ledger';
import { getDb, insertRow, queryAll, queryOne, runQuery, scheduleSave } from './database';
import { addLookupValue, getLookupNames, nextBusinessCode } from './master-data-queries';
import { getHoldingTankContents, getHoldingTanks } from './queries';

const now = () => new Date().toISOString();

type LedgerTxRow = {
  source_tank_id: number | null;
  destination_tank_id: number | null;
  source_lot_id: number | null;
  destination_lot_id: number | null;
  volume_litres: number;
  lpa: number;
};

function loadAllLedgerTransactions(): LedgerTxRow[] {
  return queryAll<LedgerTxRow>(
    `SELECT source_tank_id, destination_tank_id, source_lot_id, destination_lot_id, volume_litres, lpa
     FROM liq_transactions`,
  );
}

function nextOperationGroupId(): string {
  const seqType = 'operationGroup' as const;
  const prefix = codePrefixForEntity(seqType);
  const row = queryOne<{ last_number: number }>(
    'SELECT last_number FROM md_code_sequences WHERE entity_type = ?',
    [seqType],
  );
  const next = (row?.last_number ?? 0) + 1;
  if (row) {
    runQuery('UPDATE md_code_sequences SET last_number = ? WHERE entity_type = ?', [next, seqType]);
  } else {
    insertRow('INSERT INTO md_code_sequences (entity_type, last_number) VALUES (?, ?)', [seqType, next]);
  }
  return formatBusinessCode(prefix, next);
}

function assertFloorEquipmentLinkable(floorEquipmentId: number | null, excludeTankId?: number): void {
  if (floorEquipmentId == null) return;
  const equipment = queryOne<{ id: number; equipment_type: string; tracking_mode?: string }>(
    'SELECT id, equipment_type, tracking_mode FROM floor_equipment WHERE id = ?',
    [floorEquipmentId],
  );
  if (!equipment) throw new Error('Linked floor equipment not found.');
  if (equipment.equipment_type !== 'holding_tank') {
    throw new Error('Only holding tank floor equipment can link to a ledger tank.');
  }
  const existing = queryOne<{ id: number }>(
    `SELECT id FROM liq_tanks WHERE floor_equipment_id = ?${excludeTankId != null ? ' AND id != ?' : ''}`,
    excludeTankId != null ? [floorEquipmentId, excludeTankId] : [floorEquipmentId],
  );
  if (existing) {
    throw new Error('This floor equipment tank is already linked to a ledger tank.');
  }
}

function assertNoOpeningBalanceConflict(tankId: number): void {
  const count = queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM liq_transactions WHERE source_tank_id = ? OR destination_tank_id = ?',
    [tankId, tankId],
  )?.count ?? 0;
  if (count > 0) {
    throw new Error(
      'Opening Balance cannot be posted: this tank already has ledger activity. Use adjustments instead.',
    );
  }
}

function assertLedgerTank(tankId: number): LiqTank {
  const tank = getTank(tankId);
  if (!tank) throw new Error('Tank not found.');
  if (tank.tracking_mode !== 'LEDGER') {
    throw new Error('This operation requires a LEDGER-managed tank.');
  }
  if (tank.status !== 'Active') throw new Error('Tank is not active.');
  return tank;
}

function computeTankBalanceFromLedger(tankId: number): { volumeLitres: number; lpa: number } {
  const raw = aggregateTankBalance(tankId, loadAllLedgerTransactions());
  return {
    volumeLitres: Math.max(0, raw.volumeLitres),
    lpa: raw.volumeLitres > 0 ? Math.max(0, raw.lpa) : 0,
  };
}

function computeLotBalanceFromLedger(lotId: number): { volumeLitres: number; lpa: number } {
  const raw = aggregateLotBalance(lotId, loadAllLedgerTransactions());
  return {
    volumeLitres: Math.max(0, raw.volumeLitres),
    lpa: raw.volumeLitres > 0 ? Math.max(0, raw.lpa) : 0,
  };
}

function computeLotVolumeInTank(lotId: number, tankId: number): { volumeLitres: number; lpa: number } {
  const raw = aggregateLotInTank(lotId, tankId, loadAllLedgerTransactions());
  return {
    volumeLitres: Math.max(0, raw.volumeLitres),
    lpa: raw.volumeLitres > 0 ? Math.max(0, raw.lpa) : 0,
  };
}

function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    scheduleSave();
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function assertNoCircularGenealogy(childLotId: number, parentLotId: number): void {
  const ancestors = getLotAncestry(parentLotId);
  if (wouldCreateCircularGenealogy(childLotId, parentLotId, ancestors)) {
    throw new Error('Circular lot genealogy is not allowed.');
  }
}

function insertLotParent(
  childLotId: number,
  parentLotId: number,
  contributedVolume: number,
  contributedLpa: number,
  transactionId?: number | null,
): void {
  assertNoCircularGenealogy(childLotId, parentLotId);
  insertRow(
    `INSERT INTO liq_lot_parents (child_lot_id, parent_lot_id, contributed_volume_litres, contributed_lpa, transaction_id)
     VALUES (?, ?, ?, ?, ?)`,
    [childLotId, parentLotId, contributedVolume, contributedLpa, transactionId ?? null],
  );
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export function seedLiquidLedgerLookupsIfEmpty(): void {
  for (const name of DEFAULT_LOT_TYPES) {
    addLookupValue(LIQ_LOOKUP_TYPES.LOT_TYPE, name);
  }
  for (const name of DEFAULT_TANK_TYPES) {
    addLookupValue(LIQ_LOOKUP_TYPES.TANK_TYPE, name);
  }
}

export function listLotTypes(): string[] {
  return getLookupNames(LIQ_LOOKUP_TYPES.LOT_TYPE);
}

export function listTankTypes(): string[] {
  return getLookupNames(LIQ_LOOKUP_TYPES.TANK_TYPE);
}

// ─── Lots ───────────────────────────────────────────────────────────────────

export function createLot(input: LiqLotSaveInput): number {
  validateLotType(input.lot_type);
  validateAbv(input.initial_abv);
  validatePositiveVolume(input.initial_volume_litres, 'Initial volume');
  const lpa = computeLpa(input.initial_volume_litres, input.initial_abv);
  const code = nextBusinessCode('lot', 'liq_lots', 'lot_code');
  const ts = now();
  return insertRow(
    `INSERT INTO liq_lots (
      lot_code, lot_type, product_id, bulk_spirit_id, recipe_version_id, description,
      initial_volume_litres, initial_abv, initial_lpa, status, source_type, source_reference_id,
      parent_lot_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code, input.lot_type, input.product_id, input.bulk_spirit_id, input.recipe_version_id,
      input.description, input.initial_volume_litres, input.initial_abv, lpa, input.status,
      input.source_type, input.source_reference_id, input.parent_lot_id, input.notes, ts, ts,
    ],
  );
}

export function getLot(id: number): LiqLot | null {
  return queryOne<LiqLot>(`
    SELECT l.*, p.name AS product_name, bs.name AS bulk_spirit_name
    FROM liq_lots l
    LEFT JOIN md_products p ON p.id = l.product_id
    LEFT JOIN md_bulk_spirits bs ON bs.id = l.bulk_spirit_id
    WHERE l.id = ?
  `, [id]);
}

export function listLots(status?: string): LiqLot[] {
  const sql = `
    SELECT l.*, p.name AS product_name, bs.name AS bulk_spirit_name
    FROM liq_lots l
    LEFT JOIN md_products p ON p.id = l.product_id
    LEFT JOIN md_bulk_spirits bs ON bs.id = l.bulk_spirit_id
    ${status ? 'WHERE l.status = ?' : ''}
    ORDER BY l.created_at DESC, l.id DESC
  `;
  return queryAll<LiqLot>(sql, status ? [status] : []);
}

export function getLotParents(lotId: number): LiqLotParent[] {
  return queryAll<LiqLotParent>(`
    SELECT lp.*, pl.lot_code AS parent_lot_code, cl.lot_code AS child_lot_code
    FROM liq_lot_parents lp
    JOIN liq_lots pl ON pl.id = lp.parent_lot_id
    JOIN liq_lots cl ON cl.id = lp.child_lot_id
    WHERE lp.child_lot_id = ?
  `, [lotId]);
}

export function getLotChildren(lotId: number): LiqLotParent[] {
  return queryAll<LiqLotParent>(`
    SELECT lp.*, pl.lot_code AS parent_lot_code, cl.lot_code AS child_lot_code
    FROM liq_lot_parents lp
    JOIN liq_lots pl ON pl.id = lp.parent_lot_id
    JOIN liq_lots cl ON cl.id = lp.child_lot_id
    WHERE lp.parent_lot_id = ?
  `, [lotId]);
}

export function getLotAncestry(lotId: number): LiqLotParent[] {
  const result: LiqLotParent[] = [];
  const queue = [lotId];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const parents = getLotParents(current);
    for (const p of parents) {
      result.push(p);
      queue.push(p.parent_lot_id);
    }
  }
  return result;
}

export function getLotBalance(lotId: number): LotBalance {
  const lot = getLot(lotId);
  if (!lot) throw new Error('Lot not found.');
  const { volumeLitres, lpa } = computeLotBalanceFromLedger(lotId);
  const tanks = listTanks().filter((t) => t.tracking_mode === 'LEDGER');
  let currentTankId: number | null = null;
  let currentTankName: string | null = null;
  let bestVolume = 0;
  for (const tank of tanks) {
    const inTank = computeLotVolumeInTank(lotId, tank.id);
    if (inTank.volumeLitres > bestVolume) {
      bestVolume = inTank.volumeLitres;
      currentTankId = tank.id;
      currentTankName = tank.name;
    }
  }
  return {
    lotId,
    volumeLitres,
    lpa,
    abv: computeAbvFromLpa(volumeLitres, lpa),
    currentTankId,
    currentTankName,
  };
}

// ─── Tanks ──────────────────────────────────────────────────────────────────

export function listTanks(): LiqTank[] {
  return queryAll<LiqTank>(`
    SELECT t.*, loc.name AS location_name, fe.name AS floor_equipment_name
    FROM liq_tanks t
    LEFT JOIN md_storage_locations loc ON loc.id = t.location_id
    LEFT JOIN floor_equipment fe ON fe.id = t.floor_equipment_id
    ORDER BY t.tank_code
  `);
}

export function getTank(id: number): LiqTank | null {
  return queryOne<LiqTank>(`
    SELECT t.*, loc.name AS location_name, fe.name AS floor_equipment_name
    FROM liq_tanks t
    LEFT JOIN md_storage_locations loc ON loc.id = t.location_id
    LEFT JOIN floor_equipment fe ON fe.id = t.floor_equipment_id
    WHERE t.id = ?
  `, [id]);
}

export function saveTank(data: LiqTankSaveInput, id?: number): number {
  validateTankName(data.name);
  validateTrackingMode(data.tracking_mode);
  validatePositiveVolume(data.capacity_litres, 'Capacity');
  if (data.minimum_working_volume_litres != null) {
    validateNonNegativeVolume(data.minimum_working_volume_litres, 'Minimum working volume');
  }
  assertFloorEquipmentLinkable(data.floor_equipment_id, id);
  const ts = now();
  if (id != null) {
    const existing = getTank(id);
    if (!existing) throw new Error('Tank not found.');
    if (existing.tracking_mode === 'LEGACY') {
      throw new Error('Legacy-linked tanks cannot be edited via ledger save.');
    }
    const txCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM liq_transactions WHERE source_tank_id = ? OR destination_tank_id = ?',
      [id, id],
    )?.count ?? 0;
    if (txCount > 0 && data.tracking_mode === 'LEGACY') {
      throw new Error('Cannot change a tank with transaction history back to LEGACY mode.');
    }
    runQuery(
      `UPDATE liq_tanks SET name=?, tank_type=?, capacity_litres=?, minimum_working_volume_litres=?,
       location_id=?, floor_equipment_id=?, tracking_mode=?, status=?, notes=?, updated_at=? WHERE id=?`,
      [
        data.name, data.tank_type, data.capacity_litres, data.minimum_working_volume_litres,
        data.location_id, data.floor_equipment_id, data.tracking_mode, data.status, data.notes, ts, id,
      ],
    );
    return id;
  }
  const code = nextBusinessCode('tank', 'liq_tanks', 'tank_code');
  const tankId = insertRow(
    `INSERT INTO liq_tanks (
      tank_code, name, tank_type, capacity_litres, minimum_working_volume_litres,
      location_id, floor_equipment_id, tracking_mode, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code, data.name, data.tank_type, data.capacity_litres, data.minimum_working_volume_litres,
      data.location_id, data.floor_equipment_id, data.tracking_mode ?? 'LEDGER', data.status, data.notes, ts, ts,
    ],
  );
  if (data.floor_equipment_id != null) {
    runQuery(
      `UPDATE floor_equipment SET tracking_mode = 'LEDGER' WHERE id = ? AND equipment_type = 'holding_tank'`,
      [data.floor_equipment_id],
    );
  }
  return tankId;
}

export function getTankBalance(tankId: number): TankBalance {
  const tank = getTank(tankId);
  if (!tank) throw new Error('Tank not found.');
  if (tank.tracking_mode !== 'LEDGER') {
    throw new Error('Use legacy balance helpers for LEGACY tanks.');
  }
  const { volumeLitres, lpa } = computeTankBalanceFromLedger(tankId);
  const components = getTankLotComponents(tankId);
  const primary = components.sort((a, b) => b.volumeLitres - a.volumeLitres)[0];
  return {
    tankId,
    volumeLitres,
    lpa,
    abv: computeAbvFromLpa(volumeLitres, lpa),
    capacityLitres: tank.capacity_litres,
    utilizationPercent: capacityUtilizationPercent(volumeLitres, tank.capacity_litres),
    trackingMode: tank.tracking_mode,
    isMixed: components.length > 1,
    primaryLotCode: primary?.lotCode ?? null,
  };
}

export function getTankLotComponents(tankId: number): TankLotComponent[] {
  const lots = queryAll<{ id: number; lot_code: string; lot_type: string }>(
    'SELECT DISTINCT id, lot_code, lot_type FROM liq_lots',
  );
  const components: TankLotComponent[] = [];
  for (const lot of lots) {
    const { volumeLitres, lpa } = computeLotVolumeInTank(lot.id, tankId);
    if (volumeLitres > 1e-9) {
      components.push({
        lotId: lot.id,
        lotCode: lot.lot_code,
        lotType: lot.lot_type,
        volumeLitres,
        lpa,
        abv: computeAbvFromLpa(volumeLitres, lpa),
      });
    }
  }
  return components.sort((a, b) => b.volumeLitres - a.volumeLitres);
}

/** Legacy floor_equipment holding tanks — separate from ledger balances. */
export function listLegacyFloorTanks(): Array<{
  id: number;
  name: string;
  volumeGal: number;
  abv: number;
  trackingMode: string;
}> {
  return getHoldingTanks()
    .filter((t) => {
      const trackingMode = (t as { tracking_mode?: string }).tracking_mode ?? 'LEGACY';
      if (trackingMode === 'LEDGER') return false;
      const linked = queryOne<{ id: number }>(
        'SELECT id FROM liq_tanks WHERE floor_equipment_id = ?',
        [t.id],
      );
      return !linked;
    })
    .map((t) => {
      const contents = getHoldingTankContents(t.id);
      const trackingMode = (t as { tracking_mode?: string }).tracking_mode ?? 'LEGACY';
      return {
        id: t.id,
        name: t.name,
        volumeGal: contents.volume_gal,
        abv: contents.abv,
        trackingMode,
      };
    });
}

// ─── Transactions ───────────────────────────────────────────────────────────

function insertTransaction(input: LiqTransactionPostInput): number {
  validatePositiveVolume(input.volume_litres, 'Transaction volume');
  validateAbv(input.abv);
  const lpa = computeLpa(input.volume_litres, input.abv);
  const code = nextBusinessCode('liquidTransaction', 'liq_transactions', 'transaction_code');
  const ts = now();
  return insertRow(
    `INSERT INTO liq_transactions (
      transaction_code, transaction_type, transaction_timestamp,
      source_tank_id, destination_tank_id, source_lot_id, destination_lot_id,
      volume_litres, abv, lpa, reason_code, source_document_type, source_document_id,
      notes, created_by, created_at, transaction_group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code, input.transaction_type, input.transaction_timestamp,
      input.source_tank_id, input.destination_tank_id, input.source_lot_id, input.destination_lot_id,
      input.volume_litres, input.abv, lpa, input.reason_code, input.source_document_type,
      input.source_document_id, input.notes, input.created_by, ts, input.transaction_group_id ?? null,
    ],
  );
}

function createReversalTx(original: LiqTransaction, createdBy?: string | null, groupId?: string | null): number {
  const code = nextBusinessCode('liquidTransaction', 'liq_transactions', 'transaction_code');
  const ts = now();
  return insertRow(
    `INSERT INTO liq_transactions (
      transaction_code, transaction_type, transaction_timestamp,
      source_tank_id, destination_tank_id, source_lot_id, destination_lot_id,
      volume_litres, abv, lpa, reason_code, notes, created_by, created_at, reversal_of_transaction_id, transaction_group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code, 'Correction / Reversal', ts,
      original.destination_tank_id, original.source_tank_id,
      original.destination_lot_id, original.source_lot_id,
      original.volume_litres, original.abv, original.lpa,
      'Measurement Correction',
      `Reversal of ${original.transaction_code}`,
      createdBy ?? null, ts, original.id, groupId ?? null,
    ],
  );
}

function isTransactionReversed(transactionId: number): boolean {
  return queryOne<{ id: number }>(
    'SELECT id FROM liq_transactions WHERE reversal_of_transaction_id = ?',
    [transactionId],
  ) != null;
}

export function postTransaction(input: LiqTransactionPostInput): number {
  return withTransaction(() => insertTransaction(input));
}

export function getTransactions(filters?: {
  tankId?: number;
  lotId?: number;
  transactionType?: string;
  limit?: number;
}): LiqTransaction[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.tankId != null) {
    clauses.push('(t.source_tank_id = ? OR t.destination_tank_id = ?)');
    params.push(filters.tankId, filters.tankId);
  }
  if (filters?.lotId != null) {
    clauses.push('(t.source_lot_id = ? OR t.destination_lot_id = ?)');
    params.push(filters.lotId, filters.lotId);
  }
  if (filters?.transactionType) {
    clauses.push('t.transaction_type = ?');
    params.push(filters.transactionType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filters?.limit ?? 500;
  return queryAll<LiqTransaction>(`
    SELECT t.*,
      st.name AS source_tank_name, dt.name AS destination_tank_name,
      sl.lot_code AS source_lot_code, dl.lot_code AS destination_lot_code
    FROM liq_transactions t
    LEFT JOIN liq_tanks st ON st.id = t.source_tank_id
    LEFT JOIN liq_tanks dt ON dt.id = t.destination_tank_id
    LEFT JOIN liq_lots sl ON sl.id = t.source_lot_id
    LEFT JOIN liq_lots dl ON dl.id = t.destination_lot_id
    ${where}
    ORDER BY t.transaction_timestamp DESC, t.id DESC
    LIMIT ${limit}
  `, params as (string | number | null)[]);
}

export function reverseTransaction(transactionId: number, createdBy?: string | null): number[] {
  return withTransaction(() => {
    const original = queryOne<LiqTransaction>('SELECT * FROM liq_transactions WHERE id = ?', [transactionId]);
    if (!original) throw new Error('Transaction not found.');
    if (original.reversal_of_transaction_id) {
      throw new Error('Cannot reverse a reversal transaction.');
    }

    const targets = original.transaction_group_id
      ? queryAll<LiqTransaction>(
        `SELECT * FROM liq_transactions
         WHERE transaction_group_id = ? AND reversal_of_transaction_id IS NULL
         ORDER BY id`,
        [original.transaction_group_id],
      )
      : [original];

    const reversalGroupId = targets.length > 1 ? nextOperationGroupId() : null;
    const reversalIds: number[] = [];

    for (const tx of targets) {
      if (isTransactionReversed(tx.id)) {
        throw new Error(`Transaction ${tx.transaction_code} has already been reversed.`);
      }
      reversalIds.push(createReversalTx(tx, createdBy, reversalGroupId));
    }

    return reversalIds;
  });
}

// ─── Operations ─────────────────────────────────────────────────────────────

export function receiveBulkSpirit(input: BulkSpiritReceiptInput): { lotId: number; transactionId: number } {
  return withTransaction(() => {
    const tank = assertLedgerTank(input.destinationTankId);
    validateAbv(input.abv);
    validatePositiveVolume(input.volumeLitres, 'Received volume');

    const balance = computeTankBalanceFromLedger(tank.id);
    validateCapacity(balance.volumeLitres + input.volumeLitres, tank.capacity_litres);

    const bulkSpirit = queryOne<{ id: number; name: string; spirit_type: string }>(
      'SELECT id, name, spirit_type FROM md_bulk_spirits WHERE id = ? AND active = 1',
      [input.bulkSpiritId],
    );
    if (!bulkSpirit) throw new Error('Bulk spirit not found or inactive.');

    const lotId = createLot({
      lot_type: 'Purchased Bulk Spirit',
      product_id: null,
      bulk_spirit_id: input.bulkSpiritId,
      recipe_version_id: null,
      description: input.receivedReference?.trim() || bulkSpirit.name,
      initial_volume_litres: input.volumeLitres,
      initial_abv: input.abv,
      status: 'Active',
      source_type: 'Bulk Spirit Receipt',
      source_reference_id: input.supplierId ?? null,
      parent_lot_id: null,
      notes: input.notes ?? '',
    });

    const groupId = nextOperationGroupId();
    const transactionId = insertTransaction({
      transaction_type: 'Bulk Spirit Receipt',
      transaction_timestamp: input.receivedDate || now(),
      source_tank_id: null,
      destination_tank_id: tank.id,
      source_lot_id: null,
      destination_lot_id: lotId,
      volume_litres: input.volumeLitres,
      abv: input.abv,
      reason_code: null,
      source_document_type: 'bulk_spirit',
      source_document_id: input.bulkSpiritId,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    return { lotId, transactionId };
  });
}

export function transferLiquid(input: TransferLiquidInput): number {
  return withTransaction(() => {
    if (input.sourceTankId === input.destinationTankId) {
      throw new Error('Source and destination tanks must differ.');
    }
    const source = assertLedgerTank(input.sourceTankId);
    const dest = assertLedgerTank(input.destinationTankId);
    validatePositiveVolume(input.volumeLitres, 'Transfer volume');

    const sourceBalance = computeTankBalanceFromLedger(source.id);
    validateSufficientBalance(sourceBalance.volumeLitres, input.volumeLitres, 'Source tank');

    const destBalance = computeTankBalanceFromLedger(dest.id);
    validateCapacity(destBalance.volumeLitres + input.volumeLitres, dest.capacity_litres);

    let lotId = input.sourceLotId ?? null;
    if (lotId == null) {
      const components = getTankLotComponents(source.id);
      if (components.length === 1) lotId = components[0].lotId;
      else if (components.length === 0) throw new Error('Source tank has no lot to transfer.');
      else throw new Error('Specify a source lot when the tank contains multiple lots.');
    }

    const lotInTank = computeLotVolumeInTank(lotId, source.id);
    validateSufficientBalance(lotInTank.volumeLitres, input.volumeLitres, 'Source lot');
    const lotAbv = computeAbvFromLpa(lotInTank.volumeLitres, lotInTank.lpa);
    const transferLpa = lotInTank.volumeLitres > 0
      ? lotInTank.lpa * (input.volumeLitres / lotInTank.volumeLitres)
      : 0;
    validateSufficientBalance(lotInTank.lpa, transferLpa, 'Source lot LPA');

    const ts = now();
    const groupId = nextOperationGroupId();
    insertTransaction({
      transaction_type: 'Tank Transfer Out',
      transaction_timestamp: ts,
      source_tank_id: source.id,
      destination_tank_id: null,
      source_lot_id: lotId,
      destination_lot_id: null,
      volume_litres: input.volumeLitres,
      abv: lotAbv,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });
    return insertTransaction({
      transaction_type: 'Tank Transfer In',
      transaction_timestamp: ts,
      source_tank_id: null,
      destination_tank_id: dest.id,
      source_lot_id: null,
      destination_lot_id: lotId,
      volume_litres: input.volumeLitres,
      abv: lotAbv,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });
  });
}

export function createBlend(input: BlendInput): { lotId: number; transactionIds: number[] } {
  return withTransaction(() => {
    const sourceTank = assertLedgerTank(input.sourceTankId);
    const destTank = assertLedgerTank(input.destinationTankId);
    if (input.consumptions.length < 2) {
      throw new Error('A blend requires at least two source lots.');
    }

    let totalVolume = 0;
    let totalLpa = 0;
    const txIds: number[] = [];
    const ts = now();
    const groupId = nextOperationGroupId();

    for (const c of input.consumptions) {
      validatePositiveVolume(c.volumeLitres, 'Blend consumption volume');
      const inTank = computeLotVolumeInTank(c.lotId, sourceTank.id);
      validateSufficientBalance(inTank.volumeLitres, c.volumeLitres, `Lot ${c.lotId}`);
      const abv = computeAbvFromLpa(inTank.volumeLitres, inTank.lpa);
      const lpa = inTank.volumeLitres > 0
        ? inTank.lpa * (c.volumeLitres / inTank.volumeLitres)
        : 0;
      validateSufficientBalance(inTank.lpa, lpa, `Lot ${c.lotId} LPA`);
      totalVolume += c.volumeLitres;
      totalLpa += lpa;
      txIds.push(insertTransaction({
        transaction_type: 'Blend Consumption',
        transaction_timestamp: ts,
        source_tank_id: sourceTank.id,
        destination_tank_id: null,
        source_lot_id: c.lotId,
        destination_lot_id: null,
        volume_litres: c.volumeLitres,
        abv,
        reason_code: null,
        source_document_type: null,
        source_document_id: null,
        notes: input.notes ?? '',
        created_by: input.createdBy ?? null,
        transaction_group_id: groupId,
      }));
    }

    const destBalance = computeTankBalanceFromLedger(destTank.id);
    validateCapacity(destBalance.volumeLitres + totalVolume, destTank.capacity_litres);

    const outputAbv = computeAbvFromLpa(totalVolume, totalLpa);
    const lotId = createLot({
      lot_type: input.outputLotType,
      product_id: input.productId ?? null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: input.outputDescription,
      initial_volume_litres: totalVolume,
      initial_abv: outputAbv,
      status: 'Active',
      source_type: 'Blend',
      source_reference_id: null,
      parent_lot_id: null,
      notes: input.notes ?? '',
    });

    for (const c of input.consumptions) {
      const inTank = computeLotVolumeInTank(c.lotId, sourceTank.id);
      const abv = computeAbvFromLpa(inTank.volumeLitres, inTank.lpa);
      insertLotParent(lotId, c.lotId, c.volumeLitres, computeLpa(c.volumeLitres, abv));
    }

    txIds.push(insertTransaction({
      transaction_type: 'Blend Production',
      transaction_timestamp: ts,
      source_tank_id: null,
      destination_tank_id: destTank.id,
      source_lot_id: null,
      destination_lot_id: lotId,
      volume_litres: totalVolume,
      abv: outputAbv,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }));

    return { lotId, transactionIds: txIds };
  });
}

export function proofDown(input: ProofDownInput): { lotId: number; transactionIds: number[] } {
  return withTransaction(() => {
    const sourceTank = assertLedgerTank(input.sourceTankId);
    const destTank = assertLedgerTank(input.destinationTankId);
    validateAbv(input.sourceAbv);
    validateAbv(input.targetAbv);
    validatePositiveVolume(input.sourceVolumeLitres, 'Source volume');
    validatePositiveVolume(input.waterVolumeLitres, 'Water volume');

    const theoretical = dilutionCalculation(input.sourceVolumeLitres, input.sourceAbv, input.targetAbv);
    const outputVolume = input.actualOutputVolumeLitres ?? theoretical.finalVolumeLitres;
    validatePositiveVolume(outputVolume, 'Output volume');

    const sourceLpa = computeLpa(input.sourceVolumeLitres, input.sourceAbv);
    const outputLpa = computeLpa(outputVolume, input.targetAbv);
    if (Math.abs(outputLpa - sourceLpa) > 0.5 && !(input.notes ?? '').trim()) {
      throw new Error(
        'Actual output LPA differs from source LPA. Provide a note explaining the variance.',
      );
    }

    const lotInTank = computeLotVolumeInTank(input.sourceLotId, sourceTank.id);
    validateSufficientBalance(lotInTank.volumeLitres, input.sourceVolumeLitres, 'Source lot');

    const destBalance = computeTankBalanceFromLedger(destTank.id);
    validateCapacity(destBalance.volumeLitres + outputVolume, destTank.capacity_litres);

    const txIds: number[] = [];
    const ts = now();
    const groupId = nextOperationGroupId();

    txIds.push(insertTransaction({
      transaction_type: 'Proof Down Consumption',
      transaction_timestamp: ts,
      source_tank_id: sourceTank.id,
      destination_tank_id: null,
      source_lot_id: input.sourceLotId,
      destination_lot_id: null,
      volume_litres: input.sourceVolumeLitres,
      abv: input.sourceAbv,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }));

    txIds.push(insertTransaction({
      transaction_type: 'Proof Down Water Addition',
      transaction_timestamp: ts,
      source_tank_id: null,
      destination_tank_id: destTank.id,
      source_lot_id: null,
      destination_lot_id: null,
      volume_litres: input.waterVolumeLitres,
      abv: 0,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: 'Water addition for proof-down',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }));

    const lotId = createLot({
      lot_type: 'Proofed Spirit',
      product_id: null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: `Proof-down to ${input.targetAbv}% ABV`,
      initial_volume_litres: outputVolume,
      initial_abv: input.targetAbv,
      status: 'Active',
      source_type: 'Proof Down',
      source_reference_id: input.sourceLotId,
      parent_lot_id: null,
      notes: input.notes ?? '',
    });
    insertLotParent(lotId, input.sourceLotId, input.sourceVolumeLitres, sourceLpa);

    txIds.push(insertTransaction({
      transaction_type: 'Proof Down Production',
      transaction_timestamp: ts,
      source_tank_id: null,
      destination_tank_id: destTank.id,
      source_lot_id: null,
      destination_lot_id: lotId,
      volume_litres: outputVolume,
      abv: input.targetAbv,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    }));

    return { lotId, transactionIds: txIds };
  });
}

export function postOpeningBalance(input: OpeningBalanceInput): { lotId: number; transactionId: number } {
  return withTransaction(() => {
    const tank = assertLedgerTank(input.tankId);
    validateAbv(input.abv);
    validatePositiveVolume(input.volumeLitres, 'Opening balance volume');
    validateCapacity(input.volumeLitres, tank.capacity_litres);
    assertNoOpeningBalanceConflict(tank.id);

    const lotId = createLot({
      lot_type: input.lotType,
      product_id: input.productId ?? null,
      bulk_spirit_id: input.bulkSpiritId ?? null,
      recipe_version_id: null,
      description: input.description,
      initial_volume_litres: input.volumeLitres,
      initial_abv: input.abv,
      status: 'Active',
      source_type: 'Opening Balance',
      source_reference_id: null,
      parent_lot_id: null,
      notes: input.notes ?? '',
    });

    const groupId = nextOperationGroupId();
    const transactionId = insertTransaction({
      transaction_type: 'Opening Balance',
      transaction_timestamp: input.effectiveDate || now(),
      source_tank_id: null,
      destination_tank_id: tank.id,
      source_lot_id: null,
      destination_lot_id: lotId,
      volume_litres: input.volumeLitres,
      abv: input.abv,
      reason_code: null,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
      transaction_group_id: groupId,
    });

    return { lotId, transactionId };
  });
}

export function postAdjustment(input: {
  tankId: number;
  lotId?: number | null;
  volumeLitres: number;
  abv: number;
  increase: boolean;
  reasonCode: string;
  notes?: string;
  createdBy?: string | null;
}): number {
  return withTransaction(() => {
    const tank = assertLedgerTank(input.tankId);
    validateReasonCode(input.reasonCode, true);
    validatePositiveVolume(input.volumeLitres, 'Adjustment volume');
    validateAbv(input.abv);

    if (!input.increase) {
      const balance = computeTankBalanceFromLedger(tank.id);
      validateSufficientBalance(balance.volumeLitres, input.volumeLitres, 'Tank');
      if (input.lotId != null) {
        const lotBal = computeLotVolumeInTank(input.lotId, tank.id);
        validateSufficientBalance(lotBal.volumeLitres, input.volumeLitres, 'Lot');
      }
    } else {
      const balance = computeTankBalanceFromLedger(tank.id);
      validateCapacity(balance.volumeLitres + input.volumeLitres, tank.capacity_litres);
    }

    const type = input.increase ? 'Manual Adjustment Increase' : 'Manual Adjustment Decrease';
    return insertTransaction({
      transaction_type: type,
      transaction_timestamp: now(),
      source_tank_id: input.increase ? null : tank.id,
      destination_tank_id: input.increase ? tank.id : null,
      source_lot_id: input.increase ? null : (input.lotId ?? null),
      destination_lot_id: input.increase ? (input.lotId ?? null) : null,
      volume_litres: input.volumeLitres,
      abv: input.abv,
      reason_code: input.reasonCode,
      source_document_type: null,
      source_document_id: null,
      notes: input.notes ?? '',
      created_by: input.createdBy ?? null,
    });
  });
}

export function reconcileTank(input: ReconcileTankInput): {
  reconciliationId: number;
  transactionId: number | null;
} {
  return withTransaction(() => {
    const tank = assertLedgerTank(input.tankId);
    validateReasonCode(input.reasonCode, true);
    validateNonNegativeVolume(input.measuredVolumeLitres, 'Measured volume');

    const calculated = computeTankBalanceFromLedger(tank.id);
    const variance = input.measuredVolumeLitres - calculated.volumeLitres;
    const ts = now();

    const reconciliationId = insertRow(
      `INSERT INTO liq_reconciliations (
        tank_id, calculated_volume_litres, measured_volume_litres, variance_litres,
        calculated_abv, measured_abv, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tank.id, calculated.volumeLitres, input.measuredVolumeLitres, variance,
        computeAbvFromLpa(calculated.volumeLitres, calculated.lpa),
        input.measuredAbv ?? null, input.notes ?? '', input.createdBy ?? null, ts,
      ],
    );

    let transactionId: number | null = null;
    if (Math.abs(variance) > 1e-6) {
      const measuredAbv = input.measuredAbv ?? computeAbvFromLpa(calculated.volumeLitres, calculated.lpa);
      const type = variance > 0 ? 'Manual Adjustment Increase' : 'Manual Adjustment Decrease';
      transactionId = insertTransaction({
        transaction_type: type,
        transaction_timestamp: ts,
        source_tank_id: variance > 0 ? null : tank.id,
        destination_tank_id: variance > 0 ? tank.id : null,
        source_lot_id: null,
        destination_lot_id: null,
        volume_litres: Math.abs(variance),
        abv: measuredAbv,
        reason_code: input.reasonCode,
        source_document_type: 'reconciliation',
        source_document_id: reconciliationId,
        notes: `Reconciliation variance ${variance.toFixed(2)} L. ${input.notes ?? ''}`.trim(),
        created_by: input.createdBy ?? null,
      });
      runQuery(
        'UPDATE liq_reconciliations SET adjustment_transaction_id = ? WHERE id = ?',
        [transactionId, reconciliationId],
      );
    }

    return { reconciliationId, transactionId };
  });
}

/** Preview reconciliation without posting adjustment. */
export function previewReconciliation(tankId: number, measuredVolumeLitres: number): {
  calculatedVolumeLitres: number;
  measuredVolumeLitres: number;
  varianceLitres: number;
  calculatedAbv: number;
} {
  const tank = assertLedgerTank(tankId);
  const calculated = computeTankBalanceFromLedger(tank.id);
  return {
    calculatedVolumeLitres: calculated.volumeLitres,
    measuredVolumeLitres,
    varianceLitres: measuredVolumeLitres - calculated.volumeLitres,
    calculatedAbv: computeAbvFromLpa(calculated.volumeLitres, calculated.lpa),
  };
}

export function getReconciliations(tankId?: number): LiqReconciliation[] {
  const sql = `
    SELECT r.*, t.name AS tank_name
    FROM liq_reconciliations r
    JOIN liq_tanks t ON t.id = r.tank_id
    ${tankId != null ? 'WHERE r.tank_id = ?' : ''}
    ORDER BY r.created_at DESC
  `;
  return queryAll<LiqReconciliation>(sql, tankId != null ? [tankId] : []);
}

/** Exported for tests — compute ledger tank balance without tank metadata. */
export function computeLedgerTankBalanceLitres(tankId: number): BalanceSnapshot {
  const { volumeLitres, lpa } = computeTankBalanceFromLedger(tankId);
  return balanceFromVolumeLpa(volumeLitres, lpa);
}
