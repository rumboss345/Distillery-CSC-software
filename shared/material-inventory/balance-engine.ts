/** Pure material balance aggregation from ledger transaction rows. */

export interface MaterialLedgerRow {
  material_type: string;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  material_lot_id: number | null;
  source_location_id: number | null;
  destination_location_id: number | null;
  base_quantity: number;
}

export function materialKey(row: Pick<MaterialLedgerRow, 'material_type' | 'raw_material_id' | 'packaging_material_id'>): string {
  const id = row.raw_material_id ?? row.packaging_material_id ?? 0;
  return `${row.material_type}:${id}`;
}

function matchesMaterial(
  row: MaterialLedgerRow,
  materialType: string,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): boolean {
  if (row.material_type !== materialType) return false;
  if (materialType === 'RAW_MATERIAL') return row.raw_material_id === rawMaterialId;
  return row.packaging_material_id === packagingMaterialId;
}

/** Company-wide material balance in base units. */
export function aggregateMaterialBalance(
  materialType: string,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
  transactions: readonly MaterialLedgerRow[],
): number {
  let balance = 0;
  for (const tx of transactions) {
    if (!matchesMaterial(tx, materialType, rawMaterialId, packagingMaterialId)) continue;
    if (tx.destination_location_id != null) balance += tx.base_quantity;
    if (tx.source_location_id != null) balance -= tx.base_quantity;
  }
  return balance;
}

/** Material balance at a specific location. */
export function aggregateMaterialBalanceByLocation(
  materialType: string,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
  locationId: number,
  transactions: readonly MaterialLedgerRow[],
): number {
  let balance = 0;
  for (const tx of transactions) {
    if (!matchesMaterial(tx, materialType, rawMaterialId, packagingMaterialId)) continue;
    if (tx.destination_location_id === locationId) balance += tx.base_quantity;
    if (tx.source_location_id === locationId) balance -= tx.base_quantity;
  }
  return balance;
}

/** Lot balance across all locations. */
export function aggregateLotBalance(
  lotId: number,
  transactions: readonly MaterialLedgerRow[],
): number {
  let balance = 0;
  for (const tx of transactions) {
    if (tx.material_lot_id !== lotId) continue;
    if (tx.destination_location_id != null) balance += tx.base_quantity;
    if (tx.source_location_id != null) balance -= tx.base_quantity;
  }
  return balance;
}

/** Lot balance at a specific location. */
export function aggregateLotBalanceByLocation(
  lotId: number,
  locationId: number,
  transactions: readonly MaterialLedgerRow[],
): number {
  let balance = 0;
  for (const tx of transactions) {
    if (tx.material_lot_id !== lotId) continue;
    if (tx.destination_location_id === locationId) balance += tx.base_quantity;
    if (tx.source_location_id === locationId) balance -= tx.base_quantity;
  }
  return balance;
}
