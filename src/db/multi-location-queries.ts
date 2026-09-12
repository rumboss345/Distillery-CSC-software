/**
 * Phase 1I multi-location inventory — transfers, cycle counts & barcodes.
 */
import {
  IN_TRANSIT_LOCATION_CODE,
  type BarcodeEntityType,
  type InventoryItemType,
} from '../../shared/multi-location/constants';
import type {
  BarcodeRecord,
  CreateTransferDocumentInput,
  CycleCount,
  CycleCountLine,
  LabelData,
  LocationHierarchyNode,
  TransferDocument,
  TransferLine,
} from '../types/multi-location';
import { computeFgLotBalance, postFgCycleCountAdjustment, transferFgLot } from './finished-goods-queries';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import {
  createMaterialReconciliation,
  getMaterialLotBalanceByLocation,
  postMaterialReconciliation,
  transferMaterial,
} from './material-inventory-queries';
import { nextBusinessCode } from './master-data-queries';

const now = () => new Date().toISOString();

export function getOrCreateInTransitLocation(): number {
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM md_storage_locations WHERE location_code = ?',
    [IN_TRANSIT_LOCATION_CODE],
  );
  if (existing) return existing.id;

  return insertRow(
    `INSERT INTO md_storage_locations (location_code, name, location_type, description, active, hierarchy_level)
     VALUES (?, 'In Transit', 'Other', 'System location for inventory between sites', 1, 'Site')`,
    [IN_TRANSIT_LOCATION_CODE],
  );
}

export function createTransferDocument(input: CreateTransferDocumentInput): number {
  if (input.originLocationId === input.destinationLocationId) {
    throw new Error('Origin and destination locations must differ.');
  }
  if (!input.lines.length) throw new Error('Transfer document requires at least one line.');

  const code = nextBusinessCode('inventoryTransfer', 'inv_transfer_documents', 'transfer_code');
  const docId = insertRow(
    `INSERT INTO inv_transfer_documents (
      transfer_code, status, origin_location_id, destination_location_id,
      ship_date, notes, created_by, created_at, updated_at
    ) VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.originLocationId,
      input.destinationLocationId,
      input.shipDate ?? null,
      input.notes ?? '',
      input.createdBy ?? null,
      now(),
      now(),
    ],
  );

  input.lines.forEach((line, idx) => {
    insertRow(
      `INSERT INTO inv_transfer_lines (
        transfer_document_id, line_number, inventory_type, material_lot_id, fg_lot_id,
        raw_material_id, packaging_material_id, sku_id, quantity, unit, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        idx + 1,
        line.inventoryType,
        line.materialLotId ?? null,
        line.fgLotId ?? null,
        line.rawMaterialId ?? null,
        line.packagingMaterialId ?? null,
        line.skuId ?? null,
        line.quantity,
        line.unit,
        line.notes ?? '',
      ],
    );
  });

  return docId;
}

export function getTransferDocument(id: number): TransferDocument | null {
  return queryOne<TransferDocument>('SELECT * FROM inv_transfer_documents WHERE id = ?', [id]);
}

export function listTransferDocuments(): TransferDocument[] {
  return queryAll<TransferDocument>(
    'SELECT * FROM inv_transfer_documents ORDER BY created_at DESC',
  );
}

export function getTransferLines(transferDocumentId: number): TransferLine[] {
  return queryAll<TransferLine>(
    'SELECT * FROM inv_transfer_lines WHERE transfer_document_id = ? ORDER BY line_number',
    [transferDocumentId],
  );
}

/** Release transfer — moves inventory from origin to in-transit. */
export function releaseTransferDocument(transferDocumentId: number, shipDate?: string): void {
  withDatabaseTransaction(() => {
    const doc = getTransferDocument(transferDocumentId);
    if (!doc) throw new Error('Transfer document not found.');
    if (doc.status !== 'Draft') throw new Error('Only Draft transfers can be released.');
    const inTransitId = getOrCreateInTransitLocation();
    const lines = getTransferLines(transferDocumentId);

    for (const line of lines) {
      const groupId = postTransferLineToInTransit(doc, line, inTransitId);
      runQuery(
        'UPDATE inv_transfer_lines SET transaction_group_id = ? WHERE id = ?',
        [groupId, line.id],
      );
    }

    runQuery(
      `UPDATE inv_transfer_documents SET status = 'In Transit', ship_date = ?, updated_at = ? WHERE id = ?`,
      [shipDate ?? now(), now(), transferDocumentId],
    );
  });
}

