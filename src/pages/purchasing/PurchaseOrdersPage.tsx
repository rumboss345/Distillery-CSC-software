import { purchasingRepository } from '../../db/repositories';

export function PurchaseOrdersPage() {
  const orders = purchasingRepository.listPurchaseOrders();

  return (
    <section className="card">
      <h2>Purchase Orders</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>PUR #</th>
            <th>Supplier</th>
            <th>Date</th>
            <th>Currency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((po) => (
            <tr key={po.id}>
              <td>{po.po_code}</td>
              <td>{po.supplier_name}</td>
              <td>{po.order_date.slice(0, 10)}</td>
              <td>{po.currency}</td>
              <td>{po.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p>No purchase orders yet.</p>}
    </section>
  );
}
