/** Pure balance aggregation from ledger transaction rows (source/destination semantics). */

export interface LedgerTransactionRow {
  source_tank_id: number | null;
  destination_tank_id: number | null;
  source_lot_id: number | null;
  destination_lot_id: number | null;
  volume_litres: number;
  lpa: number;
}

export interface VolumeLpaPair {
  volumeLitres: number;
  lpa: number;
}

/** Tank balance: +volume/LPA on destination, −volume/LPA on source. Includes reversals. */
export function aggregateTankBalance(
  tankId: number,
  transactions: readonly LedgerTransactionRow[],
): VolumeLpaPair {
  let volume = 0;
  let lpa = 0;
  for (const tx of transactions) {
    if (tx.destination_tank_id === tankId) {
      volume += tx.volume_litres;
      lpa += tx.lpa;
    }
    if (tx.source_tank_id === tankId) {
      volume -= tx.volume_litres;
      lpa -= tx.lpa;
    }
  }
  return { volumeLitres: volume, lpa };
}

/** Lot balance across all tanks. */
export function aggregateLotBalance(
  lotId: number,
  transactions: readonly LedgerTransactionRow[],
): VolumeLpaPair {
  let volume = 0;
  let lpa = 0;
  for (const tx of transactions) {
    if (tx.destination_lot_id === lotId) {
      volume += tx.volume_litres;
      lpa += tx.lpa;
    }
    if (tx.source_lot_id === lotId) {
      volume -= tx.volume_litres;
      lpa -= tx.lpa;
    }
  }
  return { volumeLitres: volume, lpa };
}

/** Lot volume/LPA in a specific tank. */
export function aggregateLotInTank(
  lotId: number,
  tankId: number,
  transactions: readonly LedgerTransactionRow[],
): VolumeLpaPair {
  let volume = 0;
  let lpa = 0;
  for (const tx of transactions) {
    if (tx.destination_lot_id === lotId && tx.destination_tank_id === tankId) {
      volume += tx.volume_litres;
      lpa += tx.lpa;
    }
    if (tx.source_lot_id === lotId && tx.source_tank_id === tankId) {
      volume -= tx.volume_litres;
      lpa -= tx.lpa;
    }
  }
  return { volumeLitres: volume, lpa };
}