function postTransferLineToInTransit(
  doc: TransferDocument,
  line: TransferLine,
  inTransitId: number,
): string {
  if (line.inventory_type === 'MATERIAL') {
    if (!line.material_lot_id) throw new Error('Material line requires material lot.');
    const balance = getMaterialLotBalanceByLocation(line.material_lot_id, doc.origin_location_id);
    if (balance < line.quantity) {
      throw new Error(`Insufficient material at origin (need ${line.quantity}, have ${balance}).`);
    }
    const materialType = line.raw_material_id ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
    const groupId = transferMaterial({
      materialType,
      rawMaterialId: line.raw_material_id,
      packagingMaterialId: line.packaging_material_id,
      materialLotId: line.material_lot_id,
      sourceLocationId: doc.origin_location_id,
      destinationLocationId: inTransitId,
      quantity: line.quantity,
      unit: line.unit,
      notes: `Transfer ${doc.transfer_code} to in-transit`,
    });
    return groupId;
  }

  if (!line.fg_lot_id) throw new Error('Finished goods line requires FG lot.');
  const balance = computeFgLotBalance(line.fg_lot_id, doc.origin_location_id);
  if (balance < line.quantity) {
    throw new Error(`Insufficient FG at origin (need ${line.quantity}, have ${balance}).`);
  }
  transferFgLot({
    fgLotId: line.fg_lot_id,
    sourceLocationId: doc.origin_location_id,
    destinationLocationId: inTransitId,
    quantity: line.quantity,
    notes: `Transfer ${doc.transfer_code} to in-transit`,
  });
  const tx = queryOne<{ transaction_group_id: string }>(
    `SELECT transaction_group_id FROM fg_transactions
     WHERE fg_lot_id = ? AND transaction_type = 'Transfer Out'
     ORDER BY id DESC LIMIT 1`,
    [line.fg_lot_id],
  );
  return tx?.transaction_group_id ?? `TR-${line.id}-${Date.now()}`;
}

/** Receive transfer — moves inventory from in-transit to destination. Supports partial receipt. */
export function receiveTransferDocument(
  transferDocumentId: number,
  receipts: Array<{ lineId: number; quantity: number }>,
  receiveDate?: string,
): void {
  withDatabaseTransaction(() => {
    const doc = getTransferDocument(transferDocumentId);
    if (!doc) throw new Error('Transfer document not found.');
    if (doc.status !== 'In Transit' && doc.status !== 'Released') {
      throw new Error('Transfer must be In Transit to receive.');
    }
    const inTransitId = getOrCreateInTransitLocation();

    for (const receipt of receipts) {
      const line = queryOne<TransferLine>(
        'SELECT * FROM inv_transfer_lines WHERE id = ? AND transfer_document_id = ?',
        [receipt.lineId, transferDocumentId],
      );
      if (!line) throw new Error(`Transfer line ${receipt.lineId} not found.`);
      const remaining = line.quantity - line.received_quantity;
      if (receipt.quantity <= 0 || receipt.quantity > remaining) {
        throw new Error(`Invalid receipt quantity for line ${line.line_number}.`);
      }

      postTransferLineFromInTransit(doc, line, inTransitId, receipt.quantity);
      const newReceived = line.received_quantity + receipt.quantity;
      runQuery(
        'UPDATE inv_transfer_lines SET received_quantity = ? WHERE id = ?',
        [newReceived, line.id],
      );
    }

    const lines = getTransferLines(transferDocumentId);
    const allReceived = lines.every((l) => l.received_quantity >= l.quantity);
    const updatedStatus = allReceived ? 'Received' : 'In Transit';

    runQuery(
      `UPDATE inv_transfer_documents SET status = ?, receive_date = ?, updated_at = ? WHERE id = ?`,
      [updatedStatus, receiveDate ?? now(), now(), transferDocumentId],
    );
  });
}

