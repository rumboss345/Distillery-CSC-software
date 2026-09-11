import type pg from 'pg';
import { postFgShipmentWithClient } from './finished-goods.js';
import { insertRow, queryAll, queryOne, runQuery, withPgTransaction } from '../pg-helpers.js';

const now = () => new Date().toISOString();

/** Post shipment — immutable FG Shipment ledger entries & operational COGS snapshots. */
export async function postShipment(
  shipmentId: number,
  createdBy?: string | null,
): Promise<void> {
  await withPgTransaction(async (client) => {
    const shipment = await queryOne<{
      id: number;
      status: string;
      shipment_code: string;
      sales_order_id: number;
      customer_id: number;
      channel: string;
      ship_date: string;
    }>('SELECT * FROM sal_shipments WHERE id = $1', [shipmentId], client);
    if (!shipment) throw new Error('Shipment not found.');
    if (shipment.status === 'Posted') throw new Error('Shipment has already been posted.');
    if (shipment.status === 'Cancelled') throw new Error('Cannot post a cancelled shipment.');

    const lines = await queryAll<{
      id: number;
      fg_lot_id: number;
      sku_id: number;
      source_location_id: number;
      quantity: number;
      sales_order_line_id: number | null;
    }>(
      'SELECT id, fg_lot_id, sku_id, source_location_id, quantity, sales_order_line_id FROM sal_shipment_lines WHERE shipment_id = $1 ORDER BY line_number',
      [shipmentId],
      client,
    );
    if (lines.length === 0) throw new Error('Shipment requires at least one line.');

    const postedAt = now();

    for (const line of lines) {
      const lot = await queryOne<{ unit_cost_kyd: number | null }>(
        'SELECT unit_cost_kyd FROM fg_lots WHERE id = $1',
        [line.fg_lot_id],
        client,
      );
      if (!lot) throw new Error('FG lot not found.');
      const unitCost = lot.unit_cost_kyd;
      if (unitCost == null) throw new Error('FG lot must be valued before shipment.');

      const fgTxId = await postFgShipmentWithClient(client, {
        fgLotId: line.fg_lot_id,
        sourceLocationId: line.source_location_id,
        quantity: line.quantity,
        referenceType: 'sales_shipment',
        referenceId: shipmentId,
        notes: `Shipment ${shipment.shipment_code}`,
        createdBy: createdBy ?? null,
      });

      const extendedCost = unitCost * line.quantity;
      await runQuery(
        `UPDATE sal_shipment_lines SET
          unit_cost_kyd_snapshot = $1,
          extended_cost_kyd = $2,
          fg_transaction_id = $3
         WHERE id = $4`,
        [unitCost, extendedCost, fgTxId, line.id],
        client,
      );

      const productId =
        (
          await queryOne<{ product_id: number }>(
            'SELECT product_id FROM md_skus WHERE id = $1',
            [line.sku_id],
            client,
          )
        )?.product_id ?? null;

      await insertRow(
        `INSERT INTO sal_cogs_records (
          shipment_id, shipment_line_id, sales_order_id, customer_id, channel,
          sku_id, product_id, fg_lot_id, source_location_id, quantity,
          unit_cost_kyd_snapshot, extended_cost_kyd, recognition_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        client,
      );

      if (line.sales_order_line_id != null) {
        await runQuery(
          'UPDATE sal_sales_order_lines SET shipped_quantity = shipped_quantity + $1 WHERE id = $2',
          [line.quantity, line.sales_order_line_id],
          client,
        );
      }
    }

    await runQuery(
      `UPDATE sal_shipments SET status = 'Posted', posted_at = $1, updated_at = $2 WHERE id = $3`,
      [postedAt, postedAt, shipmentId],
      client,
    );

    await refreshSalesOrderShipStatus(client, shipment.sales_order_id);
  });
}

async function refreshSalesOrderShipStatus(client: pg.PoolClient, salesOrderId: number): Promise<void> {
  const lines = await queryAll<{ ordered_quantity: number; shipped_quantity: number }>(
    'SELECT ordered_quantity, shipped_quantity FROM sal_sales_order_lines WHERE sales_order_id = $1',
    [salesOrderId],
    client,
  );
  if (lines.length === 0) return;

  const allShipped = lines.every((l) => l.shipped_quantity >= l.ordered_quantity - 1e-9);
  const anyShipped = lines.some((l) => l.shipped_quantity > 0);
  let status: string | null = null;
  if (allShipped) status = 'Shipped';
  else if (anyShipped) status = 'Partially Shipped';
  if (status) {
    await runQuery(
      'UPDATE sal_sales_orders SET status = $1, updated_at = $2 WHERE id = $3',
      [status, now(), salesOrderId],
      client,
    );
  }
}
