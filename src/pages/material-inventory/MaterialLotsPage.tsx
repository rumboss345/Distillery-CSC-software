import { materialInventoryRepository } from '../../db/repositories';

export function MaterialLotsPage() {
  const lots = materialInventoryRepository.lots.list();

  return (
    <section className="card">
      <h2>Material Lots</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Material</th>
            <th>Supplier Lot</th>
            <th>Status</th>
            <th>Expiration</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id}>
              <td>{lot.lot_code}</td>
              <td>{lot.material_name}</td>
              <td>{lot.supplier_lot_number ?? '—'}</td>
              <td>{lot.status}</td>
              <td>{lot.expiration_date ?? '—'}</td>
              <td>{materialInventoryRepository.balance.getLotBalance(lot.id).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
