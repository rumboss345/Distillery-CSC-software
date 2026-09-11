/**
 * Phase 1N Sales, Depletions, Shipments & COGS Recognition.
 * Browser-local operational sales — no AR, no GL posting.
 */
import {
  LOT_ALLOCATION_METHODS,
  RETURN_DISPOSITIONS,
  SALES_CHANNELS,
  SALES_ORDER_STATUSES,
  SALES_ORDER_TYPES,
  type LotAllocationMethod,
  type ReturnDisposition,
  type SalesChannel,
} from '../../shared/sales/constants';
import type {
  AddReturnLineInput,
  AddSalesOrderLineInput,
  AddShipmentLineInput,
  CreateCustomerInput,
  CreateReturnInput,
  CreateSalesOrderInput,
  CreateShipmentInput,
  DepletionAnalyticsRow,
  LotAllocationSuggestion,
  SalCogsRecord,
  SalCustomer,
  SalReturn,
  SalReturnLine,
  SalSalesOrder,
  SalSalesOrderLine,
  SalShipment,
  SalShipmentLine,
} from '../types/sales';
import {
  computeFgLotBalance,
  postFgDamage,
  postFgReturn,
  postFgShipment,
  postFgWriteOff,
} from './finished-goods-queries';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { nextBusinessCode } from './master-data-queries';

const now = () => new Date().toISOString();

function assertValidChannel(channel: string): asserts channel is SalesChannel {
  if (!SALES_CHANNELS.includes(channel as SalesChannel)) {
    throw new Error(`Invalid sales channel: ${channel}`);
  }
}

function assertValidOrderType(orderType: string): void {
  if (!SALES_ORDER_TYPES.includes(orderType as (typeof SALES_ORDER_TYPES)[number])) {
    throw new Error(`Invalid sales order type: ${orderType}`);
  }
}

function assertValidDisposition(disposition: string): asserts disposition is ReturnDisposition {
  if (!RETURN_DISPOSITIONS.includes(disposition as ReturnDisposition)) {
    throw new Error(`Invalid return disposition: ${disposition}`);
  }
}

function assertValidAllocationMethod(method: string): asserts method is LotAllocationMethod {
  if (!LOT_ALLOCATION_METHODS.includes(method as LotAllocationMethod)) {
    throw new Error(`Invalid lot allocation method: ${method}`);
  }
}

// ─── Customers ─────────────────────────────────────────────────────────────

