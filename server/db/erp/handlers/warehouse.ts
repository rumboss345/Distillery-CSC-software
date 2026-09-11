import type pg from 'pg';
import { IN_TRANSIT_LOCATION_CODE } from '../../../../shared/multi-location/constants.js';
import { computeFgLotBalance, computeMaterialLotBalance } from '../balance-engine.js';
import { transferFgLot } from './finished-goods.js';
import { transferMaterial } from './material.js';
import {
  insertRow,
  nextBusinessCode,
  queryAll,
  queryOne,
  runQuery,
  withPgTransaction,
} from '../pg-helpers.js';
import { postFgCycleCountAdjustment } from './finished-goods-cycle-count.js';
import { createMaterialReconciliation, postMaterialReconciliation } from './material-reconciliation.js';

const now = () => new Date().toISOString();

async function getOrCreateInTransitLocation(client: pg.PoolClient): Promise<number> {
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM md_storage_locations WHERE location_code = $1',
    [IN_TRANSIT_LOCATION_CODE],
    client,
  );
  if (existing) return existing.id;

  return insertRow(
    `INSERT INTO md_storage_locations (location_code, name, location_type, description, active, hierarchy_level)
     VALUES ($1, 'In Transit', 'Other', 'System location for inventory between sites', TRUE, 'Site')`,
    [IN_TRANSIT_LOCATION_CODE],
    client,
  );
}

async function postTransferLineToInTransit(
  client: pg.PoolClient,
  doc: { origin_location_id: number; transfer_code: string },
  line: {
    id: number;
    inventory_type: string;
    material_lot_id: number | null;
    fg_lot_id: number | null;
    raw_material_id: number | null;
    packaging_material_id: number | null;
    quantity: number;
    unit: string;
  },
  inTransitId: number,
): Promise<string> {
  if (line.inventory_type === 'MATERIAL') {
    if (!line.material_lot_id) throw new Error('Material line requires material lot.');
    const balance = await computeMaterialLotBalance(line.material_lot_id, doc.origin_location_id);
    if (balance < line.quantity) {
      throw new Error(`Insufficient material at origin (need ${line.quantity}, have ${balance}).`);
    }
    const materialType = line.raw_material_id ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
    return transferMaterial({
      materialType,
      rawMaterialId: line.raw_material_id,
      packagingMaterialId: line.packaging_material_id,
      materialLotId: line.material_lot_id,
      sourceLocationId: doc.origin_location_id,
      destinationLocationId: inTransitId,
      quantity: line.quantity,
      unit: line.unit,
      baseQuantity: line.quantity,
      baseUnit: line.unit,
      notes: `Transfer ${doc.transfer_code} to in-transit`,
    });
  }

  if (!line.fg_lot_id) throw new Error('Finished goods line requires FG lot.');
  const balance = await computeFgLotBalance(line.fg_lot_id, doc.origin_location_id);
  if (balance < line.quantity) {
    throw new Error(`Insufficient FG at origin (need ${line.quantity}, have ${balance}).`);
  }
  await transferFgLot({
    fgLotId: line.fg_lot_id,
    sourceLocationId: doc.origin_location_id,
    destinationLocationId: inTransitId,
    quantity: line.quantity,
    notes: `Transfer ${doc.transfer_code} to in-transit`,
  });
  const tx = await queryOne<{ transaction_group_id: string }>(
    `SELECT transaction_group_id FROM fg_transactions
     WHERE fg_lot_id = $1 AND transaction_type = 'Transfer Out'
     ORDER BY id DESC LIMIT 1`,
    [line.fg_lot_id],
    client,
  );
  return tx?.transaction_group_id ?? `TR-${line.id}-${Date.now()}`;
}

export async function releaseTransferDocument(
  transferDocumentId: number,
  shipDate?: string,
): Promise<void> {
  await withPgTransaction(async (client) => {
    const doc = await queryOne<{
      id: number;
      status: string;
      origin_location_id: number;
      transfer_code: string;
    }>(
      'SELECT id, status, origin_location_id, transfer_code FROM inv_transfer_documents WHERE id = $1',
      [transferDocumentId],
      client,
    );
    if (!doc) throw new Error('Transfer document not found.');
    if (doc.status !== 'Draft') throw new Error('Only Draft transfers can be released.');

    const inTransitId = await getOrCreateInTransitLocation(client);
    const lines = await queryAll<{
      id: number;
      inventory_type: string;
      material_lot_id: number | null;
      fg_lot_id: number | null;
      raw_material_id: number | null;
      packaging_material_id: number | null;
      quantity: number;
      unit: string;
    }>(
      'SELECT * FROM inv_transfer_lines WHERE transfer_document_id = $1 ORDER BY line_number',
      [transferDocumentId],
      client,
    );

    for (const line of lines) {
      const groupId = await postTransferLineToInTransit(client, doc, line, inTransitId);
      await runQuery(
        'UPDATE inv_transfer_lines SET transaction_group_id = $1 WHERE id = $2',
        [groupId, line.id],
        client,
      );
    }

    await runQuery(
      `UPDATE inv_transfer_documents SET status = 'In Transit', ship_date = $1, updated_at = $2 WHERE id = $3`,
      [shipDate ?? now(), now(), transferDocumentId],
      client,
    );
  });
}

