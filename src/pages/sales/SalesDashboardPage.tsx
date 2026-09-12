import { salesRepository } from '../../db/repositories/sales-repository';

export function SalesDashboardPage() {
  const summary = salesRepository.getSalesDashboardSummary();

  return (
    <section className="card">
      <h2>Sales Overview</h2>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Active Customers</span>
          <span className="stat-value">{summary.activeCustomers}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Open Orders</span>
          <span className="stat-value">{summary.openOrders}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Posted Shipments</span>
          <span className="stat-value">{summary.postedShipments}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Depletions (units)</span>
          <span className="stat-value">{summary.totalDepletionQty.toFixed(0)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Operational COGS (KYD)</span>
          <span className="stat-value">{summary.totalCogsKyd.toFixed(2)}</span>
        </div>
      </div>
      <p className="page-subtitle" style={{ marginTop: '1rem' }}>
        Sales documents use SO codes (e.g. SO-000001). Shipments post immutable FG Shipment ledger
        entries with COGS snapshots — no AR or GL posting in this phase.
      </p>
    </section>
  );
}