function postTransferLineFromInTransit(
  doc: TransferDocument,
  line: TransferLine,
  inTransitId: number,
  quantity: number,
): void {
  if (line.inventory_type === 'MATERIAL') {
    if (!line.material_lot_id) throw new Error('Material line requires material lot.');
    const balance = getMaterialLotBalanceByLocation(line.material_lot_id, inTransitId);
    if (balance < quantity) {
      throw new Error(`Insufficient material in transit (need ${quantity}, have ${balance}).`);
    }
    const materialType = line.raw_material_id ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
    transferMaterial({
      materialType,
      rawMaterialId: line.raw_material_id,
      packagingMaterialId: line.packaging_material_id,
      materialLotId: line.material_lot_id,
      sourceLocationId: inTransitId,
      destinationLocationId: doc.destination_location_id,
      quantity,
      unit: line.unit,
      notes: `Transfer ${doc.transfer_code} received`,
    });
    return;
  }

  if (!line.fg_lot_id) throw new Error('Finished goods line requires FG lot.');
  const balance = computeFgLotBalance(line.fg_lot_id, inTransitId);
  if (balance < quantity) {
    throw new Error(`Insufficient FG in transit (need ${quantity}, have ${balance}).`);
  }
  transferFgLot({
    fgLotId: line.fg_lot_id,
    sourceLocationId: inTransitId,
    destinationLocationId: doc.destination_location_id,
    quantity,
    notes: `Transfer ${doc.transfer_code} received`,
  });
}

export function cancelTransferDocument(transferDocumentId: number): void {
  withDatabaseTransaction(() => {
    const doc = getTransferDocument(transferDocumentId);
    if (!doc) throw new Error('Transfer document not found.');
    if (doc.status === 'Received') throw new Error('Cannot cancel a received transfer.');
    if (doc.status === 'Cancelled') return;

    if (doc.status === 'In Transit') {
      throw new Error('In-transit transfers must be received or reversed, not cancelled.');
    }

    runQuery(
      `UPDATE inv_transfer_documents SET status = 'Cancelled', updated_at = ? WHERE id = ?`,
      [now(), transferDocumentId],
    );
  });
}

export function createCycleCount(locationId: number, countDate?: string, createdBy?: string | null): number {
  const code = nextBusinessCode('cycleCount', 'inv_cycle_counts', 'count_code');
  return insertRow(
    `INSERT INTO inv_cycle_counts (count_code, location_id, status, count_date, created_by, created_at, updated_at)
     VALUES (?, ?, 'Draft', ?, ?, ?, ?)`,
    [code, locationId, countDate ?? now().slice(0, 10), createdBy ?? null, now(), now()],
  );
}

