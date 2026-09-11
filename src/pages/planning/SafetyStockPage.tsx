import { planningRepository } from '../../db/repositories/planning-repository';

export function SafetyStockPage() {
  const items = planningRepository.listSafetyStock();

  return (
    <section className="card">
      <h2>Safety Stock</h2>
      <p className="text-muted">Minimum buffer levels used in net requirement calculations.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.item_type}</td>
              <td>{item.item_code ?? item.item_name ?? '—'}</td>
              <td>{item.safety_stock_quantity.toLocaleString()}</td>
              <td>{item.unit}</td>
              <td>{item.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p>No safety stock levels configured.</p>}
    </section>
  );
}
