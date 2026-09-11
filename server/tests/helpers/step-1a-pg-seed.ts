import type pg from 'pg';

async function upsertByCode(
  client: pg.PoolClient,
  table: string,
  codeColumn: string,
  code: string,
  insertSql: string,
  insertParams: unknown[],
): Promise<number> {
  const inserted = await client.query<{ id: number }>(
    `${insertSql.replace(' RETURNING id', '')}
     ON CONFLICT (${codeColumn}) DO UPDATE SET ${codeColumn} = EXCLUDED.${codeColumn}
     RETURNING id`,
    insertParams,
  );
  return inserted.rows[0]!.id;
}

export async function seedMinimalErpMasterData(client: pg.PoolClient): Promise<{
  rawMaterialId: number;
  locationA: number;
  locationB: number;
  tankA: number;
  tankB: number;
  skuId: number;
}> {
  await client.query(
    `UPDATE md_code_sequences SET last_number = 0
     WHERE entity_type IN ('materialTransaction', 'liquidTransaction', 'operationGroup', 'fgTransaction', 'materialOperationGroup')`,
  );
  await client.query(`DELETE FROM mat_transactions`);
  await client.query(`DELETE FROM mat_lots`);
  await client.query(`DELETE FROM liq_transactions`);
  await client.query(`DELETE FROM liq_lots`);
  await client.query(`DELETE FROM liq_tanks WHERE tank_code IN ('T-A', 'T-B')`);
  await client.query(`DELETE FROM fg_transactions`);
  await client.query(`DELETE FROM fg_lots`);

  const rawMaterialId = await upsertByCode(
    client,
    'md_raw_materials',
    'material_code',
    'RM-TEST',
    `INSERT INTO md_raw_materials (material_code, name, material_type, inventory_unit, purchase_unit, conversion_factor, active, inventory_tracking_mode)
     VALUES ($1, 'Test Sugar', 'Sweetener', 'kg', 'bag', 50, true, 'LEDGER') RETURNING id`,
    ['RM-TEST'],
  );

  const locationA = await upsertByCode(
    client,
    'md_storage_locations',
    'location_code',
    'LOC-A',
    `INSERT INTO md_storage_locations (location_code, name, location_type, active)
     VALUES ($1, 'Warehouse A', 'Raw Material Warehouse', true) RETURNING id`,
    ['LOC-A'],
  );

  const locationB = await upsertByCode(
    client,
    'md_storage_locations',
    'location_code',
    'LOC-B',
    `INSERT INTO md_storage_locations (location_code, name, location_type, active)
     VALUES ($1, 'Warehouse B', 'Raw Material Warehouse', true) RETURNING id`,
    ['LOC-B'],
  );

  const tankA = await client.query<{ id: number }>(
    `INSERT INTO liq_tanks (tank_code, name, tank_type, capacity_litres, tracking_mode, status)
     VALUES ('T-A', 'Tank A', 'Spirit Tank', 1000, 'LEDGER', 'Active') RETURNING id`,
  );
  const tankB = await client.query<{ id: number }>(
    `INSERT INTO liq_tanks (tank_code, name, tank_type, capacity_litres, tracking_mode, status)
     VALUES ('T-B', 'Tank B', 'Spirit Tank', 1000, 'LEDGER', 'Active') RETURNING id`,
  );

  let skuId: number;
  const existingSku = await client.query<{ id: number }>(
    `SELECT id FROM md_skus WHERE sku_code = 'SKU-TEST'`,
  );
  if (existingSku.rows[0]?.id) {
    skuId = existingSku.rows[0].id;
  } else {
    const productId = await upsertByCode(
      client,
      'md_products',
      'product_code',
      'PROD-TEST',
      `INSERT INTO md_products (product_code, name, category, status)
       VALUES ($1, 'Test Rum', 'Spirits', 'Active') RETURNING id`,
      ['PROD-TEST'],
    );
    const skuRow = await client.query<{ id: number }>(
      `INSERT INTO md_skus (sku_code, product_id, name, package_size, containers_per_case, status)
       VALUES ('SKU-TEST', $1, 'Test Rum 750mL', 750, 12, 'Active') RETURNING id`,
      [productId],
    );
    skuId = skuRow.rows[0]!.id;
  }

  return {
    rawMaterialId,
    locationA,
    locationB,
    tankA: tankA.rows[0]!.id,
    tankB: tankB.rows[0]!.id,
    skuId,
  };
}