export function addCycleCountLine(input: {
  cycleCountId: number;
  inventoryType: InventoryItemType;
  materialLotId?: number | null;
  fgLotId?: number | null;
  skuId?: number | null;
  systemQuantity: number;
  unit?: string;
}): number {
  const count = queryOne<CycleCount>('SELECT * FROM inv_cycle_counts WHERE id = ?', [input.cycleCountId]);
  if (!count) throw new Error('Cycle count not found.');
  if (count.status === 'Posted' || count.status === 'Cancelled') {
    throw new Error('Cannot add lines to a posted or cancelled count.');
  }

  return insertRow(
    `INSERT INTO inv_cycle_count_lines (
      cycle_count_id, inventory_type, material_lot_id, fg_lot_id, sku_id,
      system_quantity, unit
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.cycleCountId,
      input.inventoryType,
      input.materialLotId ?? null,
      input.fgLotId ?? null,
      input.skuId ?? null,
      input.systemQuantity,
      input.unit ?? 'each',
    ],
  );
}

export function recordCycleCount(input: {
  lineId: number;
  countedQuantity: number;
}): void {
  const line = queryOne<CycleCountLine>('SELECT * FROM inv_cycle_count_lines WHERE id = ?', [input.lineId]);
  if (!line) throw new Error('Cycle count line not found.');
  const variance = input.countedQuantity - line.system_quantity;
  runQuery(
    `UPDATE inv_cycle_count_lines SET counted_quantity = ?, variance_quantity = ? WHERE id = ?`,
    [input.countedQuantity, variance, input.lineId],
  );
  runQuery(
    `UPDATE inv_cycle_counts SET status = 'In Progress', updated_at = ? WHERE id = ?`,
    [now(), line.cycle_count_id],
  );
}

export function postCycleCountReconciliation(cycleCountId: number): void {
  withDatabaseTransaction(() => {
    const count = queryOne<CycleCount>('SELECT * FROM inv_cycle_counts WHERE id = ?', [cycleCountId]);
    if (!count) throw new Error('Cycle count not found.');
    if (count.status === 'Posted') throw new Error('Cycle count already posted.');
    if (count.status === 'Cancelled') throw new Error('Cannot post a cancelled count.');

    const lines = queryAll<CycleCountLine>(
      'SELECT * FROM inv_cycle_count_lines WHERE cycle_count_id = ? AND posted = 0',
      [cycleCountId],
    );

    for (const line of lines) {
      if (line.counted_quantity == null) {
        throw new Error(`Line ${line.id} has no counted quantity.`);
      }
      const variance = line.variance_quantity ?? 0;
      if (Math.abs(variance) < 0.0001) {
        runQuery('UPDATE inv_cycle_count_lines SET posted = 1 WHERE id = ?', [line.id]);
        continue;
      }

      if (line.inventory_type === 'FINISHED_GOODS' && line.fg_lot_id) {
        postFgCycleCountVariance(count.location_id, line);
      } else if (line.inventory_type === 'MATERIAL' && line.material_lot_id) {
        postMaterialCycleCountVariance(count.location_id, line);
      }

      runQuery('UPDATE inv_cycle_count_lines SET posted = 1 WHERE id = ?', [line.id]);
    }

    runQuery(
      `UPDATE inv_cycle_counts SET status = 'Posted', posted_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), cycleCountId],
    );
  });
}

function postFgCycleCountVariance(locationId: number, line: CycleCountLine): void {
  const variance = line.variance_quantity ?? 0;
  postFgCycleCountAdjustment({
    fgLotId: line.fg_lot_id!,
    locationId,
    varianceQuantity: variance,
    notes: 'Cycle count reconciliation',
  });
}

function postMaterialCycleCountVariance(locationId: number, line: CycleCountLine): void {
  const lot = queryOne<{ material_type: string; raw_material_id: number | null; packaging_material_id: number | null }>(
    'SELECT material_type, raw_material_id, packaging_material_id FROM mat_lots WHERE id = ?',
    [line.material_lot_id],
  );
  if (!lot) throw new Error('Material lot not found.');
  const physicalQty = line.counted_quantity ?? line.system_quantity;
  const recId = createMaterialReconciliation({
    material_type: lot.material_type as 'RAW_MATERIAL' | 'PACKAGING_MATERIAL',
    raw_material_id: lot.raw_material_id,
    packaging_material_id: lot.packaging_material_id,
    material_lot_id: line.material_lot_id,
    location_id: locationId,
    physical_quantity: physicalQty,
    unit: line.unit,
    base_unit: line.unit,
    reason: 'Cycle Count',
    counted_by: null,
    counted_at: now(),
    notes: 'Cycle count reconciliation',
  });
  postMaterialReconciliation(recId);
}