async function postTransferLineFromInTransit(
  client: pg.PoolClient,
  doc: { destination_location_id: number; transfer_code: string },
  line: {
    inventory_type: string;
    material_lot_id: number | null;
    fg_lot_id: number | null;
    raw_material_id: number | null;
    packaging_material_id: number | null;
    quantity: number;
    unit: string;
  },
  inTransitId: number,
  quantity: number,
): Promise<void> {
  if (line.inventory_type === 'MATERIAL') {
    if (!line.material_lot_id) throw new Error('Material line requires material lot.');
    const balance = await computeMaterialLotBalance(line.material_lot_id, inTransitId);
    if (balance < quantity) {
      throw new Error(`Insufficient material in transit (need ${quantity}, have ${balance}).`);
    }
    const materialType = line.raw_material_id ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
    await transferMaterial({
      materialType,
      rawMaterialId: line.raw_material_id,
      packagingMaterialId: line.packaging_material_id,
      materialLotId: line.material_lot_id,
      sourceLocationId: inTransitId,
      destinationLocationId: doc.destination_location_id,
      quantity,
      unit: line.unit,
      baseQuantity: quantity,
      baseUnit: line.unit,
      notes: `Transfer ${doc.transfer_code} received`,
    });
    return;
  }

  if (!line.fg_lot_id) throw new Error('Finished goods line requires FG lot.');
  const balance = await computeFgLotBalance(line.fg_lot_id, inTransitId);
  if (balance < quantity) {
    throw new Error(`Insufficient FG in transit (need ${quantity}, have ${balance}).`);
  }
  await transferFgLot({
    fgLotId: line.fg_lot_id,
    sourceLocationId: inTransitId,
    destinationLocationId: doc.destination_location_id,
    quantity,
    notes: `Transfer ${doc.transfer_code} received`,
  });
}

export async function receiveTransferDocument(
  transferDocumentId: number,
  receipts: Array<{ lineId: number; quantity: number }>,
  receiveDate?: string,
): Promise<void> {
  await withPgTransaction(async (client) => {
    const doc = await queryOne<{
      id: number;
      status: string;
      destination_location_id: number;
      transfer_code: string;
    }>(
      'SELECT id, status, destination_location_id, transfer_code FROM inv_transfer_documents WHERE id = $1',
      [transferDocumentId],
      client,
    );
    if (!doc) throw new Error('Transfer document not found.');
    if (doc.status !== 'In Transit' && doc.status !== 'Released') {
      throw new Error('Transfer must be In Transit to receive.');
    }
    const inTransitId = await getOrCreateInTransitLocation(client);

    for (const receipt of receipts) {
      const line = await queryOne<{
        id: number;
        line_number: number;
        inventory_type: string;
        material_lot_id: number | null;
        fg_lot_id: number | null;
        raw_material_id: number | null;
        packaging_material_id: number | null;
        quantity: number;
        received_quantity: number;
        unit: string;
      }>(
        'SELECT * FROM inv_transfer_lines WHERE id = $1 AND transfer_document_id = $2',
        [receipt.lineId, transferDocumentId],
        client,
      );
      if (!line) throw new Error(`Transfer line ${receipt.lineId} not found.`);
      const remaining = line.quantity - line.received_quantity;
      if (receipt.quantity <= 0 || receipt.quantity > remaining) {
        throw new Error(`Invalid receipt quantity for line ${line.line_number}.`);
      }

      await postTransferLineFromInTransit(client, doc, line, inTransitId, receipt.quantity);
      await runQuery(
        'UPDATE inv_transfer_lines SET received_quantity = $1 WHERE id = $2',
        [line.received_quantity + receipt.quantity, line.id],
        client,
      );
    }

    const lines = await queryAll<{ quantity: number; received_quantity: number }>(
      'SELECT quantity, received_quantity FROM inv_transfer_lines WHERE transfer_document_id = $1',
      [transferDocumentId],
      client,
    );
    const allReceived = lines.every((l) => l.received_quantity >= l.quantity);
    await runQuery(
      `UPDATE inv_transfer_documents SET status = $1, receive_date = $2, updated_at = $3 WHERE id = $4`,
      [allReceived ? 'Received' : 'In Transit', receiveDate ?? now(), now(), transferDocumentId],
      client,
    );
  });
}