export function createCustomer(input: CreateCustomerInput): number {
  assertValidChannel(input.channel);
  const code = nextBusinessCode('customer', 'sal_customers', 'customer_code');
  const ts = now();
  return insertRow(
    `INSERT INTO sal_customers (
      customer_code, name, channel, contact_name, contact_email, contact_phone,
      ship_to_address, active, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      code,
      input.name.trim(),
      input.channel,
      input.contactName ?? null,
      input.contactEmail ?? null,
      input.contactPhone ?? null,
      input.shipToAddress ?? '',
      input.notes ?? '',
      ts,
      ts,
    ],
  );
}

export function getCustomer(id: number): SalCustomer | null {
  return queryOne<SalCustomer>('SELECT * FROM sal_customers WHERE id = ?', [id]);
}

export function listCustomers(activeOnly = true): SalCustomer[] {
  return queryAll<SalCustomer>(
    `SELECT * FROM sal_customers${activeOnly ? ' WHERE active = 1' : ''} ORDER BY name COLLATE NOCASE`,
  );
}

// ─── Sales Orders ────────────────────────────────────────────────────────────

export function createSalesOrder(input: CreateSalesOrderInput): number {
  const customer = getCustomer(input.customerId);
  if (!customer || !customer.active) throw new Error('Customer not found or inactive.');
  const channel = input.channel ?? (customer.channel as SalesChannel);
  assertValidChannel(channel);
  const orderType = input.orderType ?? 'Sale';
  assertValidOrderType(orderType);

  const code = nextBusinessCode('salesOrder', 'sal_sales_orders', 'order_code', 6);
  const ts = now();
  return insertRow(
    `INSERT INTO sal_sales_orders (
      order_code, customer_id, channel, order_type, order_date, requested_ship_date,
      ship_from_location_id, status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
    [
      code,
      input.customerId,
      channel,
      orderType,
      input.orderDate,
      input.requestedShipDate ?? null,
      input.shipFromLocationId ?? null,
      input.notes ?? '',
      input.createdBy ?? null,
      ts,
      ts,
    ],
  );
}

export function getSalesOrder(id: number): SalSalesOrder | null {
  return queryOne<SalSalesOrder>('SELECT * FROM sal_sales_orders WHERE id = ?', [id]);
}

export function listSalesOrders(filters?: { status?: string; customerId?: number }): SalSalesOrder[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.customerId != null) {
    clauses.push('customer_id = ?');
    params.push(filters.customerId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<SalSalesOrder>(
    `SELECT * FROM sal_sales_orders ${where} ORDER BY order_date DESC, created_at DESC`,
    params as (string | number)[],
  );
}

export function addSalesOrderLine(input: AddSalesOrderLineInput): number {
  const order = getSalesOrder(input.salesOrderId);
  if (!order) throw new Error('Sales order not found.');
  if (order.status !== 'Draft') throw new Error('Lines can only be added to Draft sales orders.');

  const sku = queryOne<{ id: number }>(
    'SELECT id FROM md_skus WHERE id = ? AND status = ?',
    [input.skuId, 'Active'],
  );
  if (!sku) throw new Error('SKU not found or inactive.');
  if (input.orderedQuantity <= 0) throw new Error('Ordered quantity must be positive.');

  const lineNum =
    (queryOne<{ max_n: number }>(
      'SELECT COALESCE(MAX(line_number), 0) AS max_n FROM sal_sales_order_lines WHERE sales_order_id = ?',
      [input.salesOrderId],
    )?.max_n ?? 0) + 1;

  return insertRow(
    `INSERT INTO sal_sales_order_lines (
      sales_order_id, line_number, sku_id, ordered_quantity, shipped_quantity, unit, notes
    ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [
      input.salesOrderId,
      lineNum,
      input.skuId,
      input.orderedQuantity,
      input.unit ?? 'each',
      input.notes ?? '',
    ],
  );
}

export function getSalesOrderLines(salesOrderId: number): SalSalesOrderLine[] {
  return queryAll<SalSalesOrderLine>(
    'SELECT * FROM sal_sales_order_lines WHERE sales_order_id = ? ORDER BY line_number',
    [salesOrderId],
  );
}

export function confirmSalesOrder(salesOrderId: number): void {
  const order = getSalesOrder(salesOrderId);
  if (!order) throw new Error('Sales order not found.');
  if (order.status !== 'Draft') throw new Error('Only Draft sales orders can be confirmed.');
  const lineCount =
    queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM sal_sales_order_lines WHERE sales_order_id = ?',
      [salesOrderId],
    )?.count ?? 0;
  if (lineCount === 0) throw new Error('Sales order requires at least one line.');
  runQuery(
    `UPDATE sal_sales_orders SET status = 'Confirmed', updated_at = ? WHERE id = ?`,
    [now(), salesOrderId],
  );
}

function refreshSalesOrderShipStatus(salesOrderId: number): void {
  const lines = getSalesOrderLines(salesOrderId);
  if (lines.length === 0) return;

  const allShipped = lines.every((l) => l.shipped_quantity >= l.ordered_quantity - 1e-9);
  const anyShipped = lines.some((l) => l.shipped_quantity > 0);
  let status: (typeof SALES_ORDER_STATUSES)[number];
  if (allShipped) status = 'Shipped';
  else if (anyShipped) status = 'Partially Shipped';
  else return;

  runQuery(`UPDATE sal_sales_orders SET status = ?, updated_at = ? WHERE id = ?`, [
    status,
    now(),
    salesOrderId,
  ]);
}

// ─── Lot Allocation Suggestions ──────────────────────────────────────────────

export function suggestLotAllocations(input: {
  skuId: number;
  locationId: number;
  quantity: number;
  method: LotAllocationMethod;
}): LotAllocationSuggestion[] {
  assertValidAllocationMethod(input.method);
  if (input.quantity <= 0) throw new Error('Quantity must be positive.');

  const orderClause =
    input.method === 'FEFO'
      ? `CASE WHEN fl.expiration_date IS NULL OR fl.expiration_date = '' THEN 1 ELSE 0 END,
         fl.expiration_date ASC, fl.production_date ASC, fl.fg_lot_code ASC`
      : 'fl.production_date ASC, fl.fg_lot_code ASC';

  const lots = queryAll<{
    id: number;
    fg_lot_code: string;
    sku_id: number;
    production_date: string;
    expiration_date: string | null;
    unit_cost_kyd: number | null;
  }>(
    `SELECT fl.id, fl.fg_lot_code, fl.sku_id, fl.production_date, fl.expiration_date, fl.unit_cost_kyd
     FROM fg_lots fl
     WHERE fl.sku_id = ? AND fl.status IN ('Available', 'Released')
     ORDER BY ${orderClause}`,
    [input.skuId],
  );

  const suggestions: LotAllocationSuggestion[] = [];
  let remaining = input.quantity;

  for (const lot of lots) {
    if (remaining <= 1e-9) break;
    const available = computeFgLotBalance(lot.id, input.locationId);
    if (available <= 1e-9) continue;
    const take = Math.min(available, remaining);
    suggestions.push({
      fgLotId: lot.id,
      fgLotCode: lot.fg_lot_code,
      skuId: lot.sku_id,
      locationId: input.locationId,
      availableQuantity: available,
      productionDate: lot.production_date,
      expirationDate: lot.expiration_date,
      unitCostKyd: lot.unit_cost_kyd,
      suggestedQuantity: take,
      allocationMethod: input.method,
    });
    remaining -= take;
  }

  if (remaining > 1e-9) {
    throw new Error(
      `Insufficient FG inventory for allocation (${input.quantity - remaining} of ${input.quantity} available).`,
    );
  }

  return suggestions;
}

// ─── Shipments ───────────────────────────────────────────────────────────────

export function createShipment(input: CreateShipmentInput): number {
  const order = getSalesOrder(input.salesOrderId);
  if (!order) throw new Error('Sales order not found.');
  if (!['Confirmed', 'Partially Shipped'].includes(order.status)) {
    throw new Error('Shipment requires a Confirmed or Partially Shipped sales order.');
  }

  const loc = queryOne<{ id: number; active: number }>(
    'SELECT id, active FROM md_storage_locations WHERE id = ?',
    [input.shipFromLocationId],
  );
  if (!loc?.active) throw new Error('Ship-from location not found or inactive.');

  const code = nextBusinessCode('salesShipment', 'sal_shipments', 'shipment_code');
  const ts = now();
  return insertRow(
    `INSERT INTO sal_shipments (
      shipment_code, sales_order_id, customer_id, channel, ship_from_location_id,
      ship_date, status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
    [
      code,
      input.salesOrderId,
      order.customer_id,
      order.channel,
      input.shipFromLocationId,
      input.shipDate,
      input.notes ?? '',
      input.createdBy ?? null,
      ts,
      ts,
    ],
  );
}

export function getShipment(id: number): SalShipment | null {
  return queryOne<SalShipment>('SELECT * FROM sal_shipments WHERE id = ?', [id]);
}

export function listShipments(filters?: { salesOrderId?: number; status?: string }): SalShipment[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.salesOrderId != null) {
    clauses.push('sales_order_id = ?');
    params.push(filters.salesOrderId);
  }
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<SalShipment>(
    `SELECT * FROM sal_shipments ${where} ORDER BY ship_date DESC, created_at DESC`,
    params as (string | number)[],
  );
}

export function getShipmentLines(shipmentId: number): SalShipmentLine[] {
  return queryAll<SalShipmentLine>(
    'SELECT * FROM sal_shipment_lines WHERE shipment_id = ? ORDER BY line_number',
    [shipmentId],
  );
}

export function addShipmentLine(input: AddShipmentLineInput): number {
  const shipment = getShipment(input.shipmentId);
  if (!shipment) throw new Error('Shipment not found.');
  if (shipment.status !== 'Draft') throw new Error('Cannot modify a posted shipment.');

  const lot = queryOne<{ id: number; sku_id: number; unit_cost_kyd: number | null }>(
    'SELECT id, sku_id, unit_cost_kyd FROM fg_lots WHERE id = ?',
    [input.fgLotId],
  );
  if (!lot) throw new Error('FG lot not found.');
  if (lot.sku_id !== input.skuId) throw new Error('FG lot SKU does not match line SKU.');
  if (input.quantity <= 0) throw new Error('Shipment quantity must be positive.');

  const balance = computeFgLotBalance(input.fgLotId, input.sourceLocationId);
  if (balance < input.quantity) {
    throw new Error(`Insufficient lot quantity (${balance} available).`);
  }

  if (input.salesOrderLineId != null) {
    const orderLine = queryOne<SalSalesOrderLine>(
      'SELECT * FROM sal_sales_order_lines WHERE id = ? AND sales_order_id = ?',
      [input.salesOrderLineId, shipment.sales_order_id],
    );
    if (!orderLine) throw new Error('Sales order line not found.');
    if (orderLine.sku_id !== input.skuId) throw new Error('Sales order line SKU mismatch.');
    const remaining = orderLine.ordered_quantity - orderLine.shipped_quantity;
    if (input.quantity > remaining + 1e-9) {
      throw new Error(`Quantity exceeds remaining order line balance (${remaining}).`);
    }
  }

  const method = input.allocationMethod ?? 'Manual';
  assertValidAllocationMethod(method);

  const lineNum =
    (queryOne<{ max_n: number }>(
      'SELECT COALESCE(MAX(line_number), 0) AS max_n FROM sal_shipment_lines WHERE shipment_id = ?',
      [input.shipmentId],
    )?.max_n ?? 0) + 1;

  return insertRow(
    `INSERT INTO sal_shipment_lines (
      shipment_id, line_number, sales_order_line_id, sku_id, fg_lot_id, source_location_id,
      quantity, allocation_method, unit_cost_kyd_snapshot, extended_cost_kyd, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.shipmentId,
      lineNum,
      input.salesOrderLineId ?? null,
      input.skuId,
      input.fgLotId,
      input.sourceLocationId,
      input.quantity,
      method,
      lot.unit_cost_kyd,
      lot.unit_cost_kyd != null ? lot.unit_cost_kyd * input.quantity : null,
      input.notes ?? '',
    ],
  );
}

export function addShipmentLinesFromSuggestions(input: {
  shipmentId: number;
  salesOrderLineId: number;
  skuId: number;
  locationId: number;
  quantity: number;
  method: LotAllocationMethod;
}): number[] {
  const suggestions = suggestLotAllocations({
    skuId: input.skuId,
    locationId: input.locationId,
    quantity: input.quantity,
    method: input.method,
  });
  return suggestions.map((s) =>
    addShipmentLine({
      shipmentId: input.shipmentId,
      salesOrderLineId: input.salesOrderLineId,
      skuId: input.skuId,
      fgLotId: s.fgLotId,
      sourceLocationId: input.locationId,
      quantity: s.suggestedQuantity,
      allocationMethod: s.allocationMethod,
    }),
  );
}

/** Post shipment — immutable FG Shipment ledger entries & operational COGS snapshots. */
export function postShipment(shipmentId: number, createdBy?: string | null): void {
  withDatabaseTransaction(() => {
    const shipment = getShipment(shipmentId);
    if (!shipment) throw new Error('Shipment not found.');
    if (shipment.status === 'Posted') throw new Error('Shipment has already been posted.');
    if (shipment.status === 'Cancelled') throw new Error('Cannot post a cancelled shipment.');

    const lines = getShipmentLines(shipmentId);
    if (lines.length === 0) throw new Error('Shipment requires at least one line.');

    const order = getSalesOrder(shipment.sales_order_id);
    if (!order) throw new Error('Sales order not found.');

    const postedAt = now();

    for (const line of lines) {
      const lot = queryOne<{ unit_cost_kyd: number | null; sku_id: number }>(
        'SELECT unit_cost_kyd, sku_id FROM fg_lots WHERE id = ?',
        [line.fg_lot_id],
      );
      if (!lot) throw new Error('FG lot not found.');
      const unitCost = lot.unit_cost_kyd;
      if (unitCost == null) throw new Error('FG lot must be valued before shipment.');

      const fgTxId = postFgShipment({
        fgLotId: line.fg_lot_id,
        sourceLocationId: line.source_location_id,
        quantity: line.quantity,
        referenceType: 'sales_shipment',
        referenceId: shipmentId,
        notes: `Shipment ${shipment.shipment_code}`,
        createdBy: createdBy ?? null,
      });

      const extendedCost = unitCost * line.quantity;
      runQuery(
        `UPDATE sal_shipment_lines SET
          unit_cost_kyd_snapshot = ?,
          extended_cost_kyd = ?,
          fg_transaction_id = ?
         WHERE id = ?`,
        [unitCost, extendedCost, fgTxId, line.id],
      );

      const productId = queryOne<{ product_id: number }>(
        'SELECT product_id FROM md_skus WHERE id = ?',
        [line.sku_id],
      )?.product_id ?? null;

      insertRow(
        `INSERT INTO sal_cogs_records (
          shipment_id, shipment_line_id, sales_order_id, customer_id, channel,
          sku_id, product_id, fg_lot_id, source_location_id, quantity,
          unit_cost_kyd_snapshot, extended_cost_kyd, recognition_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shipmentId,
          line.id,
          shipment.sales_order_id,
          shipment.customer_id,
          shipment.channel,
          line.sku_id,
          productId,
          line.fg_lot_id,
          line.source_location_id,
          line.quantity,
          unitCost,
          extendedCost,
          shipment.ship_date,
          postedAt,
        ],
      );

      if (line.sales_order_line_id != null) {
        runQuery(
          `UPDATE sal_sales_order_lines SET shipped_quantity = shipped_quantity + ? WHERE id = ?`,
          [line.quantity, line.sales_order_line_id],
        );
      }
    }

    runQuery(
      `UPDATE sal_shipments SET status = 'Posted', posted_at = ?, updated_at = ? WHERE id = ?`,
      [postedAt, postedAt, shipmentId],
    );

    refreshSalesOrderShipStatus(shipment.sales_order_id);
  });
}

