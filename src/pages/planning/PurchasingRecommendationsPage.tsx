import { planningRepository } from '../../db/repositories/planning-repository';

export function PurchasingRecommendationsPage() {
  const recommendations = planningRepository.listPurchasingRecommendations();

  return (
    <section className="card">
      <h2>Purchasing Recommendations</h2>
      <p className="text-muted">
        Advisory quantities from the latest MRP run. Review and create purchase orders manually in Purchasing.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>Gross Req.</th>
            <th>On Hand</th>
            <th>Open PO</th>
            <th>Safety Stock</th>
            <th>Net Req.</th>
            <th>Recommend</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((line) => (
            <tr key={line.id}>
              <td>{line.item_code ?? line.item_name ?? '—'}</td>
              <td>{line.material_type}</td>
              <td>{line.gross_requirement.toLocaleString()}</td>
              <td>{line.on_hand_quantity.toLocaleString()}</td>
              <td>{line.open_po_quantity.toLocaleString()}</td>
              <td>{line.safety_stock_quantity.toLocaleString()}</td>
              <td>{line.net_requirement.toLocaleString()}</td>
              <td>{line.recommended_purchase_qty.toLocaleString()}</td>
              <td>{line.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {recommendations.length === 0 && <p>No purchasing recommendations from MRP.</p>}
    </section>
  );
}
