/**
 * Step 1A PostgreSQL end-to-end operational workflow (requires DATABASE_URL).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, withTransaction } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import { postMaterialTransaction } from '../../db/erp/handlers/material.js';
import { postLiquidTransaction, transferLiquid } from '../../db/erp/handlers/liquid.js';
import { postFgShipment } from '../../db/erp/handlers/finished-goods.js';
import { seedMinimalErpMasterData } from '../helpers/step-1a-pg-seed.js';
import { insertRow } from '../../db/erp/pg-helpers.js';
import { computeMaterialLotBalance } from '../../db/erp/balance-engine.js';

const pgConfigured = Boolean(process.env.DATABASE_URL);

describe('Step 1A E2E PostgreSQL workflow', { skip: !pgConfigured }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await closePool();
  });

  it('runs supplier receipt through shipment with traceable lot genealogy', async () => {
    const seed = await withTransaction((client) => seedMinimalErpMasterData(client));

    const matLotId = await withTransaction(async (client) =>
      insertRow(
        `INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status, received_date)
         VALUES ($1, 'RAW_MATERIAL', $2, 'Active', NOW())`,
        ['SUP-LOT-1', seed.rawMaterialId],
        client,
      ),
    );

    await postMaterialTransaction({
      transactionType: 'Receipt',
      materialType: 'RAW_MATERIAL',
      rawMaterialId: seed.rawMaterialId,
      materialLotId: matLotId,
      destinationLocationId: seed.locationA,
      quantity: 200,
      unit: 'kg',
      baseQuantity: 200,
      baseUnit: 'kg',
      sourceDocumentType: 'pur_receipt',
      sourceDocumentId: 1,
    });

    const matBal = await computeMaterialLotBalance(matLotId, seed.locationA);
    assert.ok(matBal >= 200);

    const liqLotId = await withTransaction(async (client) =>
      insertRow(
        `INSERT INTO liq_lots (lot_code, lot_type, status, initial_volume_litres, initial_abv, initial_lpa, source_type, source_reference_id)
         VALUES ($1, 'Bulk Spirit', 'Active', 500, 40, 200, 'material_lot', $2)`,
        ['LIQ-E2E-1', matLotId],
        client,
      ),
    );

    await postLiquidTransaction({
      transaction_type: 'Production Output',
      destination_tank_id: seed.tankA,
      destination_lot_id: liqLotId,
      volume_litres: 500,
      abv: 40,
      source_document_type: 'prod_batch',
      source_document_id: 1,
    });

    await transferLiquid({
      sourceTankId: seed.tankA,
      destinationTankId: seed.tankB,
      sourceLotId: liqLotId,
      volumeLitres: 100,
    });

    const fgLotId = await withTransaction(async (client) => {
      const lotId = await insertRow(
        `INSERT INTO fg_lots (fg_lot_code, sku_id, production_date, initial_quantity, unit_cost_kyd, status, quality_status, cost_status)
         VALUES ($1, $2, CURRENT_DATE, 50, 8.5, 'Available', 'Released', 'VALUED')`,
        ['FG-E2E-1', seed.skuId],
        client,
      );
      await insertRow(
        `INSERT INTO fg_transactions (
          transaction_code, transaction_type, transaction_timestamp, fg_lot_id, sku_id,
          destination_location_id, quantity, base_quantity, base_unit, unit_cost_kyd_snapshot, created_at
        ) VALUES ($1, 'Receipt', NOW(), $2, $3, $4, 50, 50, 'each', 8.5, NOW())`,
        ['FGTX-E2E', lotId, seed.skuId, seed.locationA],
        client,
      );
      return lotId;
    });

    const shipTxId = await postFgShipment({
      fgLotId,
      sourceLocationId: seed.locationA,
      quantity: 10,
      referenceType: 'sales_shipment',
      referenceId: 1,
      createdBy: 'e2e@test.local',
    });
    assert.ok(shipTxId > 0);

    const trace = await withTransaction(async (client) => {
      const liq = await client.query<{ source_reference_id: number | null }>(
        'SELECT source_reference_id FROM liq_lots WHERE id = $1',
        [liqLotId],
      );
      const shipTx = await client.query<{ id: number }>(
        `SELECT id FROM fg_transactions WHERE fg_lot_id = $1 AND transaction_type = 'Shipment'`,
        [fgLotId],
      );
      return {
        materialLotId: liq.rows[0]?.source_reference_id,
        shipmentPosted: (shipTx.rows.length ?? 0) > 0,
      };
    });

    assert.equal(trace.materialLotId, matLotId);
    assert.equal(trace.shipmentPosted, true);
  });
});