export async function listTransferDocuments() {
  return queryAll('SELECT * FROM inv_transfer_documents ORDER BY created_at DESC');
}

export async function createCycleCount(
  locationId: number,
  countDate?: string,
  createdBy?: string | null,
): Promise<number> {
  return withPgTransaction(async (client) => {
    const code = await nextBusinessCode('cycleCount', 'inv_cycle_counts', 'count_code', 4, client);
    return insertRow(
      `INSERT INTO inv_cycle_counts (count_code, location_id, status, count_date, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Draft', $3, $4, $5, $5)`,
      [code, locationId, countDate ?? now().slice(0, 10), createdBy ?? null, now()],
      client,
    );
  });
}

export async function recordCycleCount(lineId: number, countedQuantity: number): Promise<void> {
  await withPgTransaction(async (client) => {
    const line = await queryOne<{ id: number; cycle_count_id: number; system_quantity: number }>(
      'SELECT id, cycle_count_id, system_quantity FROM inv_cycle_count_lines WHERE id = $1',
      [lineId],
      client,
    );
    if (!line) throw new Error('Cycle count line not found.');
    const variance = countedQuantity - line.system_quantity;
    await runQuery(
      'UPDATE inv_cycle_count_lines SET counted_quantity = $1, variance_quantity = $2 WHERE id = $3',
      [countedQuantity, variance, lineId],
      client,
    );
    await runQuery(
      `UPDATE inv_cycle_counts SET status = 'In Progress', updated_at = $1 WHERE id = $2`,
      [now(), line.cycle_count_id],
      client,
    );
  });
}

export async function postCycleCountReconciliation(cycleCountId: number): Promise<void> {
  await withPgTransaction(async (client) => {
    const count = await queryOne<{ id: number; status: string; location_id: number }>(
      'SELECT id, status, location_id FROM inv_cycle_counts WHERE id = $1',
      [cycleCountId],
      client,
    );
    if (!count) throw new Error('Cycle count not found.');
    if (count.status === 'Posted') throw new Error('Cycle count already posted.');
    if (count.status === 'Cancelled') throw new Error('Cannot post a cancelled count.');

    const lines = await queryAll<{
      id: number;
      inventory_type: string;
      material_lot_id: number | null;
      fg_lot_id: number | null;
      counted_quantity: number | null;
      variance_quantity: number | null;
      unit: string;
    }>(
      'SELECT * FROM inv_cycle_count_lines WHERE cycle_count_id = $1 AND posted = FALSE',
      [cycleCountId],
      client,
    );

    for (const line of lines) {
      if (line.counted_quantity == null) {
        throw new Error(`Line ${line.id} has no counted quantity.`);
      }
      const variance = line.variance_quantity ?? 0;
      if (Math.abs(variance) < 0.0001) {
        await runQuery('UPDATE inv_cycle_count_lines SET posted = TRUE WHERE id = $1', [line.id], client);
        continue;
      }

      if (line.inventory_type === 'FINISHED_GOODS' && line.fg_lot_id) {
        await postFgCycleCountAdjustment({
          fgLotId: line.fg_lot_id,
          locationId: count.location_id,
          varianceQuantity: variance,
          notes: 'Cycle count reconciliation',
        });
      } else if (line.inventory_type === 'MATERIAL' && line.material_lot_id) {
        const lot = await queryOne<{
          material_type: string;
          raw_material_id: number | null;
          packaging_material_id: number | null;
        }>(
          'SELECT material_type, raw_material_id, packaging_material_id FROM mat_lots WHERE id = $1',
          [line.material_lot_id],
          client,
        );
        if (!lot) throw new Error('Material lot not found.');
        const recId = await createMaterialReconciliation({
          material_type: lot.material_type as 'RAW_MATERIAL' | 'PACKAGING_MATERIAL',
          raw_material_id: lot.raw_material_id,
          packaging_material_id: lot.packaging_material_id,
          material_lot_id: line.material_lot_id,
          location_id: count.location_id,
          physical_quantity: line.counted_quantity,
          unit: line.unit,
          base_unit: line.unit,
          reason: 'Cycle Count',
          counted_by: null,
          counted_at: now(),
          notes: 'Cycle count reconciliation',
        });
        await postMaterialReconciliation(recId);
      }

      await runQuery('UPDATE inv_cycle_count_lines SET posted = TRUE WHERE id = $1', [line.id], client);
    }

    await runQuery(
      `UPDATE inv_cycle_counts SET status = 'Posted', posted_at = $1, updated_at = $1 WHERE id = $2`,
      [now(), cycleCountId],
      client,
    );
  });
}

export async function listCycleCounts() {
  return queryAll('SELECT * FROM inv_cycle_counts ORDER BY created_at DESC');
}
