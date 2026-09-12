/**
 * Step 1A extended concurrency scenarios (requires DATABASE_URL).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, withTransaction, queryOne } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import { postMaterialTransaction } from '../../db/erp/handlers/material.js';
import { transferLiquid } from '../../db/erp/handlers/liquid.js';
import { placeHold, releaseHold } from '../../db/erp/handlers/quality.js';
import { computeMaterialLotBalance } from '../../db/erp/balance-engine.js';
import { seedMinimalErpMasterData } from '../helpers/step-1a-pg-seed.js';
import { insertRow } from '../../db/erp/pg-helpers.js';

const pgConfigured = Boolean(process.env.DATABASE_URL);

describe('Step 1A extended concurrency', { skip: !pgConfigured }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await closePool();
  });

  it('A: concurrent material issue cannot double-consume limited lot', async () => {
    const seed = await withTransaction((client) => seedMinimalErpMasterData(client));
    const lotId = await withTransaction(async (client) =>
      insertRow(
        `INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status, received_date)
         VALUES ($1, 'RAW_MATERIAL', $2, 'Active', NOW())`,
        ['LOT-A', seed.rawMaterialId],
        client,
      ),
    );

    await postMaterialTransaction({
      transactionType: 'Opening Balance',
      materialType: 'RAW_MATERIAL',
      rawMaterialId: seed.rawMaterialId,
      materialLotId: lotId,
      destinationLocationId: seed.locationA,
      quantity: 100,
      unit: 'kg',
      baseQuantity: 100,
      baseUnit: 'kg',
    });

    const attempts = await Promise.allSettled([
      postMaterialTransaction({
        transactionType: 'Production Issue',
        materialType: 'RAW_MATERIAL',
        rawMaterialId: seed.rawMaterialId,
        materialLotId: lotId,
        sourceLocationId: seed.locationA,
        quantity: 60,
        unit: 'kg',
        baseQuantity: 60,
        baseUnit: 'kg',
      }),
      postMaterialTransaction({
        transactionType: 'Production Issue',
        materialType: 'RAW_MATERIAL',
        rawMaterialId: seed.rawMaterialId,
        materialLotId: lotId,
        sourceLocationId: seed.locationA,
        quantity: 60,
        unit: 'kg',
        baseQuantity: 60,
        baseUnit: 'kg',
      }),
    ]);

    const succeeded = attempts.filter((a) => a.status === 'fulfilled').length;
    const balance = await computeMaterialLotBalance(lotId, seed.locationA);
    assert.ok(balance >= 0, `Negative balance: ${balance}`);
    assert.ok(balance <= 100);
    assert.ok(succeeded >= 1);
  });

  it('B: concurrent liquid transfers cannot overdraw source tank', async () => {
    const seed = await withTransaction((client) => seedMinimalErpMasterData(client));
    const lotId = await withTransaction(async (client) =>
      insertRow(
        `INSERT INTO liq_lots (lot_code, lot_type, status, initial_volume_litres, initial_abv, initial_lpa)
         VALUES ($1, 'Bulk Spirit', 'Active', 100, 40, 40)`,
        ['LIQ-A'],
        client,
      ),
    );
    const { postLiquidTransaction } = await import('../../db/erp/handlers/liquid.js');
    await postLiquidTransaction({
      transaction_type: 'Receipt',
      destination_tank_id: seed.tankA,
      destination_lot_id: lotId,
      volume_litres: 100,
      abv: 40,
    });

    const attempts = await Promise.allSettled([
      transferLiquid({
        sourceTankId: seed.tankA,
        destinationTankId: seed.tankB,
        sourceLotId: lotId,
        volumeLitres: 70,
      }),
      transferLiquid({
        sourceTankId: seed.tankA,
        destinationTankId: seed.tankB,
        sourceLotId: lotId,
        volumeLitres: 70,
      }),
    ]);

    const volRow = await withTransaction(async (client) =>
      client.query<{ vol: string }>(
        `SELECT
          COALESCE(SUM(CASE WHEN destination_tank_id = $1 THEN volume_litres ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN source_tank_id = $1 THEN volume_litres ELSE 0 END), 0) AS vol
         FROM liq_transactions WHERE source_tank_id = $1 OR destination_tank_id = $1`,
        [seed.tankA],
      ),
    );
    const balance = Number(volRow.rows[0]?.vol ?? 0);
    assert.ok(balance >= 0);
    assert.ok(balance <= 100);
    assert.ok(attempts.filter((a) => a.status === 'fulfilled').length >= 1);
  });

  it('F: QA hold blocks shipment until released', async () => {
    const seed = await withTransaction((client) => seedMinimalErpMasterData(client));
    const fgLotId = await withTransaction(async (client) => {
      const lotId = await insertRow(
        `INSERT INTO fg_lots (fg_lot_code, sku_id, production_date, initial_quantity, unit_cost_kyd, status, quality_status, cost_status)
         VALUES ($1, $2, CURRENT_DATE, 100, 5.0, 'Available', 'Released', 'VALUED')`,
        ['FG-TEST', seed.skuId],
        client,
      );
      await insertRow(
        `INSERT INTO fg_transactions (
          transaction_code, transaction_type, transaction_timestamp, fg_lot_id, sku_id,
          destination_location_id, quantity, base_quantity, base_unit, created_at
        ) VALUES ($1, 'Receipt', NOW(), $2, $3, $4, 100, 100, 'each', NOW())`,
        ['FGTX-001', lotId, seed.skuId, seed.locationA],
        client,
      );
      return lotId;
    });

    const { postFgShipment } = await import('../../db/erp/handlers/finished-goods.js');
    const holdId = await placeHold({
      entityType: 'fg_lot',
      entityId: fgLotId,
      reason: 'Test hold',
      placedBy: 'test@local',
    });

    await assert.rejects(
      () =>
        postFgShipment({
          fgLotId,
          sourceLocationId: seed.locationA,
          quantity: 10,
          createdBy: 'test@local',
        }),
      /hold/i,
    );

    await releaseHold({ holdId, releasedBy: 'test@local', releaseNotes: 'cleared' });
    const txId = await postFgShipment({
      fgLotId,
      sourceLocationId: seed.locationA,
      quantity: 10,
      createdBy: 'test@local',
    });
    assert.ok(txId > 0);
  });
});