export function registerBarcode(input: {
  barcode: string;
  entityType: BarcodeEntityType;
  entityId: number;
  labelText?: string;
}): number {
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM inv_barcodes WHERE barcode = ? COLLATE NOCASE',
    [input.barcode],
  );
  if (existing) throw new Error(`Barcode ${input.barcode} is already registered.`);

  const entityDup = queryOne<{ id: number }>(
    'SELECT id FROM inv_barcodes WHERE entity_type = ? AND entity_id = ? AND active = 1',
    [input.entityType, input.entityId],
  );
  if (entityDup) throw new Error('Entity already has an active barcode.');

  return insertRow(
    `INSERT INTO inv_barcodes (barcode, entity_type, entity_id, label_text, active, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [input.barcode, input.entityType, input.entityId, input.labelText ?? '', now()],
  );
}

export function lookupBarcode(barcode: string): BarcodeRecord | null {
  return queryOne<BarcodeRecord>(
    'SELECT * FROM inv_barcodes WHERE barcode = ? COLLATE NOCASE AND active = 1',
    [barcode.trim()],
  );
}

export function generateBarcodeForEntity(input: {
  entityType: BarcodeEntityType;
  entityId: number;
  prefix?: string;
}): string {
  const prefix = input.prefix ?? input.entityType.slice(0, 3).toUpperCase();
  const code = `${prefix}-${String(input.entityId).padStart(8, '0')}`;
  registerBarcode({ barcode: code, entityType: input.entityType, entityId: input.entityId });
  return code;
}

export function buildLabelData(entityType: BarcodeEntityType, entityId: number): LabelData | null {
  const bc = queryOne<BarcodeRecord>(
    'SELECT * FROM inv_barcodes WHERE entity_type = ? AND entity_id = ? AND active = 1',
    [entityType, entityId],
  );

  if (entityType === 'fg_lot') {
    const lot = queryOne<{ fg_lot_code: string; printed_lot_code: string | null; production_date: string; sku_id: number }>(
      'SELECT fg_lot_code, printed_lot_code, production_date, sku_id FROM fg_lots WHERE id = ?',
      [entityId],
    );
    const sku = lot ? queryOne<{ sku_code: string; name: string }>(
      'SELECT sku_code, name FROM md_skus WHERE id = ?',
      [lot.sku_id],
    ) : null;
    if (!lot) return null;
    return {
      code: lot.fg_lot_code,
      description: sku?.name ?? '',
      lot: lot.printed_lot_code ?? lot.fg_lot_code,
      date: lot.production_date,
      barcode: bc?.barcode ?? lot.fg_lot_code,
    };
  }

  if (entityType === 'material_lot') {
    const lot = queryOne<{ lot_code: string; received_date: string }>(
      'SELECT lot_code, received_date FROM mat_lots WHERE id = ?',
      [entityId],
    );
    if (!lot) return null;
    return {
      code: lot.lot_code,
      description: 'Material Lot',
      lot: lot.lot_code,
      date: lot.received_date ?? '',
      barcode: bc?.barcode ?? lot.lot_code,
    };
  }

  if (entityType === 'storage_location') {
    const loc = queryOne<{ location_code: string; name: string }>(
      'SELECT location_code, name FROM md_storage_locations WHERE id = ?',
      [entityId],
    );
    if (!loc) return null;
    return {
      code: loc.location_code,
      description: loc.name,
      lot: '',
      date: now().slice(0, 10),
      barcode: bc?.barcode ?? loc.location_code,
    };
  }

  return null;
}

export function getLocationHierarchy(): LocationHierarchyNode[] {
  const rows = queryAll<{
    id: number;
    location_code: string;
    name: string;
    hierarchy_level: string | null;
    location_type: string;
    parent_location_id: number | null;
  }>(
    'SELECT id, location_code, name, hierarchy_level, location_type, parent_location_id FROM md_storage_locations WHERE active = 1 ORDER BY name',
  );

  const map = new Map<number, LocationHierarchyNode>();
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      location_code: row.location_code,
      name: row.name,
      hierarchy_level: row.hierarchy_level as LocationHierarchyNode['hierarchy_level'],
      location_type: row.location_type,
      parent_location_id: row.parent_location_id,
      children: [],
    });
  }

  const roots: LocationHierarchyNode[] = [];
  for (const node of map.values()) {
    if (node.parent_location_id && map.has(node.parent_location_id)) {
      map.get(node.parent_location_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function updateLocationHierarchy(id: number, hierarchyLevel: string | null, parentId: number | null): void {
  runQuery(
    'UPDATE md_storage_locations SET hierarchy_level = ?, parent_location_id = ?, updated_at = ? WHERE id = ?',
    [hierarchyLevel, parentId, now(), id],
  );
}

export function listCycleCounts(): CycleCount[] {
  return queryAll<CycleCount>('SELECT * FROM inv_cycle_counts ORDER BY created_at DESC');
}

export function getCycleCountLines(cycleCountId: number): CycleCountLine[] {
  return queryAll<CycleCountLine>(
    'SELECT * FROM inv_cycle_count_lines WHERE cycle_count_id = ?',
    [cycleCountId],
  );
}