export function getCogsRecords(filters?: {
  shipmentId?: number;
  salesOrderId?: number;
  skuId?: number;
  customerId?: number;
}): SalCogsRecord[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.shipmentId != null) {
    clauses.push('shipment_id = ?');
    params.push(filters.shipmentId);
  }
  if (filters?.salesOrderId != null) {
    clauses.push('sales_order_id = ?');
    params.push(filters.salesOrderId);
  }
  if (filters?.skuId != null) {
    clauses.push('sku_id = ?');
    params.push(filters.skuId);
  }
  if (filters?.customerId != null) {
    clauses.push('customer_id = ?');
    params.push(filters.customerId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<SalCogsRecord>(
    `SELECT * FROM sal_cogs_records ${where} ORDER BY recognition_date DESC, id DESC`,
    params as (string | number)[],
  );
}

// ─── Returns ─────────────────────────────────────────────────────────────────

export function createReturn(input: CreateReturnInput): number {
  const customer = getCustomer(input.customerId);
  if (!customer) throw new Error('Customer not found.');

  if (input.shipmentId != null) {
    const shipment = getShipment(input.shipmentId);
    if (!shipment) throw new Error('Shipment not found.');
    if (shipment.status !== 'Posted') throw new Error('Returns require a posted shipment.');
  }

  const code = nextBusinessCode('salesReturn', 'sal_returns', 'return_code');
  const ts = now();
  return insertRow(
    `INSERT INTO sal_returns (
      return_code, shipment_id, sales_order_id, customer_id, return_date,
      status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
    [
      code,
      input.shipmentId ?? null,
      input.salesOrderId ?? null,
      input.customerId,
      input.returnDate,
      input.notes ?? '',
      input.createdBy ?? null,
      ts,
      ts,
    ],
  );
}

export function getReturn(id: number): SalReturn | null {
  return queryOne<SalReturn>('SELECT * FROM sal_returns WHERE id = ?', [id]);
}

export function listReturns(filters?: { status?: string; shipmentId?: number }): SalReturn[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.shipmentId != null) {
    clauses.push('shipment_id = ?');
    params.push(filters.shipmentId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<SalReturn>(
    `SELECT * FROM sal_returns ${where} ORDER BY return_date DESC, created_at DESC`,
    params as (string | number)[],
  );
}

export function getReturnLines(returnId: number): SalReturnLine[] {
  return queryAll<SalReturnLine>(
    'SELECT * FROM sal_return_lines WHERE return_id = ? ORDER BY line_number',
    [returnId],
  );
}

export function addReturnLine(input: AddReturnLineInput): number {
  const ret = getReturn(input.returnId);
  if (!ret) throw new Error('Return not found.');
  if (ret.status !== 'Draft') throw new Error('Cannot modify a posted return.');
  assertValidDisposition(input.disposition);
  if (input.quantity <= 0) throw new Error('Return quantity must be positive.');

  let unitCost: number | null = null;
  if (input.shipmentLineId != null) {
    const shipLine = queryOne<SalShipmentLine>(
      'SELECT * FROM sal_shipment_lines WHERE id = ?',
      [input.shipmentLineId],
    );
    if (!shipLine) throw new Error('Shipment line not found.');
    unitCost = shipLine.unit_cost_kyd_snapshot;
  } else {
    unitCost =
      queryOne<{ unit_cost_kyd: number | null }>(
        'SELECT unit_cost_kyd FROM fg_lots WHERE id = ?',
        [input.fgLotId],
      )?.unit_cost_kyd ?? null;
  }

  if (input.destinationLocationId == null) {
    throw new Error('Return line requires a destination location.');
  }

  const lineNum =
    (queryOne<{ max_n: number }>(
      'SELECT COALESCE(MAX(line_number), 0) AS max_n FROM sal_return_lines WHERE return_id = ?',
      [input.returnId],
    )?.max_n ?? 0) + 1;

  return insertRow(
    `INSERT INTO sal_return_lines (
      return_id, line_number, shipment_line_id, fg_lot_id, sku_id, quantity,
      disposition, destination_location_id, unit_cost_kyd_snapshot, extended_cost_kyd, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.returnId,
      lineNum,
      input.shipmentLineId ?? null,
      input.fgLotId,
      input.skuId,
      input.quantity,
      input.disposition,
      input.destinationLocationId ?? null,
      unitCost,
      unitCost != null ? unitCost * input.quantity : null,
      input.notes ?? '',
    ],
  );
}

export function postReturn(returnId: number, createdBy?: string | null): void {
  withDatabaseTransaction(() => {
    const ret = getReturn(returnId);
    if (!ret) throw new Error('Return not found.');
    if (ret.status === 'Posted') throw new Error('Return has already been posted.');
    if (ret.status === 'Cancelled') throw new Error('Cannot post a cancelled return.');

    const lines = getReturnLines(returnId);
    if (lines.length === 0) throw new Error('Return requires at least one line.');

    const postedAt = now();

    for (const line of lines) {
      const unitCost = line.unit_cost_kyd_snapshot;
      const locId = line.destination_location_id;
      if (!locId) throw new Error('Return line requires a destination location.');

      postFgReturn({
        fgLotId: line.fg_lot_id,
        destinationLocationId: locId,
        quantity: line.quantity,
        unitCostKyd: unitCost,
        referenceType: 'sales_return',
        referenceId: returnId,
        notes: `Return ${ret.return_code}`,
        createdBy: createdBy ?? null,
      });

      let fgTxId: number;
      if (line.disposition === 'Return to Stock') {
        fgTxId = queryOne<{ id: number }>(
          `SELECT id FROM fg_transactions
           WHERE reference_type = 'sales_return' AND reference_id = ?
           ORDER BY id DESC LIMIT 1`,
          [returnId],
        )!.id;
      } else if (line.disposition === 'Write-Off') {
        fgTxId = postFgWriteOff({
          fgLotId: line.fg_lot_id,
          locationId: locId,
          quantity: line.quantity,
          reason: `Return write-off ${ret.return_code}`,
          createdBy: createdBy ?? null,
        });
      } else {
        fgTxId = postFgDamage({
          fgLotId: line.fg_lot_id,
          locationId: locId,
          quantity: line.quantity,
          reason: `Return damage ${ret.return_code}`,
          createdBy: createdBy ?? null,
        });
      }

      runQuery('UPDATE sal_return_lines SET fg_transaction_id = ? WHERE id = ?', [fgTxId, line.id]);
    }

    runQuery(
      `UPDATE sal_returns SET status = 'Posted', posted_at = ?, updated_at = ? WHERE id = ?`,
      [postedAt, postedAt, returnId],
    );
  });
}

// ─── Depletion Analytics ─────────────────────────────────────────────────────

export function getDepletionAnalytics(filters?: {
  periodStart?: string;
  periodEnd?: string;
  skuId?: number;
  productId?: number;
  customerId?: number;
  channel?: SalesChannel;
  locationId?: number;
}): DepletionAnalyticsRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.periodStart) {
    clauses.push('c.recognition_date >= ?');
    params.push(filters.periodStart);
  }
  if (filters?.periodEnd) {
    clauses.push('c.recognition_date <= ?');
    params.push(filters.periodEnd);
  }
  if (filters?.skuId != null) {
    clauses.push('c.sku_id = ?');
    params.push(filters.skuId);
  }
  if (filters?.productId != null) {
    clauses.push('c.product_id = ?');
    params.push(filters.productId);
  }
  if (filters?.customerId != null) {
    clauses.push('c.customer_id = ?');
    params.push(filters.customerId);
  }
  if (filters?.channel) {
    clauses.push('c.channel = ?');
    params.push(filters.channel);
  }
  if (filters?.locationId != null) {
    clauses.push('c.source_location_id = ?');
    params.push(filters.locationId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return queryAll<DepletionAnalyticsRow>(
    `SELECT
      substr(c.recognition_date, 1, 7) AS period,
      c.sku_id AS skuId,
      s.sku_code AS skuCode,
      s.name AS skuName,
      c.product_id AS productId,
      p.name AS productName,
      c.customer_id AS customerId,
      cu.name AS customerName,
      c.channel,
      c.source_location_id AS locationId,
      l.name AS locationName,
      SUM(c.quantity) AS quantity,
      SUM(c.extended_cost_kyd) AS extendedCostKyd
     FROM sal_cogs_records c
     JOIN md_skus s ON s.id = c.sku_id
     LEFT JOIN md_products p ON p.id = c.product_id
     JOIN sal_customers cu ON cu.id = c.customer_id
     JOIN md_storage_locations l ON l.id = c.source_location_id
     ${where}
     GROUP BY period, c.sku_id, c.product_id, c.customer_id, c.channel, c.source_location_id
     ORDER BY period DESC, skuCode, customerName`,
    params as (string | number)[],
  );
}

export function getSalesDashboardSummary(): {
  activeCustomers: number;
  openOrders: number;
  postedShipments: number;
  totalDepletionQty: number;
  totalCogsKyd: number;
} {
  const activeCustomers =
    queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM sal_customers WHERE active = 1')?.count ?? 0;
  const openOrders =
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sal_sales_orders WHERE status IN ('Draft', 'Confirmed', 'Partially Shipped')`,
    )?.count ?? 0;
  const postedShipments =
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sal_shipments WHERE status = 'Posted'`,
    )?.count ?? 0;
  const totals = queryOne<{ qty: number; cost: number }>(
    `SELECT COALESCE(SUM(quantity), 0) AS qty, COALESCE(SUM(extended_cost_kyd), 0) AS cost FROM sal_cogs_records`,
  );
  return {
    activeCustomers,
    openOrders,
    postedShipments,
    totalDepletionQty: totals?.qty ?? 0,
    totalCogsKyd: totals?.cost ?? 0,
  };
}
