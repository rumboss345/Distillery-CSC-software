import { useEffect, useState } from 'react';
import { salesRepository } from '../../db/repositories/sales-repository';
import type { SalSalesOrder, SalShipment } from '../../types/sales';

export function ShipmentsPage() {
  const [shipments, setShipments] = useState<SalShipment[]>([]);
  const [orders, setOrders] = useState<SalSalesOrder[]>([]);
  const [orderId, setOrderId] = useState<number | ''>('');
  const [error, setError] = useState('');

  const refresh = () => {
    setShipments(salesRepository.listShipments());
    setOrders(
      salesRepository.listSalesOrders().filter((o) =>
        ['Confirmed', 'Partially Shipped'].includes(o.status),
      ),
    );
  };

  useEffect(() => {
    refresh();
  }, []);

  const handlePostDraft = (shipmentId: number) => {
    setError('');
    try {
      salesRepository.postShipment(shipmentId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post shipment.');
    }
  };

  const handleCreateFromOrder = () => {
    setError('');
    try {
      if (!orderId) throw new Error('Select a sales order.');
      const order = salesRepository.getSalesOrder(Number(orderId));
      if (!order?.ship_from_location_id) {
        throw new Error('Sales order has no ship-from location.');
      }
      const lines = salesRepository.getSalesOrderLines(Number(orderId));
      const shipmentId = salesRepository.createShipment({
        salesOrderId: Number(orderId),
        shipDate: new Date().toISOString().slice(0, 10),
        shipFromLocationId: order.ship_from_location_id,
      });
      for (const line of lines) {
        const remaining = line.ordered_quantity - line.shipped_quantity;
        if (remaining <= 0) continue;
        salesRepository.addShipmentLinesFromSuggestions({
          shipmentId,
          salesOrderLineId: line.id,
          skuId: line.sku_id,
          locationId: order.ship_from_location_id,
          quantity: remaining,
          method: 'FIFO',
        });
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create shipment.');
    }
  };

  return (
    <>
      <section className="card">
        <h2>Create Shipment</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-row">
          <label>
            Sales Order
            <select value={orderId} onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.order_code} — {o.status}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCreateFromOrder}>
            Create Draft Shipment (FIFO)
          </button>
        </div>
      </section>
      <table className="data-table">
        <thead>
          <tr>
            <th>Shipment</th>
            <th>Order</th>
            <th>Ship Date</th>
            <th>Status</th>
            <th>Posted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => {
            const order = salesRepository.getSalesOrder(s.sales_order_id);
            return (
              <tr key={s.id}>
                <td>{s.shipment_code}</td>
                <td>{order?.order_code ?? s.sales_order_id}</td>
                <td>{s.ship_date}</td>
                <td>{s.status}</td>
                <td>{s.posted_at ? s.posted_at.slice(0, 16) : '—'}</td>
                <td>
                  {s.status === 'Draft' && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => handlePostDraft(s.id)}>
                      Post
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
