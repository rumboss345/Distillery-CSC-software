import { queryAll } from '../pg-helpers.js';

export async function listMaterialLots(filters?: {
  materialType?: string;
  rawMaterialId?: number;
  packagingMaterialId?: number;
}) {
  let sql = `SELECT l.*, COALESCE(rm.name, pm.name) AS material_name
    FROM mat_lots l
    LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id
    LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id
    WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.materialType) {
    sql += ` AND l.material_type = $${idx++}`;
    params.push(filters.materialType);
  }
  if (filters?.rawMaterialId != null) {
    sql += ` AND l.raw_material_id = $${idx++}`;
    params.push(filters.rawMaterialId);
  }
  if (filters?.packagingMaterialId != null) {
    sql += ` AND l.packaging_material_id = $${idx++}`;
    params.push(filters.packagingMaterialId);
  }
  sql += ' ORDER BY l.received_date DESC NULLS LAST, l.id DESC';
  return queryAll(sql, params);
}

export async function listMaterialTransactions(filters?: {
  lotId?: number;
  transactionType?: string;
  limit?: number;
}) {
  let sql = 'SELECT * FROM mat_transactions WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.lotId != null) {
    sql += ` AND material_lot_id = $${idx++}`;
    params.push(filters.lotId);
  }
  if (filters?.transactionType) {
    sql += ` AND transaction_type = $${idx++}`;
    params.push(filters.transactionType);
  }
  sql += ` ORDER BY transaction_timestamp DESC, id DESC LIMIT $${idx++}`;
  params.push(filters?.limit ?? 500);
  return queryAll(sql, params);
}

export async function listLiquidLots(status?: string) {
  const sql = `
    SELECT l.*, p.name AS product_name, bs.name AS bulk_spirit_name
    FROM liq_lots l
    LEFT JOIN md_products p ON p.id = l.product_id
    LEFT JOIN md_bulk_spirits bs ON bs.id = l.bulk_spirit_id
    ${status ? 'WHERE l.status = $1' : ''}
    ORDER BY l.created_at DESC, l.id DESC`;
  return queryAll(sql, status ? [status] : []);
}

export async function listLiquidTransactions(filters?: {
  lotId?: number;
  tankId?: number;
  limit?: number;
}) {
  let sql = 'SELECT * FROM liq_transactions WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.lotId != null) {
    sql += ` AND (source_lot_id = $${idx} OR destination_lot_id = $${idx})`;
    params.push(filters.lotId);
    idx++;
  }
  if (filters?.tankId != null) {
    sql += ` AND (source_tank_id = $${idx} OR destination_tank_id = $${idx})`;
    params.push(filters.tankId);
    idx++;
  }
  sql += ` ORDER BY transaction_timestamp DESC, id DESC LIMIT $${idx++}`;
  params.push(filters?.limit ?? 500);
  return queryAll(sql, params);
}

export async function listFgLots() {
  return queryAll(`
    SELECT fl.*, s.sku_code, s.name AS sku_name
    FROM fg_lots fl
    JOIN md_skus s ON s.id = fl.sku_id
    ORDER BY fl.created_at DESC`);
}

export async function listFgTransactions(fgLotId?: number) {
  const sql = fgLotId
    ? 'SELECT * FROM fg_transactions WHERE fg_lot_id = $1 ORDER BY transaction_timestamp DESC, id DESC LIMIT 500'
    : 'SELECT * FROM fg_transactions ORDER BY transaction_timestamp DESC, id DESC LIMIT 500';
  return queryAll(sql, fgLotId != null ? [fgLotId] : []);
}

export async function listSalesOrders(filters?: { status?: string; customerId?: number }) {
  let sql = `SELECT o.*, c.customer_code, c.company_name AS customer_name
    FROM sal_sales_orders o
    JOIN sal_customers c ON c.id = o.customer_id WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.status) {
    sql += ` AND o.status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters?.customerId != null) {
    sql += ` AND o.customer_id = $${idx++}`;
    params.push(filters.customerId);
  }
  sql += ' ORDER BY o.order_date DESC, o.id DESC';
  return queryAll(sql, params);
}

export async function listShipments(filters?: { salesOrderId?: number; status?: string }) {
  let sql = 'SELECT * FROM sal_shipments WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.salesOrderId != null) {
    sql += ` AND sales_order_id = $${idx++}`;
    params.push(filters.salesOrderId);
  }
  if (filters?.status) {
    sql += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  sql += ' ORDER BY created_at DESC';
  return queryAll(sql, params);
}

export async function listQualityHolds(filters?: { status?: string; entityType?: string }) {
  let sql = 'SELECT * FROM qc_holds WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.status) {
    sql += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters?.entityType) {
    sql += ` AND entity_type = $${idx++}`;
    params.push(filters.entityType);
  }
  sql += ' ORDER BY placed_at DESC';
  return queryAll(sql, params);
}

export async function listQualitySamples(filters?: {
  sourceEntityType?: string;
  sourceEntityId?: number;
}) {
  let sql = 'SELECT * FROM qc_samples WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.sourceEntityType) {
    sql += ` AND source_entity_type = $${idx++}`;
    params.push(filters.sourceEntityType);
  }
  if (filters?.sourceEntityId != null) {
    sql += ` AND source_entity_id = $${idx++}`;
    params.push(filters.sourceEntityId);
  }
  sql += ' ORDER BY collected_at DESC';
  return queryAll(sql, params);
}
