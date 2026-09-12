import { materialInventoryRepository } from '../../db/repositories';

export function MaterialTransactionsPage() {
  const txs = materialInventoryRepository.ledger.getTransactions();

  return (
    <section className="card">
      <h2>Material Transactions</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>MTX #</th>
            <th>Type</th>
            <th>Material</th>
            <th>Lot</th>
            <th>Qty</th>
            <th>Base Qty</th>
            <th>PO/Batch</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.transaction_timestamp.slice(0, 10)}</td>
              <td>{tx.transaction_code}</td>
              <td>{tx.transaction_type}</td>
              <td>{tx.material_name}</td>
              <td>{tx.lot_code ?? '—'}</td>
              <td>{tx.quantity} {tx.unit}</td>
              <td>{tx.base_quantity} {tx.base_unit}</td>
              <td>{tx.production_batch_id ? `PB-${tx.production_batch_id}` : tx.receipt_id ? `RCV-${tx.receipt_id}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
