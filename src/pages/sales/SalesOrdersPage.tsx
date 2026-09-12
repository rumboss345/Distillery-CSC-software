import { useEffect, useState } from 'react';
import { salesRepository } from '../../db/repositories/sales-repository';
import { masterDataRepository } from '../../db/repositories';
import type { SalCustomer, SalSalesOrder } from '../../types/sales';
import type { MdSku } from '../../types/master-data';

export function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalSalesOrder[]>([]);
  const [customers, setCustomers] = useState<SalCustomer[]>([]);
  const [skus, setSkus] = useState<MdSku[]>([]);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [skuId, setSkuId] = useState<number | ''>('');
  const [qty, setQty] = useState('100');
  const [error, setError] = useState('');

  const refresh = () => setOrders(salesRepository.listSalesOrders());

  useEffect(() => {
    setCustomers(salesRepository.listCustomers());
    setSkus(masterDataRepository.skus.list());
    refresh();
  }, []);

  const handleCreate = () => {
    setError('');
    try {
      if (!customerId) throw new Error('Select a customer.');
      const orderId = salesRepository.createSalesOrder({
        customerId: Number(customerId),
        orderDate: new Date().toISOString().slice(0, 10),
      });
      if (skuId && qty) {
        salesRepository.addSalesOrderLine({
          salesOrderId: orderId,
          skuId: Number(skuId),
          orderedQuantity: Number(qty),
        });
        salesRepository.confirmSalesOrder(orderId);
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order.');
    }
  };

  return (
    <>
      <section className="card">
        <h2>New Sales Order</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-row">
          <label>
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.channel})</option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <select value={skuId} onChange={(e) => setSkuId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Optional line…</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>{s.sku_code} — {s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Qty
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>
            Create SO
          </button>
        </div>
      </section>
      <table className="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Channel</th>
            <th>Type</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const customer = customers.find((c) => c.id === o.customer_id);
            return (
              <tr key={o.id}>
                <td>{o.order_code}</td>
                <td>{customer?.name ?? o.customer_id}</td>
                <td>{o.channel}</td>
                <td>{o.order_type}</td>
                <td>{o.order_date}</td>
                <td>{o.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
