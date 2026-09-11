/**
 * System-wide recall traceability integration — Supplier Lot through shipment.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { queryAll, queryOne } from '../../../src/db/database';
import { computeFgLotBalance } from '../../../src/db/finished-goods-queries';
import { traceRecallBackward, traceRecallForward } from '../../../src/db/quality-queries';
import { getShipmentLines } from '../../../src/db/sales-queries';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import { seedTraceableProductionChain } from '../helpers/quality-test-helpers';
import {
  createAccountingIntegrationTestDb,
  postShipmentForTraceChain,
} from '../helpers/accounting-integration-test-helpers';

describe('End-to-end recall traceability', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('forward trace: supplier lot → batches → liquid → FG → location → shipped qty', async () => {
    db = await createAccountingIntegrationTestDb();
    const chain = await seedTraceableProductionChain(db);
    const onHandBeforeShip = computeFgLotBalance(chain.fgLotId, chain.fgLocId);
    const sales = postShipmentForTraceChain(chain);

    const forward = traceRecallForward(chain.supplierLotNumber);
    assert.equal(forward.direction, 'forward');
    assert.ok(forward.nodes.some((n) => n.level === 'supplier_lot' && n.code === chain.supplierLotNumber));
    assert.ok(forward.nodes.some((n) => n.level === 'material_lot' && n.id === chain.pkgLotId));
    assert.ok(forward.nodes.some((n) => n.level === 'production_batch' && n.id === chain.batchId));
    assert.ok(forward.nodes.some((n) => n.level === 'liquid_lot' && n.id === chain.outputLotId));
    assert.ok(forward.nodes.some((n) => n.level === 'fg_lot' && n.id === chain.fgLotId));

    const fgLocation = queryOne<{ location_code: string; name: string }>(
      `SELECT l.location_code, l.name
       FROM md_storage_locations l
       WHERE l.id = ?`,
      [chain.fgLocId],
    );
    assert.ok(fgLocation);

    assert.ok(onHandBeforeShip >= 100);

    const shipmentLines = getShipmentLines(sales.shipmentId);
    assert.equal(shipmentLines.length, 1);
    assert.equal(shipmentLines[0]!.fg_lot_id, chain.fgLotId);
    assert.equal(shipmentLines[0]!.source_location_id, chain.fgLocId);
    assert.equal(shipmentLines[0]!.quantity, 100);

    const fgTx = queryAll<{ transaction_type: string; quantity: number; source_location_id: number }>(
      `SELECT transaction_type, quantity, source_location_id
       FROM fg_transactions
       WHERE fg_lot_id = ? AND reference_type = 'sales_shipment'`,
      [chain.fgLotId],
    );
    assert.ok(fgTx.some((tx) => tx.transaction_type === 'Shipment' && tx.quantity === 100));
    assert.ok(fgTx.every((tx) => tx.source_location_id === chain.fgLocId));

    const remaining = computeFgLotBalance(chain.fgLotId, chain.fgLocId);
    assert.equal(remaining, onHandBeforeShip - 100);
  });

  it('backward trace: shipment / FG lot → batches → material → supplier lot', async () => {
    db = await createAccountingIntegrationTestDb();
    const chain = await seedTraceableProductionChain(db);
    const sales = postShipmentForTraceChain(chain);

    const backwardFromFg = traceRecallBackward(chain.fgLotId);
    assert.equal(backwardFromFg.direction, 'backward');
    assert.ok(backwardFromFg.nodes.some((n) => n.level === 'fg_lot' && n.id === chain.fgLotId));
    assert.ok(backwardFromFg.nodes.some((n) => n.level === 'production_batch' && n.id === chain.batchId));
    assert.ok(backwardFromFg.nodes.some((n) => n.level === 'liquid_lot' && n.id === chain.outputLotId));
    assert.ok(backwardFromFg.nodes.some((n) => n.level === 'material_lot' && n.id === chain.pkgLotId));
    assert.ok(
      backwardFromFg.nodes.some(
        (n) => n.level === 'supplier_lot' && n.code === chain.supplierLotNumber,
      ),
    );

    const shipmentLine = getShipmentLines(sales.shipmentId)[0]!;
    const backwardAnchor = traceRecallBackward(shipmentLine.fg_lot_id);
    assert.ok(backwardAnchor.nodes.some((n) => n.level === 'fg_lot' && n.id === chain.fgLotId));
    assert.ok(
      backwardAnchor.nodes.some(
        (n) => n.level === 'supplier_lot' && n.supplier_lot_number === chain.supplierLotNumber,
      ),
    );

    const matLot = queryOne<{ supplier_lot_number: string }>(
      'SELECT supplier_lot_number FROM mat_lots WHERE id = ?',
      [chain.pkgLotId],
    );
    assert.equal(matLot?.supplier_lot_number, chain.supplierLotNumber);
  });

  it('partial shipment retains trace link while updating shipped quantities', async () => {
    db = await createAccountingIntegrationTestDb();
    const chain = await seedTraceableProductionChain(db);
    postShipmentForTraceChain(chain, { quantity: 100, shipDate: '2026-02-10' });
    postShipmentForTraceChain(chain, { quantity: 50, shipDate: '2026-03-05' });

    const trace = traceRecallForward(chain.supplierLotNumber);
    assert.ok(trace.nodes.some((n) => n.level === 'fg_lot' && n.id === chain.fgLotId));

    const shippedTotal = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0) AS total
       FROM fg_transactions
       WHERE fg_lot_id = ? AND transaction_type = 'Shipment'`,
      [chain.fgLotId],
    )?.total ?? 0;
    assert.equal(shippedTotal, 150);
  });
});
