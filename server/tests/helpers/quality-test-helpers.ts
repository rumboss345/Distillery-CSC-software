import { Database } from 'sql.js/dist/sql-wasm.js';
import { queryOne } from '../../../src/db/database';
import {
  completePackagingRun,
  createPackagingRun,
  startPackagingRun,
} from '../../../src/db/finished-goods-queries';
import { createLiquidCostLayer } from '../../../src/db/costing-queries';
import {
  completeBatch,
  createOrder,
  planOrder,
  recordInput,
  releaseOrder,
  startBatch,
} from '../../../src/db/production-orders-queries';
import {
  createCostingTestDb,
  seedProofDownScenario,
  seedReceiptWithCost,
} from './costing-test-helpers';
import { runPackagingToFg, seedPackagingReadyBatch } from './finished-goods-test-helpers';

export { createCostingTestDb, seedPackagingReadyBatch, runPackagingToFg, seedProofDownScenario, seedReceiptWithCost };

export async function seedTraceableProductionChain(db: Database) {
  const scenario = seedProofDownScenario(db);
  db.run(
    `INSERT INTO md_storage_locations (location_code, name, location_type, active)
     VALUES ('FG-WH', 'Finished Goods Warehouse', 'Finished Goods Warehouse', 1)`,
  );
  const fgLocId = queryOne<{ id: number }>(
    "SELECT id FROM md_storage_locations WHERE location_code = 'FG-WH'",
  )!.id;

  db.run(
    `INSERT INTO md_skus (sku_code, product_id, name, package_type, package_size, package_size_unit, containers_per_case, status)
     VALUES ('SKU-VOD-750', ?, 'Vodka 750mL', 'bottle', 750, 'mL', 12, 'Active')`,
    [scenario.productId],
  );
  const skuId = queryOne<{ id: number }>('SELECT id FROM md_skus WHERE sku_code = ?', ['SKU-VOD-750'])!.id;

  const { locA, lotId: pkgLotId, pkgId } = seedReceiptWithCost(db, { quantity: 5000, unitCost: 0.2 });
  db.run(`UPDATE mat_lots SET supplier_lot_number = 'SUP-LOT-2026-A' WHERE id = ?`, [pkgLotId]);

  const orderId = createOrder({
    productId: scenario.productId,
    recipeId: scenario.recipeId,
    recipeVersionId: scenario.versionId,
    plannedBatchSize: 2400,
    productionType: 'Proof Down',
    skuId,
  });
  planOrder(orderId);
  const batchId = releaseOrder(orderId);
  startBatch(batchId);
  recordInput({
    batchId,
    inputType: 'Liquid Lot',
    liquidLotId: scenario.lotId,
    sourceTankId: scenario.sourceTankId,
    actualQuantity: 400,
    unit: 'L',
    actualVolumeLitres: 400,
    actualAbv: 96,
  });
  recordInput({
    batchId,
    inputType: 'Water',
    actualQuantity: 600,
    unit: 'L',
    actualVolumeLitres: 600,
  });
  recordInput({
    batchId,
    inputType: 'Packaging',
    packagingMaterialId: pkgId,
    materialLotId: pkgLotId,
    sourceLocationId: locA,
    actualQuantity: 1200,
    unit: 'each',
  });
  completeBatch({
    batchId,
    destinationTankId: scenario.destTankId,
    actualOutputLitres: 990,
    actualOutputAbv: 40,
    notes: 'QC trace test batch',
  });

  const outputLotId = queryOne<{ output_lot_id: number }>(
    'SELECT output_lot_id FROM prod_batches WHERE id = ?',
    [batchId],
  )!.output_lot_id;

  createLiquidCostLayer({
    liquidLotId: outputLotId,
    sourceType: 'Proof Down',
    effectiveDate: '2026-01-15',
    volumeLitres: 990,
    lpa: 396,
    inputCostKyd: 5000,
    conversionCostKyd: 800,
    totalCostKyd: 5800,
    unitCostPerLitreKyd: 5800 / 990,
  });

  const runId = createPackagingRun({
    productionBatchId: batchId,
    skuId,
    liquidLotId: outputLotId,
    sourceTankId: scenario.destTankId,
    destinationLocationId: fgLocId,
    plannedQuantity: 1200,
  });
  startPackagingRun(runId);
  const { fgLotId } = completePackagingRun({
    runId,
    actualGoodQuantity: 1192,
    liquidConsumedLitres: 894,
    printedLotCode: 'PRINT-QC-001',
  });

  return {
    scenario,
    skuId,
    fgLocId,
    pkgLotId,
    batchId,
    outputLotId,
    fgLotId,
    supplierLotNumber: 'SUP-LOT-2026-A',
  };
}
