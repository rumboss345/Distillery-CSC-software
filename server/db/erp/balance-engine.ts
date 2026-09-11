import { aggregateLotBalance as aggregateLiquidLotBalance } from '../../../shared/liquid-ledger/balance-engine.js';
import { queryAll, queryOne } from './pg-helpers.js';

const MAT_ACTIVE_FILTER = `
  reversal_of_transaction_id IS NULL
  AND id NOT IN (
    SELECT reversal_of_transaction_id FROM mat_transactions
    WHERE reversal_of_transaction_id IS NOT NULL
  )`;

const FG_ACTIVE_FILTER = `
  reversal_of_transaction_id IS NULL
  AND id NOT IN (
    SELECT reversal_of_transaction_id FROM fg_transactions
    WHERE reversal_of_transaction_id IS NOT NULL
  )`;

/** Derived material lot balance from append-only ledger — never stored on-hand. */
export async function computeMaterialLotBalance(
  lotId: number,
  locationId?: number | null,
): Promise<number> {
  if (locationId != null) {
    const row = await queryOne<{ qty: string }>(
      `SELECT
        COALESCE(SUM(CASE WHEN destination_location_id = $2 THEN base_quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_location_id = $2 THEN base_quantity ELSE 0 END), 0) AS qty
       FROM mat_transactions
       WHERE material_lot_id = $1 AND ${MAT_ACTIVE_FILTER}`,
      [lotId, locationId],
    );
    return Math.max(0, Number(row?.qty ?? 0));
  }

  const row = await queryOne<{ qty: string }>(
    `SELECT
      COALESCE(SUM(CASE WHEN destination_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN source_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) AS qty
     FROM mat_transactions
     WHERE material_lot_id = $1 AND ${MAT_ACTIVE_FILTER}`,
    [lotId],
  );
  return Math.max(0, Number(row?.qty ?? 0));
}

/** Derived finished-goods lot balance from append-only ledger. */
export async function computeFgLotBalance(
  fgLotId: number,
  locationId?: number | null,
): Promise<number> {
  if (locationId != null) {
    const row = await queryOne<{ qty: string }>(
      `SELECT
        COALESCE(SUM(CASE WHEN destination_location_id = $2 THEN base_quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_location_id = $2 THEN base_quantity ELSE 0 END), 0) AS qty
       FROM fg_transactions
       WHERE fg_lot_id = $1 AND ${FG_ACTIVE_FILTER}`,
      [fgLotId, locationId],
    );
    return Math.max(0, Number(row?.qty ?? 0));
  }

  const row = await queryOne<{ qty: string }>(
    `SELECT
      COALESCE(SUM(CASE WHEN destination_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN source_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) AS qty
     FROM fg_transactions
     WHERE fg_lot_id = $1 AND ${FG_ACTIVE_FILTER}`,
    [fgLotId],
  );
  return Math.max(0, Number(row?.qty ?? 0));
}

export interface LiquidLotVolume {
  volumeLitres: number;
  lpa: number;
}

/** Derived liquid lot volume from append-only ledger. */
export async function computeLiquidLotVolume(
  lotId: number,
  tankId?: number | null,
): Promise<LiquidLotVolume> {
  const rows = await queryAll<{
    source_tank_id: number | null;
    destination_tank_id: number | null;
    source_lot_id: number | null;
    destination_lot_id: number | null;
    volume_litres: number;
    lpa: number;
  }>(
    `SELECT source_tank_id, destination_tank_id, source_lot_id, destination_lot_id, volume_litres, lpa
     FROM liq_transactions
     WHERE source_lot_id = $1 OR destination_lot_id = $1`,
    [lotId],
  );

  if (tankId != null) {
    const { aggregateLotInTank } = await import('../../../shared/liquid-ledger/balance-engine.js');
    const raw = aggregateLotInTank(lotId, tankId, rows);
    return {
      volumeLitres: Math.max(0, raw.volumeLitres),
      lpa: raw.volumeLitres > 0 ? Math.max(0, raw.lpa) : 0,
    };
  }

  const raw = aggregateLiquidLotBalance(lotId, rows);
  return {
    volumeLitres: Math.max(0, raw.volumeLitres),
    lpa: raw.volumeLitres > 0 ? Math.max(0, raw.lpa) : 0,
  };
}
