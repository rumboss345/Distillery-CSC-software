import { purchasingRepository } from '../../db/repositories';

export function ReceiptsPage() {
  const receipts = purchasingRepository.listReceipts();

  return (
    <section className="card">
      <h2>Receipts</h2>
      <p className="text-muted">Draft receipts do not affect inventory. Posted receipts update the material ledger.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>RCV #</th>
            <th>Supplier</th>
            <th>Date</th>
            <th>PO</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id}>
              <td>{r.receipt_code}</td>
              <td>{r.supplier_name}</td>
              <td>{r.received_date.slice(0, 10)}</td>
              <td>{r.purchase_order_id ?? 'Direct'}</td>
              <td><strong>{r.status}</strong>{r.status === 'Posted' ? ' — Inventory Updated' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
